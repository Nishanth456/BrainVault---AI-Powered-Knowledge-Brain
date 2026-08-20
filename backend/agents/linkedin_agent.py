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


# ── Node 5: Summarize ────────────────────────────────────────────────────────

async def summarize_content(state: LinkedInState) -> dict:
    """LLM Call — generate a single short sentence summary."""
    if state.get("error"):
        return {}

    concept = state.get("concept") or ""
    has_attachment = bool(state.get("downloaded_files"))

    # For posts WITH attachments (PDF/carousel), summarize from the post caption
    # only — the caption describes what the document IS (e.g. "30 GenAI interview
    # questions covering…"). Using combined_text would just summarize the first
    # Q&A answer which is misleading.
    # For text-only posts, use the full combined_text.
    if has_attachment and state.get("post_text"):
        content = state["post_text"]
    else:
        content = state.get("combined_text") or state.get("post_text") or ""

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
        prompt = f"""Summarize this LinkedIn post in exactly ONE single, short sentence.
Describe WHAT the content/document is about (its topic and scope), not the answer to any individual question.
Be specific, not generic.

IMPORTANT: Do NOT include any introductory or concluding phrases. Output ONLY the single summary sentence itself.

{f'Primary concept: {concept}' if concept else ''}

Content:
{content[:3000]}"""

    summary = await fast_llm(
        prompt=prompt,
        system="You are a technical knowledge extraction expert. Write clear, specific, one-sentence summaries that describe what the content is about, not individual details.",
    )

    return {
        "summary": summary,
        "agent_steps": ["✅ Summary generated"],
    }



# ── Node 6: Extract concepts + tags ──────────────────────────────────────────

async def extract_key_concepts(state: LinkedInState) -> dict:
    """LLM Call — extract concepts and tags."""
    content = state.get("combined_text") or state.get("post_text") or ""
    concept = state.get("concept") or ""

    context_text = content[:4000] if content else f"Topic: {concept}"

    response_data = await fast_llm.json(
        prompt=f"""Extract key concepts and tags from this content.
Return ONLY a JSON object:
{{"concepts": ["concept1", ...up to 6], "tags": ["tag1", ...up to 5]}}

IMPORTANT: Explicitly check for AI/web frameworks or technologies (e.g., FastAPI, LangChain, Docker, React, etc.) and MUST include them as tags if they are mentioned or implied.

Primary concept (must be included): "{concept}"

URL: {state.get("url", "")}
Document Title: {state.get("document_title", "")}

Content:
{context_text}
""",
        max_tokens=1000
    )

    if not response_data:
        print("❌ extract_concepts JSON parse failed, using fallback.")
        concepts = [concept] if concept else []
        tags = [concept] if concept else []
    elif isinstance(response_data, dict):
        concepts = response_data.get("concepts", [])
        tags = response_data.get("tags", [])
    elif isinstance(response_data, list):
        # LLM returned a list instead of a dict — treat as concepts
        concepts = [str(c) for c in response_data[:6]]
        tags = concepts[:5]
    else:
        concepts = [concept] if concept else []
        tags = [concept] if concept else []

    return {
        "key_concepts": concepts,
        "tags": tags,
        "agent_steps": [f"✅ Extracted {len(concepts)} concepts, {len(tags)} tags"],
    }


# ── Node 7: Generate metadata ─────────────────────────────────────────────────

async def generate_metadata(state: LinkedInState) -> dict:
    """Generate title + metadata for a LinkedIn post/document."""
    import re as _re
    import logging
    logger = logging.getLogger(__name__)

    summary   = state.get("summary", "")
    tags      = state.get("tags", [])
    concept   = state.get("concept") or ""
    post_text = state.get("post_text") or ""
    doc_title = state.get("document_title") or ""
    url       = state.get("url") or ""

    logger.warning(f"🏷️ generate_metadata — url={url[:80]}, doc_title='{doc_title}', post_text[:60]='{post_text[:60]}'")

    # Always use LLM to generate an accurate title based on content context
    content_for_title = state.get("combined_text") or post_text or summary
    title_source = content_for_title[:2000]

    response = await reasoning_llm.json(
        prompt=f"""Generate a title for this LinkedIn post/document. Return ONLY this JSON:
{{
  "title": "Concise title (5-10 words) reflecting the content topic. Ignore author/company names. Focus on what the document or post is about.{(' Concept hint: ' + concept) if concept else ''}",
  "reading_time_minutes": <integer>,
  "importance_score": <1-10>
}}
Content context: {title_source}
Tags: {tags}
Return ONLY valid JSON.""",
    )

    try:
        metadata = response if isinstance(response, dict) else {}
        if not metadata:
            metadata = {
                "title":                (f"{concept} — LinkedIn Post" if concept else "LinkedIn Post"),
                "reading_time_minutes": 3,
                "importance_score":     5,
            }
    except Exception as e:
        print(f"❌ generate_metadata failed: {e}")
        metadata = {
            "title":                (f"{concept} — LinkedIn Post" if concept else "LinkedIn Post"),
            "reading_time_minutes": 3,
            "importance_score":     5,
        }

    return {
        "metadata":    metadata,
        "agent_steps": ["✅ Metadata generated"],
    }



