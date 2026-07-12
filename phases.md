# 🧠 BrainVault — Phased Implementation Plan

> **Rule**: Every phase ends with a working, demo-able product.
> No phase ends with broken code or "almost done."
> Each phase builds on the previous one without breaking anything.

---

## Overview

```
Phase 0 │ Full Stack Skeleton      │ Everything runs, nothing smart yet
Phase 1 │ LinkedIn Agent           │ First real agent end-to-end — paste URL → in-app PDF reader
Phase 2 │ Plain Text + Smart Notes │ Paste anything raw — auto-classified and stored
Phase 3 │ Blog Agent               │ Medium/Dev.to articles saved as beautiful cards
Phase 4 │ Research Paper Agent     │ ArXiv/PDF papers with structured breakdown
Phase 5 │ Semantic Search          │ Search across everything you've saved
Phase 6 │ AI Chat (RAG)            │ Talk to your knowledge base
Phase 7 │ GitHub + YouTube Agents  │ Repos and videos intelligently ingested
Phase 8 │ Interview Q Agent        │ Cross-space detection, grouped Q&A bank
Phase 9 │ Learning Paths           │ AI-generated progressive study roadmaps
Phase 10│ Course + Cert Agents     │ Save courses, certifications, track progress
Phase 11│ Knowledge Graph          │ Visual concept map of your entire brain
Phase 12│ Polish & Power Features  │ Animations, filters, stats, bookmarks, export
```

---

---

## ⚙️ Phase 0 — Full Stack Skeleton

> **Goal**: Everything starts. Nothing is smart yet. But all the plumbing works.

### What You Build

**Infrastructure (Docker)**
- PostgreSQL running
- Qdrant (vector DB) running
- Redis running
- MinIO (file storage) running
- All verified with health checks

**Backend (FastAPI)**
- `GET /health` → returns `{ "status": "ok" }`
- `POST /api/ingest` → accepts `{ "raw_input": "..." }` → returns `{ "job_id": "...", "status": "queued" }`
- `GET /api/knowledge` → returns empty list `[]` for now
- Database schema created (tables: `knowledge_items`, `attachments`, `tags`)
- Qdrant collection `brainvault` created with 768-dim vectors
- MinIO bucket `brainvault-files` created
- LiteLLM configured with Groq API key + Gemini API key
- Ollama running locally with `nomic-embed-text` pulled

**LangGraph**
- Master `StateGraph` skeleton exists (all nodes stubbed out, just pass-through)
- `detect_input` node: calls Groq `llama-3.1-8b-instant` — returns input type label
- Celery worker picks up job and runs the graph (even if graph does nothing useful yet)

**Frontend (Next.js 15)**
- Sidebar navigation with all sections (LinkedIn, Blogs, Papers, etc.) — all empty pages with placeholder text
- Dashboard page: shows hero text + universal input box
- Input box: user types or pastes anything → hits POST `/api/ingest` → shows "Processing..." spinner
- Empty state for every knowledge space (nice illustration, "Nothing here yet")
- Toast notification: "✅ Saved to your brain" when job completes

### ✅ Deliverable at End of Phase 0

```
1. Run docker-compose up — all services green
2. Run backend uvicorn — starts on port 8000
3. Run frontend npm run dev — starts on port 3000
4. Open the app — see the full UI layout with sidebar
5. Paste any text into the input box
6. See "Processing..." status
7. Get "✅ Saved!" toast (even though nothing is intelligently stored yet)
8. Check PostgreSQL — row exists in knowledge_items table
```

No AI intelligence. No real agents. Just the full skeleton working top-to-bottom.

### Checklist

```
Backend
- [ ] FastAPI app with CORS + router setup
- [ ] SQLAlchemy models: KnowledgeItem, Attachment
- [ ] Alembic migrations
- [ ] Celery + Redis worker setup
- [ ] LiteLLM test call to Groq (verify API key works)
- [ ] Ollama running + nomic-embed-text pulled
- [ ] Qdrant collection created
- [ ] MinIO bucket created + test upload
- [ ] /health, /ingest, /knowledge endpoints

LangGraph
- [ ] BrainVaultState TypedDict defined
- [ ] StateGraph with all nodes as stubs
- [ ] detect_input node with real Groq call
- [ ] Celery task that runs the graph

Frontend
- [ ] Next.js 15 project created
- [ ] Tailwind v4 + shadcn/ui installed
- [ ] Layout: sidebar + main content area
- [ ] All navigation links (even if pages are empty)
- [ ] UniversalInput component
- [ ] AgentProgressStream skeleton (just shows "Processing...")
- [ ] Empty state components for each knowledge space
- [ ] Toast notifications working
- [ ] API client (axios/fetch wrapper)

Docker
- [ ] docker-compose.yml with PG + Qdrant + Redis + MinIO
- [ ] Environment variables (.env file)
- [ ] README with setup instructions
```

---

---

## 🔗 Phase 1 — LinkedIn Agent (First Full Agent)

> **Goal**: Paste a LinkedIn post URL with a PDF attachment → see a card in the LinkedIn Knowledge space → click it → read the PDF attachment inside BrainVault.

This is the flagship agent. Getting this right establishes the pattern for every other agent.

### What You Build

**LinkedIn LangGraph Subgraph** (full pipeline):

