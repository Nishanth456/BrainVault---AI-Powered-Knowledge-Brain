"""
research_agent.py — Research paper ingestion LangGraph subgraph.

Pipeline:
  resolve_source → [download_pdf → extract_pdf_text] → extract_research_title → extract_structured
  → summarize → extract_concepts → generate_metadata → score_difficulty
  → place_in_tree → END

For generic research URLs (ResearchGate, etc.) without a downloadable PDF,
the PDF branch is skipped and the abstract is used as the content source.
"""
import os
import uuid
import json
import re
import tempfile
from langgraph.graph import StateGraph, END
from typing import TypedDict, Optional

from backend.tools.arxiv_client import resolve_research_source, download_arxiv_pdf
from backend.tools.pdf_extractor import pdf_extractor
from backend.services.llm import call_llm
from backend.services.minio import upload_bytes
from backend.config import settings


# ── Research-specific state ───────────────────────────────────────────────────

class ResearchState(TypedDict):
    url: str
    concept: Optional[str]
    "source_type": Optional[str]          # arxiv | pdf_url | generic_research_url | upload
    arxiv_id: Optional[str]
    title: Optional[str]
    authors: list[str]
    published_date: Optional[str]
    abstract: Optional[str]
    primary_category: Optional[str]
    pdf_url: Optional[str]
    source_url: Optional[str]
    local_pdf_path: Optional[str]
    minio_path: Optional[str]
    article_text: Optional[str]
    structured: Optional[dict]          # problem, methods, results, conclusion, etc.
    summary: Optional[str]
    key_concepts: Optional[list[str]]
    tags: Optional[list[str]]
    metadata: Optional[dict]
    difficulty: Optional[int]
    knowledge_tree: Optional[str]
    knowledge_domain: Optional[str]
    agent_steps: list[str]
    error: Optional[str]


# ── Shared taxonomy (keep in sync with other agents) ──────────────────────────

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


# ── Node 1: Resolve source metadata ────────────────────────────────────────────

async def resolve_source_node(state: ResearchState) -> dict:
    """Resolve arXiv / PDF / generic research URL into metadata and a PDF download URL."""
    url = state["url"].strip()
    try:
        resolved = await resolve_research_source(url)
        return {
            "source_type":      resolved["source_type"],
            "arxiv_id":         resolved["arxiv_id"],
            "title":            resolved["title"],
            "authors":          resolved["authors"],
            "published_date":   resolved["published"],
            "abstract":         resolved["abstract"],
            "primary_category": resolved["primary_category"],
            "pdf_url":          resolved["pdf_url"],
            "source_url":       resolved["source_url"],
            "agent_steps":      [f"✅ Resolved research source: {resolved['source_type']}"],
        }
    except Exception as e:
        return {
            "error": f"Failed to resolve research source: {e}",
            "agent_steps": ["❌ Failed to resolve research source"],
        }


# ── Node 2: Download PDF ──────────────────────────────────────────────────────

async def download_pdf_node(state: ResearchState) -> dict:
    """Download the PDF to a temp file and upload to MinIO."""
    pdf_url = state.get("pdf_url")
    if not pdf_url:
        return {
            "error": "No PDF URL available",
            "agent_steps": ["❌ No PDF URL available"],
        }

    try:
        tmp_dir = tempfile.gettempdir()
        filename = f"research_{state.get('arxiv_id') or uuid.uuid4().hex[:12]}.pdf"
        local_path = os.path.join(tmp_dir, filename)

        if state.get("source_type") == "arxiv" and state.get("arxiv_id"):
            await download_arxiv_pdf(state["arxiv_id"], local_path)
        else:
            import httpx
            async with httpx.AsyncClient(timeout=120, headers={"User-Agent": "Mozilla/5.0"}, follow_redirects=True) as client:
                resp = await client.get(pdf_url)
                resp.raise_for_status()
                with open(local_path, "wb") as f:
                    f.write(resp.content)

        with open(local_path, "rb") as f:
            pdf_bytes = f.read()

        minio_path = upload_bytes(
            filename=f"papers/{filename}",
            data=pdf_bytes,
            content_type="application/pdf",
        )

        return {
            "local_pdf_path": local_path,
            "minio_path": minio_path,
            "agent_steps": [
                f"✅ Downloaded PDF ({len(pdf_bytes):,} bytes)",
                f"✅ Uploaded to MinIO: {minio_path}",
            ],
        }
    except Exception as e:
        return {
            "error": f"Failed to download PDF: {e}",
            "agent_steps": ["❌ Failed to download PDF"],
        }


