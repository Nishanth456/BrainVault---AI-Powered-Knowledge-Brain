# 📝 Phase 3 — Blog Agent

> **Prerequisite**: Phase 2 complete — plaintext agent works, master graph routes by type, storage layer handles `qna_pairs`, and the Notes knowledge space is live.
>
> **Goal**: Paste a Medium, Dev.to, Hashnode, Substack, or generic blog URL → real-time agent pipeline runs → a beautiful card appears in the Blog Library.

---

## ✅ What You Ship at the End of Phase 3

```
1. Paste a blog URL (e.g. https://medium.com/... or https://dev.to/...)
2. Watch the real-time step-by-step agent progress stream in the UI
3. Blog Library page now shows a card for that article:
   - Article title (AI-extracted)
   - Author name + estimated reading time
   - 3-5 sentence AI summary
   - Difficulty badge (1–5)
   - Tags + key concepts chips
   - Knowledge tree path: "AI → LLMs → RAG"
4. Click "🔗 Read Original" to open the source URL
5. All data persisted in PostgreSQL + Qdrant
```

---

## 📁 New Files to Create / Update

```
backend/
├── agents/
│   ├── blog_agent.py           ← NEW: Blog LangGraph subgraph
│   └── orchestrator.py         ← UPDATE: replace blog stub with real adapter
├── tools/
│   └── blog_scraper.py         ← NEW: generic blog fetch + extract helper
├── routers/
│   └── knowledge.py            ← UPDATE: add GET /api/knowledge/blogs

frontend/
├── app/knowledge/blogs/page.tsx     ← UPDATE: empty state → real list
├── components/knowledge/
│   └── BlogCard.tsx            ← NEW: blog card component
└── lib/api.ts                  ← UPDATE: add listBlogs() helper
```

---

## 🐍 Backend Implementation

### 1. `backend/tools/blog_scraper.py` — Generic Blog Fetcher

```python
"""
blog_scraper.py — Fetch and extract content from blog URLs.

Supports:
- Medium (medium.com, *.medium.com)
- Dev.to
- Hashnode
- Substack
- Generic blogs with article markup
"""
import httpx
from bs4 import BeautifulSoup
from urllib.parse import urlparse


USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


def _site_name(url: str) -> str:
    host = urlparse(url).netloc.lower()
    if "medium.com" in host or host.endswith(".medium.com"):
        return "Medium"
    if "dev.to" in host:
        return "Dev.to"
    if "hashnode" in host:
        return "Hashnode"
    if "substack.com" in host:
        return "Substack"
    return "Blog"


async def fetch_blog(url: str) -> dict:
    """
    Fetch a blog page and extract clean article text + metadata.
    Returns: {
        "url": str,
        "site": str,
        "title": str | None,
        "author": str | None,
        "published_date": str | None,
        "raw_html": str,
        "article_text": str,
        "error": str | None,
    }
    """
    try:
        async with httpx.AsyncClient(timeout=30, headers={"User-Agent": USER_AGENT}, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            html = resp.text
    except Exception as e:
        return {
            "url": url,
            "site": _site_name(url),
            "title": None,
            "author": None,
            "published_date": None,
            "raw_html": "",
            "article_text": "",
            "error": f"Failed to fetch blog: {e}",
        }

    soup = BeautifulSoup(html, "lxml")

    # Title
    title = None
    if soup.title:
        title = soup.title.get_text(strip=True)
    og_title = soup.find("meta", property="og:title")
    if og_title and og_title.get("content"):
        title = og_title["content"].strip()

    # Author
    author = None
    for selector in [
        "meta[name='author']",
        "meta[property='article:author']",
        "meta[name='twitter:creator']",
    ]:
        tag = soup.select_one(selector)
        if tag and tag.get("content"):
            author = tag["content"].strip()
            break
    # Fallback: common author class names
    if not author:
        for cls in ["author", "byline", "post-author", "article-author", "pw-author-name"]:
            el = soup.find(class_=cls)
            if el:
                author = el.get_text(strip=True)
                break

    # Published date
    published_date = None
    for selector in ["meta[property='article:published_time']", "meta[name='datePublished']"]:
        tag = soup.select_one(selector)
        if tag and tag.get("content"):
            published_date = tag["content"].strip()
            break

    # Article text extraction
    article_text = ""

    # Try common article containers first
    article = soup.find("article")
    if article:
        article_text = article.get_text(separator="\n", strip=True)
    else:
        # Medium-specific
        medium_root = soup.find("div", class_=lambda c: c and "article-content" in c)
        if medium_root:
            article_text = medium_root.get_text(separator="\n", strip=True)
        else:
            # Generic fallback: largest <div> with paragraphs
            candidates = []
            for div in soup.find_all("div"):
                text = div.get_text(separator=" ", strip=True)
                p_count = len(div.find_all("p"))
                if len(text) > 500 and p_count >= 3:
                    candidates.append((len(text), p_count, text, div))
            if candidates:
                candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)
                article_text = candidates[0][2]

    # Clean up excessive whitespace
    article_text = "\n".join(line.strip() for line in article_text.splitlines() if line.strip())

    return {
        "url": url,
        "site": _site_name(url),
        "title": title,
        "author": author,
        "published_date": published_date,
        "raw_html": html,
        "article_text": article_text,
        "error": None,
    }
```

