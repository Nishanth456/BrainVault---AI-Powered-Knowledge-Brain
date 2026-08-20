"""
linkedin_agent.py — Optimised LangGraph subgraph for the LinkedIn agent.

Pipeline:
  fetch_page → extract_post → download_attachments → build_combined_text
  → summarize → extract_concepts → generate_metadata
  → analyze_all (parallel: infer_domain + score_difficulty + place_in_tree + detect_qna)
  → END

All LLM calls use explicit Groq models to avoid Gemini rate-limit delays.
Four post-summary analysis steps run in parallel via asyncio.gather().
"""
from langgraph.graph import StateGraph, END
from typing import TypedDict, Optional
from backend.tools.browser import linkedin_scraper
from backend.tools.pdf_extractor import pdf_extractor
from backend.tools.pdf_generator import create_slides_pdf
from backend.tools.minio_uploader import download_and_store_pdf, store_bytes_to_minio
from backend.services.llm import fast_llm, reasoning_llm
import asyncio
import json
import uuid


# ── LinkedIn-specific state ───────────────────────────────────────────────────

class LinkedInState(TypedDict):
    url: str
    concept: Optional[str]             # User-provided concept label (e.g. "Guardrails")
    raw_html: Optional[str]
    post_text: Optional[str]
    author: Optional[str]
    date: Optional[str]
    document_title: Optional[str]      # Title of attached document (if any)
    pdf_urls: list[str]
    carousel_image_urls: list[str]
    has_attachment: bool
    downloaded_files: list[dict]       # [{filename, minio_path, file_type, page_count, extracted_text}]
    combined_text: Optional[str]       # post_text + pdf_text combined
    summary: Optional[str]
    key_concepts: Optional[list[str]]
    tags: Optional[list[str]]
    metadata: Optional[dict]
    knowledge_domain: Optional[str]
    difficulty: Optional[int]
    knowledge_tree: Optional[str]
    is_interview_qna: Optional[bool]
    qna_pairs: Optional[list[dict]]
    agent_steps: list[str]
    error: Optional[str]


# ── Node 1: Fetch LinkedIn page via Playwright (authenticated) ────────────────

async def fetch_linkedin_page(state: LinkedInState) -> dict:
    """Use Playwright (logged-in session) to fetch the JS-rendered LinkedIn page."""
    try:
        html = await linkedin_scraper.fetch_page(state["url"])
        if not html or len(html) < 500:
            return {
                "raw_html": html or "",
                "error": "LinkedIn returned empty page — session may be invalid",
                "agent_steps": ["❌ LinkedIn page returned empty — check session"],
            }
        return {
            "raw_html": html,
            "agent_steps": [f"✅ LinkedIn page fetched ({len(html):,} bytes)"],
        }
    except Exception as e:
        return {
            "raw_html": "",
            "error": f"Failed to fetch page: {e}",
            "agent_steps": ["❌ Failed to fetch LinkedIn page"],
        }


# ── Node 2: Extract post content from DOM ────────────────────────────────────

async def extract_post_content(state: LinkedInState) -> dict:
    """Parse DOM to extract post text, author, and attachment URLs."""
    if state.get("error"):
        return {}

    html = state.get("raw_html") or ""
    data = linkedin_scraper.extract_post_data(html)

    # If scraping returned very little, note it but don't error
    # The LLM can still work with concept + URL context
    attachment_msg = (
        f"📎 Found: {len(data['pdf_urls'])} PDF link(s), "
        f"{len(data['carousel_image_urls'])} slide image(s)"
        if data["has_attachment"]
        else "📄 No direct attachments found in HTML"
    )

    return {
        "post_text":             data["post_text"],
        "author":                data["author"],
        "date":                  data["date"],
        "document_title":        data["document_title"],
        "pdf_urls":              data["pdf_urls"],
        "carousel_image_urls":   data["carousel_image_urls"],
        "has_attachment":        data["has_attachment"],
        "agent_steps": [
            f"✅ Post content extracted — author: {data['author'] or 'unknown'}, "
            f"text: {len(data['post_text'])} chars",
            attachment_msg,
        ],
    }


