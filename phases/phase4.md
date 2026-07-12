# 🔬 Phase 4 — Research Paper Agent

> **Prerequisite**: Phase 3 complete — blog agent works, master graph routes by type, storage layer handles `attachments`, and the Blog Library UI style is established.
>
> **Goal**: Paste an ArXiv URL, a research PDF URL, or upload a PDF → real-time agent pipeline runs → a structured card appears in the Research Papers Library. Click it → see a structured breakdown and read the PDF in-app.
>
> **UI Rule**: Tiles and flow must reflect the current Blog Agent style — full-width horizontal cards, grouped by knowledge tree, source link to the original, clean metadata chips.

---

## ✅ What You Ship at the End of Phase 4

```
1. Paste an ArXiv URL (e.g. https://arxiv.org/abs/2305.10601)
   OR a direct PDF URL
   OR upload a PDF file
2. Watch the real-time step-by-step agent progress stream in the UI
3. Research Papers Library page shows a card for that paper:
   - Exact paper title (preserved from source, not rewritten)
   - Authors + year + source (arXiv / PDF)
   - Domain badge: NLP / CV / LLMs / Robotics / Healthcare / Security / Other
   - 5-sentence accessible AI summary
   - Difficulty badge (1–5)
   - Tags + key concepts chips
   - Knowledge tree path: "AI → LLMs → RAG"
4. Click the card → open the Paper Detail view:
   - Structured breakdown (accordion):
     · Abstract
     · Problem Statement
     · Methodology / Approach
     · Model Architecture (if applicable)
     · Dataset Used
     · Results & Metrics
     · Key Contributions
     · Limitations
     · Future Work
   - "📖 Read Full Paper" button → opens the in-app PDF reader
   - "🔗 Open Original" button → opens arXiv / source URL in new tab
5. All data persisted in PostgreSQL + Qdrant
   - Original PDF stored in MinIO
   - Attachment row linked to the knowledge item
```

---

## 📁 New Files to Create / Update

```
backend/
├── agents/
│   ├── research_agent.py       ← NEW: Research Paper LangGraph subgraph
│   └── orchestrator.py         ← UPDATE: replace research stub with real adapter
├── tools/
│   ├── arxiv_client.py         ← NEW: arXiv metadata + PDF download
│   └── pdf_extractor.py        ← UPDATE: add extract_all_text + structured extraction helpers
├── routers/
│   ├── knowledge.py            ← UPDATE: add GET /api/knowledge/papers
│   └── files.py                ← UPDATE: ensure /api/files/{path} serves research PDFs
├── models/
│   └── schemas.py              ← UPDATE: add research_paper type if not present
├── services/
│   └── storage_service.py      ← UPDATE: handle type="research_paper"

frontend/
├── app/knowledge/papers/
│   ├── page.tsx                ← UPDATE: empty state → real grouped list
│   └── [id]/
│       └── page.tsx            ← NEW: paper detail view with structured breakdown
├── components/knowledge/
│   ├── PaperCard.tsx           ← NEW: full-width horizontal research paper tile
│   └── PaperDetail.tsx         ← NEW: structured breakdown accordion
├── app/knowledge/linkedin/[id]/reader/
│   └── page.tsx                ← REUSE: same in-app PDF reader component
└── lib/api.ts                  ← UPDATE: add listPapers(), getPaper(id)
```

---

## 🐍 Backend Implementation

### 1. `backend/tools/arxiv_client.py` — ArXiv Metadata + PDF Fetcher