---

### 2. `backend/agents/blog_agent.py` — Blog LangGraph Subgraph

```python
"""
blog_agent.py — Blog article ingestion LangGraph subgraph.

Pipeline:
  fetch_blog → extract_metadata → summarize → extract_concepts
  → generate_metadata → score_difficulty → place_in_tree → END
"""
from langgraph.graph import StateGraph, END
from typing import TypedDict, Optional
from backend.tools.blog_scraper import fetch_blog
from backend.services.llm import call_llm
import json


# ── Blog-specific state ───────────────────────────────────────────────────────

class BlogState(TypedDict):
    url: str
    concept: Optional[str]
    site: Optional[str]
    title: Optional[str]
    author: Optional[str]
    published_date: Optional[str]
    article_text: Optional[str]
    summary: Optional[str]
    key_concepts: Optional[list[str]]
    tags: Optional[list[str]]
    metadata: Optional[dict]
    difficulty: Optional[int]
    knowledge_tree: Optional[str]
    knowledge_domain: Optional[str]
    is_interview_qna: Optional[bool]
    qna_pairs: Optional[list[dict]]
    agent_steps: list[str]
    error: Optional[str]


# ── Shared taxonomy (keep in sync with linkedin_agent.py / plaintext_agent.py) ─

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


# ── Node 1: Fetch blog page ─────────────────────────────────────────────────

async def fetch_blog_node(state: BlogState) -> dict:
    """Fetch the blog article and extract raw text."""
    data = await fetch_blog(state["url"])

    if data.get("error"):
        return {
            "error": data["error"],
            "agent_steps": ["❌ Failed to fetch blog article"],
        }

    return {
        "site": data["site"],
        "title": data["title"],
        "author": data["author"],
        "published_date": data["published_date"],
        "article_text": data["article_text"],
        "agent_steps": [
            f"✅ Fetched {data['site']} article",
            f"✅ Extracted {len(data['article_text']):,} characters of text",
        ],
    }


# ── Node 2: Extract / clean metadata ─────────────────────────────────────────

async def extract_blog_metadata(state: BlogState) -> dict:
    """Use LLM to clean/extract title and author if missing."""
    text = (state.get("article_text") or "")[:3000]
    title = state.get("title") or ""
    author = state.get("author") or ""

    response = await call_llm(
        prompt=f"""Extract the article title and author from this blog text.
Return ONLY a JSON object:
{{
  "title": "the article title",
  "author": "the author name or publication"
}}

Current title hint: {title or "unknown"}
Current author hint: {author or "unknown"}

Text sample:
{text[:2000]}

Return ONLY valid JSON.""",
        model="groq/llama-3.1-8b-instant",
        system="You are a metadata extraction assistant. Return only valid JSON.",
        max_tokens=150,
        temperature=0,
    )

    try:
        clean = response.strip().strip("```json").strip("```").strip()
        data = json.loads(clean)
        final_title = data.get("title") or title or "Untitled Blog Post"
        final_author = data.get("author") or author or "Unknown"
    except Exception:
        final_title = title or "Untitled Blog Post"
        final_author = author or "Unknown"

    return {
        "title": final_title,
        "author": final_author,
        "agent_steps": [f"✅ Metadata extracted — {final_title} by {final_author}"],
    }


# ── Node 3: Summarize article ─────────────────────────────────────────────────

async def summarize_blog(state: BlogState) -> dict:
    """Create a 3-5 sentence summary of the article."""
    text = (state.get("article_text") or "")[:8000]

    summary = await call_llm(
        prompt=f"""Summarize this blog article in 3-5 short sentences.
Focus on the key technical insight or learning. Be specific and concise.

IMPORTANT: Output ONLY the summary. No intro, no conclusion.

Article:
{text}""",
        model="groq/gemma2-9b-it",
        system="You are a technical knowledge extraction expert.",
        max_tokens=300,
    )

    return {
        "summary": summary,
        "agent_steps": ["✅ Article summary generated"],
    }


# ── Node 4: Extract concepts + tags ───────────────────────────────────────────

async def extract_blog_concepts(state: BlogState) -> dict:
    """Extract key concepts and short tags from the article."""
    text = (state.get("article_text") or "")[:5000]
    concept = state.get("concept") or ""

    response = await call_llm(
        prompt=f"""Extract key concepts and tags from this blog article.
Return a JSON object with two lists:
- "concepts": 3-8 specific technical concepts
- "tags": 3-6 short tags

{f'Primary concept (must be included): {concept}' if concept else ''}

Article:
{text}

Return ONLY valid JSON, nothing else.""",
        model="groq/llama-3.1-8b-instant",
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


# ── Node 5: Generate metadata ─────────────────────────────────────────────────

async def generate_blog_metadata(state: BlogState) -> dict:
    """Generate reading time and importance score."""
    text = state.get("article_text") or ""
    word_count = len(text.split())
    reading_time = max(1, round(word_count / 200))

    summary = state.get("summary", "")
    concepts = state.get("key_concepts", [])
    tags = state.get("tags", [])

    response = await call_llm(
        prompt=f"""Generate metadata for this blog article. Return ONLY a JSON object:

{{
  "title": "descriptive title (max 100 chars)",
  "importance_score": <integer 1-10>
}}

Summary: {summary}
Concepts: {concepts}
Tags: {tags}

Return ONLY valid JSON.""",
        model="groq/llama-3.3-70b-versatile",
        system="You are a knowledge management expert. Return only valid JSON.",
        max_tokens=150,
        temperature=0,
    )

    try:
        clean = response.strip().strip("```json").strip("```").strip()
        metadata = json.loads(clean)
    except Exception:
        metadata = {
            "title": state.get("title") or "Untitled Blog Post",
            "importance_score": 5,
        }

    metadata["reading_time_minutes"] = reading_time

    return {
        "metadata": metadata,
        "agent_steps": [f"✅ Metadata generated — {reading_time} min read"],
    }


# ── Node 6: Score difficulty ──────────────────────────────────────────────────

async def score_blog_difficulty(state: BlogState) -> dict:
    """Score technical difficulty 1-5."""
    summary = state.get("summary", "")
    concepts = state.get("key_concepts", [])

    response = await call_llm(
        prompt=f"""Rate the technical difficulty of this blog article on a scale of 1-5:
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


# ── Node 7: Place in knowledge tree ───────────────────────────────────────────

async def place_blog_in_tree(state: BlogState) -> dict:
    """Map the blog to the predefined AI_CONCEPTS_LIST taxonomy."""
    text = (state.get("article_text") or "")[:4000]
    concept = state.get("concept") or ""

    response = await call_llm(
        prompt=f"""Determine where this blog article belongs in our predefined knowledge taxonomy.
You MUST choose exactly ONE concept from the provided ALLOWED_CONCEPTS list.

{f'User-provided concept (use to help pick): {concept}' if concept else ''}

ALLOWED_CONCEPTS:
{', '.join(AI_CONCEPTS_LIST)}

Return ONLY a JSON object:
{{
  "tree_path": "The EXACT concept string you chose from the ALLOWED_CONCEPTS list",
  "domain": "One of: Artificial Intelligence, Machine Learning, Python, System Design, SQL, Cloud Computing, DevOps, Mathematics, General"
}}

Article:
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


# ── Node 8: Detect interview Q&A (cross-space) ────────────────────────────────

async def detect_blog_interview_qna(state: BlogState) -> dict:
    """Check if the blog contains interview Q&A and extract pairs."""
    text = state.get("article_text") or ""
    summary = state.get("summary", "")

    response = await call_llm(
        prompt=f"""Determine if this blog article is primarily a list of Interview Questions and Answers.
Return ONLY a JSON object:
{{
  "is_interview_qna": true or false
}}

Summary: {summary}
Article sample: {text[:2000]}

Return ONLY valid JSON.""",
        model="groq/llama-3.1-8b-instant",
        system="You are a classifier. Return only valid JSON.",
        max_tokens=50,
        temperature=0,
    )

    try:
        clean = response.strip().strip("```json").strip("```").strip()
        data = json.loads(clean)
        is_qna = bool(data.get("is_interview_qna", False))
    except Exception:
        is_qna = False

    steps = []
    qna_pairs = []

    if is_qna:
        steps.append("✅ Classified as Interview QnA")
        steps.append("🤖 Extracting QnA pairs...")

        qna_prompt = f"""You are an expert Principal AI Engineer conducting a senior technical interview.
This blog article contains interview questions and answers.
Extract EVERY SINGLE QUESTION from the text. For each question:
1. Put the exact question in the "q" field.
2. Put the best available answer in the "a" field. If the answer is missing or weak, write a strong senior-level answer yourself.
3. Map the question to EXACTLY ONE topic from this list:
{chr(10).join([f"- {t}" for t in AI_CONCEPTS_LIST])}

Return ONLY a valid JSON array of objects:
[
  {{
    "q": "The question",
    "a": "The high-quality technical answer",
    "topic": "The exact topic from the list above"
  }}
]

Article:
{text}
"""
        qna_response = await call_llm(
            prompt=qna_prompt,
            model="groq/llama-3.3-70b-versatile",
            system="You are an expert AI Interviewer. Return only valid JSON.",
            max_tokens=4000,
            temperature=0,
        )

        try:
            match = __import__("re").search(r'\[\s*\{{.*\}}\s*\]', qna_response, __import__("re").DOTALL)
            qna_clean = match.group(0) if match else qna_response.replace("```json", "").replace("```", "").strip()
            qna_pairs = json.loads(qna_clean)
            if isinstance(qna_pairs, list):
                steps.append(f"✅ Extracted {len(qna_pairs)} QnA pairs")
            else:
                qna_pairs = []
        except Exception as e:
            print("Failed to parse QnA pairs:", e)
            qna_pairs = []

    return {
        "is_interview_qna": is_qna,
        "qna_pairs": qna_pairs,
        "agent_steps": steps,
    }


# ── Build the Blog subgraph ───────────────────────────────────────────────────

def build_blog_subgraph() -> StateGraph:
    graph = StateGraph(BlogState)

    graph.add_node("fetch_blog",            fetch_blog_node)
    graph.add_node("extract_metadata",      extract_blog_metadata)
    graph.add_node("summarize",             summarize_blog)
    graph.add_node("extract_concepts",      extract_blog_concepts)
    graph.add_node("generate_metadata",     generate_blog_metadata)
    graph.add_node("score_difficulty",      score_blog_difficulty)
    graph.add_node("place_in_tree",         place_blog_in_tree)
    graph.add_node("detect_interview_qna",  detect_blog_interview_qna)

    graph.set_entry_point("fetch_blog")
    graph.add_edge("fetch_blog",           "extract_metadata")
    graph.add_edge("extract_metadata",     "summarize")
    graph.add_edge("summarize",            "extract_concepts")
    graph.add_edge("extract_concepts",     "generate_metadata")
    graph.add_edge("generate_metadata",    "score_difficulty")
    graph.add_edge("score_difficulty",     "place_in_tree")
    graph.add_edge("place_in_tree",        "detect_interview_qna")
    graph.add_edge("detect_interview_qna", END)

    return graph


blog_subgraph = build_blog_subgraph()
```