```
fetch_linkedin_page     → Playwright fetches the JS-rendered page
extract_post_content    → LLM (Groq gemma2-9b-it): extract post text, author, date
detect_attachments      → Tool: scan DOM for PDF links or carousel images
    ├── PDF found       → download_pdf → upload to MinIO → extract_pdf_text (PyMuPDF)
    ├── Carousel found  → download_carousel_slides → upload images to MinIO
    └── No attachment   → skip
summarize_content       → LLM (Groq gemma2-9b-it): 3-5 sentence summary
extract_key_concepts    → LLM (Groq llama-3.1-8b-instant): list of concepts
generate_metadata       → LLM (Groq llama-3.3-70b-versatile): full JSON metadata
score_difficulty        → LLM (Groq deepseek-r1): 1-5 score with reasoning
place_in_knowledge_tree → LLM (Groq llama-3.3-70b-versatile): "AI > LLMs > RAG"
generate_embedding      → Ollama nomic-embed-text (local)
store_to_qdrant         → Vector stored with full payload
store_to_postgres       → Metadata row + attachment rows
```

**Real-time SSE Streaming**
- Each graph step emits a server-sent event
- Frontend shows step-by-step progress:
  ```
  ✅ Input detected: LinkedIn URL
  ✅ Page fetched
  ✅ Post content extracted
  ✅ PDF attachment found (24 pages)
  ⏳ Downloading and storing PDF...
  ✅ PDF text extracted
  ✅ Summary generated
  ✅ Metadata created
  ✅ Placed in: AI → LLMs → RAG → Intermediate
  ✅ Saved to LinkedIn Knowledge
  ```

**Frontend: LinkedIn Knowledge Page**
- Grid of `LinkedInCard` components
- Each card shows: thumbnail/icon, title, AI summary, author, difficulty badge, tags, reading time, attachment indicator
- Filter bar: by topic, by difficulty, by has-attachment

**Frontend: In-App PDF Reader**
- Route: `/knowledge/linkedin/[id]/reader`
- Full-screen two-panel layout:
  - Left: PDF rendered by `react-pdf` (page navigation, scroll, text selection enabled)
  - Right: "Ask AI" panel (stub for now, wired up in Phase 6)
- The PDF bytes are served via `/api/files/{path}` from MinIO — no external redirect ever

### ✅ Deliverable at End of Phase 1

```
1. Paste a LinkedIn post URL (one with a PDF carousel)
2. Watch real-time agent progress stream on screen
3. See the post appear as a card in LinkedIn Knowledge space
4. See: title, AI summary, difficulty, topics, tags, attachment count
5. Click "📖 Read PDF"
6. PDF opens INSIDE the app — full scrollable reader
7. Can navigate pages (prev/next/jump to page)
8. Can select text in the PDF
9. Card shows the correct knowledge tree: "AI > LLMs > RAG"
```

### Checklist

```
Backend
- [ ] Playwright install + LinkedIn scraper working
- [ ] PyMuPDF PDF text extraction
- [ ] MinIO upload for PDFs
- [ ] /api/files/{path} endpoint (serves PDF bytes)
- [ ] LinkedIn LangGraph subgraph (all nodes real, not stubs)
- [ ] SSE endpoint: GET /api/ingest/{job_id}/stream
- [ ] Groq calls working for all 5 LLM nodes
- [ ] Ollama embedding generation working
- [ ] Qdrant upsert with full payload
- [ ] PostgreSQL: knowledge_items + attachments rows saved

Frontend
- [ ] LinkedIn Knowledge page (/knowledge/linkedin)
- [ ] LinkedInCard component (all metadata displayed)
- [ ] Filter bar (topic, difficulty, has-attachment)
- [ ] AgentProgressStream: real SSE consuming, step-by-step display
- [ ] LinkedInReader component (react-pdf installed)
- [ ] In-app PDF reader route (/knowledge/linkedin/[id]/reader)
- [ ] Two-panel layout: PDF viewer + AI panel placeholder
- [ ] Page navigation controls
```

---

---

## 📝 Phase 2 — Plain Text + AI Notes Agent

> **Goal**: Paste any raw text (notes, code snippets, ChatGPT conversations, terminal output) → AI classifies it → stored in the right knowledge space automatically.

### What You Build

**Plain Text LangGraph Subgraph**:
```
analyze_content          → LLM (Groq llama-3.1-8b-instant): what is this text about?
detect_special_type      → LLM: is this a prompt? code snippet? interview Q? conversation?
infer_knowledge_domain   → LLM (Groq llama-3.3-70b): AI/Python/SQL/System Design/etc.
build_tree_position      → LLM: where in the knowledge hierarchy?
    e.g. text = "temperature top_p max_tokens"
    → AI > LLMs > Inference > Sampling Parameters
generate_summary         → LLM: 2-3 sentence summary
extract_concepts         → LLM: key concepts list
generate_metadata        → LLM: full metadata JSON
score_difficulty         → LLM: 1-5
generate_embedding       → Ollama
store                    → Qdrant + PostgreSQL (type: "note")
```

**Interview Question Cross-Detection**
- After plain text analysis, if text looks like Q&A → also flag for Interview Q space
- Goes into AI Notes AND queued for Interview Questions space

