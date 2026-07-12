# 🔗 Phase 1 — LinkedIn Agent + In-App PDF Reader

> **Prerequisite**: Phase 0 complete — all services running, skeleton working.
>
> **Goal**: Paste a LinkedIn post URL → real-time agent pipeline runs → card appears in LinkedIn Knowledge space → click "Read PDF" → full PDF renders inside BrainVault.
>
> No redirect. No download prompt. The PDF is yours, inside your brain.

---

## ✅ What You Ship at the End of Phase 1

```
1. Paste a LinkedIn post URL (one with a PDF carousel or document attachment)
2. Watch the real-time step-by-step agent progress stream in the UI
3. LinkedIn Knowledge page now shows a card for that post:
   - Post title (AI-extracted)
   - Author name + date
   - 3-5 sentence AI summary
   - Difficulty badge (1–5)
   - Tags + key concepts chips
   - "📎 Attachment: filename.pdf (24 pages)"
   - Knowledge tree path: "AI → LLMs → RAG → Intermediate"
4. Click "📖 Read PDF"
5. Full-screen reader opens — PDF renders page by page INSIDE the app
6. Page navigation: prev / next / jump to page number
7. Text is selectable inside the PDF
8. "Ask AI" panel stub is on the right (wired up in Phase 6)
9. All data persisted in PostgreSQL + Qdrant + MinIO
```

---

## 📁 New Files to Create in Phase 1

```
backend/
├── agents/
│   └── linkedin_agent.py         ← LinkedIn LangGraph subgraph (NEW)
├── tools/
│   ├── __init__.py
│   ├── browser.py                ← Playwright scraper (NEW)
│   ├── pdf_extractor.py          ← PyMuPDF text extraction (NEW)
│   └── minio_uploader.py         ← File download + MinIO upload (NEW)
├── routers/
│   ├── knowledge.py              ← GET /api/knowledge/linkedin (NEW)
│   └── files.py                  ← GET /api/files/{path} — serve PDFs (NEW)
└── services/
    └── storage_service.py        ← Save knowledge item to PG (NEW)

frontend/
├── app/
│   └── knowledge/
│       └── linkedin/
│           ├── page.tsx          ← LinkedIn Knowledge page (UPDATE: was empty state)
│           └── [id]/
│               └── reader/
│                   └── page.tsx  ← In-app PDF reader (NEW)
├── components/
│   ├── knowledge/
│   │   ├── LinkedInCard.tsx      ← Knowledge card component (NEW)
│   │   └── LinkedInReader.tsx    ← react-pdf based reader (NEW)
│   └── dashboard/
│       └── AgentProgressStream.tsx ← Updated to consume real SSE (UPDATE)
└── lib/
    └── api.ts                    ← Updated with new endpoints (UPDATE)
```

---

## 🐍 Backend Implementation

### Install new dependencies

Add to `backend/requirements.txt`:

```
# Web scraping
playwright==1.47.0
beautifulsoup4==4.12.3
lxml==5.3.0

# PDF processing
PyMuPDF==1.24.11

# HTTP
httpx==0.27.2
```

```bash
pip install playwright PyMuPDF beautifulsoup4 lxml httpx
playwright install chromium
```

---

### `backend/tools/browser.py` — Playwright Scraper

```python
import asyncio
from playwright.async_api import async_playwright, Page
from bs4 import BeautifulSoup
from typing import Optional

class LinkedInScraper:
    """
    Uses Playwright (headless Chromium) to fetch JS-rendered LinkedIn pages.
    LinkedIn requires JavaScript to render post content.
    """

    async def fetch_page(self, url: str) -> str:
        """Fetch the full rendered HTML of a LinkedIn post URL."""
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                ]
            )
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1280, "height": 800}
            )
            page = await context.new_page()

            try:
                await page.goto(url, wait_until="networkidle", timeout=30000)
                await page.wait_for_timeout(3000)   # Extra wait for dynamic content
                html = await page.content()
            finally:
                await browser.close()

        return html

    def extract_post_data(self, html: str) -> dict:
        """
        Parse the HTML and extract:
        - Post text content
        - Author name
        - Post date
        - Attachment URLs (PDF links, carousel image URLs)
        """
        soup = BeautifulSoup(html, "lxml")
        result = {
            "post_text": "",
            "author": "",
            "date": "",
            "pdf_urls": [],
            "carousel_image_urls": [],
            "has_attachment": False,
        }

        # Extract post text — LinkedIn uses various class names
        # Try multiple selectors (LinkedIn changes their DOM structure)
        text_selectors = [
            "span[dir='ltr']",
            ".feed-shared-text",
            ".update-components-text",
            "div.attributed-text-segment-list__content"
        ]
        for selector in text_selectors:
            elements = soup.select(selector)
            if elements:
                text_parts = [el.get_text(separator=" ", strip=True) for el in elements]
                result["post_text"] = " ".join(text_parts[:5])  # Take first 5 blocks
                break

        # Extract author
        author_selectors = [
            ".update-components-actor__name",
            ".feed-shared-actor__name",
            "span.update-components-actor__title"
        ]
        for selector in author_selectors:
            el = soup.select_one(selector)
            if el:
                result["author"] = el.get_text(strip=True)
                break

        # Look for PDF document links
        for link in soup.find_all("a", href=True):
            href = link.get("href", "")
            if ".pdf" in href.lower():
                result["pdf_urls"].append(href)
                result["has_attachment"] = True

        # Look for document/carousel viewer
        # LinkedIn renders document carousels as image sequences
        doc_containers = soup.find_all(
            "div",
            class_=lambda c: c and ("document" in c.lower() or "carousel" in c.lower())
        )
        for container in doc_containers:
            images = container.find_all("img", src=True)
            for img in images:
                src = img.get("src", "")
                if src and "licdn.com" in src and src not in result["carousel_image_urls"]:
                    result["carousel_image_urls"].append(src)
                    result["has_attachment"] = True

        return result


# Singleton instance
linkedin_scraper = LinkedInScraper()
```

---

### `backend/tools/pdf_extractor.py` — PyMuPDF