```python
"""
arxiv_client.py — Fetch metadata and PDF from arXiv URLs.

Supports:
- https://arxiv.org/abs/2305.10601
- https://arxiv.org/pdf/2305.10601.pdf
"""
import httpx
import re
from urllib.parse import urlparse


ARXIV_ID_RE = re.compile(r"(\d{4}\.\d{4,5})(?:v\d+)?")


def _extract_arxiv_id(url: str) -> str | None:
    path = urlparse(url).path
    match = ARXIV_ID_RE.search(path)
    return match.group(1) if match else None


def _is_arxiv(url: str) -> bool:
    return "arxiv.org" in urlparse(url).netloc.lower()


async def fetch_arxiv_metadata(arxiv_id: str) -> dict:
    """Fetch arXiv metadata via the export API (no key required)."""
    url = f"http://export.arxiv.org/api/query?id_list={arxiv_id}"
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        xml = resp.text

    # Minimal XML parsing
    import xml.etree.ElementTree as ET
    root = ET.fromstring(xml)
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    entry = root.find("atom:entry", ns)
    if entry is None:
        raise ValueError("No arXiv entry found")

    title = entry.findtext("atom:title", "", ns).strip().replace("\n", " ")
    summary = entry.findtext("atom:summary", "", ns).strip()
    published = entry.findtext("atom:published", "", ns)[:10]

    authors = []
    for author in entry.findall("atom:author", ns):
        name = author.findtext("atom:name", "", ns)
        if name:
            authors.append(name)

    # Primary category
    category = ""
    cat_el = entry.find("atom:category", ns)
    if cat_el is not None:
        category = cat_el.get("term", "")

    pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"

    return {
        "arxiv_id": arxiv_id,
        "title": title,
        "authors": authors,
        "published": published,
        "summary": summary,
        "primary_category": category,
        "pdf_url": pdf_url,
        "source_url": f"https://arxiv.org/abs/{arxiv_id}",
    }


async def download_arxiv_pdf(arxiv_id: str, output_path: str) -> None:
    """Download the PDF to a local path."""
    pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        resp = await client.get(pdf_url)
        resp.raise_for_status()
        with open(output_path, "wb") as f:
            f.write(resp.content)


async def resolve_research_source(url: str) -> dict:
    """
    Resolve a research URL into metadata + a local PDF path.
    Returns: {
        "source_type": "arxiv" | "pdf_url" | "upload",
        "title": str | None,
        "authors": list[str],
        "published": str | None,
        "abstract": str | None,
        "primary_category": str,
        "pdf_url": str,
        "source_url": str,
        "arxiv_id": str | None,
    }
    """
    if _is_arxiv(url):
        arxiv_id = _extract_arxiv_id(url)
        if not arxiv_id:
            raise ValueError("Could not extract arXiv ID from URL")
        meta = await fetch_arxiv_metadata(arxiv_id)
        return {
            "source_type": "arxiv",
            "title": meta["title"],
            "authors": meta["authors"],
            "published": meta["published"],
            "abstract": meta["summary"],
            "primary_category": meta["primary_category"],
            "pdf_url": meta["pdf_url"],
            "source_url": meta["source_url"],
            "arxiv_id": arxiv_id,
        }

    # Direct PDF URL
    if url.lower().endswith(".pdf"):
        return {
            "source_type": "pdf_url",
            "title": None,
            "authors": [],
            "published": None,
            "abstract": None,
            "primary_category": "",
            "pdf_url": url,
            "source_url": url,
            "arxiv_id": None,
        }

    raise ValueError("Unsupported research source. Use an arXiv URL or direct PDF URL.")
```

---

### 2. `backend/tools/pdf_extractor.py` — PDF Text Extraction Helpers

Add these helpers to the existing `backend/tools/pdf_extractor.py`:

```python
import fitz  # PyMuPDF


def extract_all_text(pdf_path: str) -> str:
    """Extract all text from a PDF file."""
    doc = fitz.open(pdf_path)
    parts = []
    for page in doc:
        parts.append(page.get_text())
    doc.close()
    return "\n\n".join(parts)


def count_pdf_pages(pdf_path: str) -> int:
    """Return the number of pages in a PDF."""
    doc = fitz.open(pdf_path)
    count = len(doc)
    doc.close()
    return count
```

---

### 3. `backend/agents/research_agent.py` — Research Paper LangGraph Subgraph

