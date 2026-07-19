"""
linkedin_agent.py — Full 9-node LangGraph subgraph for the LinkedIn agent.

Pipeline:
  fetch_page → extract_post → download_attachments → build_combined_text
  → summarize → extract_concepts → generate_metadata → score_difficulty
  → place_in_tree → END

Phase 1: Authenticated LinkedIn scraping.
  - PDFs: downloaded directly if LinkedIn exposes download URL
  - Carousel slides: downloaded as images then stitched into a PDF via pdf_generator
"""
from langgraph.graph import StateGraph, END
from typing import TypedDict, Optional
from backend.tools.browser import linkedin_scraper
from backend.tools.pdf_extractor import pdf_extractor
from backend.tools.pdf_generator import create_slides_pdf
from backend.tools.minio_uploader import download_and_store_pdf, store_bytes_to_minio
from backend.services.llm import call_llm
import json
import uuid
import httpx


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


# ── Node 5: Summarize with Groq llama-3.1-8b-instant ─────────────────────────

async def summarize_content(state: LinkedInState) -> dict:
    """LLM Call — Groq llama-3.1-8b-instant — generate a single short sentence summary."""
    if state.get("error"):
        return {}

    content = state.get("combined_text") or state.get("post_text") or ""
    concept = state.get("concept") or ""

    if not content and not concept:
        return {"summary": "No content extracted.", "agent_steps": ["⚠️ No content to summarize"]}

    # If we have concept but no post text (scraping failed), generate from concept
    if not state.get("post_text") and concept:
        prompt = f"""Generate a single, short sentence summary for a LinkedIn post about: "{concept}"
The post is from: {state.get("url", "")}
Author: {state.get("author", "unknown")}

Write a specific, technical one-sentence summary about what this post likely covers regarding {concept}.

IMPORTANT: Do NOT include any introductory or concluding phrases. Output ONLY the single summary sentence itself."""
    else:
        prompt = f"""Summarize this LinkedIn post (and any attached document) in exactly ONE single, short sentence.
Focus on the key technical insight or learning. Be specific, not generic.

IMPORTANT: Do NOT include any introductory or concluding phrases (e.g., "Here is a summary", "In conclusion"). Output ONLY the single summary sentence itself.

{f'Primary concept: {concept}' if concept else ''}

Content:
{content[:6000]}"""

    summary = await call_llm(
        prompt=prompt,
        model="groq/llama-3.1-8b-instant",
        system="You are a technical knowledge extraction expert. Write clear, specific, one-sentence summaries.",
        max_tokens=100,
    )

    return {
        "summary": summary,
        "agent_steps": ["✅ Summary generated"],
    }


# ── Node 6: Extract concepts + tags ──────────────────────────────────────────

async def extract_key_concepts(state: LinkedInState) -> dict:
    """LLM Call — Groq llama-3.1-8b-instant — extract concepts and tags."""
    content = state.get("combined_text") or state.get("post_text") or ""
    concept = state.get("concept") or ""

    context_text = content[:4000] if content else f"Topic: {concept}"

    response = await call_llm(
        prompt=f"""Extract key concepts and tags from this content.
Return a JSON object with two lists:
- "concepts": 3-8 specific technical concepts
- "tags": 3-6 short tags

Primary concept (must be included): "{concept}"

Content:
{context_text}

Return ONLY valid JSON, nothing else.""",
        model="groq/llama-3.1-8b-instant",
        system="You are a technical content analyst. Always return valid JSON.",
        max_tokens=250,
        temperature=0,
    )

    try:
        clean = response.strip().strip("```json").strip("```").strip()
        data = json.loads(clean)
        concepts = data.get("concepts", [])
        tags = data.get("tags", [])
    except Exception:
        # Fallback: use the concept as at least one tag
        concepts = [concept] if concept else []
        tags = [concept] if concept else []

    return {
        "key_concepts": concepts,
        "tags": tags,
        "agent_steps": [f"✅ Extracted {len(concepts)} concepts, {len(tags)} tags"],
    }