# ── Node 3: Extract text from PDF ─────────────────────────────────────────────

async def extract_pdf_text_node(state: ResearchState) -> dict:
    """Extract text from the downloaded PDF using PyMuPDF."""
    local_path = state.get("local_pdf_path")
    if not local_path or not os.path.exists(local_path):
        return {
            "error": "PDF file not found",
            "agent_steps": ["❌ PDF file not found"],
        }

    try:
        extracted = pdf_extractor.extract_from_path(local_path)
        text = extracted["full_text"]
        page_count = extracted["page_count"]

        # Prefer arXiv/generic title/author from metadata if not already set
        title = state.get("title") or extracted["metadata"].get("title")
        author = state.get("authors")[0] if state.get("authors") else extracted["metadata"].get("author")

        return {
            "title": title,
            "article_text": text,
            "metadata": {
                **(state.get("metadata") or {}),
                "page_count": page_count,
                "pdf_author": author,
            },
            "agent_steps": [f"✅ Extracted {page_count} pages ({len(text):,} chars)"],
        }
    except Exception as e:
        return {
            "error": f"Failed to extract PDF text: {e}",
            "agent_steps": ["❌ Failed to extract PDF text"],
        }


# ── Node 4: Structured extraction with Gemini ─────────────────────────────────

async def extract_structured_node(state: ResearchState) -> dict:
    """Use Gemini 2.5 Flash for long-context structured extraction."""
    text = (state.get("article_text") or "")[:30000]
    abstract = state.get("abstract") or ""
    title = state.get("title") or "Untitled Research Paper"

    # For generic research URLs without full text, build a lightweight structured stub
    if state.get("source_type") == "generic_research_url" and not text.strip():
        return {
            "structured": {
                "problem": abstract.strip() or "Research problem described on the source page.",
                "methods": "See source page for detailed methodology.",
                "results": "See source page for detailed results.",
                "conclusion": "See source page for conclusions.",
                "limitations": "Not stated",
                "future_work": "Not stated",
            },
            "agent_steps": ["✅ Structured extraction skipped for generic URL, using abstract"],
        }

    prompt = f"""Analyze this research paper and return a JSON object with these exact keys:
- "problem": the problem or research question addressed (2-4 sentences)
- "methods": the methods, model, dataset, or approach used (2-4 sentences)
- "results": the key results, metrics, or findings (2-4 sentences)
- "conclusion": the conclusion or implications (2-4 sentences)
- "limitations": any limitations mentioned (1-3 sentences, or "Not stated")
- "future_work": future work or open questions (1-3 sentences, or "Not stated")

CRITICAL RULES:
- Output ONLY the JSON object. No markdown, no explanation, no code fences.
- Do NOT start with "Here is" or any meta-preface.
- Be specific and technical. Use numbers and model names when available.

Title: {title}
Abstract: {abstract}

Paper text:
{text}

Return ONLY valid JSON."""

    try:
        response = await call_llm(
            prompt=prompt,
            model="gemini/gemini-2.5-flash-preview-05-20",
            system="You are a research paper analysis assistant. Return only valid JSON.",
            max_tokens=2000,
            temperature=0,
        )

        clean = response.strip()
        if clean.startswith("```"):
            clean = re.sub(r"^```(?:json)?\s*|\s*```$", "", clean, flags=re.DOTALL).strip()

        structured = json.loads(clean)
        required = ["problem", "methods", "results", "conclusion", "limitations", "future_work"]
        for key in required:
            if key not in structured:
                structured[key] = "Not available"

        return {
            "structured": structured,
            "agent_steps": ["✅ Structured extraction completed"],
        }
    except Exception as e:
        print("Structured extraction failed:", e)
        return {
            "structured": {
                "problem": "Not available",
                "methods": "Not available",
                "results": "Not available",
                "conclusion": "Not available",
                "limitations": "Not available",
                "future_work": "Not available",
            },
            "agent_steps": ["⚠️ Structured extraction failed, using fallback"],
        }