**Frontend: AI Notes Page**
- `NoteCard` components
- Unlike flat chronological order — notes organized by `knowledge_tree` path
- Collapsible tree view on the left: `AI > LLMs > Inference > ...`
- Click a branch → see all notes in that branch
- Each note card: title, summary, concepts, difficulty, tree path

**Universal Input Box Enhancement**
- Show the AI's real-time classification decision below the input:
  ```
  Analyzing...
  🧠 Detected: Technical Note
  📁 Will be stored in: AI → LLMs → Inference → Sampling Parameters
  ```

### ✅ Deliverable at End of Phase 2

```
1. Paste: "temperature controls randomness in LLM output. top_p is nucleus sampling..."
2. See: "Detected: AI Note → AI > LLMs > Inference > Sampling Parameters"
3. Card appears in AI Notes with tree path visible
4. Browse tree: expand "AI" → "LLMs" → "Inference" → see the note
5. Works for code snippets too (stored under correct language/concept)
6. Works for pasted ChatGPT conversations
```

### Checklist

```
Backend
- [ ] Plain text LangGraph subgraph
- [ ] Interview Q detection node
- [ ] Knowledge tree placement working (LLM)
- [ ] Notes stored with tree_path field in PostgreSQL

Frontend
- [ ] AI Notes page (/knowledge/notes)
- [ ] Collapsible knowledge tree sidebar
- [ ] NoteCard component
- [ ] Input box: real-time type detection display
- [ ] "Will be stored in:" preview before saving
```

---

---

## 📰 Phase 3 — Blog Agent

> **Goal**: Paste any blog URL (Medium, Dev.to, Hashnode, personal sites) → clean article card with summary, key concepts, estimated read time.

### What You Build

**Blog LangGraph Subgraph**:
```
fetch_blog_page         → Playwright (handles JS-rendered pages)
clean_article_content   → Tool: extract article text, remove ads/nav/comments
                          (use readability-lxml or newspaper4k — both free)
extract_structure       → LLM (Groq gemma2-9b-it): headings, main sections
generate_summary        → LLM: 3-5 sentence summary
extract_key_concepts    → LLM: technical concepts, technologies mentioned
estimate_reading_time   → Tool: word count / 200 wpm
generate_metadata       → LLM: full metadata JSON
place_in_tree           → LLM: knowledge tree path
score_difficulty        → LLM: 1-5
generate_embedding      → Ollama
store                   → Qdrant + PostgreSQL (type: "blog")
```

**Frontend: Blog Library Page**
- Beautiful article cards with:
  - Extracted OG image (or fallback gradient)
  - Title, author, publication, date
  - AI summary
  - Reading time estimate
  - Key concepts chips
  - Tags, difficulty badge
  - Link to original article (external, for reading the actual article)
- Filter by: topic, difficulty, reading time (< 5 min / 5-15 min / 15+ min)
- Sort by: most recent, difficulty, reading time

### ✅ Deliverable at End of Phase 3

```
1. Paste a Medium article URL
2. Watch agent extract the clean article (no ads, no paywall UI)
3. Beautiful card appears: image, title, summary, key concepts
4. Filter by "AI > RAG" — see only RAG-related articles
5. Click "Open Original" → goes to the real article in new tab
```

### Checklist

```
Backend
- [ ] Blog scraper (Playwright + readability-lxml or newspaper4k)
- [ ] OG image extraction
- [ ] Blog LangGraph subgraph
- [ ] Reading time calculation

Frontend
- [ ] Blog Library page (/knowledge/blogs)
- [ ] BlogCard component (with image, all metadata)
- [ ] Filter + sort controls
- [ ] Reading time display
```

---

---

## 🔬 Phase 4 — Research Paper Agent

> **Goal**: Paste an ArXiv URL or upload a research PDF → get a structured breakdown: problem, method, results, limitations. Read the PDF in-app.

### What You Build

**Research Paper LangGraph Subgraph**:
```
detect_source           → Tool: is it arxiv URL, PDF URL, or uploaded file?
fetch_paper             → Tool: download PDF (arxiv API or direct URL)
upload_to_minio         → Tool: store original PDF
extract_full_text       → PyMuPDF: extract all pages
extract_structured_info → LLM (Gemini 2.5 Flash — 1M context):
                          ├── Abstract
                          ├── Problem Statement
                          ├── Methodology / Approach
                          ├── Model Architecture (if applicable)
                          ├── Dataset Used
                          ├── Results & Metrics
                          ├── Key Contributions
                          ├── Limitations
                          └── Future Work
classify_domain         → LLM: NLP / CV / LLMs / Robotics / Healthcare / Security
generate_summary        → LLM: accessible 5-sentence summary (non-jargon)
score_difficulty        → LLM: 1-5 (1=survey paper, 5=hardcore math)
generate_metadata       → LLM: full metadata
generate_embedding      → Ollama
store                   → Qdrant + PostgreSQL (type: "research_paper")
```

**Why Gemini 2.5 Flash here?**
Research papers are long (10–50 pages). Gemini's 1M token context window means you feed the ENTIRE paper in one call and get a complete structured analysis. No chunking, no missed context.