```python
import fitz   # PyMuPDF
from typing import Optional
import tempfile
import os

class PDFExtractor:
    """Extract text and metadata from PDF files using PyMuPDF (free, open-source)."""

    def extract_from_bytes(self, pdf_bytes: bytes) -> dict:
        """
        Given raw PDF bytes, return:
        - full_text: all text concatenated
        - pages: list of {page_num, text} dicts
        - page_count: total pages
        - metadata: PDF document metadata
        """
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(pdf_bytes)
            tmp_path = tmp.name

        try:
            doc = fitz.open(tmp_path)
            pages = []
            all_text_parts = []

            for page_num in range(len(doc)):
                page = doc[page_num]
                text = page.get_text("text")   # Extract text layer
                pages.append({
                    "page_num": page_num + 1,
                    "text": text.strip()
                })
                if text.strip():
                    all_text_parts.append(f"[Page {page_num + 1}]\n{text.strip()}")

            metadata = doc.metadata or {}
            doc.close()

            return {
                "full_text": "\n\n".join(all_text_parts),
                "pages": pages,
                "page_count": len(pages),
                "metadata": {
                    "title": metadata.get("title", ""),
                    "author": metadata.get("author", ""),
                    "subject": metadata.get("subject", ""),
                }
            }
        finally:
            os.unlink(tmp_path)   # Clean up temp file

    def extract_from_path(self, file_path: str) -> dict:
        """Extract from a local file path."""
        with open(file_path, "rb") as f:
            return self.extract_from_bytes(f.read())


pdf_extractor = PDFExtractor()
```

---

### `backend/tools/minio_uploader.py` — Download + Upload

```python
import httpx
import uuid
from backend.services.minio import upload_bytes, get_bytes

async def download_and_store_pdf(url: str, prefix: str = "linkedin") -> dict:
    """
    Download a PDF from a URL and store it in MinIO.
    Returns the storage info dict.
    """
    async with httpx.AsyncClient(
        timeout=60.0,
        follow_redirects=True,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; BrainVault/1.0)"
        }
    ) as client:
        response = await client.get(url)
        response.raise_for_status()

    pdf_bytes = response.content
    filename = f"{prefix}_{uuid.uuid4()}.pdf"

    minio_path = upload_bytes(
        filename=filename,
        data=pdf_bytes,
        content_type="application/pdf"
    )

    return {
        "filename": filename,
        "minio_path": minio_path,
        "file_type": "pdf",
        "file_size_bytes": len(pdf_bytes),
        "raw_bytes": pdf_bytes   # Pass along for text extraction
    }


async def store_bytes_to_minio(data: bytes, filename: str, content_type: str = "application/pdf") -> str:
    """Store any bytes directly to MinIO. Returns minio_path."""
    return upload_bytes(filename=filename, data=data, content_type=content_type)
```

---

### `backend/agents/linkedin_agent.py` — Full LangGraph Subgraph

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict, Optional
from backend.tools.browser import linkedin_scraper
from backend.tools.pdf_extractor import pdf_extractor
from backend.tools.minio_uploader import download_and_store_pdf, store_bytes_to_minio
from backend.services.llm import call_llm
import json
import uuid

# ── LinkedIn-specific state ───────────────────────────────────────────────────

class LinkedInState(TypedDict):
    url: str
    raw_html: Optional[str]
    post_text: Optional[str]
    author: Optional[str]
    date: Optional[str]
    pdf_urls: list[str]
    carousel_image_urls: list[str]
    has_attachment: bool
    downloaded_files: list[dict]         # [{filename, minio_path, file_type, page_count, extracted_text}]
    combined_text: Optional[str]         # post_text + pdf_text combined
    summary: Optional[str]
    key_concepts: Optional[list[str]]
    tags: Optional[list[str]]
    metadata: Optional[dict]
    difficulty: Optional[int]
    knowledge_tree: Optional[str]
    agent_steps: list[str]
    error: Optional[str]

# ── Node functions ─────────────────────────────────────────────────────────────

async def fetch_linkedin_page(state: LinkedInState) -> dict:
    """Node 1: Use Playwright to fetch the rendered LinkedIn page."""
    try:
        html = await linkedin_scraper.fetch_page(state["url"])
        return {
            "raw_html": html,
            "agent_steps": ["✅ LinkedIn page fetched"]
        }
    except Exception as e:
        return {
            "error": f"Failed to fetch page: {e}",
            "agent_steps": ["❌ Failed to fetch LinkedIn page"]
        }


async def extract_post_content(state: LinkedInState) -> dict:
    """Node 2: Parse DOM to extract post text, author, attachments."""
    if state.get("error"):
        return {}

    data = linkedin_scraper.extract_post_data(state["raw_html"])
    return {
        "post_text": data["post_text"],
        "author": data["author"],
        "date": data["date"],
        "pdf_urls": data["pdf_urls"],
        "carousel_image_urls": data["carousel_image_urls"],
        "has_attachment": data["has_attachment"],
        "agent_steps": [
            f"✅ Post content extracted — author: {data['author'] or 'unknown'}",
            f"📎 Attachments found: PDF={len(data['pdf_urls'])}, Carousel slides={len(data['carousel_image_urls'])}"
            if data["has_attachment"] else "📄 No attachments found"
        ]
    }


async def download_attachments(state: LinkedInState) -> dict:
    """Node 3: Download PDFs and carousel images → store in MinIO → extract text."""
    if state.get("error") or not state.get("has_attachment"):
        return {"downloaded_files": [], "agent_steps": ["⏭️ No attachments to download"]}

    downloaded = []

    # Download PDFs
    for pdf_url in state.get("pdf_urls", []):
        try:
            file_info = await download_and_store_pdf(pdf_url, prefix="linkedin")
            # Extract text from the downloaded PDF
            pdf_data = pdf_extractor.extract_from_bytes(file_info["raw_bytes"])
            file_info["page_count"] = pdf_data["page_count"]
            file_info["extracted_text"] = pdf_data["full_text"][:50000]   # Cap at 50k chars
            file_info.pop("raw_bytes", None)   # Don't keep bytes in state
            downloaded.append(file_info)
        except Exception as e:
            downloaded.append({"error": str(e), "file_type": "pdf"})

    # Download carousel images (store as-is for now, OCR in future)
    for i, img_url in enumerate(state.get("carousel_image_urls", [])[:20]):  # Cap at 20 slides
        try:
            import httpx
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(img_url)
            filename = f"linkedin_slide_{uuid.uuid4()}.jpg"
            minio_path = await store_bytes_to_minio(resp.content, filename, "image/jpeg")
            downloaded.append({
                "filename": filename,
                "minio_path": minio_path,
                "file_type": "image",
                "file_size_bytes": len(resp.content),
                "page_count": None,
                "extracted_text": ""
            })
        except Exception as e:
            pass

    pdf_count = sum(1 for f in downloaded if f.get("file_type") == "pdf")
    return {
        "downloaded_files": downloaded,
        "agent_steps": [f"✅ Downloaded {pdf_count} PDF(s) and {len(downloaded)-pdf_count} slide image(s) → stored in MinIO"]
    }


