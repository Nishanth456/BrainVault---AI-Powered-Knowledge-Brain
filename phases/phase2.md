# 📝 Phase 2 — Plain Text + Smart Notes Agent

> **Prerequisite**: Phase 1 complete — LinkedIn agent works, storage layer handles `qna_pairs`, master graph routes by type.
>
> **Goal**: Paste any raw text (notes, code snippets, ChatGPT conversations, terminal output) → AI classifies it → stores it in the right knowledge space automatically. If it contains interview Q&A, also route to Interview Questions space.

---

## ✅ What You Ship at the End of Phase 2

```
1. Paste raw text into the dashboard input
2. See real-time classification preview:
   "🧠 Detected: AI Note → AI > LLMs > Inference > Sampling Parameters"
3. Plain Text Agent runs a real LangGraph subgraph (not a stub)
4. Note is saved as type="note" in PostgreSQL + Qdrant
5. If the text contains interview Q&A, items are ALSO saved as type="interview_qna"
6. AI Notes page (/knowledge/notes) shows a tree-organized list of NoteCards
7. Notes are grouped by knowledge_domain → knowledge_tree
8. Each card shows: title, summary, key concepts, tags, difficulty badge, tree path
9. Interview Q&A cross-detection reuses the exact same pattern already in linkedin_agent.py
```

---

## 📁 Files to Create / Update

```
backend/
├── agents/
│   ├── plaintext_agent.py      ← NEW: real Plain Text LangGraph subgraph
│   └── orchestrator.py         ← UPDATE: replace stub_agent_node for plaintext
├── routers/
│   └── knowledge.py            ← UPDATE: add GET /api/knowledge/notes endpoint
└── services/
    └── storage_service.py        ← ALREADY handles qna_pairs (no change needed)

frontend/
├── app/knowledge/notes/page.tsx  ← UPDATE: empty state → real tree view
├── components/knowledge/
│   └── NoteCard.tsx            ← NEW: note card component
├── components/dashboard/
│   └── UniversalInput.tsx      ← UPDATE: classification preview + note routing
└── lib/api.ts                  ← UPDATE: add listNotes() helper
```

---

## 🐍 Backend Implementation

### 1. `backend/agents/plaintext_agent.py` — Real Plain Text Subgraph

Create a new LangGraph subgraph that mirrors the LinkedIn agent's structure but is optimized for raw text. It reuses the same `AI_CONCEPTS_LIST` taxonomy and interview Q&A detection logic.