# ── Node 3: Download PDFs + stitch carousel slides into PDF ──────────────────

async def download_attachments(state: LinkedInState) -> dict:
    """
    Priority order:
    1. If direct PDF URL found → download PDF directly
    2. If carousel slide images found → download all slides → stitch into PDF
    3. If nothing → no attachment (LLM works from post text only)
    """
    if state.get("error"):
        return {"downloaded_files": [], "agent_steps": ["⏭️ Skipping downloads (error state)"]}

    downloaded = []
    steps = []

    # ── Strategy 1: Direct PDF download ──────────────────────────────────────
    for pdf_url in state.get("pdf_urls", []):
        try:
            steps.append(f"⬇️ Downloading PDF from {pdf_url[:60]}...")
            # Try direct HTTP download first (with session cookies if needed)
            try:
                file_info = await download_and_store_pdf(pdf_url, prefix="linkedin")
                raw_bytes = file_info.pop("raw_bytes", None)
            except Exception as e:
                print(f"⚠️ Direct PDF download failed: {e}")
                # Fallback: use Playwright session to download
                raw_bytes = await linkedin_scraper.fetch_pdf_bytes(pdf_url)
                if raw_bytes:
                    import uuid as _uuid
                    filename = f"linkedin_{_uuid.uuid4()}.pdf"
                    minio_path = await store_bytes_to_minio(raw_bytes, filename, "application/pdf")
                    file_info = {
                        "filename": filename,
                        "minio_path": minio_path,
                        "file_type": "pdf",
                        "file_size_bytes": len(raw_bytes),
                    }
                else:
                    raise Exception("PDF download returned empty bytes")

            if raw_bytes:
                pdf_data = pdf_extractor.extract_from_bytes(raw_bytes)
                file_info["page_count"] = pdf_data["page_count"]
                file_info["extracted_text"] = pdf_data["full_text"][:50000]
            else:
                file_info["page_count"] = None
                file_info["extracted_text"] = ""

            downloaded.append(file_info)
            steps.append(f"✅ PDF downloaded: {file_info.get('page_count', '?')} pages → stored in MinIO")

        except Exception as e:
            steps.append(f"⚠️ PDF download failed: {e}")

    # ── Strategy 2: Carousel slides → stitch into PDF ─────────────────────────
    if not downloaded and state.get("carousel_image_urls"):
        slide_urls = state["carousel_image_urls"][:40]  # Cap at 40 slides
        steps.append(f"🖼️ Downloading {len(slide_urls)} carousel slides...")

        try:
            slide_bytes_list = await linkedin_scraper.download_slide_images(slide_urls)
            steps.append(f"✅ Downloaded {len(slide_bytes_list)}/{len(slide_urls)} slides")

            if slide_bytes_list:
                doc_title = state.get("document_title") or "LinkedIn Document"
                pdf_bytes = create_slides_pdf(slide_bytes_list, title=doc_title)

                if pdf_bytes:
                    filename = f"linkedin_{uuid.uuid4()}.pdf"
                    minio_path = await store_bytes_to_minio(pdf_bytes, filename, "application/pdf")

                    # Extract text from the stitched PDF
                    try:
                        pdf_data = pdf_extractor.extract_from_bytes(pdf_bytes)
                        page_count = pdf_data["page_count"]
                        extracted_text = pdf_data["full_text"][:50000]
                    except Exception:
                        page_count = len(slide_bytes_list)
                        extracted_text = ""

                    downloaded.append({
                        "filename":       filename,
                        "minio_path":     minio_path,
                        "file_type":      "pdf",
                        "file_size_bytes": len(pdf_bytes),
                        "page_count":     page_count,
                        "extracted_text": extracted_text,
                    })
                    steps.append(
                        f"✅ Stitched {len(slide_bytes_list)} slides → {page_count}-page PDF → stored in MinIO"
                    )
                else:
                    steps.append("⚠️ PDF stitching failed")
            else:
                steps.append("⚠️ No slide images could be downloaded")

        except Exception as e:
            steps.append(f"⚠️ Carousel processing failed: {e}")

    if not downloaded:
        steps.append("📝 No PDF attachment — will use post text only")

    return {
        "downloaded_files": downloaded,
        "agent_steps": steps,
    }