# ── Node 7: Generate metadata ─────────────────────────────────────────────────

async def generate_metadata(state: LinkedInState) -> dict:
    """LLM Call — Groq llama-3.3-70b-versatile — generate full metadata JSON."""
    summary   = state.get("summary", "")
    concepts  = state.get("key_concepts", [])
    tags      = state.get("tags", [])
    concept   = state.get("concept") or ""
    doc_title = state.get("document_title") or ""

    response = await call_llm(
        prompt=f"""Generate metadata for this LinkedIn post. Return ONLY a JSON object:

{{
  "title": "descriptive title (incorporate the concept '{concept}' if provided, max 100 chars)",
  "reading_time_minutes": <integer, estimated reading time>,
  "importance_score": <1-10, how important/valuable is this knowledge>
}}

Post summary: {summary}
Document title: {doc_title}
Concepts: {concepts}
Tags: {tags}
Author: {state.get("author", "unknown")}
Has PDF attachment: {bool(state.get("downloaded_files"))}

Return ONLY valid JSON.""",
        model="groq/llama-3.3-70b-versatile",
        system="You are a knowledge management expert. Return only valid JSON.",
        max_tokens=200,
        temperature=0,
    )

    try:
        clean    = response.strip().strip("```json").strip("```").strip()
        metadata = json.loads(clean)
    except Exception:
        # Fallback title uses concept or document title
        fallback_title = (
            doc_title or
            (f"{concept} — LinkedIn Post" if concept else None) or
            (state.get("post_text") or "LinkedIn Post")[:80]
        )
        metadata = {
            "title":                fallback_title,
            "reading_time_minutes": 3,
            "importance_score":     5,
        }

    return {
        "metadata":    metadata,
        "agent_steps": ["✅ Metadata generated"],
    }


# ── Node 8: Infer Knowledge Domain ────────────────────────────────────────────

async def infer_domain(state: LinkedInState) -> dict:
    """Pick the broad knowledge domain for the post."""
    content = state.get("combined_text") or state.get("post_text") or ""
    raw = content[:3000]
    concept = state.get("concept") or ""

    response = await call_llm(
        prompt=f"""Determine the broad knowledge domain for this text.
Choose exactly ONE from this list:
Artificial Intelligence, Machine Learning, Python, System Design, SQL, Cloud Computing, DevOps, Mathematics, General

{f'User-provided concept: {concept}' if concept else ''}

Text:
{raw}

Respond with ONLY the domain name, nothing else.""",
        model="groq/llama-3.1-8b-instant",
        system="You are a knowledge domain classifier.",
        max_tokens=30,
        temperature=0,
    )

    domain = response.strip()
    valid_domains = {"Artificial Intelligence", "Machine Learning", "Python", "System Design", "SQL", "Cloud Computing", "DevOps", "Mathematics", "General"}
    if domain not in valid_domains:
        domain = "General"

    return {
        "knowledge_domain": domain,
        "agent_steps": [f"📁 Domain inferred: {domain}"],
    }

# ── Node 9: Score difficulty ──────────────────────────────────────────────────

async def score_difficulty(state: LinkedInState) -> dict:
    """LLM Call — Groq llama-3.3-70b-versatile — score difficulty 1-5."""
    summary = state.get("summary", "")

    response = await call_llm(
        prompt=f"""Rate the technical difficulty of this content on a scale of 1-5:
1 = Beginner (anyone can understand)
2 = Basic (some tech background needed)
3 = Intermediate (solid tech knowledge needed)
4 = Advanced (expert knowledge needed)
5 = Expert (cutting-edge research/deep expertise)

Content summary: {summary}
Concepts covered: {state.get("key_concepts", [])}

Reply with ONLY the number (1, 2, 3, 4, or 5). Nothing else.""",
        model="groq/llama-3.3-70b-versatile",
        system="You are a technical difficulty assessor.",
        max_tokens=10,
        temperature=0,
    )

    try:
        clean = response.strip()
        for char in clean:
            if char.isdigit():
                difficulty = int(char)
                difficulty = max(1, min(5, difficulty))
                break
        else:
            difficulty = 3
    except Exception:
        difficulty = 3

    return {
        "difficulty":  difficulty,
        "agent_steps": [f"✅ Difficulty scored: {difficulty}/5"],
    }


