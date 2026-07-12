# 🧠 BrainVault — Implementation Blueprint

> **Full-Stack Architecture: 100% Free & Open-Source**
> *LangGraph · Multi-agent · Real tools · Many LLM calls · No paid APIs · Self-hosted*

---

## 💡 Core Constraint: Zero Cost

Every component in this stack is:
- **Free to use** (free-tier API or self-hosted)
- **Open-source** (no vendor lock-in)
- **Production-capable** (not just toys)

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│               Frontend (Next.js 15)                 │  ← Premium SaaS UI
├─────────────────────────────────────────────────────┤
│              Backend API (FastAPI)                  │  ← REST + SSE Streaming
├─────────────────────────────────────────────────────┤
│   Agentic Core (LangGraph — StateGraph Engine)      │  ← Multi-agent orchestration
├─────────────────────────────────────────────────────┤
│   Free LLM Layer (Groq + Gemini + Ollama)           │  ← All free, routed by task
├─────────────────────────────────────────────────────┤
│   Data Layer (Qdrant + PostgreSQL + MinIO)          │  ← All self-hosted, all free
└─────────────────────────────────────────────────────┘
```

---

## 🤖 Agentic Framework: LangGraph (The Only Choice)

LangGraph is **the production standard** for stateful, multi-agent systems. Here's why it is the right and only framework for BrainVault:

### Why LangGraph Fits BrainVault Perfectly

BrainVault's ingestion pipeline is **not linear** — it is a conditional decision graph:

```
Input Received
    ↓
Detect Type (LLM decision)
    ↓
    ├── linkedin URL → LinkedIn Subgraph
    ├── medium URL  → Blog Subgraph
    ├── arxiv URL   → Research Paper Subgraph
    ├── pdf file    → PDF Subgraph
    ├── github URL  → GitHub Subgraph
    ├── youtube URL → YouTube Subgraph
    ├── course URL  → Course Subgraph
    └── plain text  → SmartText Subgraph
                          ↓
                    [CONDITIONAL FORK]
                    Does it contain interview questions?
                          ├── YES → also route to Interview Q space
                          └── NO → continue
                                ↓
                          Generate Metadata (LLM)
                                ↓
                          Score Difficulty (LLM)
                                ↓
                          Generate Embedding (local model)
                                ↓
                          Store (Qdrant + PostgreSQL)
                                ↓
                          Stream result → Frontend via SSE
```

This is exactly what **LangGraph's `StateGraph`** was built for:
- **Non-linear conditional routing** via `add_conditional_edges`
- **Stateful checkpointing** — if PDF extraction fails at step 5 of 9, resume from step 5
- **Subgraph composition** — each specialized agent is its own `StateGraph` composed into the master
- **Built-in streaming** — stream agent steps to frontend via SSE natively
- **Human-in-the-loop** — future: user corrects misclassification mid-pipeline
- **Real tool nodes** — Playwright, PyMuPDF, APIs all become LangGraph tool nodes

### LangGraph Core Pattern Used

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict, Optional, Annotated
import operator

# Shared state object flowing through the entire graph
class BrainVaultState(TypedDict):
    raw_input: str                        # What the user pasted
    input_type: str                       # Detected: linkedin/blog/pdf/text/etc.
    url: Optional[str]                    # If URL-based
    file_path: Optional[str]             # If file-based
    scraped_content: Optional[dict]      # Raw scraped data
    attachments: Optional[list]          # PDFs/images found
    extracted_text: str                  # Clean extracted content
    summary: str                         # AI-generated summary
    key_concepts: list[str]             # Extracted concepts
    metadata: dict                       # Full metadata object
    difficulty: int                      # 1-5 score
    knowledge_space: str                 # Where it belongs
    knowledge_tree_path: str            # e.g. "AI > LLMs > RAG"
    embedding_id: Optional[str]         # Qdrant point ID
    stored_files: list[str]             # S3/MinIO file paths
    is_interview_question: bool         # Cross-space detection
    error: Optional[str]                # For retry/error handling
    agent_steps: Annotated[list, operator.add]  # Streamed to frontend

# Master orchestrator graph
master_graph = StateGraph(BrainVaultState)

# Add all agent nodes
master_graph.add_node("detect_input",       detect_input_node)
master_graph.add_node("linkedin_agent",     linkedin_subgraph.compile())
master_graph.add_node("blog_agent",         blog_subgraph.compile())
master_graph.add_node("pdf_agent",          pdf_subgraph.compile())
master_graph.add_node("research_agent",     research_subgraph.compile())
master_graph.add_node("github_agent",       github_subgraph.compile())
master_graph.add_node("youtube_agent",      youtube_subgraph.compile())
master_graph.add_node("course_agent",       course_subgraph.compile())
master_graph.add_node("plaintext_agent",    plaintext_subgraph.compile())
master_graph.add_node("interview_agent",    interview_subgraph.compile())
master_graph.add_node("generate_metadata",  metadata_node)
master_graph.add_node("score_difficulty",   difficulty_node)
master_graph.add_node("check_interview_qs", interview_detection_node)
master_graph.add_node("generate_embedding", embedding_node)
master_graph.add_node("store_knowledge",    storage_node)

# Entry point
master_graph.set_entry_point("detect_input")

# Conditional routing based on detected type
master_graph.add_conditional_edges("detect_input", route_by_type, {
    "linkedin":   "linkedin_agent",
    "blog":       "blog_agent",
    "pdf":        "pdf_agent",
    "research":   "research_agent",
    "github":     "github_agent",
    "youtube":    "youtube_agent",
    "course":     "course_agent",
    "plaintext":  "plaintext_agent",
})

# All agents converge into metadata generation
for agent in ["linkedin_agent", "blog_agent", "pdf_agent", "research_agent",
              "github_agent", "youtube_agent", "course_agent", "plaintext_agent"]:
    master_graph.add_edge(agent, "check_interview_qs")

# After interview check, generate metadata
master_graph.add_conditional_edges("check_interview_qs", route_interview, {
    "has_questions": "interview_agent",
    "no_questions":  "generate_metadata",
})
master_graph.add_edge("interview_agent",    "generate_metadata")
master_graph.add_edge("generate_metadata",  "score_difficulty")
master_graph.add_edge("score_difficulty",   "generate_embedding")
master_graph.add_edge("generate_embedding", "store_knowledge")
master_graph.add_edge("store_knowledge",    END)

app = master_graph.compile(checkpointer=MemorySaver())
```