# ── Node 4: Build combined text for LLM calls ────────────────────────────────

async def build_combined_text(state: LinkedInState) -> dict:
    """Combine post text + concept + PDF extracted text for all LLM processing."""
    parts = []

    # Include user concept as primary context anchor
    if state.get("concept"):
        parts.append(f"[CONCEPT]\n{state['concept']}")

    if state.get("post_text"):
        parts.append(f"[LINKEDIN POST]\n{state['post_text']}")

    if state.get("document_title"):
        parts.append(f"[DOCUMENT TITLE]\n{state['document_title']}")

    for f in state.get("downloaded_files", []):
        if f.get("file_type") == "pdf" and f.get("extracted_text"):
            label = f"[ATTACHED PDF: {f.get('filename', 'document')}]"
            parts.append(f"{label}\n{f['extracted_text'][:15000]}")

    combined = "\n\n".join([p for p in parts if p])
    return {
        "combined_text": combined,
        "agent_steps": [f"✅ Combined content: {len(combined):,} characters"],
    }



AI_CONCEPTS_LIST = [
    "Artificial Intelligence (AI)", "History of AI", "Types of AI", "Mathematics for AI",
    "Python for AI", "Data Science", "Data Engineering", "Machine Learning",
    "Deep Learning", "Neural Networks", "Computer Vision", "Natural Language Processing (NLP)",
    "Speech AI", "Reinforcement Learning", "Generative AI Basics", "Foundation Models",
    "AI Terminology", "Prompt Engineering", "Tokenization", "Embeddings",
    "Attention Mechanism", "Transformers", "Large Language Models (LLMs)", "Multimodal AI",
    "Vision Language Models (VLMs)", "Small Language Models (SLMs)", "Reasoning Models",
    "Retrieval-Augmented Generation (RAG)", "Knowledge Graphs", "Vector Databases", "Semantic Search",
    "Fine-Tuning", "Parameter-Efficient Fine-Tuning (PEFT)", "Quantization", "Model Distillation",
    "AI Agents", "Agentic AI", "Multi-Agent Systems", "Agent Frameworks",
    "AI Memory", "Model Context Protocol (MCP)", "AI Tools", "AI Frameworks", "FastAPI for AI",
    "AI APIs", "Open-Source LLMs", "AI Cloud Platforms", "AI Infrastructure",
    "MLOps", "LLMOps", "AI Deployment", "AI Evaluation", "AI Benchmarks",
    "AI Observability", "AI Guardrails", "AI Safety", "AI Security", "AI Privacy",
    "AI Ethics", "Responsible AI", "AI Governance", "Explainable AI (XAI)",
    "AI Alignment", "AI Hallucinations", "AI Bias", "AI Regulations", "AI Applications",
    "AI Use Cases", "AI Project Development", "AI System Design", "AI Research Trends",
    "Edge AI", "Robotics and AI", "Autonomous Systems", "Internet of Things (IoT) with AI",
    "AI in Healthcare", "AI in Finance", "AI in Education", "AI in Cybersecurity",
    "AI in Software Development", "Future of AI",
    "FastAPI", "React", "Docker", "Kubernetes", "CI/CD", 
    "Production Engineering", "General Software Engineering", 
    "Backend Development", "Frontend Development", "Database Engineering",
    "Cloud Computing", "DevOps"
]