**Frontend: Research Papers Page**
- Cards grouped by domain (tabs: NLP / CV / LLMs / All)
- Paper card: title, authors, year, domain, AI summary, method shortline, results shortline
- Click → full structured breakdown view (accordion sections)
- "📖 Read Full Paper" → in-app PDF reader (reuses LinkedInReader from Phase 1!)
- ArXiv link button

### ✅ Deliverable at End of Phase 4

```
1. Paste https://arxiv.org/abs/2305.10601 (RAG paper)
2. Agent downloads PDF, extracts all text, sends to Gemini
3. Card appears with: Problem/Method/Results/Limitations filled
4. Click the card → see full structured breakdown
5. Click "Read Full Paper" → PDF opens in-app reader (same from Phase 1)
6. Papers grouped under "LLMs" domain tab
```

### Checklist

```
Backend
- [ ] ArXiv API integration (free, no key needed)
- [ ] PDF download + MinIO upload for papers
- [ ] Gemini 2.5 Flash call for long-context extraction
- [ ] Structured JSON output from LLM (Pydantic schema)
- [ ] Research paper LangGraph subgraph
- [ ] Domain classification node

Frontend
- [ ] Research Papers page (/knowledge/papers)
- [ ] Domain tab filter (NLP / CV / LLMs / etc.)
- [ ] PaperCard component
- [ ] Structured breakdown view (accordion)
- [ ] Reuse LinkedInReader for PDF viewing
```

---

---

## 🔍 Phase 5 — Semantic Search

> **Goal**: Type any query in natural language → get relevant results from ACROSS all your saved content — LinkedIn posts, blogs, papers, notes — ranked by relevance.

### What You Build

**Search Pipeline**:
```
user_query              → "show me everything about RAG evaluation"
generate_query_embedding → Ollama nomic-embed-text (same model used at save time)
qdrant_search           → Cosine similarity search, top 20 results
                          Filter by: type, difficulty, knowledge_tree (optional)
rerank_results          → LLM (Groq llama-3.1-8b-instant): rerank top 20 → top 10
                          (optional for better quality, skip for Phase 5 if slow)
return_results          → Grouped by source type
```

**`POST /api/search`**:
```json
{
  "query": "RAG evaluation techniques",
  "filters": {
    "types": ["linkedin", "blog", "research_paper"],
    "difficulty_max": 4,
    "knowledge_tree": "AI > LLMs"
  },
  "limit": 10
}
```

**Frontend: Search Page**
- Persistent search bar in header (always visible)
- Full search page at `/search`
- Results appear grouped by type: "From LinkedIn (3)", "From Blogs (2)", "From Papers (1)"
- Each result shows: title, source type badge, AI summary snippet, relevance context
- Filters sidebar: content type, difficulty range, date range
- Empty state: "Your brain has no results for this yet. Add some content!"

### ✅ Deliverable at End of Phase 5

```
1. Save a LinkedIn post about RAG, a blog about evaluation, a research paper on RAGAS
2. Go to Search
3. Type: "how to evaluate RAG systems"
4. See results from ALL three sources — ranked by relevance
5. Filter by "Research Papers only" → only the paper shows
6. Click a result → go to that item's page
```

### Checklist

```
Backend
- [ ] /api/search endpoint
- [ ] Query embedding via Ollama (same model as ingestion)
- [ ] Qdrant vector search with payload filtering
- [ ] Result formatting + grouping by type

Frontend
- [ ] Search bar in header (always visible, keyboard shortcut /)
- [ ] Search page (/search)
- [ ] ResultCard component (generic, handles all types)
- [ ] Grouping by source type
- [ ] Filter sidebar
- [ ] Loading states + empty states
```

---

---

## 💬 Phase 6 — AI Chat (RAG over Your Knowledge)

> **Goal**: Open AI Chat → ask anything → BrainVault answers using ONLY your personal knowledge base, with citations showing which saved items it used.

### What You Build

**RAG Pipeline (LangGraph)**:
```
user_message            → "Explain RAG evaluation to me"
generate_query_embedding → Ollama nomic-embed-text
qdrant_search           → Top 8 most relevant chunks from your knowledge
format_context          → Combine chunks into context string with source labels
llm_answer              → LLM (Gemini 2.5 Flash):
                          "Based on the following from your BrainVault knowledge:
                           [SOURCE 1: LinkedIn post about RAGAS by...]
                           [SOURCE 2: Research paper 'RAGAS: Automated Evaluation...']
                           Answer: RAG evaluation typically involves..."
stream_response         → Token-by-token streaming to frontend
return_citations        → List of source items used
```

**`POST /api/chat` (streaming)**

**Frontend: AI Chat Page**
- Full-screen chat interface (like ChatGPT but for your brain)
- Streaming token output (real-time character-by-character)
- Below each AI response: "📚 Sources used:" with clickable cards
- Clicking a source card → opens that knowledge item
- Chat history (stored in PostgreSQL per session)
- "Ask AI" panel in the LinkedInReader (Phase 1 stub now wired up!)
- Suggested questions based on your recent saves

### ✅ Deliverable at End of Phase 6

```
1. Open AI Chat
2. Ask: "What do I know about prompt engineering?"
3. See streaming response using your saved content
4. See 3-4 source cards below: "[LinkedIn post] [Blog article] [Note]"
5. Click a source → opens that item
6. Open a LinkedIn PDF reader from Phase 1 → "Ask AI" now works!
```