```python
"""
plaintext_agent.py — Plain Text / Smart Notes LangGraph subgraph.

Pipeline:
  analyze_content → detect_special_type → infer_domain → build_tree_position
  → generate_summary → extract_concepts → generate_metadata → score_difficulty
  → detect_interview_qna → END

Phase 2: replaces the plaintext stub in orchestrator.py.
"""
from langgraph.graph import StateGraph, END
from typing import TypedDict, Optional
from backend.services.llm import call_llm
import json
import re


# ── Plaintext-specific state ────────────────────────────────────────────────

class PlainTextState(TypedDict):
    raw_input: str
    concept: Optional[str]              # Optional user-provided concept
    content_type: Optional[str]         # 'note', 'code', 'conversation', 'interview_qna', etc.
    inferred_domain: Optional[str]
    knowledge_tree: Optional[str]
    title: Optional[str]
    summary: Optional[str]
    key_concepts: Optional[list[str]]
    tags: Optional[list[str]]
    metadata: Optional[dict]
    difficulty: Optional[int]
    is_interview_qna: Optional[bool]
    qna_pairs: Optional[list[dict]]
    agent_steps: list[str]
    error: Optional[str]


# ── Shared taxonomy (keep in sync with linkedin_agent.py) ───────────────────

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


# ── Node 1: Analyze content type ───────────────────────────────────────────

async def analyze_content(state: PlainTextState) -> dict:
    """Classify the raw text into a high-level content type."""
    raw = state["raw_input"][:3000]

    response = await call_llm(
        prompt=f"""Classify this raw text into exactly one of these categories:
note, code_snippet, chatgpt_conversation, interview_qna, terminal_output, checklist, other

Rules:
- note: general technical notes or explanations
- code_snippet: primarily code blocks
- chatgpt_conversation: a back-and-forth Q&A conversation
- interview_qna: explicit interview questions and answers
- terminal_output: command line output / logs
- checklist: a list of items, todos, or steps
- other: anything else

Text:
{raw}

Respond with ONLY the category name, nothing else.""",
        model="groq/llama-3.1-8b-instant",
        system="You are a content classifier.",
        max_tokens=20,
        temperature=0,
    )

    content_type = response.strip().lower().replace(" ", "_")
    valid = {"note", "code_snippet", "chatgpt_conversation", "interview_qna", "terminal_output", "checklist", "other"}
    content_type = content_type if content_type in valid else "note"

    return {
        "content_type": content_type,
        "agent_steps": [f"🧠 Detected content type: {content_type.replace('_', ' ')}"],
    }


# ── Node 2: Infer knowledge domain ─────────────────────────────────────────

async def infer_domain(state: PlainTextState) -> dict:
    """Pick the broad knowledge domain for the note."""
    raw = state["raw_input"][:3000]
    concept = state.get("concept") or ""

    response = await call_llm(
        prompt=f"""Determine the broad knowledge domain for this text.
Choose exactly ONE from this list:
Artificial Intelligence, Machine Learning, Python, System Design, SQL, Cloud Computing, DevOps, Mathematics, General

{f'User-provided concept: {concept}' if concept else ''}

Text:
{raw}

Respond with ONLY the domain name, nothing else.""",
        model="groq/llama-3.1-8b-instant",
        system="You are a knowledge domain classifier.",
        max_tokens=30,
        temperature=0,
    )

    domain = response.strip()
    valid_domains = {"Artificial Intelligence", "Machine Learning", "Python", "System Design", "SQL", "Cloud Computing", "DevOps", "Mathematics", "General"}
    if domain not in valid_domains:
        domain = "General"

    return {
        "inferred_domain": domain,
        "agent_steps": [f"📁 Domain inferred: {domain}"],
    }


# ── Node 3: Build knowledge tree position ──────────────────────────────────

async def build_tree_position(state: PlainTextState) -> dict:
    """Map the note to the predefined AI_CONCEPTS_LIST taxonomy."""
    raw = state["raw_input"][:4000]
    concept = state.get("concept") or ""

    response = await call_llm(
        prompt=f"""Determine where this content belongs in our predefined knowledge taxonomy.
You MUST choose exactly ONE concept from the provided ALLOWED_CONCEPTS list.

{f'User-provided concept (use to help pick): {concept}' if concept else ''}

ALLOWED_CONCEPTS:
{', '.join(AI_CONCEPTS_LIST)}

Return ONLY a JSON object:
{{
  "tree_path": "The EXACT concept string you chose from the ALLOWED_CONCEPTS list"
}}

Text:
{raw}

Return ONLY valid JSON.""",
        model="groq/llama-3.3-70b-versatile",
        system="You are a knowledge taxonomy expert. Strictly adhere to the allowed list. Return only valid JSON.",
        max_tokens=150,
        temperature=0,
    )

    try:
        clean = response.strip().strip("```json").strip("```").strip()
        tree_data = json.loads(clean)
        chosen_path = tree_data.get("tree_path")
        if chosen_path not in AI_CONCEPTS_LIST:
            chosen_path = "Artificial Intelligence (AI)"
    except Exception:
        chosen_path = "Artificial Intelligence (AI)"

    return {
        "knowledge_tree": chosen_path,
        "agent_steps": [f"🌳 Placed in taxonomy: {chosen_path}"],
    }


# ── Node 4: Generate summary ─────────────────────────────────────────────────

async def generate_summary(state: PlainTextState) -> dict:
    """Create a 2-3 sentence summary of the raw text."""
    raw = state["raw_input"][:6000]

    summary = await call_llm(
        prompt=f"""Summarize this raw text in 2-3 short sentences.
Focus on the key technical insight or learning. Be specific.

IMPORTANT: Output ONLY the summary. No intro, no conclusion.

Text:
{raw}""",
        model="groq/gemma2-9b-it",
        system="You are a technical knowledge extraction expert.",
        max_tokens=200,
    )

    return {
        "summary": summary,
        "agent_steps": ["✅ Summary generated"],
    }


# ── Node 5: Extract concepts + tags ──────────────────────────────────────────

async def extract_concepts(state: PlainTextState) -> dict:
    """Extract key concepts and short tags from the text."""
    raw = state["raw_input"][:4000]
    concept = state.get("concept") or ""

    response = await call_llm(
        prompt=f"""Extract key concepts and tags from this text.
Return a JSON object with two lists:
- "concepts": 3-8 specific technical concepts
- "tags": 3-6 short tags

{f'Primary concept (must be included): {concept}' if concept else ''}

Text:
{raw}

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


# ── Node 6: Generate metadata ────────────────────────────────────────────────

async def generate_metadata(state: PlainTextState) -> dict:
    """Generate title, reading time, and importance score."""
    summary = state.get("summary", "")
    concepts = state.get("key_concepts", [])
    tags = state.get("tags", [])
    content_type = state.get("content_type", "note")

    response = await call_llm(
        prompt=f"""Generate metadata for this note. Return ONLY a JSON object:

{{
  "title": "descriptive title (max 100 chars)",
  "reading_time_minutes": <integer>,
  "importance_score": <1-10>
}}

Summary: {summary}
Content type: {content_type}
Concepts: {concepts}
Tags: {tags}

Return ONLY valid JSON.""",
        model="groq/llama-3.3-70b-versatile",
        system="You are a knowledge management expert. Return only valid JSON.",
        max_tokens=200,
        temperature=0,
    )

    try:
        clean = response.strip().strip("```json").strip("```").strip()
        metadata = json.loads(clean)
    except Exception:
        metadata = {
            "title": (state["raw_input"][:80] or "Untitled Note"),
            "reading_time_minutes": 1,
            "importance_score": 5,
        }

    return {
        "metadata": metadata,
        "agent_steps": ["✅ Metadata generated"],
    }


# ── Node 7: Score difficulty ─────────────────────────────────────────────────

async def score_difficulty(state: PlainTextState) -> dict:
    """Score technical difficulty 1-5."""
    summary = state.get("summary", "")

    response = await call_llm(
        prompt=f"""Rate the technical difficulty of this content on a scale of 1-5:
1 = Beginner
2 = Basic
3 = Intermediate
4 = Advanced
5 = Expert

Summary: {summary}
Concepts: {state.get('key_concepts', [])}

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


# ── Node 8: Detect interview Q&A ─────────────────────────────────────────────

async def detect_interview_qna(state: PlainTextState) -> dict:
    """
    Reuses the same pattern as linkedin_agent.py:
    - Classify if text is interview Q&A
    - If yes, extract all Q&A pairs and map each to a topic
    """
    content = state["raw_input"]
    summary = state.get("summary", "")

    response = await call_llm(
        prompt=f"""Determine if this content is primarily a list of Interview Questions and Answers (or interview preparation material).
Return ONLY a JSON object:
{{
  "is_interview_qna": true or false
}}

Summary: {summary}
Content sample: {content[:2000]}

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
The following text contains interview questions and answers.
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

Text:
{content}
"""
        qna_response = await call_llm(
            prompt=qna_prompt,
            model="groq/llama-3.3-70b-versatile",
            system="You are an expert AI Interviewer. Return only valid JSON.",
            max_tokens=4000,
            temperature=0,
        )

        try:
            match = re.search(r'\[\s*\{{.*\}}\s*\]', qna_response, re.DOTALL)
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


# ── Build the Plain Text subgraph ───────────────────────────────────────────

def build_plaintext_subgraph() -> StateGraph:
    graph = StateGraph(PlainTextState)

    graph.add_node("analyze_content",      analyze_content)
    graph.add_node("infer_domain",          infer_domain)
    graph.add_node("build_tree_position",   build_tree_position)
    graph.add_node("generate_summary",      generate_summary)
    graph.add_node("extract_concepts",      extract_concepts)
    graph.add_node("generate_metadata",     generate_metadata)
    graph.add_node("score_difficulty",      score_difficulty)
    graph.add_node("detect_interview_qna",  detect_interview_qna)

    graph.set_entry_point("analyze_content")
    graph.add_edge("analyze_content",      "infer_domain")
    graph.add_edge("infer_domain",         "build_tree_position")
    graph.add_edge("build_tree_position",  "generate_summary")
    graph.add_edge("generate_summary",       "extract_concepts")
    graph.add_edge("extract_concepts",       "generate_metadata")
    graph.add_edge("generate_metadata",      "score_difficulty")
    graph.add_edge("score_difficulty",       "detect_interview_qna")
    graph.add_edge("detect_interview_qna",   END)

    return graph


plaintext_subgraph = build_plaintext_subgraph()
```