# ── Helper: Infer Knowledge Domain (runs inside analyze_all) ─────────────────

async def _infer_domain(state: LinkedInState) -> dict:
    """Pick the broad knowledge domain for the post."""
    summary = state.get("summary") or ""
    tags    = state.get("tags") or []
    concept = state.get("concept") or ""

    response = await fast_llm(
        prompt=f"""Choose ONE knowledge domain from this list:
Artificial Intelligence, Machine Learning, Python, System Design, SQL, Cloud Computing, DevOps, Mathematics, General

Summary: {summary}
Tags: {tags}{f', Concept: {concept}' if concept else ''}

Respond with ONLY the domain name.""",
        system="You are a knowledge domain classifier. Reply with only the domain name.",
        max_tokens=15,
        temperature=0,
    )

    domain = response.strip()
    valid_domains = {"Artificial Intelligence", "Machine Learning", "Python", "System Design", "SQL", "Cloud Computing", "DevOps", "Mathematics", "General"}
    return domain if domain in valid_domains else "General"

# ── Helper: Score difficulty (runs inside analyze_all) ───────────────────────

async def _score_difficulty(state: LinkedInState) -> int:
    """Score difficulty 1-5 for an AI practitioner audience."""
    summary  = state.get("summary", "")
    concepts = state.get("key_concepts", [])

    response = await fast_llm(
        prompt=f"""Rate technical difficulty for an AI practitioner (1-5):
1=Beginner, 2=Basic, 3=Intermediate, 4=Advanced, 5=Expert

Summary: {summary}
Concepts: {concepts}

Reply ONLY with the digit.""",
        system="Technical difficulty rater. Reply only with a single digit 1-5.",
        max_tokens=5,
        temperature=0,
    )

    for char in response.strip():
        if char.isdigit():
            return max(1, min(5, int(char)))
    return 3


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
    
    # General Software Engineering & Frameworks
    "FastAPI", "React", "Docker", "Kubernetes", "CI/CD", 
    "Production Engineering", "General Software Engineering", 
    "Backend Development", "Frontend Development", "Database Engineering",
    "Cloud Computing", "DevOps"
]

async def _place_in_knowledge_tree(state: LinkedInState) -> str:
    """Map to predefined taxonomy. Returns the chosen tree path."""
    summary  = state.get("summary", "")
    concepts = state.get("key_concepts", [])
    tags     = state.get("tags", [])
    concept  = state.get("concept") or ""

    response = await fast_llm.json(
        prompt=f"""Choose exactly ONE entry from ALLOWED_CONCEPTS that best matches this content.
IMPORTANT: You MUST choose the most SPECIFIC category possible. Do NOT choose broad categories like "Artificial Intelligence (AI)" unless absolutely no other specific category fits.

Return ONLY: {{"tree_path": "<exact entry>"}}

ALLOWED_CONCEPTS: {', '.join(AI_CONCEPTS_LIST)}

Summary: {summary}
Tags: {tags}
Concepts: {concepts}
User concept hint: {concept}

Return ONLY valid JSON.""",
        max_tokens=400
    )

    try:
        if isinstance(response, dict):
            chosen = response.get("tree_path", "")
        else:
            chosen = ""
        if chosen not in AI_CONCEPTS_LIST:
            print(f"⚠️ Invalid taxonomy chosen: {chosen}. Falling back to AI.")
            chosen = "Artificial Intelligence (AI)"
    except Exception as e:
        print(f"⚠️ Error parsing taxonomy: {e}. Falling back to AI.")
        chosen = "Artificial Intelligence (AI)"
    return chosen