```python
"""
research_agent.py — Research paper ingestion LangGraph subgraph.

Pipeline:
  resolve_source → download_pdf → extract_text → structured_extraction
  → summarize → extract_concepts → classify_domain → generate_metadata
  → score_difficulty → place_in_tree → detect_interview_qna → END
"""
from langgraph.graph import StateGraph, END
from typing import TypedDict, Optional
from backend.tools.arxiv_client import resolve_research_source, download_arxiv_pdf
from backend.tools.pdf_extractor import extract_all_text, count_pdf_pages
from backend.services.llm import call_llm
from backend.services.minio import upload_file
import json
import os
import tempfile
import re


# ── Research-specific state ───────────────────────────────────────────────────

class ResearchState(TypedDict):
    url: str  # arXiv URL, PDF URL, or local file path for uploads
    concept: Optional[str]
    source_type: Optional[str]  # arxiv | pdf_url | upload
    arxiv_id: Optional[str]
    title: Optional[str]
    authors: list[str]
    published: Optional[str]
    abstract: Optional[str]
    primary_category: Optional[str]
    pdf_url: Optional[str]
    source_url: Optional[str]
    local_pdf_path: Optional[str]
    minio_path: Optional[str]
    full_text: Optional[str]
    page_count: Optional[int]
    structured: Optional[dict]
    summary: Optional[str]
    key_concepts: Optional[list[str]]
    tags: Optional[list[str]]
    domain: Optional[str]
    metadata: Optional[dict]
    difficulty: Optional[int]
    knowledge_tree: Optional[str]
    knowledge_domain: Optional[str]
    is_interview_qna: Optional[bool]
    qna_pairs: Optional[list[dict]]
    agent_steps: list[str]
    error: Optional[str]


# ── Shared taxonomy (keep in sync with linkedin_agent.py / blog_agent.py) ─

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


RESEARCH_DOMAINS = [
    "Natural Language Processing (NLP)",
    "Computer Vision (CV)",
    "Large Language Models (LLMs)",
    "Multimodal AI",
    "Reinforcement Learning",
    "Robotics",
    "Healthcare AI",
    "Security / AI Safety",
    "AI Systems / MLOps",
    "General AI / Other",
]


# ── Node 1: Resolve source ──────────────────────────────────────────────────

async def resolve_source_node(state: ResearchState) -> dict:
    """Resolve arXiv / PDF URL into metadata and a downloadable PDF URL."""
    url = state["url"]
    try:
        info = await resolve_research_source(url)
        return {
            "source_type": info["source_type"],
            "arxiv_id": info["arxiv_id"],
            "title": info["title"],
            "authors": info["authors"],
            "published": info["published"],
            "abstract": info["abstract"],
            "primary_category": info["primary_category"],
            "pdf_url": info["pdf_url"],
            "source_url": info["source_url"],
            "agent_steps": [f"✅ Resolved {info['source_type']} source: {info.get('arxiv_id') or url}"],
        }
    except Exception as e:
        return {
            "error": f"Failed to resolve research source: {e}",
            "agent_steps": ["❌ Failed to resolve research source"],
        }


# ── Node 2: Download PDF ───────────────────────────────────────────────────

async def download_pdf_node(state: ResearchState) -> dict:
    """Download the PDF to a temporary local path."""
    pdf_url = state.get("pdf_url")
    if not pdf_url:
        return {"error": "No PDF URL available", "agent_steps": ["❌ No PDF URL available"]}

    try:
        suffix = f"_{state.get('arxiv_id', 'paper')}.pdf" if state.get("arxiv_id") else ".pdf"
        fd, local_path = tempfile.mkstemp(suffix=suffix)
        os.close(fd)

        if state.get("source_type") == "arxiv":
            await download_arxiv_pdf(state["arxiv_id"], local_path)
        else:
            async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
                resp = await client.get(pdf_url)
                resp.raise_for_status()
                with open(local_path, "wb") as f:
                    f.write(resp.content)

        return {
            "local_pdf_path": local_path,
            "agent_steps": [f"✅ Downloaded PDF to {local_path}"],
        }
    except Exception as e:
        return {
            "error": f"Failed to download PDF: {e}",
            "agent_steps": ["❌ Failed to download PDF"],
        }


# ── Node 3: Extract text ──────────────────────────────────────────────────────

async def extract_text_node(state: ResearchState) -> dict:
    """Extract full text and page count from the local PDF."""
    local_path = state.get("local_pdf_path")
    if not local_path or not os.path.exists(local_path):
        return {"error": "PDF not found", "agent_steps": ["❌ PDF not found"]}

    try:
        full_text = extract_all_text(local_path)
        page_count = count_pdf_pages(local_path)
        return {
            "full_text": full_text,
            "page_count": page_count,
            "agent_steps": [
                f"✅ Extracted {page_count} pages",
                f"✅ Extracted {len(full_text):,} characters of text",
            ],
        }
    except Exception as e:
        return {
            "error": f"Failed to extract PDF text: {e}",
            "agent_steps": ["❌ Failed to extract PDF text"],
        }


# ── Node 4: Structured extraction ───────────────────────────────────────────

async def structured_extraction_node(state: ResearchState) -> dict:
    """Use Gemini 2.5 Flash (or Groq fallback) to extract structured paper info."""
    text = (state.get("full_text") or "")[:120000]  # Gemini 2.5 Flash has 1M context; cap for safety
    abstract = state.get("abstract") or ""
    title = state.get("title") or ""

    prompt = f"""Analyze this research paper and return a JSON object with these fields:
{{
  "abstract": "paper abstract (or concise summary if abstract not provided)",
  "problem_statement": "what problem does the paper address?",
  "methodology": "what approach/method does the paper propose?",
  "model_architecture": "describe the model or system architecture, if any",
  "dataset": "what dataset(s) were used?",
  "results": "what are the main results and metrics?",
  "key_contributions": ["contribution 1", "contribution 2", ...],
  "limitations": "what limitations does the paper mention?",
  "future_work": "what future work does the paper suggest?"
}}

Title: {title}
Abstract: {abstract}

Text:
{text}

Return ONLY valid JSON."""

    try:
        response = await call_llm(
            prompt=prompt,
            model="gemini/gemini-2.5-flash-preview-05-20",
            system="You are a research paper analysis expert. Return only valid JSON.",
            max_tokens=2000,
            temperature=0,
            fallback_model="groq/llama-3.3-70b-versatile",
        )
        clean = response.strip().strip("```json").strip("```").strip()
        structured = json.loads(clean)
    except Exception as e:
        # Fallback: minimal structured data
        structured = {
            "abstract": abstract or "",
            "problem_statement": "",
            "methodology": "",
            "model_architecture": "",
            "dataset": "",
            "results": "",
            "key_contributions": [],
            "limitations": "",
            "future_work": "",
        }

    return {
        "structured": structured,
        "agent_steps": ["✅ Structured paper breakdown extracted"],
    }


# ── Node 5: Summarize ────────────────────────────────────────────────────────

async def summarize_research_node(state: ResearchState) -> dict:
    """Generate an accessible 5-sentence summary."""
    text = (state.get("full_text") or "")[:8000]
    abstract = state.get("abstract") or ""

    summary = await call_llm(
        prompt=f"""Summarize this research paper in 5 short sentences for a technical but non-expert audience.
Avoid jargon where possible. Focus on what the paper does and why it matters.

CRITICAL RULES:
- Output ONLY the summary sentences.
- Do NOT start with "Here is a summary", "In summary", "This paper discusses", or similar meta-text.
- Do NOT add an introduction, conclusion, or explanation.
- Do NOT use bullet points or numbered lists.

Abstract:
{abstract}

Text:
{text}""",
        model="groq/gemma2-9b-it",
        system="You are a research communication expert. Return only the summary with no meta commentary.",
        max_tokens=400,
    )

    # Strip common LLM meta-prefaces as a safety net
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
        "agent_steps": ["✅ Paper summary generated"],
    }


# ── Node 6: Extract concepts + tags ─────────────────────────────────────────

async def extract_research_concepts(state: ResearchState) -> dict:
    """Extract key concepts and tags from the paper."""
    text = (state.get("full_text") or "")[:5000]
    concept = state.get("concept") or ""

    response = await call_llm(
        prompt=f"""Extract key concepts and tags from this research paper.
Return a JSON object with two lists:
- "concepts": 4-10 specific technical concepts
- "tags": 3-6 short tags

{f'Primary concept (must be included): {concept}' if concept else ''}

Text:
{text}

Return ONLY valid JSON, nothing else.""",
        model="groq/llama-3.1-8b-it",
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
        concepts = [concept] if concept else []
        tags = [concept] if concept else []

    return {
        "key_concepts": concepts,
        "tags": tags,
        "agent_steps": [f"✅ Extracted {len(concepts)} concepts, {len(tags)} tags"],
    }


# ── Node 7: Classify domain ──────────────────────────────────────────────────

async def classify_domain_node(state: ResearchState) -> dict:
    """Classify the paper into a research domain."""
    text = (state.get("full_text") or "")[:4000]
    abstract = state.get("abstract") or ""
    category = state.get("primary_category") or ""

    response = await call_llm(
        prompt=f"""Classify this research paper into exactly one of these domains:
{', '.join(RESEARCH_DOMAINS)}

Primary arXiv category: {category or 'unknown'}
Abstract: {abstract}
Text sample: {text}

Reply with ONLY the domain name. Nothing else.""",
        model="groq/llama-3.1-8b-it",
        system="You are a research domain classifier.",
        max_tokens=30,
        temperature=0,
    )

    domain = response.strip()
    if domain not in RESEARCH_DOMAINS:
        domain = "General AI / Other"

    return {
        "domain": domain,
        "agent_steps": [f"✅ Domain classified: {domain}"],
    }


# ── Node 8: Generate metadata ─────────────────────────────────────────────────

async def generate_research_metadata(state: ResearchState) -> dict:
    """Generate metadata, preserving the exact source title."""
    text = state.get("full_text") or ""
    word_count = len(text.split())
    reading_time = max(1, round(word_count / 200))

    existing_title = state.get("title") or "Untitled Research Paper"
    authors = state.get("authors") or []
    published = state.get("published") or ""
    page_count = state.get("page_count") or 0
    domain = state.get("domain") or "General AI / Other"

    response = await call_llm(
        prompt=f"""Rate the importance of this research paper on a scale of 1-10.
Return ONLY a JSON object:

{{
  "importance_score": <integer 1-10>
}}

Title: {existing_title}
Domain: {domain}
Authors: {', '.join(authors)}
Published: {published}
Pages: {page_count}

Return ONLY valid JSON.""",
        model="groq/llama-3.3-70b-versatile",
        system="You are a knowledge management expert. Return only valid JSON with the importance score.",
        max_tokens=100,
        temperature=0,
    )

    try:
        clean = response.strip().strip("```json").strip("```").strip()
        data = json.loads(clean)
        importance_score = max(1, min(10, int(data.get("importance_score", 5))))
    except Exception:
        importance_score = 5

    metadata = {
        "title": existing_title,
        "authors": authors,
        "published": published,
        "domain": domain,
        "page_count": page_count,
        "importance_score": importance_score,
        "reading_time_minutes": reading_time,
    }

    return {
        "metadata": metadata,
        "agent_steps": [f"✅ Metadata generated — {reading_time} min read"],
    }


# ── Node 9: Score difficulty ──────────────────────────────────────────────────

async def score_research_difficulty(state: ResearchState) -> dict:
    """Score technical difficulty 1-5."""
    summary = state.get("summary", "")
    concepts = state.get("key_concepts", [])
    structured = state.get("structured") or {}

    response = await call_llm(
        prompt=f"""Rate the technical difficulty of this research paper on a scale of 1-5:
1 = Survey / accessible overview
2 = Introductory method
3 = Standard research paper
4 = Complex architecture or heavy math
5 = Cutting-edge / very technical

Summary: {summary}
Concepts: {concepts}
Methodology: {structured.get('methodology', '')}

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


# ── Node 10: Place in knowledge tree ────────────────────────────────────────

async def place_research_in_tree(state: ResearchState) -> dict:
    """Map the paper to the predefined AI_CONCEPTS_LIST taxonomy."""
    text = (state.get("full_text") or "")[:4000]
    concept = state.get("concept") or ""
    domain = state.get("domain") or ""

    response = await call_llm(
        prompt=f"""Determine where this research paper belongs in our predefined knowledge taxonomy.

Available concepts:
{', '.join(AI_CONCEPTS_LIST)}

Domain: {domain}
{f'User-provided concept (must be included): {concept}' if concept else ''}

Text sample:
{text}

Return ONLY the most specific concept name from the list above. Nothing else.""",
        model="groq/llama-3.3-70b-versatile",
        system="You are a knowledge taxonomy expert. Return only the concept name.",
        max_tokens=50,
        temperature=0,
    )

    tree = response.strip()
    if tree not in AI_CONCEPTS_LIST:
        tree = concept or domain or "Artificial Intelligence (AI)"

    return {
        "knowledge_tree": tree,
        "knowledge_domain": "Artificial Intelligence",
        "agent_steps": [f"✅ Placed in knowledge tree: {tree}"],
    }


# ── Node 11: Detect interview Q&A ───────────────────────────────────────────

async def detect_research_interview_qna(state: ResearchState) -> dict:
    """Research papers rarely contain interview Q&A, but check just in case."""
    return {
        "is_interview_qna": False,
        "qna_pairs": [],
        "agent_steps": ["✅ Interview Q&A check complete"],
    }


# ── Build the subgraph ──────────────────────────────────────────────────────

research_subgraph = StateGraph(ResearchState)

research_subgraph.add_node("resolve_source", resolve_source_node)
research_subgraph.add_node("download_pdf", download_pdf_node)
research_subgraph.add_node("extract_text", extract_text_node)
research_subgraph.add_node("structured_extraction", structured_extraction_node)
research_subgraph.add_node("summarize", summarize_research_node)
research_subgraph.add_node("extract_concepts", extract_research_concepts)
research_subgraph.add_node("classify_domain", classify_domain_node)
research_subgraph.add_node("generate_metadata", generate_research_metadata)
research_subgraph.add_node("score_difficulty", score_research_difficulty)
research_subgraph.add_node("place_in_tree", place_research_in_tree)
research_subgraph.add_node("detect_interview_qna", detect_research_interview_qna)

research_subgraph.set_entry_point("resolve_source")
research_subgraph.add_edge("resolve_source", "download_pdf")
research_subgraph.add_edge("download_pdf", "extract_text")
research_subgraph.add_edge("extract_text", "structured_extraction")
research_subgraph.add_edge("structured_extraction", "summarize")
research_subgraph.add_edge("summarize", "extract_concepts")
research_subgraph.add_edge("extract_concepts", "classify_domain")
research_subgraph.add_edge("classify_domain", "generate_metadata")
research_subgraph.add_edge("generate_metadata", "score_difficulty")
research_subgraph.add_edge("score_difficulty", "place_in_tree")
research_subgraph.add_edge("place_in_tree", "detect_interview_qna")
research_subgraph.add_edge("detect_interview_qna", END)
```