---

### 2. `backend/agents/orchestrator.py` — Wire Real Plaintext Agent

Replace the `plaintext_agent` stub with a real adapter. The current file already has `linkedin_agent_node` as a real adapter — follow that exact pattern.

**Current state (from code):**
```python
stub_agents = [
    "blog_agent", "pdf_agent", "research_agent",
    "github_agent", "youtube_agent", "course_agent", "plaintext_agent",
]
for name in stub_agents:
    graph.add_node(name, stub_agent_node)
```

**Change to:**
```python
stub_agents = [
    "blog_agent", "pdf_agent", "research_agent",
    "github_agent", "youtube_agent", "course_agent",
]
for name in stub_agents:
    graph.add_node(name, stub_agent_node)

# Phase 2: real plaintext agent
graph.add_node("plaintext_agent", plaintext_agent_node)
```

Add the adapter function near `linkedin_agent_node`:

```python
async def plaintext_agent_node(state: BrainVaultState) -> dict:
    """
    Adapter: runs the Plain Text LangGraph subgraph and merges results
    back into the master BrainVaultState.
    """
    from backend.agents.plaintext_agent import plaintext_subgraph, PlainTextState

    plaintext_state = PlainTextState(
        raw_input=state["raw_input"],
        concept=state.get("concept") or "",
        content_type=None,
        inferred_domain=None,
        knowledge_tree=None,
        title=None,
        summary=None,
        key_concepts=None,
        tags=None,
        metadata=None,
        difficulty=None,
        is_interview_qna=None,
        qna_pairs=None,
        agent_steps=[],
        error=None,
    )

    compiled = plaintext_subgraph.compile()
    result = await compiled.ainvoke(plaintext_state)

    metadata = result.get("metadata") or {}
    is_qna = result.get("is_interview_qna")

    # If interview Q&A detected, storage_service will create interview_qna items
    # from qna_pairs. The primary note is still saved as type="note".
    return {
        "input_type":       "note",
        "extracted_text":   state["raw_input"],
        "title":            metadata.get("title", ""),
        "summary":          result.get("summary", ""),
        "key_concepts":     result.get("key_concepts") or [],
        "tags":             result.get("tags") or [],
        "difficulty":       result.get("difficulty", 3),
        "knowledge_tree":   result.get("knowledge_tree", ""),
        "knowledge_domain": result.get("inferred_domain"),
        "qna_pairs":        result.get("qna_pairs") or [],
        "metadata":         metadata,
        "agent_steps":      result.get("agent_steps") or [],
        "error":            result.get("error"),
        "source_url":       None,
        "author":           None,
    }
```

