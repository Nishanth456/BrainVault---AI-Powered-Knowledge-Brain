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

## How It Works — The Big Picture

```
User pastes anything (URL / text / PDF / code / notes)
              ↓
   Master Orchestrator Agent
              ↓
   Detects input type automatically
              ↓
   Routes to the right Specialized Agent
              ↓
   Agent extracts, analyzes, enriches content
              ↓
   AI generates full metadata + difficulty score
              ↓
   Content stored in the correct Knowledge Space
              ↓
   User can search semantically, chat with it,
   or follow an AI-generated learning path
```

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
| **Future** | Images, voice notes, podcast audio |

---

## Specialized Agents Inside BrainVault

BrainVault runs **multiple specialized AI agents**, each an expert at a specific content type:

| Agent | Handles | Key Outputs |
|---|---|---|
| **LinkedIn Agent** | LinkedIn posts + attachments + carousels + PDFs | Summary, topics, tags, difficulty, in-app PDF reader |
| **Blog Agent** | Medium, Dev.to, Hashnode, personal blogs | Article text, headings, key concepts, clean summary |
| **Research Paper Agent** | ArXiv, PDF papers | Problem, method, architecture, dataset, results, limitations |
| **PDF Agent** | Books, cheat sheets, slides, documentation | Section extraction, page summaries, tables, images |
| **Plain Text Agent** | Pasted notes, code snippets, ChatGPT chats | Context inference, topic detection, auto-classification |
| **Interview Question Agent** | Q&As from any source | Question, explanation, difficulty, related questions |
| **Documentation Agent** | LangGraph, FastAPI, OpenAI docs, etc. | Indexed and summarized docs |
| **GitHub Agent** | GitHub repositories | README, architecture, tech stack, use cases |
| **YouTube Agent** | Single videos + full playlists | Transcript, chapter summaries, key concepts, difficulty |
| **Course Agent** | Udemy, Coursera, fast.ai, DeepLearning.AI | Syllabus, module summaries, notes, progress tracking |
| **Certification Agent** | Certificate links, exam prep material | Credential metadata, related resources, study notes |

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
Embedding ID           Date Added          Attachment Type
```

---

## Knowledge Spaces (Pages)

Each knowledge type lives in its own curated space:

| Space | What's Inside |
|---|---|
| **LinkedIn Knowledge** | Cards with thumbnail, summary, difficulty, tags, attachments |
| **Blog Library** | Article cards with image, author, reading time, key concepts |
| **Research Papers** | Papers grouped by domain with method/results summaries |
| **Interview Questions** | Q&As grouped by domain (AI, ML, Python, System Design, SQL, RAG…) |
| **AI Notes** | Quick pasted text, auto-classified hierarchically |
| **Prompt Library** | Prompts categorized by use case |
| **Documentation** | Official docs summarized and indexed |
| **GitHub Repos** | Repo cards with architecture, tech stack, language, stars |
| **PDF Library** | Books and documents with reader + AI summary |
| **YouTube** | Saved videos and full playlists, transcribed and summarized |
| **Course Websites** | Structured course content from Udemy, Coursera, fast.ai, etc. |
| **Certifications** | Credentials earned, exam notes, prep resources |
| **Bookmarks** | Pinned favorites and recently read |
| **Learning Paths** | AI-generated progressive study plans |

---

## AI-Powered Features

### 🔍 Semantic Search
Search using natural language — not keywords. Ask "show everything about prompt engineering" and get results across LinkedIn posts, blogs, papers, notes, and interview questions.

### 💬 AI Chat (RAG over your Knowledge)
Ask BrainVault anything. It searches your entire personal knowledge base and answers using only what *you* have stored — your own curated second brain.

### 📚 Learning Mode
Select any topic (e.g., "LLMs") and BrainVault generates a **personalized progressive learning path** from your own stored content — ordered from foundational to advanced.

**Example path auto-generated from your knowledge:**
```
Introduction to LLMs
    → Inference & Sampling Parameters
        → Prompt Engineering Basics
            → Chain of Thought
                → RAG
                    → Agents
                        → Multi-Agent Systems
                            → Evaluation
```

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