### Checklist

```
Backend
- [ ] RAG LangGraph subgraph (search → context → LLM → stream)
- [ ] /api/chat endpoint with SSE streaming
- [ ] Chat history stored in PostgreSQL
- [ ] Citation extraction from context

Frontend
- [ ] Chat page (/chat)
- [ ] StreamingMessage component (token-by-token)
- [ ] SourceCitationCard component
- [ ] ChatHistory sidebar
- [ ] Wire up "Ask AI" panel in LinkedInReader
- [ ] Suggested questions feature
```

---

---

## 🐙 Phase 7 — GitHub + YouTube Agents

> **Goal**: Save GitHub repos and YouTube videos/playlists. GitHub shows as a repo card with architecture summary. YouTube shows with transcript and chapter summaries.

### What You Build

**GitHub LangGraph Subgraph**:
```
parse_github_url        → Tool: extract owner/repo from URL
fetch_repo_metadata     → GitHub REST API (free, 60 req/hr unauth, 5000 auth)
fetch_readme            → GitHub API: get README.md content
fetch_repo_structure    → GitHub API: top-level file tree
detect_tech_stack       → LLM (Groq): infer stack from package.json/requirements.txt/etc.
summarize_readme        → LLM (Groq gemma2-9b-it): what is this repo?
extract_architecture    → LLM: how is it structured? what are the main components?
classify_purpose        → LLM: tool/library/tutorial/paper-implementation/template
generate_metadata       → LLM: full metadata
store                   → Qdrant + PostgreSQL (type: "github_repo")
```

**YouTube LangGraph Subgraph**:
```
detect_content          → Tool: is it a single video or a playlist?
fetch_metadata          → yt-dlp: title, channel, duration, thumbnail, chapters
fetch_transcript        → youtube-transcript-api (free, no API key!):
                          → auto-generated or manual captions
detect_chapters         → Tool: from yt-dlp chapter markers OR description
summarize_per_chapter   → LLM (Groq gemma2-9b-it): summarize each chapter
overall_summary         → LLM: 5-sentence overall summary
extract_key_concepts    → LLM: technical topics covered
classify_difficulty     → LLM: 1-5
place_in_tree           → LLM: knowledge tree path
generate_embedding      → Ollama (embed summary + key concepts)
store                   → Qdrant + PostgreSQL (type: "youtube_video" or "youtube_playlist")

IF PLAYLIST:
    → Loop over each video (up to 50)
    → Run subgraph per video
    → Create playlist-level summary from all videos
    → Store playlist record + linked video records
```

**Frontend: GitHub Repos Page**
- Repo cards: name, description, AI summary, tech stack chips, stars, language, last updated
- "What is this for?" section — AI-generated use case description
- Architecture overview section
- Link to actual GitHub repo

**Frontend: YouTube Page**
- Video card: thumbnail, title, channel, duration, difficulty
- Chapter breakdown: each chapter with AI summary
- Full transcript viewer (searchable, timestamped)
- Playlist view: shows all videos in a playlist as a course-like series

### ✅ Deliverable at End of Phase 7

```
GitHub:
1. Paste https://github.com/langchain-ai/langgraph
2. See repo card: "Agent orchestration framework for building stateful multi-agent..."
3. Tech stack: Python, LangChain, graphs
4. Architecture: "Core modules: StateGraph, nodes, edges, checkpointing..."

YouTube:
1. Paste a YouTube video URL about RAG
2. See card with: thumbnail, AI summary, key concepts, difficulty 3/5
3. Click → see chapter list with per-chapter summaries
4. Click a chapter → jump to that section in the transcript
5. Transcript is searchable: search "evaluation" → highlights all occurrences
```

### Checklist

```
Backend
- [ ] GitHub REST API integration (free tier)
- [ ] GitHub LangGraph subgraph
- [ ] yt-dlp installed and working
- [ ] youtube-transcript-api working
- [ ] YouTube LangGraph subgraph (single video)
- [ ] YouTube playlist handling (loop + aggregate)

Frontend
- [ ] GitHub Repos page (/knowledge/github)
- [ ] RepoCard component
- [ ] YouTube page (/knowledge/youtube)
- [ ] VideoCard component with thumbnail
- [ ] Chapter breakdown component
- [ ] Transcript viewer (searchable, scrollable)
- [ ] PlaylistView component
```

---

---

## 💼 Phase 8 — Interview Question Agent + Q&A Bank

> **Goal**: Interview questions detected from ANY source — LinkedIn, notes, blogs, PDFs — automatically routed to a grouped Q&A bank sorted by domain and difficulty.

### What You Build

**Interview Detection Node** (already stubbed in master graph, now made real):
```
Already in every agent subgraph as the final step before metadata:

check_for_interview_qs  → LLM (Groq llama-3.1-8b-instant):
                          "Does this content contain interview questions or Q&A patterns?"
                          → Returns: yes/no + extracted Q&A pairs

IF YES:
    for each question found:
        classify_domain     → LLM: AI/ML/Python/SQL/System Design/Cloud/RAG/LangGraph
        classify_difficulty → LLM: 1-5
        generate_answer     → LLM (Groq llama-3.3-70b): detailed explanation
        find_related_qs     → Qdrant search: find similar questions already in vault
        store_question      → PostgreSQL: interview_questions table
                              (linked to parent knowledge_item)
```

