# BrainVault Backend Documentation

This document serves as the complete technical reference for the BrainVault backend, detailing the LangGraph architecture, the exact number of nodes, and an exhaustive breakdown of LLM usage per agent.

## Overview

The BrainVault backend is built on **FastAPI** and uses **LangGraph** to orchestrate complex data ingestion pipelines. It uses a Master Orchestrator (Supervisor) pattern that routes incoming requests to highly specialized agent subgraphs based on content type.

---

## 1. Master Orchestrator Graph
The master graph manages the entry point, routing, and final storage of all knowledge items.
- **Total Nodes: 11**
  1. `detect_input` (Entry) - Uses **Groq (llama-3.1-8b-instant)** to classify input type.
  2. `linkedin_agent` - Routes to LinkedIn Subgraph.
  3. `blog_agent` - Routes to Blog Subgraph.
  4. `research_agent` - Routes to Research Subgraph.
  5. `youtube_agent` - Routes to YouTube Subgraph.
  6. `github_agent` - Routes to GitHub Subgraph.
  7. `plaintext_agent` - Routes to Plain Text Subgraph.
  8. `pdf_agent` - Currently routes to Research Subgraph.
  9. `course_agent` - Stub for future.
  10. `certification_agent` - Stub for future.
  11. `store` (Convergence) - Saves to Postgres and uses **Ollama (`nomic-embed-text`)** for generating vector embeddings to store in Qdrant.

---

## 2. Agent Subgraphs Deep Dive

Below is the complete technical breakdown of each active agent subgraph, its nodes, and the exact LLM calls and models used.

### A. LinkedIn Agent (`linkedin_agent.py`)
Scrapes authenticated LinkedIn posts, handles PDF/Carousel downloads, and extracts technical context.
- **Total Nodes: 10**
- **LLM Calls: 6 to 7**
- **Node & LLM Breakdown:**
  1. `fetch_page`: Playwright scraping (No LLM).
  2. `extract_post`: DOM extraction (No LLM).
  3. `download_attachments`: Handles PDF / Images (No LLM).
  4. `build_combined_text`: Merges text (No LLM).
  5. `summarize`: **Groq (`llama-3.1-8b-instant`)** (1 call).
  6. `extract_concepts`: **Groq (`llama-3.1-8b-instant`)** (1 call).
  7. `generate_metadata`: **Groq (`llama-3.3-70b-versatile`)** (1 call).
  8. `score_difficulty`: **Groq (`llama-3.3-70b-versatile`)** (1 call).
  9. `place_in_tree`: **Groq (`llama-3.3-70b-versatile`)** (1 call).
  10. `detect_qna`: **Groq (`llama-3.1-8b-instant`)** to detect Q&A (1 call). *Optional:* If Q&A is detected, an additional call to **Groq (`llama-3.3-70b-versatile`)** is made to extract pairs (+1 call).

### B. Blog Agent (`blog_agent.py`)
Fetches and cleans blog articles, focusing on the core technical learning.
- **Total Nodes: 8**
- **LLM Calls: 7 to 8**
- **Node & LLM Breakdown:**
  1. `fetch_blog`: Scraper (No LLM).
  2. `extract_metadata`: **Groq (`llama-3.1-8b-instant`)** to clean title/author (1 call).
  3. `summarize`: **Groq (`llama-3.1-8b-instant`)** (1 call).
  4. `extract_concepts`: **Groq (`llama-3.1-8b-instant`)** (1 call).
  5. `generate_metadata`: **Groq (`llama-3.3-70b-versatile`)** (1 call).
  6. `score_difficulty`: **Groq (`llama-3.3-70b-versatile`)** (1 call).
  7. `place_in_tree`: **Groq (`llama-3.3-70b-versatile`)** (1 call).
  8. `detect_interview_qna`: **Groq (`llama-3.1-8b-instant`)** (1 call). *Optional:* If detected, calls **Groq (`llama-3.3-70b-versatile`)** for extraction (+1 call).

### C. PlainText / Smart Notes Agent (`plaintext_agent.py`)
Processes unstructured raw text, code snippets, and logs.
- **Total Nodes: 8**
- **LLM Calls: 7 to 8**
- **Node & LLM Breakdown:**
  1. `analyze_content`: **Groq (`llama-3.1-8b-instant`)** to classify note type (1 call).
  2. `infer_domain`: **Groq (`llama-3.1-8b-instant`)** (1 call).
  3. `build_tree_position`: **Groq (`llama-3.3-70b-versatile`)** (1 call).
  4. `generate_summary`: **Groq (`llama-3.3-70b-versatile`)** to create a teaching summary (1 call).
  5. `extract_concepts`: **Groq (`llama-3.1-8b-instant`)** (1 call).
  6. `generate_metadata`: Python determinism (No LLM).
  7. `score_difficulty`: **Groq (`llama-3.3-70b-versatile`)** (1 call).
  8. `detect_interview_qna`: **Groq (`llama-3.1-8b-instant`)** (1 call). *Optional:* If detected, calls **Groq (`llama-3.3-70b-versatile`)** for extraction (+1 call).