> **Why this works**: `storage_service.save_knowledge_item()` already checks `state.get("qna_pairs")`. If present, it inserts multiple `interview_qna` rows **in addition to** the primary note. This is the exact same behavior used by the LinkedIn agent in Phase 1.

---

### 3. `backend/routers/knowledge.py` — Add Notes Endpoint

Add a new endpoint that returns all `type="note"` items, mirroring the existing `/interview` endpoint.

```python
@router.get("/notes")
async def get_note_items(
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    """Return all AI Notes items."""
    result = await db.execute(
        select(KnowledgeItem)
        .options(selectinload(KnowledgeItem.attachments))
        .where(KnowledgeItem.type == "note")
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

### 4. `frontend/lib/api.ts` — Add Notes API Helper

Add a typed helper next to the existing knowledge helpers:

```typescript
export async function listNotes(limit = 20): Promise<KnowledgeItem[]> {
  const res = await fetch(`${API_BASE}/api/knowledge/notes?limit=${limit}`)
  if (!res.ok) throw new Error(`Notes list failed: ${res.status}`)
  return res.json()
}
```

---

### 5. `frontend/components/knowledge/NoteCard.tsx` — New Component

Create a card component for notes. Reuse styling patterns from `LinkedInCard.tsx` and `QnACard.tsx`.

```tsx
"use client"
import { useState } from "react"
import { Trash2, Loader2, Clock, Tag, ChevronRight } from "lucide-react"

const difficultyLabel = ["", "Beginner", "Basic", "Intermediate", "Advanced", "Expert"]
const difficultyColor = [
  "",
  "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  "text-blue-400   bg-blue-400/10   border-blue-400/20",
  "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  "text-orange-400 bg-orange-400/10 border-orange-400/20",
  "text-red-400    bg-red-400/10    border-red-400/20",
]

