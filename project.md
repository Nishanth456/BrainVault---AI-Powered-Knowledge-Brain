# 🧠 BrainVault

> **An Agentic AI-Powered Personal Knowledge Brain**

---

## What Is BrainVault?

BrainVault is an **intelligent second brain** — a personal knowledge platform that automatically captures, understands, classifies, and retrieves knowledge from *any* source you throw at it.

You don't organize. **The AI does.**

Unlike Notion, Obsidian, or any note-taking tool, BrainVault doesn't just store information. It *understands* it. It figures out what kind of content it is, what topic it belongs to, how difficult it is, and exactly where it fits inside your personal knowledge ecosystem — then organizes it there automatically.

---

## The Core Problem It Solves

Professionals, AI engineers, researchers, and students absorb enormous amounts of information every day:

- LinkedIn posts, Twitter/X threads
- PDFs, research papers, documentation
- Medium/Dev.to/Hashnode blogs
- GitHub repos and READMEs
- ChatGPT conversations and AI-generated content
- Technical notes, interview questions, code snippets
- YouTube transcripts, podcast summaries

All of this knowledge ends up **scattered, forgotten, or unusable** — bookmarks never revisited, PDFs in random folders, notes with no context.

Current tools require **manual organization** and cannot reason about the knowledge they store. There is no system today that can:

- Automatically determine what a piece of content *is*
- Classify it into the right knowledge domain and subdomain
- Score its difficulty and learning stage
- Organize it progressively from beginner to advanced
- Let you search it semantically or chat with it

**BrainVault is that system.**

---

## Core Philosophy

> **The user should never think about where to save information.**
>
> The AI should decide.

---

## How It Works — The Big Picture (LangGraph Architecture)

BrainVault's ingestion pipeline is orchestrated by a powerful **LangGraph** state machine.

```
User pastes anything (URL / text / PDF / code / notes)
              ↓
   FastAPI pushes task to Celery & Redis
              ↓
   Master Orchestrator Agent (LangGraph)
              ↓
   Detects input type automatically (via Groq llama-3.1)
              ↓
   Routes to 1 of 9 Specialized Agent Subgraphs
              ↓
   Agent fetches, parses, and extracts raw data
              ↓
   Agent enriches content (Summaries, Concepts, Tags) 
   (via Groq llama-3.3 & Gemini 2.5 Flash)
              ↓
   AI generates full metadata + difficulty score (1-5)
              ↓
   Content embedded into vectors (via local Ollama)
              ↓
   Stored in Postgres (metadata), Qdrant (vectors), MinIO (files)
              ↓
   User can search semantically, chat with it via RAG,
   or follow an AI-generated learning path in the Next.js UI
```

---

## Architecture Stack

BrainVault uses a modern, robust, and AI-native technology stack:
- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS v4, Framer Motion.
- **Backend**: FastAPI, SQLAlchemy (AsyncPG).
- **Asynchronous Queues**: Celery & Redis (to process heavy AI extraction without blocking the UI).
- **AI Orchestration**: LangGraph.
- **LLM Engine**: Multi-model approach:
  - **Groq (llama-3.1 & 3.3)**: High-speed classification, summarization, and taxonomy routing.
  - **Google Gemini (2.5 Flash)**: Heavy document reasoning and long-context structured extraction.
  - **Ollama (`nomic-embed-text`)**: 100% local, zero-cost vector embedding generation.
- **Infrastructure**: Dockerized PostgreSQL (relational), Qdrant (vector DB), and MinIO (S3-compatible object storage).

---

## What You Can Feed BrainVault

| Input Type | Examples |
|---|---|
| **URLs** | LinkedIn posts, Medium articles, research paper links, GitHub repos, YouTube videos |
| **Files** | PDFs, books, cheat sheets, slides, documentation |
| **Raw Text** | Technical notes, code snippets, ChatGPT conversations, prompts |
| **Structured Content** | Interview Q&As, Markdown notes, Twitter/X threads |
| **YouTube** | Single videos, full playlists — transcribed and summarized |
| **Courses** | Udemy/Coursera course URLs — extract syllabus and notes |
| **Certifications** | Certificate links, exam prep notes, credential metadata |

---

## Specialized Agents Inside BrainVault

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

*(Note: Interview Q&A detection is built directly into multiple agents, extracting hidden questions and writing high-quality answers).*

---

## Knowledge Classification System

BrainVault doesn't just create flat folders. It builds a **hierarchical, intelligent knowledge tree**:

```
Knowledge Domain
    └── Subdomain
            └── Topic
                    └── Concept
                            └── Difficulty Level (1–5)
                                        └── Content Items
```

**Example:**
```
Artificial Intelligence
    └── LLMs
            └── Prompt Engineering
                    └── Zero-Shot Prompting
                                └── Beginner (Level 1)
                                            └── [LinkedIn Post by @user]
                                            └── [Medium Blog Article]
```

Every content item receives a **Difficulty Score (1–5)** generated by AI, enabling users to study progressively — naturally moving from beginner to advanced within any topic.

---

## Metadata Generated Per Item

Every piece of knowledge stored gets a full AI-generated metadata profile:

```
Title                  Author              Source URL
Category               Subcategory         Topic
Difficulty (1–5)       Reading Time        Importance Score
Tags                   Keywords            Key Concepts
Summary                Technologies        Learning Path Position
Embedding ID           Date Added          Attachment Type (MinIO URI)
```

---

## Knowledge Spaces (Pages)

Each knowledge type lives in its own curated space:

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

## AI-Powered Features

### 🔍 Semantic Search
Search using natural language — not keywords. Ask "show everything about prompt engineering" and get results across LinkedIn posts, blogs, papers, notes, and interview questions via Qdrant vector search.

### 💬 AI Chat (RAG over your Knowledge)
Ask BrainVault anything. It searches your entire personal knowledge base and answers using only what *you* have stored — your own curated second brain.

### 📚 Learning Mode
Select any topic (e.g., "LLMs") and BrainVault generates a **personalized progressive learning path** from your own stored content — ordered from foundational to advanced.

---

## Who Is This For?

- **AI Engineers & Researchers** — manage papers, docs, and notes in one intelligent brain
- **Students** — organize learning resources automatically and study progressively
- **Content Creators** — centralize all research for writing and creation
- **Tech Professionals** — interview prep, documentation, and knowledge retention
- **Knowledge Workers** — anyone who consumes and needs to recall large volumes of information

---

## End Vision

BrainVault becomes a **true AI-powered Second Brain** — a system where users never worry about organizing knowledge. They simply capture information from anywhere, and an intelligent multi-agent backend continuously transforms it into a structured, searchable, interconnected, and personalized learning ecosystem that grows alongside the user.

> Capture once. Understand always. Learn forever.