# ── Node 5: Summarize paper ─────────────────────────────────────────────────────

async def summarize_research_node(state: ResearchState) -> dict:
    """Create a concise 3-5 sentence summary of the paper."""
    text = (state.get("article_text") or "")[:12000]
    abstract = state.get("abstract") or ""

    # If we have a good abstract but no extracted text, use the abstract as the summary
    if not text.strip() and abstract.strip():
        return {
            "summary": abstract.strip(),
            "agent_steps": ["✅ Research summary generated from abstract"],
        }

    summary = await call_llm(
        prompt=f"""Summarize this research paper in 3-5 short sentences as one paragraph.
Focus on the key contribution, method, and result.

CRITICAL RULES:
- Output ONLY the summary sentences.
- Do NOT start with "Here is a summary", "In summary", "This paper", or any meta-text.
- Do NOT add an introduction, conclusion, or explanation.
- Do NOT use bullet points or numbered lists.

Abstract: {abstract}

Paper text:
{text}""",
        model="gemini/gemini-2.5-flash-preview-05-20",
        system="You are a technical knowledge extraction expert. Return only the requested summary with no meta commentary.",
        max_tokens=400,
    )

    meta_prefixes = [
        r"(?i)^here\s+is\s+a\s+summary[^\n]*",
        r"(?i)^here\s+is\s+the\s+summary[^\n]*",
        r"(?i)^in\s+summary[^\n]*",
        r"(?i)^this\s+paper\s+discusses[^\n]*",
        r"(?i)^summary[^\n]*",
    ]
    for pattern in meta_prefixes:
        summary = re.sub(pattern, "", summary).strip()

    return {
        "summary": summary,
        "agent_steps": ["✅ Research summary generated"],
    }


# ── Node 6: Extract concepts + tags ────────────────────────────────────────────

async def extract_research_concepts_node(state: ResearchState) -> dict:
    """Extract key concepts and short tags from the paper."""
    text = (state.get("article_text") or "")[:6000]
    abstract = (state.get("abstract") or "")[:2000]
    concept = state.get("concept") or ""
    category = state.get("primary_category") or ""

    context = text.strip() or abstract.strip()

    response = await call_llm(
        prompt=f"""Extract key concepts and tags from this research paper.
Return a JSON object with two lists:
- "concepts": 4-10 specific technical concepts
- "tags": 3-6 short tags

{f'Primary concept (must be included): {concept}' if concept else ''}
{f'Paper category: {category}' if category else ''}

Paper text:
{context}

Return ONLY valid JSON, nothing else.""",
        model="groq/llama-3.1-8b-instant",
        system="You are a technical content analyst. Always return valid JSON.",
        max_tokens=300,
        temperature=0,
    )

    try:
        clean = response.strip().strip("```json").strip("```").strip()
        data = json.loads(clean)
        concepts = data.get("concepts", [])
        tags = data.get("tags", [])
    except Exception:
        concepts = [concept] if concept else []
        tags = [concept] if concept else []

    return {
        "key_concepts": concepts,
        "tags": tags,
        "agent_steps": [f"✅ Extracted {len(concepts)} concepts, {len(tags)} tags"],
    }


# ── Node 7: Generate metadata ────────────────────────────────────────────────