---

## 🆓 Free LLM Stack — All Sources Documented

### Primary LLM Providers (All 100% Free)

#### 1. 🟢 Groq — Fast Inference, Free Tier
**Best for**: Extraction, summarization, classification (high-speed, many calls)
- **URL**: [console.groq.com](https://console.groq.com) — sign up free, no credit card
- **Free limits**: 30 RPM / 30,000 TPM / 14,400 RPD
- **Available models**:
  - `llama-3.3-70b-versatile` — Best general reasoning
  - `llama-3.1-8b-instant` — Ultra-fast, cheap for extraction
  - `deepseek-r1-distill-llama-70b` — Strong reasoning/classification
  - `gemma2-9b-it` — Google's open model, very capable
  - `mixtral-8x7b-32768` — Long context (32K), great for PDFs
- **Why Groq**: Fastest inference in the world (LPU hardware). Perfect for the 5–10 LLM calls per ingestion — they complete in under 2 seconds total.

#### 2. 🔵 Google AI Studio (Gemini) — Long Context, Free Tier
**Best for**: Long document analysis, research papers, large PDFs
- **URL**: [aistudio.google.com](https://aistudio.google.com) — free, no credit card
- **Free limits**: 15 RPM / 1M TPM / 1,500 RPD (generous!)
- **Available models**:
  - `gemini-2.0-flash` — 1M token context window, extremely capable
  - `gemini-2.5-flash` — Best reasoning, 1M context (free tier)
  - `gemini-2.0-flash-lite` — Fastest, for quick classification
- **Why Gemini**: The **1 million token context window** is game-changing for BrainVault — you can feed an entire PDF, book chapter, or full research paper in a single LLM call. Nothing else on the free tier comes close.

#### 3. 🟡 Cerebras — High Volume, Free
**Best for**: Bulk embedding text preparation, high-volume extraction
- **URL**: [inference.cerebras.ai](https://inference.cerebras.ai) — free, no credit card
- **Free limits**: 1 million tokens/day (most generous free tier)
- **Available models**: Llama 4, Qwen3, DeepSeek variants
- **Why Cerebras**: Best token-per-day allowance. Use it as overflow when Groq hits rate limits.

#### 4. ⚫ Ollama — Local, Unlimited, Private
**Best for**: Embeddings, sensitive personal data, offline mode
- **URL**: [ollama.com](https://ollama.com) — completely free forever, runs on your machine
- **Cost**: Zero (uses your GPU/CPU)
- **Key models for BrainVault**:
  - `nomic-embed-text` — Best free embedding model (768-dim, fast)
  - `mxbai-embed-large` — Higher quality embeddings (1024-dim)
  - `llama3.2:3b` — Tiny local model for quick classifications
  - `mistral:7b` — Solid all-around local model
- **Why Ollama**: Embedding generation happens **hundreds of times** as your knowledge base grows. Using Ollama means zero API cost for embeddings forever. Your data never leaves your machine.

#### 5. 🔴 OpenRouter — Unified Free Model Router
**Best for**: Fallback routing, model experimentation
- **URL**: [openrouter.ai](https://openrouter.ai) — many free models available
- **Free models**: `google/gemma-2-27b-it:free`, `meta-llama/llama-3.2-90b-vision-instruct:free`, `microsoft/phi-3-medium-128k-instruct:free` and many more
- **Why OpenRouter**: Single API key, access to 50+ models. Build your fallback chain: if Groq hits limits → OpenRouter free models.

### LLM Routing Strategy for BrainVault

| Task | Model | Provider | Why |
|---|---|---|---|
| **Input type detection** | `llama-3.1-8b-instant` | Groq | Simple classification, needs to be instant |
| **Web page extraction** | `gemma2-9b-it` | Groq | Fast, good at structured extraction |
| **Long PDF analysis** | `gemini-2.5-flash` | Google AI Studio | 1M context window handles full PDFs |
| **Research paper analysis** | `gemini-2.5-flash` | Google AI Studio | Long context + strong reasoning |
| **Metadata generation (JSON)** | `llama-3.3-70b-versatile` | Groq | Best structured output on free tier |
| **Difficulty scoring** | `deepseek-r1-distill-llama-70b` | Groq | Reasoning model, better 1-5 scoring |
| **Interview Q detection** | `llama-3.1-8b-instant` | Groq | Simple yes/no classification |
| **Knowledge tree placement** | `llama-3.3-70b-versatile` | Groq | Hierarchical reasoning |
| **Embeddings (all content)** | `nomic-embed-text` | Ollama (local) | Free forever, privacy-preserving |
| **AI Chat / RAG synthesis** | `gemini-2.5-flash` | Google AI Studio | Best reasoning for conversation |
| **Learning path generation** | `llama-3.3-70b-versatile` | Groq | Multi-step planning |
| **Fallback (rate limited)** | `google/gemma-2-27b-it:free` | OpenRouter | When Groq/Gemini hit limits |

### LLM Abstraction Layer (LiteLLM)

Use **LiteLLM** (open-source, free) to call any provider with one unified interface:

```python
# pip install litellm
from litellm import completion

# Works the same regardless of provider
response = completion(
    model="groq/llama-3.3-70b-versatile",      # or...
    # model="gemini/gemini-2.5-flash",
    # model="ollama/nomic-embed-text",
    # model="openrouter/google/gemma-2-27b-it:free",
    messages=[{"role": "user", "content": prompt}]
)
```

LiteLLM also handles **automatic fallbacks** and **rate limit retries**:
```python
# Auto-fallback chain: try Groq → fallback to Gemini → fallback to OpenRouter
response = completion(
    model="groq/llama-3.3-70b-versatile",
    fallbacks=["gemini/gemini-2.0-flash", "openrouter/google/gemma-2-27b-it:free"],
    messages=[...]
)
```

---

## 🗄️ Free & Open-Source Database Stack

### 1. PostgreSQL — Metadata & Relations
- **License**: Open Source (PostgreSQL License)
- **Cost**: Free, self-hosted via Docker
- **Stores**: All knowledge item metadata, user data, tags, categories, knowledge tree, bookmarks, learning paths
- **Docker**: `docker run -p 5432:5432 -e POSTGRES_PASSWORD=pass postgres:16`

### 2. Qdrant — Vector Search Engine
- **License**: Apache 2.0 (open source)
- **Cost**: Free, self-hosted via Docker
- **Stores**: All text embeddings for semantic search + RAG
- **Why Qdrant over ChromaDB**: Payload filtering ("search only in my LinkedIn posts, difficulty ≤ 3"), Rust performance, better ANN algorithms for production
- **Docker**: `docker run -p 6333:6333 -v ./qdrant_storage:/qdrant/storage qdrant/qdrant`

### 3. MinIO — Object Storage (S3-compatible)
- **License**: AGPL 3.0 (open source)
- **Cost**: Free, self-hosted via Docker
- **Stores**: Downloaded PDFs, extracted images, LinkedIn carousel slides, course thumbnails
- **Docker**: `docker run -p 9000:9000 -p 9001:9001 minio/minio server /data --console-address ":9001"`

### 4. Redis — Cache & Task Queue
- **License**: MIT (open source)
- **Cost**: Free, self-hosted
- **Stores**: Celery task queue state, LLM response cache, rate-limit counters
- **Docker**: `docker run -p 6379:6379 redis:7-alpine`

### 5. SQLite — Development Only
- **License**: Public Domain
- **Cost**: Free, built into Python
- **Use**: Zero-config local dev before spinning up Postgres

---

## 🎨 Frontend Stack — Next.js 15

| Layer | Technology | Why |
|---|---|---|
| **Framework** | Next.js 15 (App Router) | RSC + SSE streaming for real-time agent progress |
| **Language** | TypeScript | Non-negotiable |
| **Styling** | Tailwind CSS v4 | Utility-first |
| **UI Components** | shadcn/ui + Radix UI | Full code ownership, accessible |
| **Animations** | Framer Motion | Spring physics for cards, page transitions |
| **PDF Viewer** | `react-pdf` (pdfjs-dist) | **In-app PDF rendering — no redirects, no downloads** |
| **Knowledge Graph** | React Flow | Interactive concept node graph |
| **State** | Zustand + TanStack Query | Lightweight client + server state |
| **Real-time** | Server-Sent Events (SSE) | Stream agent steps live to UI |
| **Rich Text** | Tiptap | Annotations and AI Notes editor |
| **Icons** | Lucide React | Clean, consistent |
| **Fonts** | Geist (Vercel) | Premium typography |

---

## 🔗 LinkedIn Agent — Full Pipeline (Deep Dive)

This is the most complex agent because LinkedIn uses JavaScript rendering and PDFs are embedded as carousel slides.

### The User's Flow

```
1. User scrolling LinkedIn feed
2. Sees a post with a PDF carousel (e.g. "Top 10 RAG Techniques")
3. Copies the LinkedIn post URL
4. Pastes into BrainVault input box
5. Clicks "Save to Brain"
6. Watches real-time agent progress stream
7. Done — clicks into the saved item
8. Reads the full PDF carousel INSIDE BrainVault — no redirect
```

### LinkedIn Agent Subgraph (LangGraph)

```python
class LinkedInState(TypedDict):
    url: str
    raw_html: str
    post_text: str
    author: str
    post_date: str
    attachment_urls: list[str]          # PDF URLs found
    carousel_slide_urls: list[str]      # Image slide URLs
    downloaded_files: list[dict]        # {filename, minio_path, type}
    pdf_text: str                       # Extracted from any attached PDFs
    summary: str
    key_concepts: list[str]
    topics: list[str]
    tags: list[str]

linkedin_graph = StateGraph(LinkedInState)

linkedin_graph.add_node("fetch_page",         fetch_linkedin_page)     # Playwright
linkedin_graph.add_node("extract_post",       extract_post_content)    # LLM call
linkedin_graph.add_node("detect_attachments", detect_attachments)      # Tool: check DOM
linkedin_graph.add_node("download_pdf",       download_pdf_attachment) # Tool: download + MinIO
linkedin_graph.add_node("extract_pdf_text",   extract_pdf_text)        # PyMuPDF
linkedin_graph.add_node("extract_carousel",   extract_carousel_slides) # Playwright + download images
linkedin_graph.add_node("summarize",          summarize_content)       # LLM call
linkedin_graph.add_node("extract_concepts",   extract_key_concepts)    # LLM call
linkedin_graph.add_node("classify_topics",    classify_topics)         # LLM call

linkedin_graph.set_entry_point("fetch_page")
linkedin_graph.add_edge("fetch_page",         "extract_post")
linkedin_graph.add_edge("extract_post",       "detect_attachments")
linkedin_graph.add_conditional_edges("detect_attachments", route_attachment_type, {
    "pdf":       "download_pdf",
    "carousel":  "extract_carousel",
    "none":      "summarize",
})
linkedin_graph.add_edge("download_pdf",       "extract_pdf_text")
linkedin_graph.add_edge("extract_pdf_text",   "summarize")
linkedin_graph.add_edge("extract_carousel",   "summarize")
linkedin_graph.add_edge("summarize",          "extract_concepts")
linkedin_graph.add_edge("extract_concepts",   "classify_topics")
linkedin_graph.add_edge("classify_topics",    END)
```

### Tool Implementations

#### `fetch_linkedin_page` — Playwright Tool
```python
from playwright.async_api import async_playwright

async def fetch_linkedin_page(state: LinkedInState) -> dict:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Set headers to look like a real browser
        await page.set_extra_http_headers({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)..."
        })

        await page.goto(state["url"], wait_until="networkidle")
        await page.wait_for_timeout(3000)  # Wait for JS to render

        html = await page.content()
        await browser.close()

        return {"raw_html": html}
```

#### `detect_attachments` — Find PDF/Carousel in DOM
```python
from bs4 import BeautifulSoup

def detect_attachments(state: LinkedInState) -> dict:
    soup = BeautifulSoup(state["raw_html"], "html.parser")

    # Find PDF document links
    pdf_links = []
    for link in soup.find_all("a", href=True):
        if ".pdf" in link["href"] or "document" in link.get("class", []):
            pdf_links.append(link["href"])

    # Find carousel/document viewer
    carousel_images = []
    doc_viewer = soup.find("div", class_=lambda x: x and "document" in x.lower())
    if doc_viewer:
        for img in doc_viewer.find_all("img"):
            if img.get("src"):
                carousel_images.append(img["src"])

    attachment_type = "pdf" if pdf_links else "carousel" if carousel_images else "none"

    return {
        "attachment_urls": pdf_links,
        "carousel_slide_urls": carousel_images,
        # Pass attachment_type as a routing signal in state
    }
```

#### `download_pdf_attachment` — Download + Store in MinIO
```python
import httpx
from minio import Minio
import uuid

async def download_pdf_attachment(state: LinkedInState) -> dict:
    minio_client = Minio("localhost:9000",
        access_key="minioadmin",
        secret_key="minioadmin",
        secure=False
    )

    downloaded_files = []
    for pdf_url in state["attachment_urls"]:
        async with httpx.AsyncClient() as client:
            response = await client.get(pdf_url)

        file_id = str(uuid.uuid4())
        filename = f"linkedin_attachment_{file_id}.pdf"

        # Upload to MinIO
        minio_client.put_object(
            "brainvault-files",
            filename,
            data=response.content,
            length=len(response.content),
            content_type="application/pdf"
        )

        downloaded_files.append({
            "filename": filename,
            "minio_path": f"brainvault-files/{filename}",
            "type": "pdf",
            "size": len(response.content)
        })

    return {"downloaded_files": downloaded_files}
```

#### `extract_pdf_text` — PyMuPDF (Free, Open Source)
```python
import fitz  # PyMuPDF

def extract_pdf_text(state: LinkedInState) -> dict:
    all_text = []

    for file_info in state["downloaded_files"]:
        if file_info["type"] == "pdf":
            # Get PDF from MinIO (or temp path)
            doc = fitz.open(file_info["local_temp_path"])

            for page_num in range(len(doc)):
                page = doc[page_num]
                text = page.get_text()
                all_text.append(f"[Page {page_num + 1}]\n{text}")

            doc.close()

    return {"pdf_text": "\n\n".join(all_text)}
```

#### `summarize_content` — Groq LLM Call
```python
from litellm import completion

async def summarize_content(state: LinkedInState) -> dict:
    content_to_summarize = state["post_text"]
    if state.get("pdf_text"):
        content_to_summarize += f"\n\n[ATTACHED PDF CONTENT]\n{state['pdf_text'][:8000]}"

    response = completion(
        model="groq/gemma2-9b-it",
        messages=[{
            "role": "system",
            "content": "You are a knowledge extraction expert. Summarize this LinkedIn post (and any attached document) concisely in 3-5 sentences. Focus on the key technical insight."
        }, {
            "role": "user",
            "content": content_to_summarize
        }]
    )

    return {"summary": response.choices[0].message.content}
```

### What Gets Stored

After the LinkedIn agent completes, `store_knowledge_node` writes:

**PostgreSQL** (metadata):
```sql
INSERT INTO knowledge_items (
    id, type, source_url, title, author, summary,
    key_concepts, tags, difficulty, knowledge_tree,
    reading_time, importance_score, created_at
) VALUES (...)

INSERT INTO attachments (
    id, knowledge_item_id, filename, minio_path,
    file_type, page_count, extracted_text
) VALUES (...)
```

**Qdrant** (vectors — for semantic search):
```python
qdrant_client.upsert(
    collection_name="brainvault",
    points=[PointStruct(
        id=str(uuid4()),
        vector=embedding,              # Generated by Ollama nomic-embed-text
        payload={
            "knowledge_id": item_id,
            "type": "linkedin",
            "title": title,
            "summary": summary,
            "tags": tags,
            "difficulty": difficulty,
            "knowledge_tree": "AI > LLMs > RAG",  # For filtered search
        }
    )]
)
```

---

## 📱 LinkedIn Knowledge Card — In-App PDF Reader

### How it looks in the UI

```
┌─────────────────────────────────────────────────────────────┐
│  🔗 LinkedIn                                    [★ Bookmark] │
│                                                             │
│  📄 Top 10 RAG Techniques You Must Know in 2025            │
│     by Andrew Ng · June 28, 2025                           │
│                                                             │
│  "A comprehensive breakdown of advanced RAG patterns        │
│   including HyDE, RAPTOR, Corrective RAG, and Self-RAG..."  │
│                                                             │
│  🏷  RAG  🏷  LLMs  🏷  Vector Search  🏷  AI Architecture  │
│  ⭐ Difficulty: 4/5 · ⏱ 12 min · 📁 AI > LLMs > RAG        │
│                                                             │
│  📎 Attachment: "RAG_Techniques_2025.pdf" (24 pages)        │
│                                                             │
│  [📖 Read PDF]  [💬 Ask AI]  [🔗 Original Post]             │
└─────────────────────────────────────────────────────────────┘
```

### When user clicks "📖 Read PDF"

The PDF opens **inside BrainVault** — rendered by `react-pdf` directly in the browser. No download. No redirect. No leaving the app.

```tsx
// components/knowledge/LinkedInReader.tsx
"use client"
import { Document, Page, pdfjs } from "react-pdf"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, MessageSquare, Bookmark } from "lucide-react"

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`

interface LinkedInReaderProps {
  knowledgeItem: KnowledgeItem
  pdfMinioPath: string  // "brainvault-files/linkedin_attachment_abc.pdf"
}

export function LinkedInReader({ knowledgeItem, pdfMinioPath }: LinkedInReaderProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState<number>(1)
  const [aiPanelOpen, setAiPanelOpen] = useState(false)

  // API route serves the PDF bytes from MinIO — frontend never needs the raw URL
  const pdfApiUrl = `/api/files/${encodeURIComponent(pdfMinioPath)}`

  return (
    <div className="flex h-screen bg-[#0F0E17] text-white">

      {/* PDF Viewer Panel */}
      <div className="flex-1 flex flex-col items-center overflow-y-auto p-6">

        {/* Navigation */}
        <div className="flex items-center gap-4 mb-6 sticky top-0 bg-[#0F0E17]/80 backdrop-blur-md p-3 rounded-xl z-10">
          <Button variant="ghost" onClick={() => setPageNumber(p => Math.max(1, p - 1))}>
            <ChevronLeft size={18} />
          </Button>
          <span className="text-sm text-zinc-400">
            Page {pageNumber} of {numPages}
          </span>
          <Button variant="ghost" onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}>
            <ChevronRight size={18} />
          </Button>
          <Button variant="outline" onClick={() => setAiPanelOpen(!aiPanelOpen)}>
            <MessageSquare size={16} className="mr-2" />
            Ask AI about this PDF
          </Button>
          <Button variant="ghost">
            <Bookmark size={16} />
          </Button>
        </div>

        {/* The PDF rendered in-browser */}
        <Document
          file={pdfApiUrl}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          className="shadow-2xl"
        >
          <Page
            pageNumber={pageNumber}
            width={Math.min(window.innerWidth * 0.6, 800)}
            renderTextLayer={true}      // Enables text selection
            renderAnnotationLayer={true}
          />
        </Document>
      </div>

      {/* AI Chat Panel (slides in from right) */}
      {aiPanelOpen && (
        <div className="w-96 border-l border-white/10 flex flex-col bg-[#1a1928]">
          <div className="p-4 border-b border-white/10">
            <h3 className="font-semibold">Ask AI about this document</h3>
            <p className="text-xs text-zinc-400 mt-1">
              Powered by your BrainVault knowledge
            </p>
          </div>
          <AIChatPanel
            contextDocumentId={knowledgeItem.id}
            systemContext={knowledgeItem.summary}
          />
        </div>
      )}
    </div>
  )
}
```

### Backend API Route — Serve PDF from MinIO

```python
# backend/routers/files.py
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from minio import Minio

router = APIRouter()
minio_client = Minio("localhost:9000", access_key="minioadmin", secret_key="minioadmin", secure=False)

@router.get("/api/files/{file_path:path}")
async def serve_file(file_path: str):
    """
    Serve files from MinIO storage.
    Frontend reads PDF bytes directly from this endpoint — MinIO URL never exposed.
    """
    bucket_name = "brainvault-files"

    response = minio_client.get_object(bucket_name, file_path)
    content = response.read()

    return StreamingResponse(
        iter([content]),
        media_type="application/pdf",
        headers={"Content-Disposition": "inline"}  # Render in browser, not download
    )
```

---

## 🆕 New Agents Added

### YouTube Agent

Handles single video URLs and full playlist URLs.

```
fetch_video_metadata (yt-dlp or youtube-data-api free tier)
    → extract_transcript (youtube-transcript-api — free, no API key)
    → detect_chapters (from description or auto-chapters)
    → summarize_per_chapter (LLM: Groq gemma2-9b-it)
    → extract_key_concepts (LLM: Groq)
    → classify_topic + difficulty (LLM: Groq)
    → if PLAYLIST: repeat for each video, create playlist-level summary
    → store (PostgreSQL + Qdrant)
```

**Tools used**:
- `youtube-transcript-api` — Free, no API key, gets full transcripts
- `yt-dlp` — Free, open source, gets video metadata, thumbnail, chapters

**Knowledge Space**: YouTube card shows video thumbnail, AI chapter summary, transcript search, key concepts. Click → in-app video player + transcript side panel.

### Course Agent

Handles Udemy, Coursera, fast.ai, DeepLearning.AI course URLs.

```
fetch_course_page (Playwright)
    → extract_syllabus (LLM: parse curriculum sections)
    → extract_instructor + rating + duration
    → summarize_course_content (LLM: Gemini 2.5 Flash — long content)
    → identify_prerequisites (LLM)
    → map_to_knowledge_tree (LLM: where in the hierarchy does this fit?)
    → store
```

**Knowledge Space**: Course card shows syllabus tree, duration, difficulty. Tracks which modules you've completed.

### Certification Agent

Handles certification credentials, exam notes, prep resources.

```
detect_cert_type (LLM: AWS/GCP/Azure/LangChain/HuggingFace cert?)
    → extract_credential_info (name, date, expiry, issuer, ID)
    → find_related_resources (semantic search in your vault)
    → extract_exam_topics (LLM: from cert description)
    → create_study_plan_from_vault (LLM: use your existing knowledge)
    → store
```

**Knowledge Space**: Shows credential card, expiry countdown, linked learning resources, knowledge gaps (topics in cert not yet in your vault).

---

## 📁 Project Folder Structure

```
brainvault/
├── frontend/                              # Next.js 15 App
│   ├── app/
│   │   ├── (auth)/                        # Login/signup
│   │   ├── dashboard/                     # Home dashboard
│   │   ├── knowledge/
│   │   │   ├── linkedin/                  # LinkedIn space
│   │   │   │   └── [id]/reader/           # In-app PDF reader page
│   │   │   ├── blogs/
│   │   │   ├── papers/
│   │   │   ├── interviews/
│   │   │   ├── notes/
│   │   │   ├── pdfs/
│   │   │   ├── github/
│   │   │   ├── prompts/
│   │   │   ├── youtube/                   # YouTube space
│   │   │   │   └── [id]/                 # Video + transcript view
│   │   │   ├── courses/                   # Course space
│   │   │   └── certifications/            # Certifications space
│   │   ├── learning/
│   │   ├── chat/
│   │   ├── search/
│   │   └── graph/
│   ├── components/
│   │   ├── ui/                            # shadcn/ui
│   │   ├── knowledge/
│   │   │   ├── KnowledgeCard.tsx
│   │   │   ├── LinkedInReader.tsx         # In-app PDF reader
│   │   │   ├── YouTubeViewer.tsx          # In-app video + transcript
│   │   │   └── CourseProgress.tsx
│   │   ├── agents/
│   │   │   └── AgentProgressStream.tsx    # Real-time SSE progress
│   │   ├── chat/
│   │   └── graph/
│   └── lib/
│       ├── api.ts
│       ├── sse.ts                         # SSE client for agent streaming
│       └── store.ts
│
├── backend/                               # FastAPI Python
│   ├── main.py
│   ├── routers/
│   │   ├── ingest.py                      # POST /ingest
│   │   ├── knowledge.py
│   │   ├── search.py
│   │   ├── chat.py
│   │   ├── learning.py
│   │   └── files.py                       # Serve PDF/files from MinIO
│   ├── agents/
│   │   ├── orchestrator.py                # Master LangGraph StateGraph
│   │   ├── linkedin_agent.py              # LinkedIn subgraph
│   │   ├── blog_agent.py
│   │   ├── pdf_agent.py
│   │   ├── research_agent.py
│   │   ├── plaintext_agent.py
│   │   ├── interview_agent.py
│   │   ├── github_agent.py
│   │   ├── youtube_agent.py               # NEW
│   │   ├── course_agent.py                # NEW
│   │   └── certification_agent.py         # NEW
│   ├── tools/
│   │   ├── browser.py                     # Playwright scraper
│   │   ├── pdf_extractor.py               # PyMuPDF
│   │   ├── github_api.py                  # GitHub REST (free)
│   │   ├── youtube_tool.py                # youtube-transcript-api + yt-dlp
│   │   ├── qdrant_tools.py
│   │   └── storage.py                     # MinIO
│   ├── llm/
│   │   ├── router.py                      # LiteLLM routing logic
│   │   └── prompts.py                     # All prompt templates
│   ├── models/
│   │   ├── knowledge.py
│   │   └── agents.py
│   └── services/
│       ├── embedding_service.py           # Ollama nomic-embed-text
│       ├── rag_service.py
│       └── learning_service.py
│
└── infrastructure/
    ├── docker-compose.yml                 # All services: PG + Qdrant + Redis + MinIO
    └── postgres/init.sql
```

---

## 🐳 Docker Compose — Full Local Stack (Free)

```yaml
# docker-compose.yml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: brainvault
      POSTGRES_USER: brainvault
      POSTGRES_PASSWORD: brainvault_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./infrastructure/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql

  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_storage:/qdrant/storage

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data

volumes:
  postgres_data:
  qdrant_storage:
  minio_data:
```

---

## ⚡ LLM Calls Per Operation (All Free)

| Operation | LLM Calls | Primary Model | Fallback |
|---|---|---|---|
| LinkedIn post (no attachment) | 4 | Groq: gemma2-9b-it | OpenRouter |
| LinkedIn post (with PDF) | 7 | Groq + Gemini Flash | OpenRouter |
| Blog article ingestion | 4 | Groq: gemma2-9b-it | Cerebras |
| Research paper (long PDF) | 5 | Gemini 2.5 Flash (1M ctx) | Groq Mixtral |
| Plain text / notes | 3 | Groq: llama3.1-8b-instant | Cerebras |
| GitHub repo | 4 | Groq: llama3.3-70b | OpenRouter |
| YouTube video | 5 | Groq: gemma2-9b-it | Cerebras |
| AI Chat (RAG query) | 2 | Gemini 2.5 Flash | Groq 70b |
| Learning path generation | 3 | Groq: llama3.3-70b | Gemini Flash |
| Embeddings (all) | 0 API calls | Ollama: nomic-embed-text | Local always |

---

## 🗺️ Development Phases

### Phase 1 — Foundation (Weeks 1–3)
- [ ] Docker Compose up: PG + Qdrant + Redis + MinIO
- [ ] FastAPI skeleton + PostgreSQL schema
- [ ] Ollama + nomic-embed-text setup (local embeddings)
- [ ] LiteLLM configured with Groq + Gemini API keys
- [ ] LangGraph master orchestrator graph skeleton
- [ ] Input type detection agent (LLM call #1 via Groq)
- [ ] Plain text agent subgraph
- [ ] Basic metadata generation (Groq structured output)
- [ ] Next.js skeleton + sidebar layout

### Phase 2 — Core Agents (Weeks 4–7)
- [ ] LinkedIn agent (Playwright + PDF download + MinIO + PyMuPDF)
- [ ] In-app PDF reader (react-pdf) — **NO REDIRECTS**
- [ ] Blog agent (Medium, Dev.to)
- [ ] Research Paper agent (Gemini 2.5 Flash long context)
- [ ] GitHub agent (GitHub REST API free)
- [ ] SSE streaming of agent steps to frontend
- [ ] All knowledge space pages

### Phase 3 — New Agents (Weeks 8–9)
- [ ] YouTube agent (yt-dlp + youtube-transcript-api)
- [ ] Course agent (Playwright + LLM curriculum extraction)
- [ ] Certification agent

### Phase 4 — Intelligence Layer (Weeks 10–12)
- [ ] Semantic search (Qdrant + Ollama embeddings)
- [ ] AI Chat RAG (LangGraph + Gemini Flash)
- [ ] Learning path generator
- [ ] Interview question cross-space detection
- [ ] Difficulty scoring + knowledge tree

### Phase 5 — Premium UI (Weeks 13–14)
- [ ] Knowledge graph (React Flow)
- [ ] Full-screen reader for PDFs + in-app video player
- [ ] Framer Motion animations
- [ ] Dashboard statistics
- [ ] Learning path visual roadmap

---

## 🔑 Final Stack Summary

| Layer | Technology | Cost |
|---|---|---|
| **Agentic Framework** | LangGraph | Free (MIT) |
| **Primary LLM** | Groq (Llama 3.3 70B, gemma2-9b) | Free tier |
| **Long Context LLM** | Google AI Studio (Gemini 2.5 Flash) | Free tier |
| **High Volume LLM** | Cerebras (1M tokens/day) | Free tier |
| **Fallback LLM** | OpenRouter (50+ free models) | Free tier |
| **Embeddings** | Ollama + nomic-embed-text (local) | Free forever |
| **LLM Abstraction** | LiteLLM | Free (MIT) |
| **Vector Database** | Qdrant (self-hosted Docker) | Free forever |
| **Relational DB** | PostgreSQL (self-hosted Docker) | Free forever |
| **Object Storage** | MinIO (self-hosted Docker) | Free forever |
| **Cache/Queue** | Redis (self-hosted Docker) | Free forever |
| **PDF Extraction** | PyMuPDF (fitz) | Free (AGPL) |
| **Web Scraping** | Playwright + BeautifulSoup4 | Free (MIT) |
| **YouTube** | youtube-transcript-api + yt-dlp | Free |
| **Frontend** | Next.js 15 + shadcn/ui + Tailwind | Free |
| **PDF Viewer** | react-pdf (pdfjs-dist) | Free (Apache 2.0) |
| **Animations** | Framer Motion | Free |

**Total monthly cost: $0.00** 🎯