# ── Node 9: Place in knowledge tree ─────────────────────────────────────────

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
    "AI Memory", "Model Context Protocol (MCP)", "AI Tools", "AI Frameworks",
    "AI APIs", "Open-Source LLMs", "AI Cloud Platforms", "AI Infrastructure",
    "MLOps", "LLMOps", "AI Deployment", "AI Evaluation", "AI Benchmarks",
    "AI Observability", "AI Guardrails", "AI Safety", "AI Security", "AI Privacy",
    "AI Ethics", "Responsible AI", "AI Governance", "Explainable AI (XAI)",
    "AI Alignment", "AI Hallucinations", "AI Bias", "AI Regulations", "AI Applications",
    "AI Use Cases", "AI Project Development", "AI System Design", "AI Research Trends",
    "Edge AI", "Robotics and AI", "Autonomous Systems", "Internet of Things (IoT) with AI",
    "AI in Healthcare", "AI in Finance", "AI in Education", "AI in Cybersecurity",
    "AI in Software Development", "Future of AI"
]

async def place_in_knowledge_tree(state: LinkedInState) -> dict:
    """LLM Call — Groq llama-3.3-70b-versatile — map to predefined taxonomy."""
    summary  = state.get("summary", "")
    concepts = state.get("key_concepts", [])
    tags     = state.get("tags", [])
    concept  = state.get("concept") or ""

    response = await call_llm(
        prompt=f"""Determine where this content belongs in our predefined knowledge taxonomy.
You MUST choose exactly ONE concept from the provided ALLOWED_CONCEPTS list that best matches the content.
If the user provided a concept ('{concept}'), use it to help you pick the closest match from the list.

ALLOWED_CONCEPTS:
{', '.join(AI_CONCEPTS_LIST)}

Return ONLY a JSON object:
{{
  "tree_path": "The EXACT concept string you chose from the ALLOWED_CONCEPTS list"
}}

Summary: {summary}
Concepts: {concepts}
Tags: {tags}

Return ONLY valid JSON.""",
        model="groq/llama-3.3-70b-versatile",
        system="You are a knowledge taxonomy expert. You strictly adhere to the allowed list. Return only valid JSON.",
        max_tokens=150,
        temperature=0,
    )

    try:
        clean     = response.strip().strip("```json").strip("```").strip()
        tree_data = json.loads(clean)
        chosen_path = tree_data.get("tree_path")
        if chosen_path not in AI_CONCEPTS_LIST:
            # Fallback if LLM halluciantes a path
            chosen_path = "Artificial Intelligence (AI)"
    except Exception:
        chosen_path = "Artificial Intelligence (AI)"

    return {
        "knowledge_tree": chosen_path,
        "agent_steps":    [f"✅ Placed in taxonomy: {chosen_path}"],
    }



# ── Node 10: Detect if it's an Interview QnA ────────────────────────────────