async def build_combined_text(state: LinkedInState) -> dict:
    """Node 4: Combine post text + PDF extracted text for LLM processing."""
    parts = []

    if state.get("post_text"):
        parts.append(f"[LINKEDIN POST]\n{state['post_text']}")

    for f in state.get("downloaded_files", []):
        if f.get("file_type") == "pdf" and f.get("extracted_text"):
            parts.append(f"[ATTACHED PDF: {f['filename']}]\n{f['extracted_text'][:15000]}")

    combined = "\n\n".join(parts)
    return {
        "combined_text": combined,
        "agent_steps": [f"✅ Combined content prepared ({len(combined)} characters)"]
    }


async def summarize_content(state: LinkedInState) -> dict:
    """Node 5: LLM Call — Groq gemma2-9b-it — generate 3-5 sentence summary."""
    if state.get("error"):
        return {}

    content = state.get("combined_text") or state.get("post_text") or ""
    if not content:
        return {"summary": "No content extracted.", "agent_steps": ["⚠️ No content to summarize"]}

    summary = await call_llm(
        prompt=f"""Summarize this LinkedIn post (and any attached document) in 3-5 sentences.
Focus on the key technical insight or learning. Be specific, not generic.

Content:
{content[:6000]}""",
        model="groq/gemma2-9b-it",
        system="You are a technical knowledge extraction expert. Write clear, specific summaries.",
        max_tokens=300
    )

    return {
        "summary": summary,
        "agent_steps": ["✅ Summary generated"]
    }


async def extract_key_concepts(state: LinkedInState) -> dict:
    """Node 6: LLM Call — Groq llama-3.1-8b-instant — extract concepts and tags."""
    content = state.get("combined_text") or state.get("post_text") or ""

    response = await call_llm(
        prompt=f"""Extract key concepts and tags from this content.
Return a JSON object with two lists:
- "concepts": 3-8 specific technical concepts (e.g. "Retrieval Augmented Generation", "Vector Embeddings")
- "tags": 3-6 short tags (e.g. "RAG", "LLMs", "Python")

Content:
{content[:4000]}

Return ONLY valid JSON, nothing else.""",
        model="groq/llama-3.1-8b-instant",
        system="You are a technical content analyst. Always return valid JSON.",
        max_tokens=200,
        temperature=0
    )

    try:
        # Strip markdown code blocks if present
        clean = response.strip().strip("```json").strip("```").strip()
        data = json.loads(clean)
        concepts = data.get("concepts", [])
        tags = data.get("tags", [])
    except Exception:
        concepts = []
        tags = []

    return {
        "key_concepts": concepts,
        "tags": tags,
        "agent_steps": [f"✅ Extracted {len(concepts)} concepts, {len(tags)} tags"]
    }


async def generate_metadata(state: LinkedInState) -> dict:
    """Node 7: LLM Call — Groq llama-3.3-70b-versatile — generate full metadata JSON."""
    content = state.get("combined_text") or state.get("post_text") or ""
    summary = state.get("summary", "")
    concepts = state.get("key_concepts", [])
    tags = state.get("tags", [])

    response = await call_llm(
        prompt=f"""Generate metadata for this LinkedIn post. Return ONLY a JSON object:

{{
  "title": "descriptive title for the post (not just the first line, make it meaningful)",
  "reading_time_minutes": <integer, estimated reading time>,
  "importance_score": <1-10, how important/valuable is this knowledge>
}}

Post summary: {summary}
Concepts: {concepts}
Tags: {tags}
Author: {state.get("author", "unknown")}
Has PDF attachment: {state.get("has_attachment", False)}

Return ONLY valid JSON.""",
        model="groq/llama-3.3-70b-versatile",
        system="You are a knowledge management expert. Return only valid JSON.",
        max_tokens=200,
        temperature=0
    )

    try:
        clean = response.strip().strip("```json").strip("```").strip()
        metadata = json.loads(clean)
    except Exception:
        metadata = {
            "title": state.get("post_text", "LinkedIn Post")[:80],
            "reading_time_minutes": 3,
            "importance_score": 5
        }

    return {
        "metadata": metadata,
        "agent_steps": ["✅ Metadata generated"]
    }


async def score_difficulty(state: LinkedInState) -> dict:
    """Node 8: LLM Call — Groq deepseek-r1 — score difficulty 1-5."""
    content = state.get("combined_text") or state.get("post_text") or ""
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
        model="groq/deepseek-r1-distill-llama-70b",
        system="You are a technical difficulty assessor.",
        max_tokens=5,
        temperature=0
    )

    try:
        difficulty = int(response.strip()[0])
        difficulty = max(1, min(5, difficulty))
    except Exception:
        difficulty = 3

    return {
        "difficulty": difficulty,
        "agent_steps": [f"✅ Difficulty scored: {difficulty}/5"]
    }


