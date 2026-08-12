# BrainVault — AI-Powered Knowledge Brain

> **Capture anything. Understand everything.** Paste any URL, text, or file. BrainVault's AI agents automatically extract, classify, and organize it into your personal knowledge brain.

## 🧠 What is BrainVault?

BrainVault is an **intelligent second brain**. Unlike standard note-taking tools, it doesn't just store information; it *understands* it. Using a multi-agent AI architecture, BrainVault automatically figures out what a piece of content is (LinkedIn post, research paper, YouTube video, etc.), classifies it into the right domain, scores its difficulty, and places it into a hierarchical knowledge tree.

**You don't organize. The AI does.**

---

## 🏗️ Architecture & 7 Core Services

BrainVault runs on a robust, asynchronous, and containerized architecture. It is fully Dockerized and consists of **7 Core Services** running simultaneously to process knowledge in the background without blocking the user interface:

1. **Frontend (Next.js 16)**: The beautiful, premium user interface built with React 19, Tailwind CSS v4, and Framer Motion.
2. **Backend API (FastAPI)**: The high-speed Python backend that serves data and triggers ingestion workflows.
3. **Celery Worker**: The background processing engine that runs heavy AI extractions, web scraping, and LangGraph orchestrations.
4. **PostgreSQL**: The primary relational database storing metadata, tags, and user profiles.
5. **Qdrant**: The vector database storing text embeddings for Semantic Search and RAG (Chat).
6. **Redis**: The message broker routing tasks between FastAPI and Celery.
7. **MinIO**: The S3-compatible object storage for saving raw files, PDFs, and images.

---

## ⚙️ How It Works (The AI Pipeline)

BrainVault uses **LangGraph** to orchestrate 9 specialized AI agent subgraphs. When you submit content:
1. **Routing**: The Master Agent uses Groq (Llama-3) to detect the input type.
2. **Extraction**: A specialized agent (e.g., GitHub Agent, YouTube Agent, PDF Agent) scrapes and parses the raw data.
3. **Enrichment**: Gemini 2.5 Flash and Llama-3 summarize, tag, and assign a difficulty score (1-5).
4. **Embedding**: Local Ollama (`nomic-embed-text`) generates vector embeddings.
5. **Retrieval**: You can semantically search your entire database or chat with it via Retrieval-Augmented Generation (RAG).

## 🤖 Specialized AI Agents & Tools

BrainVault runs **9 specialized AI agent subgraphs**, each an expert at a specific content type:

| Agent | Handles | Key Outputs |
|---|---|---|
| **LinkedIn Agent** | LinkedIn posts + attachments + carousels + PDFs | Summary, topics, tags, difficulty, stitches carousels to PDFs |
| **Blog Agent** | Medium, Dev.to, Hashnode, personal blogs | Article text, headings, key concepts, clean summary |
| **Research Paper Agent** | ArXiv, PDF papers | Problem, method, architecture, dataset, results, limitations |
| **PDF Agent** | Books, cheat sheets, slides, documentation | Section extraction, page summaries, tables, images |
| **Plain Text Agent** | Pasted notes, code snippets, ChatGPT chats | Context inference, topic detection, auto-classification |
| **GitHub Agent** | GitHub repositories | README, architecture, tech stack, use cases |
| **YouTube Agent** | Single videos + full playlists | Transcript, chapter summaries, overall summary, key concepts |
| **Course Agent** (Future) | Udemy, Coursera, fast.ai, DeepLearning.AI | Syllabus, module summaries, notes, progress tracking |
| **Certification Agent** (Future) | Certificate links, exam prep material | Credential metadata, related resources, study notes |

---

## 🗂️ Knowledge Spaces

Each knowledge type lives in its own curated space within the platform:

| Space | What's Inside |
|---|---|
| **LinkedIn Knowledge** | Cards with thumbnail, summary, difficulty, tags, attachments |
| **Blog Library** | Article cards with image, author, reading time, key concepts |
| **Research Papers** | Papers grouped by domain with method/results summaries |
| **Interview Questions** | Auto-extracted Q&As grouped by domain |
| **AI Notes** | Quick pasted text, auto-classified hierarchically |
| **GitHub Repos** | Repo cards with architecture, tech stack, language, stars |
| **PDF Library** | Books and documents with reader + AI summary |
| **YouTube** | Saved videos and full playlists, transcribed and summarized |

---

## ✨ AI-Powered Features

### 🔍 Semantic Search
Search using natural language — not keywords. Ask "show everything about prompt engineering" and get results across LinkedIn posts, blogs, papers, notes, and interview questions via Qdrant vector search.

### 💬 AI Chat (RAG over your Knowledge)
Ask BrainVault anything. It searches your entire personal knowledge base and answers using only what *you* have stored — your own curated second brain.

### 📚 Learning Mode
Select any topic (e.g., "LLMs") and BrainVault generates a **personalized progressive learning path** from your own stored content — ordered from foundational to advanced.

---

## 📚 Documentation

For a deep dive into the technical stack, architecture, and flows, please refer to the detailed documentation:

- **[Backend Architecture & Agents](documentation/backend.md)**: Complete breakdown of the LangGraph master orchestrator, the 9 agent subgraphs, and exhaustive details on LLM usage.
- **[Frontend Architecture](documentation/frontend.md)**: Details on the Next.js App Router stack, Tailwind CSS v4 styling, component-driven design, and premium aesthetic philosophy.
- **[Infrastructure Flow](documentation/infrastructure.md)**: Explanation of the containerized core services and the end-to-end data ingestion pipeline.

---

## 🚀 Quick Start (Local Development)

The entire application is Dockerized. You can start the infrastructure, backend API, celery workers, and frontend with a single command.

### 1. Start all services

Make sure Docker and Docker Compose are installed, then run from the **project root**:

```bash
docker-compose up -d --build
```

This starts all 7 core services at once.
- **Backend API:** Available at [http://localhost:8000/docs](http://localhost:8000/docs).
- **Frontend:** Available at [http://localhost:3000](http://localhost:3000).

> **Hot Reloading:** The local `backend` and `frontend` directories are mounted into the containers. Any changes you make to the code will instantly reflect without needing to rebuild the images!

> After any change to the LinkedIn scraper or agents, **restart the Celery worker** container so the new code takes effect:
> `docker-compose restart celery`

---

## 🔐 LinkedIn Ingestion — Manual Login Required

LinkedIn blocks headless / automated logins, so the scraper **cannot log itself in** reliably. You must create a saved browser session once, then the backend reuses it.

### First-time setup

1. Make sure your backend `.env` has your LinkedIn credentials (they are only used as a fallback):
   ```env
   LINKEDIN_EMAIL=your_email@example.com
   LINKEDIN_PASSWORD=your_password
   ```
2. Run the manual login script:
   ```bash
   cd backend
   python scripts/linkedin_login.py
   ```
3. A real browser window opens. Log in to LinkedIn normally and solve any CAPTCHA / 2FA.
4. Once you see your feed, the script saves the session to `backend/linkedin_session.json`.
5. **Restart the Celery worker** so it picks up the new session.
6. Now paste a LinkedIn post URL into the BrainVault UI and ingest it.

### If LinkedIn ingestion stops working

- The session probably expired. Re-run `python scripts/linkedin_login.py`, then restart the Celery worker.
- Check `backend/login_dump.html` or `backend/post_dump.html` for debug output if login or scraping fails.

---

## 👤 Updating the Default Profile

When a new user visits the Profile page, the application automatically seeds the database with a default profile. You can customize this by editing the `DEFAULT_PROFILE` dictionary at the top of `backend/routers/profile.py` with your own details. Once updated, restart the backend server, and the new default profile will be used for any newly initialized users.