async def generate_research_metadata_node(state: ResearchState) -> dict:
    """Generate reading time and importance score."""
    text = state.get("article_text") or ""
    word_count = len(text.split())
    reading_time = max(1, round(word_count / 150))

    summary = state.get("summary", "")
    concepts = state.get("key_concepts", [])
    tags = state.get("tags", [])
    existing_title = state.get("title") or "Untitled Research Paper"

    response = await call_llm(
        prompt=f"""Rate the importance of this research paper on a scale of 1-10.
Return ONLY a JSON object:

{{
  "importance_score": <integer 1-10>
}}

Title: {existing_title}
Summary: {summary}
Concepts: {concepts}
Tags: {tags}

Return ONLY valid JSON.""",
        model="groq/llama-3.3-70b-versatile",
        system="You are a knowledge management expert. Return only valid JSON with the importance score.",
        max_tokens=100,
        temperature=0,
    )

    try:
        clean = response.strip().strip("```json").strip("```").strip()
        metadata = json.loads(clean)
        importance_score = max(1, min(10, int(metadata.get("importance_score", 5))))
    except Exception:
        importance_score = 5

    metadata = {
        "title": existing_title,
        "importance_score": importance_score,
        "reading_time_minutes": reading_time,
        "page_count": (state.get("metadata") or {}).get("page_count"),
    }

    return {
        "metadata": metadata,
        "agent_steps": [f"✅ Metadata generated — {reading_time} min read"],
    }


async def extract_research_title_node(state: ResearchState) -> dict:
    """If the generic scraper only gave a generic title, ask LLM to extract the exact paper title."""
    title = state.get("title") or ""
    text = (state.get("article_text") or "")[:4000]
    abstract = (state.get("abstract") or "")[:1500]

    # If title looks already specific (more than 8 words), trust it
    if len(title.split()) >= 8:
        return {"title": title, "agent_steps": ["✅ Title already specific, kept as-is"]}

    if not text.strip() and not abstract.strip():
        return {"title": title or "Untitled Research Paper", "agent_steps": ["⚠️ No content to extract title from"]}

    response = await call_llm(
        prompt=f"""Extract the exact title of the research paper from this text.
Return ONLY a JSON object:

{{
  "title": "The exact paper title as it appears on the page"
}}

Current title hint: {title or "unknown"}

Text:
{text or abstract}

Return ONLY valid JSON. Do NOT rewrite or summarise the title.""",
        model="groq/llama-3.1-8b-instant",
        system="You are a metadata extraction assistant. Return only the exact title in valid JSON.",
        max_tokens=150,
        temperature=0,
    )

    try:
        clean = response.strip().strip("```json").strip("```").strip()
        data = json.loads(clean)
        final_title = data.get("title") or title or "Untitled Research Paper"
    except Exception:
        final_title = title or "Untitled Research Paper"

    return {
        "title": final_title,
        "agent_steps": [f"✅ Extracted exact paper title: {final_title}"],
    }


# ── Node 8: Score difficulty ──────────────────────────────────────────────────

async def score_research_difficulty_node(state: ResearchState) -> dict:
    """Score technical difficulty 1-5."""
    summary = state.get("summary", "")
    concepts = state.get("key_concepts", [])

    response = await call_llm(
        prompt=f"""Rate the technical difficulty of this research paper on a scale of 1-5:
1 = Beginner
2 = Basic
3 = Intermediate
4 = Advanced
5 = Expert

Summary: {summary}
Concepts: {concepts}

Reply with ONLY the number (1, 2, 3, 4, or 5). Nothing else.""",
        model="groq/llama-3.3-70b-versatile",
        system="You are a technical difficulty assessor.",
        max_tokens=10,
        temperature=0,
    )

    try:
        clean = response.strip()
        difficulty = 3
        for char in clean:
            if char.isdigit():
                difficulty = max(1, min(5, int(char)))
                break
    except Exception:
        difficulty = 3

    return {
        "difficulty": difficulty,
        "agent_steps": [f"✅ Difficulty scored: {difficulty}/5"],
    }