async def place_in_knowledge_tree(state: LinkedInState) -> dict:
    """Node 9: LLM Call — Groq llama-3.3-70b — determine knowledge tree position."""
    summary = state.get("summary", "")
    concepts = state.get("key_concepts", [])
    tags = state.get("tags", [])

    response = await call_llm(
        prompt=f"""Determine where this content belongs in a knowledge hierarchy.
Return ONLY a JSON object:

{{
  "domain": "top-level domain (e.g. 'Artificial Intelligence', 'Python', 'System Design', 'SQL', 'Cloud Computing')",
  "subdomain": "subdomain (e.g. 'LLMs', 'Web Frameworks', 'Database Design')",
  "topic": "specific topic (e.g. 'RAG Systems', 'FastAPI', 'PostgreSQL')",
  "tree_path": "Domain > Subdomain > Topic (e.g. 'Artificial Intelligence > LLMs > RAG Systems')"
}}

Summary: {summary}
Concepts: {concepts}
Tags: {tags}

Return ONLY valid JSON.""",
        model="groq/llama-3.3-70b-versatile",
        system="You are a knowledge taxonomy expert. Return only valid JSON.",
        max_tokens=200,
        temperature=0
    )

    try:
        clean = response.strip().strip("```json").strip("```").strip()
        tree_data = json.loads(clean)
    except Exception:
        tree_data = {
            "domain": "General",
            "subdomain": "Miscellaneous",
            "topic": "General Knowledge",
            "tree_path": "General > Miscellaneous > General Knowledge"
        }

    return {
        "knowledge_tree": tree_data.get("tree_path", "General"),
        "agent_steps": [f"✅ Placed in: {tree_data.get('tree_path', 'General')}"]
    }


# ── Build the LinkedIn subgraph ────────────────────────────────────────────────

def build_linkedin_subgraph() -> StateGraph:
    graph = StateGraph(LinkedInState)

    graph.add_node("fetch_page",           fetch_linkedin_page)
    graph.add_node("extract_post",         extract_post_content)
    graph.add_node("download_attachments", download_attachments)
    graph.add_node("build_combined_text",  build_combined_text)
    graph.add_node("summarize",            summarize_content)
    graph.add_node("extract_concepts",     extract_key_concepts)
    graph.add_node("generate_metadata",    generate_metadata)
    graph.add_node("score_difficulty",     score_difficulty)
    graph.add_node("place_in_tree",        place_in_knowledge_tree)

    graph.set_entry_point("fetch_page")
    graph.add_edge("fetch_page",           "extract_post")
    graph.add_edge("extract_post",         "download_attachments")
    graph.add_edge("download_attachments", "build_combined_text")
    graph.add_edge("build_combined_text",  "summarize")
    graph.add_edge("summarize",            "extract_concepts")
    graph.add_edge("extract_concepts",     "generate_metadata")
    graph.add_edge("generate_metadata",    "score_difficulty")
    graph.add_edge("score_difficulty",     "place_in_tree")
    graph.add_edge("place_in_tree",        END)

    return graph

linkedin_subgraph = build_linkedin_subgraph()
```

---

### Wire LinkedIn Agent into Master Orchestrator

Update `backend/agents/orchestrator.py` — replace the `linkedin_agent` stub:

```python
# In orchestrator.py — replace the stub with the real subgraph

from backend.agents.linkedin_agent import linkedin_subgraph, LinkedInState

# Replace this:
#   graph.add_node("linkedin_agent", stub_agent_node)

# With this:
async def linkedin_agent_node(state: BrainVaultState) -> dict:
    """Adapter: runs the LinkedIn subgraph and merges results back into master state."""
    linkedin_state = LinkedInState(
        url=state["raw_input"].strip(),
        pdf_urls=[],
        carousel_image_urls=[],
        has_attachment=False,
        downloaded_files=[],
        agent_steps=[],
    )

    compiled = linkedin_subgraph.compile()
    result = await compiled.ainvoke(linkedin_state)

    return {
        "input_type":     "linkedin",
        "extracted_text": result.get("combined_text", ""),
        "title":          result.get("metadata", {}).get("title", ""),
        "summary":        result.get("summary", ""),
        "key_concepts":   result.get("key_concepts", []),
        "tags":           result.get("tags", []),
        "difficulty":     result.get("difficulty", 3),
        "knowledge_tree": result.get("knowledge_tree", ""),
        "metadata":       result.get("metadata", {}),
        "attachments":    result.get("downloaded_files", []),
        "agent_steps":    result.get("agent_steps", []),
        "error":          result.get("error"),
    }

graph.add_node("linkedin_agent", linkedin_agent_node)
```

---

### `backend/services/storage_service.py` — Save to PostgreSQL + Qdrant

```python
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.database import AsyncSessionLocal
from backend.models.schemas import KnowledgeItem, Attachment, IngestionJob
from backend.services.embedding import generate_embedding
from backend.services.qdrant import upsert_knowledge_item
from backend.agents.state import BrainVaultState
import uuid

async def save_knowledge_item(state: BrainVaultState) -> str:
    """
    Save a fully processed knowledge item to:
    1. PostgreSQL (metadata + attachments)
    2. Qdrant (embedding vector)

    Returns the knowledge_item_id (UUID string).
    """
    async with AsyncSessionLocal() as db:
        item_id = str(uuid.uuid4())
        metadata = state.get("metadata") or {}

        # Create knowledge item
        item = KnowledgeItem(
            id=uuid.UUID(item_id),
            type=state.get("input_type", "plaintext"),
            title=state.get("title") or metadata.get("title"),
            summary=state.get("summary"),
            source_url=state.get("url") or state.get("raw_input"),
            raw_content=state.get("extracted_text", "")[:10000],  # Cap raw content
            key_concepts=state.get("key_concepts") or [],
            tags=state.get("tags") or [],
            difficulty=state.get("difficulty"),
            reading_time_minutes=metadata.get("reading_time_minutes"),
            importance_score=metadata.get("importance_score"),
            knowledge_tree=state.get("knowledge_tree"),
        )
        db.add(item)

        # Save attachments
        for att in state.get("attachments") or []:
            if att.get("minio_path"):
                attachment = Attachment(
                    knowledge_item_id=uuid.UUID(item_id),
                    filename=att.get("filename", "unknown"),
                    minio_path=att["minio_path"],
                    file_type=att.get("file_type", "pdf"),
                    file_size_bytes=att.get("file_size_bytes"),
                    page_count=att.get("page_count"),
                    extracted_text=att.get("extracted_text", "")[:20000],
                )
                db.add(attachment)

        await db.commit()

    # Generate embedding from summary + key concepts
    embed_text = f"{state.get('title', '')} {state.get('summary', '')} {' '.join(state.get('key_concepts') or [])}"
    embedding = await generate_embedding(embed_text)

    # Store in Qdrant
    point_id = upsert_knowledge_item(
        item_id=item_id,
        vector=embedding,
        payload={
            "type":           state.get("input_type", "plaintext"),
            "title":          state.get("title", ""),
            "summary":        state.get("summary", ""),
            "tags":           state.get("tags") or [],
            "key_concepts":   state.get("key_concepts") or [],
            "difficulty":     state.get("difficulty", 3),
            "knowledge_tree": state.get("knowledge_tree", ""),
            "source_url":     state.get("url") or state.get("raw_input", ""),
        }
    )

    # Update embedding_id in PostgreSQL
    async with AsyncSessionLocal() as db:
        from sqlalchemy import update, text
        await db.execute(
            text("UPDATE knowledge_items SET embedding_id = :eid WHERE id = :id"),
            {"eid": point_id, "id": item_id}
        )
        await db.commit()

    return item_id