### D. YouTube Agent (`youtube_agent.py`)
Fetches video transcripts and chapters, handling both single videos and playlists.
- **Total Nodes: 7**
- **LLM Calls: 4 + N** *(where N is the number of video chapters)*
- **Node & LLM Breakdown:**
  1. `resolve_url`: API fetch (No LLM).
  2. `summarize_chapters`: **Groq (`llama-3.1-8b-instant`)** called *once per chapter* in the video (N calls).
  3. `overall_summary`: **Groq (`llama-3.1-8b-instant`)** (1 call).
  4. `extract_concepts`: **Groq (`llama-3.1-8b-instant`)** (1 call).
  5. `score_difficulty`: **Groq (`llama-3.3-70b-versatile`)** (1 call).
  6. `place_in_tree`: **Groq (`llama-3.3-70b-versatile`)** (1 call).
  7. `generate_metadata`: Payload assembly (No LLM).

### E. Research Paper Agent (`research_agent.py`)
Handles arXiv and generic research papers, extracting structured data (methods, results, conclusions) from long PDFs.
- **Total Nodes: 10**
- **LLM Calls: 6 to 7**
- **Node & LLM Breakdown:**
  1. `resolve_source`: API fetch (No LLM).
  2. `download_pdf`: File handling (No LLM).
  3. `extract_pdf_text`: PyMuPDF parsing (No LLM).
  4. `extract_research_title`: **Groq (`llama-3.1-8b-instant`)** (optional, 0 to 1 call).
  5. `extract_structured`: **Gemini (`gemini-2.5-flash-preview-05-20`)** used for heavy long-context extraction (1 call).
  6. `summarize`: **Gemini (`gemini-2.5-flash-preview-05-20`)** (1 call).
  7. `extract_concepts`: **Groq (`llama-3.1-8b-instant`)** (1 call).
  8. `generate_metadata`: **Groq (`llama-3.3-70b-versatile`)** (1 call).
  9. `score_difficulty`: **Groq (`llama-3.3-70b-versatile`)** (1 call).
  10. `place_in_tree`: **Groq (`llama-3.3-70b-versatile`)** (1 call).

### F. GitHub Agent (`github_agent.py`)
Analyzes repository structure, tech stack, and README.
- **Total Nodes: 9**
- **LLM Calls: 7**
- **Node & LLM Breakdown:**
  1. `fetch_repo`: API fetch (No LLM).
  2. `detect_tech_stack`: **Groq (`llama-3.1-8b-instant`)** (1 call).
  3. `summarize_readme`: **Groq (`llama-3.1-8b-instant`)** (1 call).
  4. `extract_architecture`: **Groq (`llama-3.1-8b-instant`)** (1 call).
  5. `classify_purpose`: **Groq (`llama-3.1-8b-instant`)** (1 call).
  6. `extract_concepts`: **Groq (`llama-3.1-8b-instant`)** (1 call).
  7. `score_difficulty`: **Groq (`llama-3.3-70b-versatile`)** (1 call).
  8. `generate_metadata`: Payload assembly (No LLM).
  9. `place_in_tree`: **Groq (`llama-3.3-70b-versatile`)** (1 call).

### G. Vector Embeddings Generation (Ollama)
While the agents handle extraction and reasoning, **Ollama** is used specifically during the final storage phase and for semantic search.
- **Location:** `backend/services/embedding.py` and `backend/services/qdrant.py`
- **Usage:** Whenever the final `store` node executes (or when a user searches), the extracted summaries and metadata are sent to a local Ollama instance (`http://localhost:11434/api/embeddings`).
- **Model:** `nomic-embed-text`
- **Details:** Ollama converts the text into a 768-dimensional vector. This vector is then stored alongside the payload in the **Qdrant** vector database, enabling the system's core Retrieval-Augmented Generation (RAG) and semantic search features without incurring API costs.

---

## Technical Stack & Concurrency
- **Framework:** FastAPI
- **Database ORM:** SQLAlchemy (AsyncPG for async database operations)
- **Background Tasks:** Celery with Redis broker. This allows the heavy, multi-step LangGraph workflows to run asynchronously in the background, keeping the main FastAPI thread free to serve requests.
- **Graph Checkpointing:** `MemorySaver` checkpointer is used to maintain the state of the graph during execution, ensuring resilience.
- **LLM Models:**
  - `groq/llama-3.1-8b-instant` (Fast classification, summaries, parsing)
  - `groq/llama-3.3-70b-versatile` (Complex reasoning, taxonomies, scoring, qna generation)
  - `gemini/gemini-2.5-flash-preview-05-20` (Long-context window handling for heavy documents like PDFs)
  - `ollama/nomic-embed-text` (Local dense vector embeddings generation)