**Interview Question LangGraph Subgraph** (for direct Q&A input):
```
detect_questions        → LLM: extract all Q&A from input
classify_each_question  → LLM: domain + difficulty per question
generate_explanations   → LLM: detailed answer + examples
find_related            → Qdrant: find related questions in vault
store_all               → PostgreSQL + Qdrant (type: "interview_question")
```

**Frontend: Interview Questions Page**
- Domain tabs: AI | ML | Python | SQL | System Design | Cloud | RAG | LangGraph | All
- Difficulty filter: Beginner / Mid / Advanced
- Question card: question text, domain badge, difficulty, expandable answer
- "Related Questions" shown below each answer
- Progress tracking: "Mark as Reviewed" checkbox
- Stats: total questions per domain, reviewed count
- "Generate Quiz" button (asks 5 random questions from selected domain — Phase 12 feature, stub here)

### ✅ Deliverable at End of Phase 8

```
1. Paste a LinkedIn post that has "5 RAG interview questions"
2. Post goes to LinkedIn Knowledge space
3. ALSO: 5 questions automatically appear in Interview Questions → RAG tab
4. Each question has: AI-generated detailed answer + related questions
5. Direct: paste "What is the difference between RAG and fine-tuning?" 
6. Instantly appears in Interview Questions → AI tab
7. Filter by "Advanced" → only hard questions show
8. Mark questions as "Reviewed" to track prep progress
```

### Checklist

```
Backend
- [ ] Interview detection in ALL existing agent subgraphs
- [ ] Interview question LangGraph subgraph
- [ ] interview_questions table in PostgreSQL
- [ ] Related question finder (Qdrant similarity)
- [ ] LLM-generated detailed answers

Frontend
- [ ] Interview Questions page (/knowledge/interviews)
- [ ] Domain tabs
- [ ] QuestionCard component (expandable)
- [ ] Related questions section
- [ ] "Mark as Reviewed" functionality
- [ ] Domain stats display
```

---

---

## 📚 Phase 9 — Learning Paths

> **Goal**: Select any topic → BrainVault generates a personalized progressive learning roadmap using ONLY your saved content, ordered from beginner to advanced.

### What You Build

**Learning Path Generator (LangGraph)**:
```
get_topic               → User selects "LLMs" or types "teach me RAG"
search_related_content  → Qdrant: find ALL content related to this topic
group_by_concept        → LLM (Groq llama-3.3-70b):
                          Group the content by concept:
                          - Introduction to LLMs (3 items, difficulty 1-2)
                          - Transformer Architecture (2 items, difficulty 3)
                          - Prompt Engineering (5 items, difficulty 2-3)
                          - RAG (4 items, difficulty 3-4)
                          - Agents (3 items, difficulty 4-5)
order_progressively     → LLM: sort groups from foundational to advanced
identify_gaps           → LLM: "You have nothing about Embeddings — consider adding it"
create_path_object      → Build structured JSON path
store_path              → PostgreSQL (can be saved/named by user)
```

**Frontend: Learning Paths Page**
- "Generate Learning Path" input (type a topic)
- Visual roadmap (vertical timeline or node graph):
  ```
  ● Introduction (3 items) ─────────────────────────── Beginner
  ● Transformer Architecture (2 items) ────────────── Intermediate
  ● Prompt Engineering (5 items) ──────────────────── Intermediate
  ● RAG Systems (4 items) ─────────────────────────── Advanced
  ● Agents & Orchestration (3 items) ─────────────── Expert
  ```
- Click any node → see all linked content items
- "Knowledge Gaps" warning: "⚠️ No content found for Embeddings — add some!"
- Save/name paths: "My LLM Mastery Path"
- Progress: mark items as completed, see % progress per stage
- Suggested next item: "Next up: [RAG paper] based on your progress"

### ✅ Deliverable at End of Phase 9

```
1. Type "teach me about LangGraph"
2. BrainVault scans your saved content
3. Shows progressive path: Intro → Graphs → Nodes → State → Agents → Multi-Agent
4. Each stage lists the actual saved items (your LinkedIn posts, blog articles, etc.)
5. Gap alert: "No content about LangGraph streaming — consider adding some"
6. Mark stage 1 as complete → progress bar updates
7. Save path as "My LangGraph Journey"
```

### Checklist

```
Backend
- [ ] Learning path generator LangGraph subgraph
- [ ] /api/learning-path endpoint
- [ ] Gap detection logic
- [ ] learning_paths table in PostgreSQL
- [ ] Progress tracking table

Frontend
- [ ] Learning Paths page (/learning)
- [ ] Path generation input
- [ ] Visual roadmap component (vertical timeline)
- [ ] Node click → content list modal
- [ ] Gap warning component
- [ ] Progress tracking (mark complete)
- [ ] Saved paths list
```

---

---

## 🎓 Phase 10 — Course + Certification Agents

> **Goal**: Save Udemy/Coursera course URLs → get structured syllabus. Save certifications → track credentials, expiry, and related study material.

### What You Build