---

### 4. `backend/agents/orchestrator.py` — Wire Research Agent

Replace the research stub with a real adapter (similar to `blog_agent_node`):

```python
async def research_agent_node(state: BrainVaultState) -> dict:
    """
    Adapter: runs the Research Paper LangGraph subgraph and merges results
    back into the master BrainVaultState.
    """
    from backend.agents.research_agent import research_subgraph, ResearchState

    research_state = ResearchState(
        url=state["raw_input"].strip(),
        concept=state.get("concept") or "",
        source_type=None,
        arxiv_id=None,
        title=None,
        authors=[],
        published=None,
        abstract=None,
        primary_category=None,
        pdf_url=None,
        source_url=None,
        local_pdf_path=None,
        minio_path=None,
        full_text=None,
        page_count=None,
        structured=None,
        summary=None,
        key_concepts=None,
        tags=None,
        domain=None,
        metadata=None,
        difficulty=None,
        knowledge_tree=None,
        knowledge_domain=None,
        is_interview_qna=None,
        qna_pairs=None,
        agent_steps=[],
        error=None,
    )

    compiled = research_subgraph.compile()
    result = await compiled.ainvoke(research_state)

    metadata = result.get("metadata") or {}

    # Prefer the exact source title; never let the LLM rewrite it
    final_title = result.get("title") or metadata.get("title", "")

    return {
        "input_type":       "research_paper",
        "extracted_text":   result.get("full_text", ""),
        "title":            final_title,
        "summary":          result.get("summary", ""),
        "key_concepts":     result.get("key_concepts") or [],
        "tags":             result.get("tags") or [],
        "difficulty":       result.get("difficulty", 3),
        "knowledge_tree":   result.get("knowledge_tree", ""),
        "knowledge_domain": result.get("knowledge_domain"),
        "qna_pairs":        [],
        "metadata":         metadata,
        "attachments":      [{"path": result.get("minio_path"), "type": "pdf"}] if result.get("minio_path") else [],
        "agent_steps":      result.get("agent_steps") or [],
        "error":            result.get("error"),
        "source_url":       result.get("source_url") or state["raw_input"].strip(),
        "author":           ", ".join(result.get("authors") or []),
    }
```