export interface NoteItem {
  id: string
  title: string
  summary: string
  knowledge_tree: string
  knowledge_domain?: string | null
  key_concepts: string[]
  tags: string[]
  difficulty: number
  reading_time: number
  created_at: string
}

interface NoteCardProps {
  item: NoteItem
  onDelete?: (id: string) => void
}

export function NoteCard({ item, onDelete }: NoteCardProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const diff = item.difficulty || 0

  const handleDelete = async () => {
    if (!window.confirm("Delete this note?")) return
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
                    hover:border-cyan-500/30 hover:bg-white/[0.05] transition-all duration-300
                    flex flex-col gap-3.5 overflow-hidden">

      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300
                      bg-gradient-to-br from-cyan-600/5 via-transparent to-transparent rounded-2xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/15 flex items-center justify-center flex-shrink-0">
            <Tag size={13} className="text-cyan-400" />
          </div>
          <span className="text-xs text-zinc-500 font-medium">{item.knowledge_domain || "Note"}</span>
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
            title="Delete note"
          >
            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2 -mb-1">
        {item.title || "Untitled Note"}
      </h3>

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
              className="px-2 py-0.5 text-[11px] bg-cyan-600/10 text-cyan-300
                         rounded-full border border-cyan-600/15"
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
      <div className="flex items-center gap-1.5 text-xs text-zinc-600 mt-auto pt-2 border-t border-white/[0.05]">
        <Clock size={11} />
        {item.reading_time ? `${item.reading_time} min read` : "Saved"}
      </div>
    </div>
  )
}
```

---

### 6. `frontend/app/knowledge/notes/page.tsx` — Tree-Organized Notes Page

Replace the current empty-state-only page with a grouped tree view, similar to `interviews/page.tsx`.

```tsx
"use client"
import { useEffect, useState, useMemo } from "react"
import { NoteCard, type NoteItem } from "@/components/knowledge/NoteCard"
import { EmptyState } from "@/components/ui/EmptyState"
import { RefreshCw, Filter, FolderOpen, ChevronDown, ChevronRight, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

function groupNotes(items: NoteItem[]) {
  const domains: Record<string, Record<string, NoteItem[]>> = {}
  for (const item of items) {
    const domain = item.knowledge_domain || "General"
    const tree = item.knowledge_tree || "Uncategorized"

    if (!domains[domain]) domains[domain] = {}
    if (!domains[domain][tree]) domains[domain][tree] = []

    domains[domain][tree].push(item)
  }
  return domains
}

export default function NotesPage() {
  const [items, setItems] = useState<NoteItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [collapsedTrees, setCollapsedTrees] = useState<Record<string, boolean>>({})

  const fetchItems = () => {
    setLoading(true)
    setError(false)
    fetch("http://localhost:8000/api/knowledge/notes")
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

  const grouped = useMemo(() => groupNotes(items), [items])
  const domains = Object.keys(grouped).sort()

  const toggleTree = (key: string) => {
    setCollapsedTrees(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="p-6 sm:p-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-8 gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-8 h-8 rounded-xl bg-cyan-600/15 flex items-center justify-center">
                <MessageCircle size={16} className="text-cyan-400" />
              </div>
              <h1 className="text-2xl font-bold text-white">AI Notes</h1>
            </div>
            <p className="text-zinc-500 text-sm">
              Pasted text, code snippets, ChatGPT conversations, and quick notes — auto-classified hierarchically.
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
            icon={<MessageCircle size={24} className="text-cyan-400" />}
            title="Could not load AI Notes"
            description="Make sure the BrainVault backend is running on port 8000."
            hint="Run: uvicorn backend.main:app --reload"
          />
        )}

        {/* Empty */}
        {!loading && !error && items.length === 0 && (
          <EmptyState
            icon={<MessageCircle size={24} className="text-cyan-400" />}
            title="No notes saved yet"
            description="Paste any raw text, code, or ChatGPT conversation in the dashboard to get started."
            hint="The Plain Text Agent infers topic, domain, and difficulty automatically."
          />
        )}

        {/* Grouped tree view */}
        {!loading && !error && domains.length > 0 && (
          <div className="space-y-12">
            {domains.map(domain => {
              const trees = Object.keys(grouped[domain]).sort()

              return (
                <div key={domain} className="bg-white/[0.02] rounded-2xl border border-white/[0.05] p-6 sm:p-8">
                  {/* Domain header */}
                  <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/[0.05]">
                    <div className="w-8 h-8 rounded-xl bg-cyan-500/15 flex items-center justify-center">
                      <FolderOpen size={16} className="text-cyan-400" />
                    </div>
                    <h2 className="text-xl font-bold text-white">{domain}</h2>
                  </div>

                  <div className="space-y-8">
                    {trees.map(tree => {
                      const treeItems = grouped[domain][tree]
                      const treeKey = `${domain}-${tree}`
                      const isCollapsed = collapsedTrees[treeKey]

                      return (
                        <div key={tree}>
                          {/* Tree header */}
                          <button
                            onClick={() => toggleTree(treeKey)}
                            className="flex items-center gap-2.5 mb-4 group w-full text-left hover:bg-white/[0.02] p-2 -ml-2 rounded-lg transition-colors"
                          >
                            <div className="w-5 h-5 rounded bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                              <MessageCircle size={10} className="text-emerald-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-semibold text-white/90 truncate">{tree}</span>
                            </div>
                            <span className="text-xs text-zinc-500 flex-shrink-0">
                              {treeItems.length} {treeItems.length === 1 ? "item" : "items"}
                            </span>
                            {isCollapsed
                              ? <ChevronRight size={14} className="text-zinc-600 flex-shrink-0" />
                              : <ChevronDown size={14} className="text-zinc-600 flex-shrink-0" />
                            }
                          </button>

                          {/* Cards */}
                          {!isCollapsed && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {treeItems.map(item => (
                                <NoteCard
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

### 7. `frontend/components/dashboard/UniversalInput.tsx` — Classification Preview

Enhance the input box to show a live preview of where the note will be stored. This is a UI-only preview; the real classification still happens on the backend.

Add state and a small preview panel below the input:

```tsx
const [detectedPreview, setDetectedPreview] = useState<{
  type: string
  domain: string
  tree: string
} | null>(null)
```

After the existing `useEffect` that toggles the concept field, add a debounced preview fetch:

```tsx
useEffect(() => {
  if (!input.trim() || input.trim().length < 20) {
    setDetectedPreview(null)
    return
  }

  // Skip preview for obvious URLs — backend will route those to other agents
  if (input.trim().startsWith("http")) {
    setDetectedPreview(null)
    return
  }

  const timer = setTimeout(async () => {
    try {
      const res = await fetch("http://localhost:8000/api/ingest/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_input: input.trim() }),
      })
      if (res.ok) {
        const data = await res.json()
        setDetectedPreview(data)
      }
    } catch {
      setDetectedPreview(null)
    }
  }, 800)

  return () => clearTimeout(timer)
}, [input])
```

Then render the preview below the input box (inside the same relative container, before the progress steps):

```tsx
{detectedPreview && !loading && (
  <motion.div
    initial={{ opacity: 0, y: -4 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/8 border border-cyan-500/15 text-xs text-cyan-300"
  >
    <Brain size={12} />
    <span>
      Detected: <span className="font-medium text-cyan-200">{detectedPreview.type}</span>
      {" → "}
      <span className="font-medium text-cyan-200">{detectedPreview.domain}</span>
      {detectedPreview.tree && (
        <>
          {" → "}
          <span className="font-medium text-cyan-200">{detectedPreview.tree}</span>
        </>
      )}
    </span>
  </motion.div>
)}
```

> **Backend endpoint needed**: Add `POST /api/ingest/preview` in `backend/routers/ingest.py` that calls `detect_input_type()` + a lightweight LLM prompt for domain/tree. This endpoint should be fast (< 1s) and not create a job. It is optional — if skipped, the preview simply won't appear.

Example minimal preview endpoint:

```python
@router.post("/ingest/preview")
async def preview_classification(request: IngestRequest):
    """Fast classification preview for the dashboard input box."""
    from backend.services.llm import detect_input_type, call_llm
    import json

    input_type = await detect_input_type(request.raw_input)

    if input_type != "plaintext":
        return {"type": input_type, "domain": None, "tree": None}

    domain_prompt = f"""Determine the broad knowledge domain for this text. Choose exactly ONE:
Artificial Intelligence, Machine Learning, Python, System Design, SQL, Cloud Computing, DevOps, Mathematics, General

Text: {request.raw_input[:1000]}

Return ONLY the domain name."""

    domain = await call_llm(domain_prompt, model="groq/llama-3.1-8b-instant", max_tokens=20, temperature=0)
    domain = domain.strip()
    valid = {"Artificial Intelligence", "Machine Learning", "Python", "System Design", "SQL", "Cloud Computing", "DevOps", "Mathematics", "General"}
    if domain not in valid:
        domain = "General"

    return {"type": "note", "domain": domain, "tree": None}
```

---

## ✅ Phase 2 Completion Checklist

### Backend
- [ ] `backend/agents/plaintext_agent.py` created with 8-node real subgraph
- [ ] `AI_CONCEPTS_LIST` matches the list in `linkedin_agent.py`
- [ ] `analyze_content` node classifies text into note/code/conversation/etc.
- [ ] `infer_domain` node returns a valid broad domain
- [ ] `build_tree_position` node maps to the predefined taxonomy
- [ ] `generate_summary` node produces a 2-3 sentence summary
- [ ] `extract_concepts` node returns concepts + tags as JSON
- [ ] `generate_metadata` node returns title, reading_time, importance_score
- [ ] `score_difficulty` node returns integer 1-5
- [ ] `detect_interview_qna` node reuses the LinkedIn agent's Q&A extraction pattern
- [ ] `backend/agents/orchestrator.py` wires `plaintext_agent_node` instead of stub
- [ ] `plaintext_agent_node` adapter merges subgraph output into `BrainVaultState`
- [ ] `backend/routers/knowledge.py` adds `GET /api/knowledge/notes`
- [ ] (Optional) `POST /api/ingest/preview` endpoint for live classification preview
- [ ] `storage_service.save_knowledge_item()` correctly stores:
  - Primary note as `type="note"`
  - Interview Q&A pairs as `type="interview_qna"` when detected
- [ ] Celery task streams plaintext agent steps via Redis pub/sub

### Frontend
- [ ] `frontend/lib/api.ts` adds `listNotes()` helper
- [ ] `frontend/components/knowledge/NoteCard.tsx` created
- [ ] `frontend/app/knowledge/notes/page.tsx` shows tree-organized notes (not empty state)
- [ ] Notes grouped by `knowledge_domain` → `knowledge_tree`
- [ ] Collapsible tree sections work
- [ ] Empty state, loading skeletons, and error state all handled
- [ ] `frontend/components/dashboard/UniversalInput.tsx` shows classification preview for plaintext
- [ ] Toast on completion routes to `/knowledge/notes` when type is `note`

### Integration / Manual Tests
- [ ] Paste a short technical note → saved as `note` → appears in AI Notes
- [ ] Paste a note with 3 interview Q&A pairs → appears in BOTH AI Notes and Interview QnA
- [ ] Paste a code snippet → classified as `code_snippet` → stored under correct domain
- [ ] Paste a ChatGPT conversation → classified as `chatgpt_conversation`
- [ ] Verify `knowledge_tree` matches an item from `AI_CONCEPTS_LIST`
- [ ] Verify difficulty badge renders correctly in NoteCard
- [ ] Verify delete note removes card and refreshes list
- [ ] Verify SSE progress shows plaintext agent steps

---

## 🧪 Manual Test Sequence

```bash
# 1. Start all services
cd infrastructure
docker-compose up -d

# 2. Start backend (from project root)
uvicorn backend.main:app --reload

# 3. Start frontend
cd frontend
npm run dev

# 4. Test plain text ingestion via curl
curl -X POST http://localhost:8000/api/ingest \
  -H 'Content-Type: application/json' \
  -d '{"raw_input": "temperature controls randomness in LLM output. top_p is nucleus sampling. max_tokens limits response length."}'

# 5. Watch SSE stream
curl -N http://localhost:8000/api/ingest/{job_id}/stream

# 6. Verify note saved
curl http://localhost:8000/api/knowledge/notes

# 7. Verify interview cross-detection (paste Q&A text)
curl -X POST http://localhost:8000/api/ingest \
  -H 'Content-Type: application/json' \
  -d '{"raw_input": "Q: What is RAG? A: Retrieval-Augmented Generation combines retrieval with generation. Q: What is a vector DB? A: A database optimized for storing and searching embeddings."}'

# 8. Verify both note and interview items exist
curl http://localhost:8000/api/knowledge/notes
curl http://localhost:8000/api/knowledge/interview

# 9. Open frontend
# http://localhost:3000 → paste note → watch preview → save → navigate to AI Notes
```

---

## 🔗 Next Phase

**Phase 3 — Blog Agent**: Medium/Dev.to articles saved as beautiful cards. The same master graph routing + storage pattern from Phase 2 is reused.