```

---

### `backend/routers/knowledge.py` — List LinkedIn Items

```python
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
from backend.models.database import get_db
from backend.models.schemas import KnowledgeItem, Attachment
from sqlalchemy.orm import selectinload

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

@router.get("/linkedin")
async def get_linkedin_items(
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db)
):
    """Return all LinkedIn knowledge items with their attachments."""
    result = await db.execute(
        select(KnowledgeItem)
        .options(selectinload(KnowledgeItem.attachments))
        .where(KnowledgeItem.type == "linkedin")
        .order_by(KnowledgeItem.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    items = result.scalars().all()

    return [
        {
            "id":               str(item.id),
            "type":             item.type,
            "title":            item.title,
            "summary":          item.summary,
            "source_url":       item.source_url,
            "author":           item.author,
            "key_concepts":     item.key_concepts or [],
            "tags":             item.tags or [],
            "difficulty":       item.difficulty,
            "reading_time":     item.reading_time_minutes,
            "knowledge_tree":   item.knowledge_tree,
            "created_at":       item.created_at.isoformat(),
            "attachments": [
                {
                    "id":         str(att.id),
                    "filename":   att.filename,
                    "minio_path": att.minio_path,
                    "file_type":  att.file_type,
                    "page_count": att.page_count,
                }
                for att in item.attachments
            ]
        }
        for item in items
    ]


@router.get("/{item_id}")
async def get_knowledge_item(item_id: str, db: AsyncSession = Depends(get_db)):
    """Get a single knowledge item by ID."""
    result = await db.execute(
        select(KnowledgeItem)
        .options(selectinload(KnowledgeItem.attachments))
        .where(KnowledgeItem.id == item_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        return {"error": "Not found"}

    return {
        "id":             str(item.id),
        "type":           item.type,
        "title":          item.title,
        "summary":        item.summary,
        "source_url":     item.source_url,
        "key_concepts":   item.key_concepts or [],
        "tags":           item.tags or [],
        "difficulty":     item.difficulty,
        "knowledge_tree": item.knowledge_tree,
        "created_at":     item.created_at.isoformat(),
        "attachments": [
            {
                "id":         str(att.id),
                "filename":   att.filename,
                "minio_path": att.minio_path,
                "file_type":  att.file_type,
                "page_count": att.page_count,
            }
            for att in item.attachments
        ]
    }
```

---

### `backend/routers/files.py` — Serve PDFs from MinIO

```python
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from backend.services.minio import get_bytes
import io

router = APIRouter(prefix="/api/files", tags=["files"])

@router.get("/{file_path:path}")
async def serve_file(file_path: str):
    """
    Serve any file stored in MinIO.
    Frontend passes the minio_path (e.g. 'brainvault-files/linkedin_abc.pdf').
    This endpoint returns the raw bytes — PDF renders inline in the browser.

    The MinIO URL is NEVER exposed to the frontend.
    """
    try:
        file_bytes = get_bytes(file_path)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"File not found: {e}")

    # Determine content type
    if file_path.endswith(".pdf"):
        content_type = "application/pdf"
    elif file_path.endswith((".jpg", ".jpeg")):
        content_type = "image/jpeg"
    elif file_path.endswith(".png"):
        content_type = "image/png"
    else:
        content_type = "application/octet-stream"

    return StreamingResponse(
        content=io.BytesIO(file_bytes),
        media_type=content_type,
        headers={
            "Content-Disposition": "inline",              # Render in browser, not download
            "Cache-Control": "private, max-age=3600",     # Cache for 1 hour
            "Content-Length": str(len(file_bytes)),
        }
    )
```

### Add SSE endpoint for real-time streaming

Add to `backend/routers/ingest.py`:

```python
from fastapi.responses import StreamingResponse
import asyncio

@router.get("/ingest/{job_id}/stream")
async def stream_job_progress(job_id: str, db: AsyncSession = Depends(get_db)):
    """
    SSE endpoint: streams agent steps in real-time.
    Frontend connects here after submitting a job.
    """
    async def event_generator():
        last_step_count = 0

        for _ in range(60):    # Poll for up to 2 minutes
            await asyncio.sleep(2)

            result = await db.execute(text("""
                SELECT ij.status, ij.detected_type, ij.error_message,
                       ki.knowledge_tree
                FROM ingestion_jobs ij
                LEFT JOIN knowledge_items ki ON ij.knowledge_item_id = ki.id
                WHERE ij.id = :job_id
            """), {"job_id": job_id})
            row = result.fetchone()

            if not row:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Job not found'})}\n\n"
                break

            status = row.status

            if status == "done":
                yield f"data: {json.dumps({'type': 'done', 'knowledge_tree': row.knowledge_tree})}\n\n"
                break
            elif status == "failed":
                yield f"data: {json.dumps({'type': 'error', 'message': row.error_message})}\n\n"
                break
            else:
                yield f"data: {json.dumps({'type': 'status', 'status': status})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )
```

---

## 🎨 Frontend Implementation

### Install react-pdf

```bash
cd frontend
npm install react-pdf pdfjs-dist
npm install @types/react-pdf --save-dev
```

---

### `frontend/components/dashboard/AgentProgressStream.tsx` (Updated)

```tsx
"use client"
import { useEffect, useState } from "react"
import { CheckCircle2, Loader2, XCircle, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface Step {
  message: string
  status: "done" | "active" | "error"
  timestamp: number
}

interface AgentProgressStreamProps {
  jobId: string | null
  onComplete?: (knowledgeTree?: string) => void
}

export function AgentProgressStream({ jobId, onComplete }: AgentProgressStreamProps) {
  const [steps, setSteps] = useState<Step[]>([])
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!jobId) return

    setIsConnected(true)
    setSteps([{ message: "Connecting to agent pipeline...", status: "active", timestamp: Date.now() }])

    const eventSource = new EventSource(`http://localhost:8000/api/ingest/${jobId}/stream`)

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.type === "done") {
        setSteps(prev => [
          ...prev.map(s => ({ ...s, status: "done" as const })),
          { message: "✅ Saved to your brain!", status: "done", timestamp: Date.now() }
        ])
        setIsConnected(false)
        eventSource.close()
        onComplete?.(data.knowledge_tree)
      } else if (data.type === "error") {
        setSteps(prev => [
          ...prev,
          { message: `❌ ${data.message}`, status: "error", timestamp: Date.now() }
        ])
        setIsConnected(false)
        eventSource.close()
      } else if (data.step) {
        setSteps(prev => [
          ...prev.map(s => ({ ...s, status: "done" as const })),
          { message: data.step, status: "active", timestamp: Date.now() }
        ])
      }
    }

    eventSource.onerror = () => {
      setIsConnected(false)
      eventSource.close()
    }

    return () => eventSource.close()
  }, [jobId])

  if (!jobId || steps.length === 0) return null

  return (
    <div className="mt-4 p-4 bg-white/3 border border-white/8 rounded-xl space-y-2">
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
        Agent Pipeline
      </p>
      {steps.map((step, i) => (
        <div key={i} className="flex items-start gap-2 text-sm">
          {step.status === "active" && (
            <Loader2 size={14} className="text-violet-400 animate-spin mt-0.5 flex-shrink-0" />
          )}
          {step.status === "done" && (
            <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
          )}
          {step.status === "error" && (
            <XCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
          )}
          <span className={cn(
            step.status === "active" && "text-white",
            step.status === "done" && "text-zinc-400",
            step.status === "error" && "text-red-400"
          )}>
            {step.message}
          </span>
        </div>
      ))}
    </div>
  )
}
```

---

### `frontend/app/knowledge/linkedin/page.tsx` — LinkedIn Knowledge Page

```tsx
"use client"
import { useEffect, useState } from "react"
import { LinkedInCard } from "@/components/knowledge/LinkedInCard"
import { EmptyState } from "@/components/ui/EmptyState"
import { Linkedin, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Attachment {
  id: string
  filename: string
  minio_path: string
  file_type: string
  page_count: number | null
}

interface LinkedInItem {
  id: string
  title: string
  summary: string
  source_url: string
  author: string
  key_concepts: string[]
  tags: string[]
  difficulty: number
  reading_time: number
  knowledge_tree: string
  created_at: string
  attachments: Attachment[]
}

export default function LinkedInPage() {
  const [items, setItems] = useState<LinkedInItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("http://localhost:8000/api/knowledge/linkedin")
      .then(r => r.json())
      .then(data => {
        setItems(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Linkedin size={20} className="text-blue-400" />
              <h1 className="text-2xl font-bold text-white">LinkedIn Knowledge</h1>
            </div>
            <p className="text-zinc-500 text-sm">
              Posts, articles, and PDF carousels — intelligently extracted and organized.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-500">{items.length} items</span>
            <Button variant="outline" size="sm" className="border-white/10 text-zinc-400 hover:text-white">
              <Filter size={14} className="mr-2" />
              Filter
            </Button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-64 bg-white/3 rounded-xl animate-pulse border border-white/5" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Linkedin size={32} className="text-blue-400" />}
            title="No LinkedIn posts saved yet"
            description="Paste a LinkedIn URL in the dashboard. Posts with PDF attachments will have an in-app reader."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map(item => (
              <LinkedInCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

---

### `frontend/components/knowledge/LinkedInCard.tsx`

```tsx
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Linkedin, FileText, Clock, BookOpen, ChevronRight, ExternalLink } from "lucide-react"

const difficultyLabel = ["", "Beginner", "Basic", "Intermediate", "Advanced", "Expert"]
const difficultyColor = ["", "text-emerald-400", "text-blue-400", "text-yellow-400", "text-orange-400", "text-red-400"]

export function LinkedInCard({ item }: { item: any }) {
  const hasPdf = item.attachments?.some((a: any) => a.file_type === "pdf")

  return (
    <div className="group bg-white/3 border border-white/8 rounded-xl p-5 hover:border-violet-500/30 hover:bg-white/5 transition-all duration-200 flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0">
            <Linkedin size={14} className="text-blue-400" />
          </div>
          <span className="text-xs text-zinc-500">LinkedIn</span>
        </div>
        {item.difficulty && (
          <span className={`text-xs font-medium ${difficultyColor[item.difficulty]}`}>
            {difficultyLabel[item.difficulty]}
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2">
        {item.title || "Untitled Post"}
      </h3>

      {/* Summary */}
      <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">
        {item.summary}
      </p>

      {/* Tags */}
      {item.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.tags.slice(0, 4).map((tag: string) => (
            <span key={tag} className="px-2 py-0.5 text-xs bg-violet-600/10 text-violet-300 rounded-full border border-violet-600/15">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Knowledge tree */}
      {item.knowledge_tree && (
        <p className="text-xs text-zinc-600 truncate">📁 {item.knowledge_tree}</p>
      )}

      {/* PDF attachment indicator */}
      {hasPdf && (
        <div className="flex items-center gap-1.5 text-xs text-cyan-400 bg-cyan-500/10 rounded-lg px-3 py-2 border border-cyan-500/15">
          <FileText size={12} />
          <span>
            PDF attached — {item.attachments.find((a: any) => a.file_type === "pdf")?.page_count || "?"} pages
          </span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 mt-auto pt-2 border-t border-white/5">
        {hasPdf && (
          <Link
            href={`/knowledge/linkedin/${item.id}/reader`}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 rounded-lg py-2 px-3 transition-all"
          >
            <BookOpen size={12} />
            Read PDF
          </Link>
        )}
        {item.source_url && (
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 rounded-lg py-2 px-3 border border-white/5 hover:border-white/10 transition-all"
          >
            <ExternalLink size={12} />
            Post
          </a>
        )}
      </div>
    </div>
  )
}
```

---

### `frontend/app/knowledge/linkedin/[id]/reader/page.tsx`

```tsx
import { LinkedInReader } from "@/components/knowledge/LinkedInReader"

interface ReaderPageProps {
  params: { id: string }
}

async function getKnowledgeItem(id: string) {
  const res = await fetch(`http://localhost:8000/api/knowledge/${id}`, {
    cache: "no-store"
  })
  return res.json()
}

export default async function LinkedInReaderPage({ params }: ReaderPageProps) {
  const item = await getKnowledgeItem(params.id)

  const pdfAttachment = item.attachments?.find((a: any) => a.file_type === "pdf")

  return (
    <LinkedInReader
      item={item}
      pdfMinioPaths={
        item.attachments
          ?.filter((a: any) => a.file_type === "pdf")
          .map((a: any) => a.minio_path) || []
      }
    />
  )
}
```

---

### `frontend/components/knowledge/LinkedInReader.tsx` — In-App PDF Viewer

```tsx
"use client"
import { useState, useCallback } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"
import {
  ChevronLeft, ChevronRight, MessageSquare, Bookmark,
  ExternalLink, ArrowLeft, FileText, ZoomIn, ZoomOut
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"

// IMPORTANT: Set the worker path for pdfjs
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`

interface LinkedInReaderProps {
  item: {
    id: string
    title: string
    summary: string
    source_url: string
    knowledge_tree: string
    tags: string[]
    difficulty: number
  }
  pdfMinioPaths: string[]    // e.g. ["brainvault-files/linkedin_abc.pdf"]
}

export function LinkedInReader({ item, pdfMinioPaths }: LinkedInReaderProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState<number>(1)
  const [pageInput, setPageInput] = useState<string>("1")
  const [scale, setScale] = useState<number>(1.0)
  const [aiPanelOpen, setAiPanelOpen] = useState<boolean>(false)

  // Current PDF (support multiple attachments — show first by default)
  const [currentPdfIndex, setCurrentPdfIndex] = useState(0)
  const currentPdfPath = pdfMinioPaths[currentPdfIndex]

  // API route: backend serves the PDF bytes from MinIO
  // Never exposes the MinIO URL to the client
  const pdfApiUrl = currentPdfPath
    ? `http://localhost:8000/api/files/${currentPdfPath}`
    : null

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setPageNumber(1)
    setPageInput("1")
  }, [])

  const goToPage = (n: number) => {
    const clamped = Math.max(1, Math.min(numPages, n))
    setPageNumber(clamped)
    setPageInput(String(clamped))
  }

  if (!pdfApiUrl) {
    return (
      <div className="flex items-center justify-center h-screen text-zinc-400">
        No PDF attachment found for this item.
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-[#0A0A0F] text-white overflow-hidden">

      {/* ── Left: PDF Viewer ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-white/5 bg-[#0D0D14] flex-shrink-0">
          <Link href="/knowledge/linkedin">
            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white p-2">
              <ArrowLeft size={16} />
            </Button>
          </Link>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{item.title}</p>
            <p className="text-xs text-zinc-500 truncate">{item.knowledge_tree}</p>
          </div>

          {/* Page navigation */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost" size="sm"
              onClick={() => goToPage(pageNumber - 1)}
              disabled={pageNumber <= 1}
              className="text-zinc-400 hover:text-white p-2"
            >
              <ChevronLeft size={16} />
            </Button>

            <div className="flex items-center gap-1 text-sm">
              <Input
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") goToPage(parseInt(pageInput) || 1)
                }}
                className="w-12 h-7 text-center text-xs bg-white/5 border-white/10 text-white"
              />
              <span className="text-zinc-500 text-xs">/ {numPages}</span>
            </div>

            <Button
              variant="ghost" size="sm"
              onClick={() => goToPage(pageNumber + 1)}
              disabled={pageNumber >= numPages}
              className="text-zinc-400 hover:text-white p-2"
            >
              <ChevronRight size={16} />
            </Button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1 border-l border-white/5 pl-3">
            <Button
              variant="ghost" size="sm"
              onClick={() => setScale(s => Math.max(0.5, s - 0.1))}
              className="text-zinc-400 hover:text-white p-2"
            >
              <ZoomOut size={14} />
            </Button>
            <span className="text-xs text-zinc-500 w-10 text-center">{Math.round(scale * 100)}%</span>
            <Button
              variant="ghost" size="sm"
              onClick={() => setScale(s => Math.min(2.5, s + 0.1))}
              className="text-zinc-400 hover:text-white p-2"
            >
              <ZoomIn size={14} />
            </Button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 border-l border-white/5 pl-3">
            <Button
              variant="outline" size="sm"
              onClick={() => setAiPanelOpen(!aiPanelOpen)}
              className={`text-xs border-white/10 ${aiPanelOpen ? "bg-violet-600/20 text-violet-300 border-violet-500/30" : "text-zinc-400 hover:text-white"}`}
            >
              <MessageSquare size={13} className="mr-1.5" />
              Ask AI
            </Button>
            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white p-2">
              <Bookmark size={14} />
            </Button>
            {item.source_url && (
              <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white p-2">
                  <ExternalLink size={14} />
                </Button>
              </a>
            )}
          </div>
        </div>

        {/* PDF Canvas */}
        <div className="flex-1 overflow-y-auto flex justify-center py-8 bg-[#111118]">
          <Document
            file={pdfApiUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={(err) => console.error("PDF load error:", err)}
            loading={
              <div className="flex items-center gap-2 text-zinc-500 mt-20">
                <FileText size={20} className="animate-pulse" />
                <span>Loading PDF...</span>
              </div>
            }
            error={
              <div className="text-red-400 mt-20 text-sm">
                Failed to load PDF. Make sure the backend is running and the file exists.
              </div>
            }
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderTextLayer={true}           // Enables text selection
              renderAnnotationLayer={true}      // Renders links etc.
              className="shadow-2xl shadow-black/50 rounded-sm"
            />
          </Document>
        </div>
      </div>

      {/* ── Right: AI Panel (stub for Phase 6) ───────────────── */}
      {aiPanelOpen && (
        <div className="w-80 border-l border-white/8 flex flex-col bg-[#0D0D14] flex-shrink-0">
          <div className="p-4 border-b border-white/5">
            <h3 className="text-sm font-semibold text-white">Ask AI about this PDF</h3>
            <p className="text-xs text-zinc-500 mt-1">
              RAG chat coming in Phase 6.
            </p>
          </div>
          <div className="flex-1 flex items-center justify-center text-center p-6">
            <div>
              <MessageSquare size={32} className="text-zinc-700 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">
                AI chat will be enabled in Phase 6.
              </p>
              <p className="text-xs text-zinc-600 mt-2">
                You'll be able to ask questions about this document and get answers from your knowledge base.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

---

## ✅ Phase 1 Completion Checklist

```
Backend — Tools
- [ ] Playwright installed: playwright install chromium
- [ ] linkedin_scraper.fetch_page() returns HTML
- [ ] linkedin_scraper.extract_post_data() returns {post_text, author, pdf_urls, carousel_image_urls}
- [ ] pdf_extractor.extract_from_bytes() returns {full_text, pages, page_count}
- [ ] download_and_store_pdf() downloads from URL and stores in MinIO
- [ ] /api/files/{path} endpoint returns PDF bytes correctly

Backend — LinkedIn LangGraph Subgraph (9 nodes, all real)
- [ ] fetch_linkedin_page → HTML returned
- [ ] extract_post_content → post_text, author, attachment URLs extracted
- [ ] download_attachments → PDFs downloaded, stored in MinIO, text extracted
- [ ] build_combined_text → post + PDF text combined
- [ ] summarize_content → Groq gemma2-9b-it returns 3-5 sentence summary
- [ ] extract_key_concepts → Groq returns JSON with concepts + tags
- [ ] generate_metadata → Groq returns title, reading_time, importance_score
- [ ] score_difficulty → Groq deepseek-r1 returns 1-5 integer
- [ ] place_in_knowledge_tree → Groq returns domain/subdomain/topic/tree_path

Backend — Storage
- [ ] save_knowledge_item() saves to PostgreSQL (knowledge_items + attachments rows)
- [ ] Ollama embedding generated for the content
- [ ] Qdrant upsert successful
- [ ] embedding_id written back to PostgreSQL

Backend — API Endpoints
- [ ] POST /api/ingest → job created, Celery picks it up
- [ ] GET /api/ingest/{job_id}/stream → SSE stream works
- [ ] GET /api/knowledge/linkedin → returns list of items with attachments
- [ ] GET /api/knowledge/{id} → returns single item
- [ ] GET /api/files/{minio_path} → returns PDF bytes (inline Content-Disposition)

Frontend — Pages + Components
- [ ] LinkedIn Knowledge page shows cards (not empty state) after saving
- [ ] LinkedInCard shows: title, summary, author, difficulty, tags, tree path
- [ ] "📎 PDF attached" indicator shows on cards with PDFs
- [ ] "Read PDF" button links to /knowledge/linkedin/{id}/reader
- [ ] AgentProgressStream shows real SSE steps (not hardcoded)
- [ ] /knowledge/linkedin/[id]/reader route works
- [ ] LinkedInReader renders the PDF on screen (react-pdf)
- [ ] Page navigation (prev/next/jump to page) works
- [ ] Text selection works inside the PDF
- [ ] Zoom in/out works
- [ ] "Ask AI" panel opens (stub — just shows "coming in Phase 6")
- [ ] "Back" button goes back to LinkedIn page
- [ ] "Open Post" button opens the original LinkedIn URL in new tab
```

---

## 🧪 Manual Test Sequence

```bash
# 1. Make sure Phase 0 is fully working first

# 2. Test the scraper in isolation
cd backend
python -c "
import asyncio
from tools.browser import linkedin_scraper
html = asyncio.run(linkedin_scraper.fetch_page('https://www.linkedin.com/posts/...your-url...'))
data = linkedin_scraper.extract_post_data(html)
print(data)
"

# 3. Test the PDF extractor
python -c "
from tools.pdf_extractor import pdf_extractor
with open('test.pdf', 'rb') as f:
    result = pdf_extractor.extract_from_bytes(f.read())
print(result['page_count'], 'pages')
print(result['full_text'][:500])
"

# 4. Test the full pipeline end-to-end
curl -X POST http://localhost:8000/api/ingest \
  -H 'Content-Type: application/json' \
  -d '{"raw_input": "https://linkedin.com/posts/your-url"}'

# 5. Watch SSE stream
curl -N http://localhost:8000/api/ingest/{job_id}/stream

# 6. Check the result in PostgreSQL
docker exec -it brainvault-postgres psql -U brainvault -c \
  "SELECT id, type, title, difficulty, knowledge_tree FROM knowledge_items ORDER BY created_at DESC LIMIT 3;"

# 7. Check attachments saved
docker exec -it brainvault-postgres psql -U brainvault -c \
  "SELECT filename, minio_path, page_count FROM attachments ORDER BY created_at DESC LIMIT 3;"

# 8. Test file serving
curl -I http://localhost:8000/api/files/brainvault-files/{filename}.pdf
# Should return: Content-Type: application/pdf, Content-Disposition: inline

# 9. Open frontend
# http://localhost:3000 → paste LinkedIn URL → watch progress → click card → click "Read PDF"
```

---

> **Phase 1 done?** You have the most complex agent complete.
> Every other agent (Blog, Research Paper, GitHub, YouTube) follows the same pattern.
> Next: **[Phase 2 →](./phase2.md)** — Plain Text Agent + Smart Knowledge Tree routing.