Also update `all_agents` and routing to include `research_agent`.

---

### 5. `backend/routers/knowledge.py` — Add Papers Endpoint

Add:

```python
@router.get("/knowledge/papers")
async def list_papers(db: AsyncSession = Depends(get_db)):
    """Return all saved research papers."""
    result = await db.execute(text("""
        SELECT id, type, title, summary, source_url, author, key_concepts, tags,
               difficulty, metadata, knowledge_tree, knowledge_domain, created_at
        FROM knowledge_items
        WHERE type = 'research_paper'
        ORDER BY created_at DESC
    """))
    rows = result.mappings().all()
    return [_serialize_item(dict(row)) for row in rows]
```

---

### 6. `backend/services/storage_service.py` — Save Research Papers

Ensure `save_knowledge_item` handles `type="research_paper"`:

```python
if state["input_type"] == "research_paper":
    # Upload local PDF to MinIO if not already uploaded
    local_pdf = state.get("local_pdf_path")
    minio_path = state.get("minio_path")
    if local_pdf and not minio_path:
        minio_path = await upload_file(local_pdf, folder="papers")
        state["minio_path"] = minio_path
```

---

## ⚛️ Frontend Implementation

### 1. `frontend/components/knowledge/PaperCard.tsx`

Mirror `BlogCard.tsx` style: full-width horizontal tile, source link, metadata chips, grouped by knowledge tree.