---

### 3. `backend/agents/orchestrator.py` — Wire Real Blog Agent

Replace the `blog_agent` stub with a real adapter. Update the stub list and add the adapter function.

**Change:**
```python
stub_agents = [
    "pdf_agent", "research_agent",
    "github_agent", "youtube_agent", "course_agent",
]
for name in stub_agents:
    graph.add_node(name, stub_agent_node)

# Phase 2: real plaintext agent
graph.add_node("plaintext_agent", plaintext_agent_node)

# Phase 3: real blog agent
graph.add_node("blog_agent", blog_agent_node)
```

Add the adapter near `linkedin_agent_node`:

```python
async def blog_agent_node(state: BrainVaultState) -> dict:
    """
    Adapter: runs the Blog LangGraph subgraph and merges results
    back into the master BrainVaultState.
    """
    from backend.agents.blog_agent import blog_subgraph, BlogState

    blog_state = BlogState(
        url=state["raw_input"].strip(),
        concept=state.get("concept") or "",
        site=None,
        title=None,
        author=None,
        published_date=None,
        article_text=None,
        summary=None,
        key_concepts=None,
        tags=None,
        metadata=None,
        difficulty=None,
        knowledge_tree=None,
        knowledge_domain=None,
        is_interview_qna=None,
        qna_pairs=None,
        agent_steps=[],
        error=None,
    )

    compiled = blog_subgraph.compile()
    result = await compiled.ainvoke(blog_state)

    metadata = result.get("metadata") or {}
    is_qna = result.get("is_interview_qna")

    # If interview Q&A detected, storage_service will create interview_qna items too.
    return {
        "input_type":       "blog",
        "extracted_text":   result.get("article_text", ""),
        "title":            metadata.get("title", result.get("title", "")),
        "summary":          result.get("summary", ""),
        "key_concepts":     result.get("key_concepts") or [],
        "tags":             result.get("tags") or [],
        "difficulty":       result.get("difficulty", 3),
        "knowledge_tree":   result.get("knowledge_tree", ""),
        "knowledge_domain": result.get("knowledge_domain"),
        "qna_pairs":        result.get("qna_pairs") or [],
        "metadata":         metadata,
        "agent_steps":      result.get("agent_steps") or [],
        "error":            result.get("error"),
        "source_url":       state["raw_input"].strip(),
        "author":           result.get("author", ""),
    }
```