async def _detect_and_extract_qna(state: LinkedInState) -> tuple[bool, list]:
    """Detect QnA and extract pairs if applicable. Returns (is_qna, qna_pairs)."""
    summary = state.get("summary", "")
    post_text = state.get("post_text") or ""

    response = await fast_llm.json(
        prompt=f"""You must determine if this content is related to Interview Questions.
If the text contains interview questions, OR if the text explicitly states it is sharing an Interview Guide, Interview Questions, or preparing for interviews, return {{"is_interview_qna": true}}.
Otherwise return {{"is_interview_qna": false}}.

Summary: {summary}
Content sample: {post_text[:1500]}
""",
        max_tokens=50
    )
    is_qna = bool(response.get("is_interview_qna", False))

    if not is_qna:
        return is_qna, []

    # Use combined_text for extraction so we can pull the actual questions from the PDF attachment
    extraction_content = state.get("combined_text") or state.get("post_text") or ""

    # Extract QnA pairs
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
4. "topic": EXACTLY ONE from this full list (pick the MOST SPECIFIC match — e.g. "AI Memory" for memory questions, "AI Agents" for agent questions, not a broad category): {', '.join(AI_CONCEPTS_LIST)}
5. "keywords": 4-8 searchable keywords

Return ONLY a valid JSON array:
[{{"context": "", "q": "...", "a": "...", "topic": "...", "keywords": [...]}}]

Text:
{extraction_content}"""

    qna_response = await reasoning_llm(
        prompt=qna_prompt,
        system="Expert interview question extractor. Return valid JSON array only.",
        temperature=0,
        max_tokens=8000,
    )
    try:
        import re
        match = re.search(r'\[\s*\{.*\}\s*\]', qna_response, re.DOTALL)
        qna_clean = match.group(0) if match else qna_response.replace("```json", "").replace("```", "").strip()
        qna_pairs = json.loads(qna_clean)
        if isinstance(qna_pairs, list):
            for pair in qna_pairs:
                ctx = pair.pop("context", "").strip()
                # Ignore generic/invented contexts from the LLM
                if ctx and ctx.lower() not in ["none", "n/a", "null", "general", "interview", "general context"]:
                    pair["q"] = f"**Situation:** {ctx}\n\n**Question:** {pair['q']}"
            return True, qna_pairs
    except Exception as e:
        print("Failed to parse QnA pairs:", e)
    return True, []


# ── Node: Parallel analysis (domain + difficulty + tree + qna) ────────────────

async def analyze_all(state: LinkedInState) -> dict:
    """
    Runs four independent analyses in parallel via asyncio.gather():
      • infer knowledge domain
      • score difficulty
      • place in knowledge tree
      • detect interview QnA (+ extract pairs if needed)
    """
    domain_task   = _infer_domain(state)
    diff_task     = _score_difficulty(state)
    tree_task     = _place_in_knowledge_tree(state)
    qna_task      = _detect_and_extract_qna(state)

    domain, difficulty, tree_path, (is_qna, qna_pairs) = await asyncio.gather(
        domain_task, diff_task, tree_task, qna_task
    )

    is_qna = is_qna and len(qna_pairs) > 0

    steps = [
        f"📁 Domain: {domain}",
        f"✅ Difficulty: {difficulty}/5",
        f"✅ Tree: {tree_path}",
    ]
    if is_qna:
        steps.append(f"✅ Interview QnA detected ({len(qna_pairs)} pairs)")

    return {
        "knowledge_domain": domain,
        "difficulty":       difficulty,
        "knowledge_tree":   tree_path,
        "is_interview_qna": is_qna,
        "qna_pairs":        qna_pairs,
        "agent_steps":      steps,
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
    graph.add_node("analyze_all",          analyze_all)   # parallel: domain+diff+tree+qna

    graph.set_entry_point("fetch_page")
    graph.add_edge("fetch_page",           "extract_post")
    graph.add_edge("extract_post",         "download_attachments")
    graph.add_edge("download_attachments", "build_combined_text")
    graph.add_edge("build_combined_text",  "summarize")
    graph.add_edge("summarize",            "extract_concepts")
    graph.add_edge("extract_concepts",     "generate_metadata")
    graph.add_edge("generate_metadata",    "analyze_all")
    graph.add_edge("analyze_all",          END)

    return graph


linkedin_subgraph = build_linkedin_subgraph()