Key differences from BlogCard:
- Icon: `FileText` instead of `Globe`
- Accent color: `indigo` instead of `orange`
- Shows: domain badge, authors, published year, page count
- Links to `/knowledge/papers/{id}` for detail view
- "🔗 Open Original" opens arXiv / source URL

```tsx
export interface PaperItem {
  id: string
  title: string
  summary: string
  source_url: string
  author: string
  domain?: string
  key_concepts: string[]
  tags: string[]
  difficulty: number
  reading_time_minutes: number
  importance_score: number
  knowledge_tree: string
  knowledge_domain?: string | null
  metadata: {
    authors?: string[]
    published?: string
    page_count?: number
    domain?: string
  }
  created_at: string
}
```

### 2. `frontend/app/knowledge/papers/page.tsx`

Mirror `blogs/page.tsx`:
- Page header with `FileText` icon
- Group papers by `knowledge_tree`
- Collapsible sections
- Full-width `PaperCard` list
- Empty state, refresh button, filter placeholder

### 3. `frontend/app/knowledge/papers/[id]/page.tsx`

Paper detail view:
- Header: title, authors, published, domain badge, difficulty badge
- Structured breakdown accordion:
  - Abstract
  - Problem Statement
  - Methodology
  - Model Architecture
  - Dataset
  - Results
  - Key Contributions
  - Limitations
  - Future Work