**Course LangGraph Subgraph**:
```
fetch_course_page       → Playwright (handle JS-rendered Udemy/Coursera pages)
extract_course_info     → LLM (Gemini Flash): title, instructor, rating, duration, price
extract_syllabus        → LLM: parse curriculum → list of modules → list of lessons
identify_prerequisites  → LLM: what should you know before this course?
map_to_knowledge_tree   → LLM: where in your tree does this course belong?
find_related_in_vault   → Qdrant: what do you already know that's relevant?
generate_course_summary → LLM: 5-sentence description
store                   → PostgreSQL (type: "course") with module structure
```

**Certification LangGraph Subgraph**:
```
detect_cert_type        → LLM: AWS/GCP/Azure/HuggingFace/LangChain/DeepLearning.AI?
extract_credential_info → LLM or tool: name, issuer, date earned, expiry date, cert ID
extract_exam_topics     → LLM: core exam domains covered
find_related_in_vault   → Qdrant: your existing content related to this cert's topics
identify_knowledge_gaps → LLM: cert topics NOT in your vault yet
create_prep_suggestion  → LLM: suggested study plan from your existing content
store                   → PostgreSQL (type: "certification")
```

**Frontend: Course Space**
- Course cards: thumbnail, title, instructor, rating, duration, difficulty
- Expandable syllabus tree (modules > lessons)
- "What You Already Know" section (matched from vault via semantic search)
- Progress bar (which modules you've completed)

**Frontend: Certifications Space**
- Credential card: issuer logo, cert name, date, expiry countdown
- Exam domains covered
- "Study Materials in Your Vault" — linked content from your brain
- "Knowledge Gaps" — topics not yet in your vault
- Expiry alert: "⚠️ Expires in 6 months — consider renewing!"

### ✅ Deliverable at End of Phase 10

```
Courses:
1. Paste a Coursera course URL
2. See card with: course info, full syllabus tree (expandable)
3. "You already know: Transformers, Attention (from 3 items in your vault)"
4. Mark modules as completed

Certifications:
1. Add "AWS Solutions Architect Associate" cert
2. See credential card with exam domains: Storage/Compute/Networking/Security
3. "From your vault: 2 items about S3, 0 items about VPC (gap!)"
4. Expiry in: 2 years, 3 months
```

### Checklist

```
Backend
- [ ] Course scraper (Playwright for Udemy/Coursera)
- [ ] Course LangGraph subgraph
- [ ] Certification LangGraph subgraph
- [ ] courses + certifications tables in PostgreSQL
- [ ] course_progress table

Frontend
- [ ] Courses page (/knowledge/courses)
- [ ] CourseCard + SyllabusTree component
- [ ] Module progress tracking
- [ ] Certifications page (/knowledge/certifications)
- [ ] CertCard component with expiry countdown
- [ ] Knowledge gap display
```

---

---

## 🌐 Phase 11 — Knowledge Graph

> **Goal**: See your entire brain as an interactive visual network — nodes are concepts, edges are relationships. Click a node to explore.

### What You Build

**Knowledge Graph Builder**:
```
get_all_knowledge_items     → PostgreSQL: fetch all items with knowledge_tree paths
extract_all_concepts        → PostgreSQL: aggregate all tags/concepts/topics
build_node_list             → Deduplicated unique concepts/topics
build_edge_list             → Connect concepts that co-occur in same items
                              (e.g. "RAG" + "Vector Search" appear in same post → edge)
calculate_node_weights      → Node size = how many items reference this concept
calculate_edge_weights      → Edge thickness = how many items connect these two
cluster_by_domain           → Group by top-level knowledge domain (color coding)
return_graph_data           → Nodes + edges JSON for React Flow
```

**`GET /api/graph`** → returns React Flow compatible node/edge data

**Frontend: Knowledge Graph Page**
- Full-screen interactive canvas (React Flow)
- Nodes: concept circles, sized by frequency
- Edges: connections between co-occurring concepts, thickness = strength
- Color coded by domain (AI=violet, Python=blue, SQL=orange, etc.)
- Minimap in corner
- Zoom / pan / click
- Click a node → right panel slides in showing all items tagged with that concept
- Search a concept → fly to that node
- Filter: show only nodes with 3+ connections (hide rare/isolated nodes)

### ✅ Deliverable at End of Phase 11

```
1. Open Knowledge Graph
2. See your brain as a visual network
3. Large "RAG" node in the center (most referenced concept)
4. Connected to: "Vector Search", "Embeddings", "LangChain", "FAISS", etc.
5. Click "RAG" → right panel: "12 items tagged with RAG"
6. See items: [LinkedIn post] [Blog article] [Research paper] [Interview Q]
7. Click any item → navigate to it
8. Filter by "AI" domain → only AI-related nodes remain
```

### Checklist

```
Backend
- [ ] /api/graph endpoint
- [ ] Concept co-occurrence algorithm
- [ ] Node/edge weight calculation
- [ ] React Flow compatible output format

Frontend
- [ ] Knowledge Graph page (/graph)
- [ ] React Flow full-screen canvas
- [ ] Node/edge rendering with sizes + colors
- [ ] Minimap
- [ ] Click-to-explore right panel
- [ ] Concept search + fly-to
- [ ] Domain filter
```

---

---

## ✨ Phase 12 — Polish + Power Features

> **Goal**: BrainVault feels like a premium SaaS product. Every interaction is smooth and delightful.

### What You Build

**UI Polish**
- Framer Motion: page transition animations, card entrance animations, loading skeletons
- Dark glassmorphism theme refined (subtle grain texture, better gradient meshes)
- Neural brain animation on the dashboard hero (canvas/WebGL or CSS animation)
- Micro-interactions: hover effects on cards, button press animations
- Skeleton loading states for all cards (no layout shift)

**Power Features**
- **Bookmarks & Pins**: pin any item to a "Favorites" section, accessible from sidebar
- **Recently Viewed**: track last 10 opened items, show in dashboard
- **Dashboard Statistics**: total items, domains covered, reading time saved, items per category (animated counter cards)
- **Smart Filters**: cross-space filter — "show all difficulty 3-4 content about RAG across all types"
- **Bulk Import**: paste multiple URLs/texts at once (comma or newline separated)
- **Quiz Mode**: random 5 questions from Interview Q bank — answer and get feedback (LLM grades your answer)
- **Export**: export any knowledge item as clean Markdown
- **Keyboard Shortcuts**: `/` to search, `N` to open input box, `Esc` to go back

**Performance**
- Infinite scroll for all knowledge space pages (no pagination buttons)
- Image lazy loading for cards
- API response caching (Redis) for frequently accessed items

### ✅ Deliverable at End of Phase 12

```
A polished, fast, beautiful app that feels like Notion AI met Perplexity.

1. Dashboard shows animated stats: "87 items · 6 domains · 43h reading time saved"
2. All cards animate in smoothly on page load
3. Hover over a card → subtle lift + glow effect
4. Press / → search opens instantly
5. Press N → input box focuses
6. Open Quiz Mode → 5 random AI questions, type answers, get scored
7. Export a research paper breakdown as Markdown
8. Bookmark 3 items → they all appear in Favorites sidebar section
```

### Checklist

```
UI
- [ ] Framer Motion: page transitions + card animations
- [ ] Loading skeletons for all cards
- [ ] Dashboard hero neural animation
- [ ] Glassmorphism refinements
- [ ] Hover states on all interactive elements

Features
- [ ] Bookmarks system (frontend + backend)
- [ ] Recently Viewed tracking
- [ ] Dashboard statistics endpoint + animated UI
- [ ] Smart cross-space filter
- [ ] Bulk import support
- [ ] Quiz Mode (LLM-graded answers)
- [ ] Markdown export
- [ ] Keyboard shortcuts
- [ ] Infinite scroll
```

---

---

## 📊 Full Progress Tracker

| Phase | Name | Agents Added | Core Delivery | Status |
|---|---|---|---|---|
| **0** | Full Stack Skeleton | — | Everything runs, full UI layout | ⬜ Not Started |
| **1** | LinkedIn Agent | LinkedIn | Paste URL → in-app PDF reader | ⬜ Not Started |
| **2** | Plain Text Agent | SmartText | Paste anything → auto-classified notes | ⬜ Not Started |
| **3** | Blog Agent | Blog | Save Medium/Dev.to as article cards | ⬜ Not Started |
| **4** | Research Paper Agent | Research | ArXiv → structured breakdown + reader | ⬜ Not Started |
| **5** | Semantic Search | — | Natural language search across all content | ⬜ Not Started |
| **6** | AI Chat (RAG) | — | Chat with your knowledge base | ⬜ Not Started |
| **7** | GitHub + YouTube | GitHub, YouTube | Repos + video transcripts | ⬜ Not Started |
| **8** | Interview Q Agent | Interview | Cross-space Q&A bank by domain | ⬜ Not Started |
| **9** | Learning Paths | — | AI-generated progressive study roadmaps | ⬜ Not Started |
| **10** | Course + Cert Agents | Course, Cert | Save courses, track certifications | ⬜ Not Started |
| **11** | Knowledge Graph | — | Interactive visual concept network | ⬜ Not Started |
| **12** | Polish + Power | — | Premium SaaS feel + power features | ⬜ Not Started |

---

## 🧱 Dependency Order

```
Phase 0  (required by everything)
    ↓
Phase 1  (LinkedIn — establishes agent pattern + PDF reader + SSE streaming)
    ↓
Phase 2  (Plain Text — establishes knowledge tree routing)
    ↓
Phase 3  (Blog — simplest scraper after LinkedIn)
    ↓
Phase 4  (Research Papers — reuses PDF reader from Phase 1)
    ↓
Phase 5  (Semantic Search — needs content from Phases 1–4)
    ↓
Phase 6  (AI Chat — needs semantic search from Phase 5)
    ↓
Phase 7  (GitHub + YouTube — independent agents, needs Phase 2 pattern)
    ↓
Phase 8  (Interview Qs — depends on Phase 2 pattern + Phases 1,3,4 content)
    ↓
Phase 9  (Learning Paths — needs content from all phases + search from Phase 5)
    ↓
Phase 10 (Courses + Certs — independent, needs Phase 2 pattern)
    ↓
Phase 11 (Knowledge Graph — needs a full knowledge base from all phases)
    ↓
Phase 12 (Polish — everything complete)
```

> **Start Phase 0 now. Don't skip ahead.**
> Every phase is a shippable milestone. By Phase 2 you'll already have a working personal knowledge tool.