async def detect_interview_qna(state: LinkedInState) -> dict:
    """LLM Call — Groq llama-3.1-8b-instant — check if content is interview prep/QnA."""
    summary = state.get("summary", "")
    content = state.get("combined_text") or state.get("post_text") or ""
    
    response = await call_llm(
        prompt=f"""Determine if this content is primarily a list of Interview Questions and Answers (or interview preparation material).
Return ONLY a JSON object:
{{
  "is_interview_qna": true or false
}}

Summary: {summary}
Content sample: {content[:2000]}

Return ONLY valid JSON.""",
        model="groq/llama-3.1-8b-instant",
        system="You are a classifier. Return only valid JSON.",
        max_tokens=50,
        temperature=0,
    )
    
    try:
        clean = response.strip().strip("```json").strip("```").strip()
        data = json.loads(clean)
        is_qna = bool(data.get("is_interview_qna", False))
    except Exception:
        is_qna = False
        
    steps = [f"✅ Classified as Interview QnA"] if is_qna else []
    
    qna_pairs = []
    
    if is_qna and not state.get("has_attachment"):
        steps.append("🤖 Extracting QnA and answering missing questions...")
        qna_prompt = f"""You are an expert Principal AI Engineer conducting a senior technical interview.
The following text contains a list of multiple interview questions.
You MUST extract EVERY SINGLE QUESTION from the text (there are usually 10-20 questions). Do not stop after the first one!
For each question:
1. Extract the exact question into the "q" field.
2. If the original text provides a highly detailed answer, use it.
3. If an answer is missing, vague, or incomplete, YOU MUST write a high-quality, professional, and comprehensive answer yourself. 
   - The answer should be tailored for a senior AI/ML interview.
   - Do NOT simply restate or repeat the question. 
   - Provide a direct, insightful, and technically accurate explanation.
4. Map the question to EXACTLY ONE of the following AI topics:
{chr(10).join([f"- {t}" for t in AI_CONCEPTS_LIST])}

Return ONLY a valid JSON array of objects:
[
  {{
    "q": "The question",
    "a": "The high-quality technical answer",
    "topic": "The exact topic from the list above"
  }}
]

Text:
{content}
"""
        qna_response = await call_llm(
            prompt=qna_prompt,
            model="groq/llama-3.3-70b-versatile",
            system="You are an expert AI Interviewer. Return only valid JSON.",
            max_tokens=4000,
            temperature=0,
        )
        try:
            print("--- LLM QNA RESPONSE ---")
            print(qna_response)
            print("------------------------")
            
            # Use regex to extract the JSON array robustly
            import re
            match = re.search(r'\[\s*\{.*\}\s*\]', qna_response, re.DOTALL)
            if match:
                qna_clean = match.group(0)
            else:
                qna_clean = qna_response.replace("```json", "").replace("```", "").strip()
                
            qna_pairs = json.loads(qna_clean)
            if isinstance(qna_pairs, list):
                steps.append(f"✅ Extracted {len(qna_pairs)} QnA pairs")
            else:
                qna_pairs = []
        except Exception as e:
            print("Failed to parse QnA pairs:", e)
            qna_pairs = []

    return {
        "is_interview_qna": is_qna,
        "qna_pairs": qna_pairs,
        "agent_steps": steps
    }


# ── Build the LinkedIn subgraph ───────────────────────────────────────────────

def build_linkedin_subgraph() -> StateGraph:
    graph = StateGraph(LinkedInState)

    graph.add_node("fetch_page",           fetch_linkedin_page)
    graph.add_node("extract_post",         extract_post_content)
    graph.add_node("download_attachments", download_attachments)
    graph.add_node("build_combined_text",  build_combined_text)
    graph.add_node("summarize",            summarize_content)
    graph.add_node("extract_concepts",     extract_key_concepts)
    graph.add_node("generate_metadata",    generate_metadata)
    graph.add_node("infer_domain",         infer_domain)
    graph.add_node("score_difficulty",     score_difficulty)
    graph.add_node("place_in_tree",        place_in_knowledge_tree)
    graph.add_node("detect_qna",           detect_interview_qna)

    graph.set_entry_point("fetch_page")
    graph.add_edge("fetch_page",           "extract_post")
    graph.add_edge("extract_post",         "download_attachments")
    graph.add_edge("download_attachments", "build_combined_text")
    graph.add_edge("build_combined_text",  "summarize")
    graph.add_edge("summarize",            "extract_concepts")
    graph.add_edge("extract_concepts",     "generate_metadata")
    graph.add_edge("generate_metadata",    "infer_domain")
    graph.add_edge("infer_domain",         "score_difficulty")
    graph.add_edge("score_difficulty",     "place_in_tree")
    graph.add_edge("place_in_tree",        "detect_qna")
    graph.add_edge("detect_qna",           END)

    return graph


linkedin_subgraph = build_linkedin_subgraph()