- Action buttons:
  - "📖 Read Full Paper" → opens `/knowledge/papers/{id}/reader` (reuse LinkedInReader)
  - "🔗 Open Original" → external source URL

### 4. Reuse PDF Reader

The existing in-app PDF reader at `/knowledge/linkedin/[id]/reader` should be generalized or duplicated for `/knowledge/papers/[id]/reader`. Prefer generalizing the reader component to accept any `knowledge_item_id` and serve the PDF via `/api/files/{path}`.

### 5. `frontend/lib/api.ts`

Add:

```ts
export async function listPapers(): Promise<PaperItem[]> {
  const res = await fetch("http://localhost:8000/api/knowledge/papers")
  if (!res.ok) throw new Error("Failed to fetch papers")
  return res.json()
}

export async function getPaper(id: string): Promise<PaperItem> {
  const res = await fetch(`http://localhost:8000/api/knowledge/${id}`)
  if (!res.ok) throw new Error("Failed to fetch paper")
  return res.json()
}
```

---

## 🎨 UI / Flow Rules (Match Blog Agent Style)

| Element | Blog Agent Style | Research Paper Style |
|---------|------------------|----------------------|
| Card shape | Full-width horizontal rectangle | Same |
| Card link | Entire card links to source URL | Card links to detail page; "Open Original" button links to source |
| Grouping | By `knowledge_tree` | Same |
| Section header | Leaf topic + full path | Same |
| Accent color | Orange | Indigo |
| Metadata chips | Difficulty, tags, reading time | Difficulty, domain, tags, year, pages |
| Icon | `Globe` | `FileText` |
| Empty state | Icon + title + description + hint | Same pattern |

---

## ✅ Phase 4 Checklist

```
Backend
- [ ] arxiv_client.py resolves arXiv URLs and fetches metadata
- [ ] PDF download works for arXiv and direct PDF URLs
- [ ] research_agent.py LangGraph subgraph with all nodes
- [ ] Structured extraction returns valid JSON
- [ ] Exact title preserved from source (not rewritten by LLM)
- [ ] Summary has no meta-prefaces
- [ ] Domain classification into predefined list
- [ ] Difficulty scoring 1-5
- [ ] Knowledge tree placement
- [ ] MinIO upload for original PDF
- [ ] GET /api/knowledge/papers endpoint
- [ ] storage_service handles research_paper type
- [ ] orchestrator routes "research" input to research_agent

Frontend
- [ ] PaperCard.tsx full-width horizontal tile
- [ ] papers/page.tsx grouped by knowledge tree
- [ ] papers/[id]/page.tsx structured breakdown accordion
- [ ] Reuse / generalize PDF reader for papers
- [ ] listPapers() + getPaper() in api.ts
- [ ] Empty state, refresh, filter placeholder
- [ ] Domain badge + authors + year + page count visible
```

---

## 🧪 Test Plan

1. Paste `https://arxiv.org/abs/2305.10601` (RAGAS paper) into the universal input.
2. Verify backend detects type as `research`.
3. Watch agent steps stream in real-time.
4. Open Research Papers Library.
5. Confirm card shows exact arXiv title, authors, year, domain, summary, difficulty.
6. Click card → detail view shows structured breakdown.
7. Click "📖 Read Full Paper" → in-app PDF reader opens.
8. Click "🔗 Open Original" → arXiv abstract page opens in new tab.
9. Verify PDF is stored in MinIO and retrievable via `/api/files/{path}`.