---

### 4. `backend/routers/knowledge.py` — Add Blogs Endpoint

Add a new endpoint that returns all `type="blog"` items, mirroring `/linkedin`:

```python
@router.get("/blogs")
async def get_blog_items(
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    """Return all Blog knowledge items."""
    result = await db.execute(
        select(KnowledgeItem)
        .options(selectinload(KnowledgeItem.attachments))
        .where(KnowledgeItem.type == "blog")
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
            "knowledge_domain": item.knowledge_domain,
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
            ],
        }
        for item in items
    ]
```

---

## 🎨 Frontend Implementation

### 5. `frontend/lib/api.ts` — Add Blogs API Helper

```typescript
export async function listBlogs(limit = 20): Promise<KnowledgeItem[]> {
  const res = await fetch(`${API_BASE}/api/knowledge/blogs?limit=${limit}`)
  if (!res.ok) throw new Error(`Blogs list failed: ${res.status}`)
  return res.json()
}
```

---

### 6. `frontend/components/knowledge/BlogCard.tsx` — New Component

```tsx
"use client"
import { useState } from "react"
import Link from "next/link"
import { BookOpen, Clock, ExternalLink, Trash2, Loader2, ChevronRight } from "lucide-react"

const difficultyLabel = ["", "Beginner", "Basic", "Intermediate", "Advanced", "Expert"]
const difficultyColor = [
  "",
  "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  "text-blue-400   bg-blue-400/10   border-blue-400/20",
  "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  "text-orange-400 bg-orange-400/10 border-orange-400/20",
  "text-red-400    bg-red-400/10    border-red-400/20",
]

export interface BlogItem {
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
  knowledge_domain?: string | null
  created_at: string
}

interface BlogCardProps {
  item: BlogItem
  onDelete?: (id: string) => void
}

export function BlogCard({ item, onDelete }: BlogCardProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const diff = item.difficulty || 0

  const handleDelete = async () => {
    if (!window.confirm("Delete this blog article?")) return
    setIsDeleting(true)
    try {
      const res = await fetch(`http://localhost:8000/api/knowledge/${item.id}`, { method: "DELETE" })
      if (res.ok) onDelete?.(item.id)
      else setIsDeleting(false)
    } catch (e) {
      console.error(e)
      setIsDeleting(false)
    }
  }

  return (
    <div className="group relative bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5
                    hover:border-green-500/30 hover:bg-white/[0.05] transition-all duration-300
                    flex flex-col gap-3.5 overflow-hidden">

      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300
                      bg-gradient-to-br from-green-600/5 via-transparent to-transparent rounded-2xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-green-500/15 flex items-center justify-center flex-shrink-0">
            <BookOpen size={13} className="text-green-400" />
          </div>
          <span className="text-xs text-zinc-500 font-medium">{item.knowledge_domain || "Blog"}</span>
        </div>

        <div className="flex items-center gap-2">
          {diff > 0 && (
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${difficultyColor[diff]}`}>
              {difficultyLabel[diff]}
            </span>
          )}
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-zinc-500 hover:text-red-400 p-1 rounded-md hover:bg-red-400/10 transition-colors disabled:opacity-50"
            title="Delete article"
          >
            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2 -mb-1">
        {item.title || "Untitled Article"}
      </h3>

      {/* Author */}
      {item.author && (
        <p className="text-xs text-zinc-500 -mt-1">by {item.author}</p>
      )}

      {/* Summary */}
      <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">
        {item.summary}
      </p>

      {/* Tags */}
      {item.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.tags.slice(0, 5).map(tag => (
            <span
              key={tag}
              className="px-2 py-0.5 text-[11px] bg-green-600/10 text-green-300
                         rounded-full border border-green-600/15"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Tree path */}
      {item.knowledge_tree && (
        <div className="flex items-center gap-1 text-[11px] text-zinc-600 truncate">
          <ChevronRight size={10} className="flex-shrink-0" />
          <span className="truncate">{item.knowledge_tree}</span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/[0.05]">
        <div className="flex items-center gap-1.5 text-xs text-zinc-600">
          <Clock size={11} />
          {item.reading_time ? `${item.reading_time} min read` : "Saved"}
        </div>
        <Link
          href={item.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={11} />
          Read Original
        </Link>
      </div>
    </div>
  )
}
```

---

### 7. `frontend/app/knowledge/blogs/page.tsx` — Blog Library Page

Replace the empty-state-only page with a grouped list view, similar to `linkedin/page.tsx`:

```tsx
"use client"
import { useEffect, useState, useMemo } from "react"
import { BlogCard, type BlogItem } from "@/components/knowledge/BlogCard"
import { EmptyState } from "@/components/ui/EmptyState"
import { Filter, RefreshCw, FolderOpen, ChevronDown, ChevronRight, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"

function groupBySection(items: BlogItem[]): Record<string, BlogItem[]> {
  const groups: Record<string, BlogItem[]> = {}
  for (const item of items) {
    const section = item.knowledge_tree || "Uncategorised"
    if (!groups[section]) groups[section] = []
    groups[section].push(item)
  }
  return groups
}

export default function BlogsPage() {
  const [items, setItems] = useState<BlogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const fetchItems = () => {
    setLoading(true)
    setError(false)
    fetch("http://localhost:8000/api/knowledge/blogs")
      .then(r => {
        if (!r.ok) throw new Error("API error")
        return r.json()
      })
      .then(data => {
        setItems(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }

  useEffect(() => { fetchItems() }, [])

  const grouped = useMemo(() => groupBySection(items), [items])
  const sections = Object.keys(grouped).sort()

  const toggleSection = (section: string) => {
    setCollapsed(prev => ({ ...prev, [section]: !prev[section] }))
  }

  return (
    <div className="p-6 sm:p-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-8 gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-8 h-8 rounded-xl bg-green-600/15 flex items-center justify-center">
                <BookOpen size={16} className="text-green-400" />
              </div>
              <h1 className="text-2xl font-bold text-white">Blog Library</h1>
            </div>
            <p className="text-zinc-500 text-sm">
              Articles from Medium, Dev.to, Hashnode, Substack, and personal blogs — summarised and indexed.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {!loading && (
              <span className="text-sm text-zinc-600 hidden sm:block">
                {items.length} {items.length === 1 ? "item" : "items"}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={fetchItems}
              className="border-white/10 text-zinc-400 hover:text-white h-8">
              <RefreshCw size={13} className="mr-1.5" />
              Refresh
            </Button>
            <Button variant="outline" size="sm"
              className="border-white/10 text-zinc-400 hover:text-white h-8">
              <Filter size={13} className="mr-1.5" />
              Filter
            </Button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-8">
            {[...Array(2)].map((_, si) => (
              <div key={si}>
                <div className="h-5 w-48 bg-white/[0.05] rounded-lg animate-pulse mb-4" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-64 bg-white/[0.03] rounded-2xl animate-pulse border border-white/[0.05]" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <EmptyState
            icon={<BookOpen size={24} className="text-green-400" />}
            title="Could not load Blog Library"
            description="Make sure the BrainVault backend is running on port 8000."
            hint="Run: uvicorn backend.main:app --reload"
          />
        )}

        {/* Empty */}
        {!loading && !error && items.length === 0 && (
          <EmptyState
            icon={<BookOpen size={24} className="text-green-400" />}
            title="No blog articles saved yet"
            description="Paste a Medium, Dev.to, Hashnode, or any blog URL in the dashboard to get started."
            hint="The Blog Agent extracts key concepts, author info, and reading time automatically."
          />
        )}

        {/* Grouped list */}
        {!loading && !error && sections.length > 0 && (
          <div className="space-y-10">
            {sections.map(section => {
              const sectionItems = grouped[section]
              const isCollapsed = collapsed[section]

              return (
                <div key={section}>
                  <button
                    onClick={() => toggleSection(section)}
                    className="flex items-center gap-2.5 mb-4 group w-full text-left hover:bg-white/[0.02] p-2 -ml-2 rounded-lg transition-colors"
                  >
                    <div className="w-8 h-8 rounded-xl bg-green-500/15 flex items-center justify-center">
                      <FolderOpen size={16} className="text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-base font-semibold text-white/90 truncate">{section}</span>
                    </div>
                    <span className="text-xs text-zinc-500 flex-shrink-0">
                      {sectionItems.length} {sectionItems.length === 1 ? "item" : "items"}
                    </span>
                    {isCollapsed
                      ? <ChevronRight size={16} className="text-zinc-600 flex-shrink-0" />
                      : <ChevronDown size={16} className="text-zinc-600 flex-shrink-0" />
                    }
                  </button>

                  {!isCollapsed && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {sectionItems.map(item => (
                        <BlogCard
                          key={item.id}
                          item={item}
                          onDelete={(id) => setItems(prev => prev.filter(i => i.id !== id))}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

---

## ✅ Phase 3 Completion Checklist

### Backend
- [ ] `backend/tools/blog_scraper.py` created with `fetch_blog()` helper
- [ ] `backend/agents/blog_agent.py` created with 8-node real subgraph
- [ ] `AI_CONCEPTS_LIST` matches the list in `linkedin_agent.py` / `plaintext_agent.py`
- [ ] `fetch_blog_node` fetches and extracts article text
- [ ] `extract_blog_metadata` cleans title + author
- [ ] `summarize` node produces 3-5 sentence summary
- [ ] `extract_concepts` node returns concepts + tags as JSON
- [ ] `generate_metadata` node returns title, reading_time, importance_score
- [ ] `score_difficulty` node returns integer 1-5
- [ ] `place_in_tree` node maps to predefined taxonomy
- [ ] `detect_interview_qna` node reuses the LinkedIn/plaintext Q&A extraction pattern
- [ ] `backend/agents/orchestrator.py` wires `blog_agent_node` instead of stub
- [ ] `blog_agent_node` adapter merges subgraph output into `BrainVaultState`
- [ ] `backend/routers/knowledge.py` adds `GET /api/knowledge/blogs`
- [ ] `storage_service.save_knowledge_item()` correctly stores:
  - Primary blog as `type="blog"`
  - Interview Q&A pairs as `type="interview_qna"` when detected
- [ ] Celery task streams blog agent steps via Redis pub/sub

### Frontend
- [ ] `frontend/lib/api.ts` adds `listBlogs()` helper
- [ ] `frontend/components/knowledge/BlogCard.tsx` created
- [ ] `frontend/app/knowledge/blogs/page.tsx` shows grouped blog cards (not empty state)
- [ ] Cards grouped by `knowledge_tree`
- [ ] Collapsible sections work
- [ ] Empty state, loading skeletons, and error state all handled
- [ ] "Read Original" link opens source URL in new tab

### Integration / Manual Tests
- [ ] Paste a Medium article URL → saved as `blog` → appears in Blog Library
- [ ] Paste a Dev.to article URL → saved as `blog` → appears in Blog Library
- [ ] Paste a blog article with interview Q&A → appears in BOTH Blog Library and Interview QnA
- [ ] Verify `knowledge_tree` matches an item from `AI_CONCEPTS_LIST`
- [ ] Verify difficulty badge renders correctly in BlogCard
- [ ] Verify delete removes card and refreshes list
- [ ] Verify SSE progress shows blog agent steps

---

## 🧪 Manual Test Sequence

```bash
# 1. Start all services
cd infrastructure
docker-compose up -d

# 2. Start backend (from project root)
cd C:\Users\nisha\Projects\BrainVault
uvicorn backend.main:app --reload --port 8000

# 3. Start Celery worker (from project root, in another terminal)
backend\venv\Scripts\celery.exe -A backend.tasks.ingestion worker --loglevel=info --pool=solo

# 4. Start frontend
cd frontend
npm run dev

# 5. Test blog ingestion via curl
curl -X POST http://localhost:8000/api/ingest \
  -H 'Content-Type: application/json' \
  -d '{"raw_input": "https://medium.com/example/ai-article"}'

# 6. Watch SSE stream
curl -N http://localhost:8000/api/ingest/{job_id}/stream

# 7. Verify blog saved
curl http://localhost:8000/api/knowledge/blogs

# 8. Open frontend
# http://localhost:3000 → paste blog URL → watch progress → navigate to Blog Library
```

---

## 🔗 Next Phase

**Phase 4 — Research Paper Agent**: ArXiv/PDF papers with structured breakdown.