# ── Node 5: Single-Pass Metadata Analysis ──────────────────────────────────

async def analyze_post(state: LinkedInState) -> dict:
    """
    Combined LLM Call (fast_llm: gemini-3.1-flash-lite) to extract ALL metadata at once:
    - Summary, Tags, Concepts, Title, Domain, Difficulty, Tree, QnA detection
    """
    import json
    
    if state.get("error"):
        return {}

    concept = state.get("concept") or ""
    has_attachment = bool(state.get("downloaded_files"))
    post_text = state.get("post_text") or ""
    combined_text = state.get("combined_text") or post_text

    # Title extraction context
    title_source = combined_text[:2000]

    # For posts WITH attachments, summarizing from the post caption is better.
    if has_attachment and post_text:
        summary_content = post_text
    else:
        summary_content = combined_text

    prompt = f"""You are an expert technical knowledge extractor. Analyze this LinkedIn post and extract all required metadata into a SINGLE JSON object.

Content Context for Title: {title_source}
Content for Analysis: {summary_content[:4000]}
Primary Concept (hint): {concept}

Return ONLY this EXACT JSON structure:
{{
  "title": "Concise title (5-10 words). Ignore author/company names.",
  "summary": "Specific, technical one-sentence summary of WHAT the post/document covers.",
  "key_concepts": ["concept1", "concept2", ...up to 6],
  "tags": ["tag1", ...up to 5. MUST include AI/web frameworks if mentioned],
  "reading_time_minutes": <int>,
  "importance_score": <1-10>,
  "knowledge_domain": "Must be one of: Artificial Intelligence, Machine Learning, Python, System Design, SQL, Cloud Computing, DevOps, Mathematics, General",
  "difficulty": <1-5 digit, where 1=Beginner, 5=Expert>,
  "knowledge_tree": "Must be one of the ALLOWED_CONCEPTS (pick most specific)",
  "is_interview_qna": <boolean: true if content shares interview questions or a guide>
}}

ALLOWED_CONCEPTS for knowledge_tree: {', '.join(AI_CONCEPTS_LIST)}
"""

    try:
        response = await fast_llm.json(
            prompt=prompt + "\n\nSystem: You are a data extraction API. Output strictly valid JSON matching the schema.",
            max_tokens=1500
        )
        
        metadata = response if isinstance(response, dict) else {}
    except Exception as e:
        print(f"❌ analyze_post failed: {e}")
        metadata = {}

    # Defaults in case LLM missed fields
    title = metadata.get("title") or (f"{concept} — LinkedIn Post" if concept else "LinkedIn Post")
    summary = metadata.get("summary") or "No summary generated."
    key_concepts = metadata.get("key_concepts") or ([concept] if concept else [])
    tags = metadata.get("tags") or ([concept] if concept else [])
    domain = metadata.get("knowledge_domain") or "General"
    difficulty = metadata.get("difficulty") or 3
    tree = metadata.get("knowledge_tree") or "Artificial Intelligence (AI)"
    is_qna = bool(metadata.get("is_interview_qna", False))

    if tree not in AI_CONCEPTS_LIST:
        tree = "Artificial Intelligence (AI)"

    return {
        "metadata": {
            "title": title,
            "reading_time_minutes": metadata.get("reading_time_minutes", 3),
            "importance_score": metadata.get("importance_score", 5),
        },
        "summary": summary,
        "key_concepts": key_concepts,
        "tags": tags,
        "knowledge_domain": domain,
        "difficulty": difficulty,
        "knowledge_tree": tree,
        "is_interview_qna": is_qna,
        "agent_steps": [
            "✅ Single-pass metadata analysis complete",
            f"📁 Domain: {domain}",
            f"✅ Difficulty: {difficulty}/5",
            f"✅ Tree: {tree}",
        ]
    }