# ── Node 9: Place in knowledge tree ──────────────────────────────────────────

async def place_research_in_tree_node(state: ResearchState) -> dict:
    """Map the paper to the predefined AI_CONCEPTS_LIST taxonomy."""
    text = (state.get("article_text") or "")[:4000]
    concept = state.get("concept") or ""
    category = state.get("primary_category") or ""

    response = await call_llm(
        prompt=f"""Determine where this research paper belongs in our predefined knowledge taxonomy.
You MUST choose exactly ONE concept from the provided ALLOWED_CONCEPTS list.

{f'User-provided concept (use to help pick): {concept}' if concept else ''}
{f'Paper category: {category}' if category else ''}

ALLOWED_CONCEPTS:
{', '.join(AI_CONCEPTS_LIST)}

Return ONLY a JSON object:
{{
  "tree_path": "The EXACT concept string you chose from the ALLOWED_CONCEPTS list",
  "domain": "One of: Artificial Intelligence, Machine Learning, Python, System Design, SQL, Cloud Computing, DevOps, Mathematics, General"
}}

Paper text:
{text}

Return ONLY valid JSON.""",
        model="groq/llama-3.3-70b-versatile",
        system="You are a knowledge taxonomy expert. Strictly adhere to the allowed list. Return only valid JSON.",
        max_tokens=200,
        temperature=0,
    )

    try:
        clean = response.strip().strip("```json").strip("```").strip()
        tree_data = json.loads(clean)
        chosen_path = tree_data.get("tree_path")
        domain = tree_data.get("domain", "General")
        if chosen_path not in AI_CONCEPTS_LIST:
            chosen_path = "Artificial Intelligence (AI)"
    except Exception:
        chosen_path = "Artificial Intelligence (AI)"
        domain = "General"

    return {
        "knowledge_tree": chosen_path,
        "knowledge_domain": domain,
        "agent_steps": [f"🌳 Placed in taxonomy: {chosen_path}"],
    }


# ── Build the Research subgraph ───────────────────────────────────────────────

def build_research_subgraph() -> StateGraph:
    graph = StateGraph(ResearchState)

    graph.add_node("resolve_source",       resolve_source_node)
    graph.add_node("download_pdf",         download_pdf_node)
    graph.add_node("extract_pdf_text",     extract_pdf_text_node)
    graph.add_node("extract_research_title", extract_research_title_node)
    graph.add_node("extract_structured",   extract_structured_node)
    graph.add_node("summarize",            summarize_research_node)
    graph.add_node("extract_concepts",     extract_research_concepts_node)
    graph.add_node("generate_metadata",    generate_research_metadata_node)
    graph.add_node("score_difficulty",     score_research_difficulty_node)
    graph.add_node("place_in_tree",        place_research_in_tree_node)

    graph.set_entry_point("resolve_source")
    graph.add_conditional_edges(
        "resolve_source",
        route_after_resolve,
        {
            "download_pdf": "download_pdf",
            "skip_pdf": "extract_research_title",
        },
    )
    graph.add_edge("download_pdf",       "extract_pdf_text")
    graph.add_edge("extract_pdf_text",   "extract_research_title")
    graph.add_edge("extract_research_title", "extract_structured")
    graph.add_edge("extract_structured", "summarize")
    graph.add_edge("summarize",          "extract_concepts")
    graph.add_edge("extract_concepts",   "generate_metadata")
    graph.add_edge("generate_metadata",  "score_difficulty")
    graph.add_edge("score_difficulty",   "place_in_tree")
    graph.add_edge("place_in_tree",      END)

    return graph


def route_after_resolve(state: ResearchState) -> str:
    """For generic research URLs without a downloadable PDF, skip PDF download/extraction."""
    source_type = state.get("source_type")
    pdf_url = state.get("pdf_url")
    if source_type == "generic_research_url" or not pdf_url:
        return "skip_pdf"
    return "download_pdf"


research_subgraph = build_research_subgraph()