# ── Node 6: Extract QnA Pairs (Conditional) ──────────────────────────────────

async def extract_qna_pairs(state: LinkedInState) -> dict:
    """
    Called ONLY if is_interview_qna is True.
    Uses reasoning_llm (gemini-3.6-flash) for deep QnA extraction.
    """
    if not state.get("is_interview_qna"):
        return {"qna_pairs": [], "agent_steps": []}

    import json
    
    # We strictly extract questions from post text, bypassing heavy PDF scans.
    extraction_content = state.get("post_text") or ""
    
    qna_prompt = f"""You are an expert Principal AI Engineer conducting a senior technical interview.
Extract ONLY REAL, TECHNICAL interview questions from the text. 
IMPORTANT: 
- DO NOT convert general statements, advice, conversational text, or rhetorical questions into Q&A pairs.
- Only extract questions that would actually be asked in a technical interview (e.g., system design, coding, concept explanations).
- If the text contains NO actual technical interview questions, you MUST return an empty array [].

For each valid question, extract:
1. "context": specific background scenario. MUST be strictly empty ("") unless the text provides a hypothetical situation.
2. "q": the exact question
3. "a": answer from text — reformat with bullet points/bold/newlines if it's a wall of text. Write a high-quality answer if missing.
4. "topic": EXACTLY ONE from this full list (pick the MOST SPECIFIC match): {', '.join(AI_CONCEPTS_LIST)}
5. "keywords": 4-8 searchable keywords

Return ONLY a valid JSON array:
[{{"context": "", "q": "...", "a": "...", "topic": "...", "keywords": [...]}}]

Text:
{extraction_content}"""

    try:
        qna_response = await reasoning_llm(
            prompt=qna_prompt,
            system="Expert interview question extractor. Return valid JSON array only.",
            temperature=0,
            max_tokens=8000,
        )
        
        import re
        match = re.search(r'\[\\s*\\{.*\\}\\s*\]', qna_response, re.DOTALL)
        qna_clean = match.group(0) if match else qna_response.replace("`json", "").replace("`", "").strip()
        qna_pairs = json.loads(qna_clean)
        
        if isinstance(qna_pairs, list):
            for pair in qna_pairs:
                ctx = pair.pop("context", "").strip()
                if ctx and ctx.lower() not in ["none", "n/a", "null", "general", "interview", "general context"]:
                    pair["q"] = f"**Situation:** {ctx}\n\n**Question:** {pair['q']}"
            
            return {
                "is_interview_qna": len(qna_pairs) > 0,
                "qna_pairs": qna_pairs,
                "agent_steps": [f"✅ Interview QnA extracted ({len(qna_pairs)} pairs)"] if len(qna_pairs) > 0 else []
            }
    except Exception as e:
        print("Failed to parse QnA pairs:", e)
        
    return {"is_interview_qna": False, "qna_pairs": [], "agent_steps": []}


# ── Build the LinkedIn subgraph ───────────────────────────────────────────────

def build_linkedin_subgraph() -> StateGraph:
    graph = StateGraph(LinkedInState)

    graph.add_node("fetch_page",           fetch_linkedin_page)
    graph.add_node("extract_post",         extract_post_content)
    graph.add_node("download_attachments", download_attachments)
    graph.add_node("build_combined_text",  build_combined_text)
    graph.add_node("analyze_post",         analyze_post)
    graph.add_node("extract_qna_pairs",    extract_qna_pairs)

    graph.set_entry_point("fetch_page")
    graph.add_edge("fetch_page",           "extract_post")
    graph.add_edge("extract_post",         "download_attachments")
    graph.add_edge("download_attachments", "build_combined_text")
    graph.add_edge("build_combined_text",  "analyze_post")
    graph.add_edge("analyze_post",         "extract_qna_pairs")
    graph.add_edge("extract_qna_pairs",    END)

    return graph


linkedin_subgraph = build_linkedin_subgraph()
