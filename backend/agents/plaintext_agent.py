"""
plaintext_agent.py — Plain Text / Smart Notes LangGraph subgraph.

Pipeline:
  analyze_content → infer_domain → build_tree_position → generate_summary
  → extract_concepts → generate_metadata → score_difficulty
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
    content_type: Optional[str]         # 'note', 'code_snippet', 'conversation', 'interview_qna', etc.
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


# ── Node 4: Generate AI insight (extends the note, does not summarise it) ────────────────────────────────────────────────────────────────────────────────

async def generate_summary(state: PlainTextState) -> dict:
    """
    Store the user's pasted text as-is (raw_content).
    Generate a short AI *insight* that extends the note with real-world context,
    use-cases, or gotchas — NOT a paraphrase or summary of it.
    """
    raw = state["raw_input"]

    # Light cleanup: trim and collapse 3+ consecutive newlines to 2
    cleaned = raw.strip()
    cleaned = re.sub(r'\n{4,}', '\n\n\n', cleaned)

    ai_summary = await call_llm(
        prompt=f"""The user saved this technical note:

{cleaned[:4000]}

Write 3-5 sentences that ADD value beyond what the note says:
- Explain WHY this concept matters in practice, or how it fits into a larger picture
- Mention a real-world use-case, trade-off, or common pitfall
- Do NOT restate, paraphrase, or summarise the note
- Do NOT start with "This note", "The note", "These parameters", or any meta-reference
- Be direct, dense, and technically sharp""",
        model="groq/llama-3.1-8b-instant",
        system="You are a senior engineer adding practical insight to a colleague's notes. Never restate the note itself.",
        temperature=0.3,
        max_tokens=150,
    )

    return {
        "summary": ai_summary.strip(),
        "agent_steps": ["✅ AI insight generated"],
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

def _estimate_reading_time(text: str) -> int:
    """Estimate reading time in minutes at ~200 words per minute."""
    words = len(text.split())
    return max(1, round(words / 200))


def _estimate_importance(raw: str, concepts: list[str], tags: list[str], concept_hint: str | None) -> int:
    """
    Score importance 1-10 based on:
    - content length (longer = more substantial)
    - concept/tag density
    - user-provided concept hint
    """
    word_count = len(raw.split())
    density = (len(concepts) + len(tags)) / max(word_count, 1) * 100

    score = 5
    if word_count > 1000:
        score += 2
    elif word_count > 300:
        score += 1
    if len(concepts) >= 5:
        score += 1
    if len(tags) >= 4:
        score += 1
    if density > 8:
        score += 1
    if concept_hint:
        score += 1

    return max(1, min(10, score))


def _generate_title(raw: str, summary: str, concept_hint: str | None) -> str:
    """Generate a concise title from the first meaningful line or summary."""
    # Try first non-empty line
    for line in raw.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#"):
            # Use first line if it's a reasonable title length
            if 10 <= len(stripped) <= 100:
                return stripped[:100]
            break

    # Fallback to summary first sentence
    if summary:
        first_sentence = summary.split(".")[0].strip()
        if len(first_sentence) >= 10:
            return (first_sentence[:97] + "...") if len(first_sentence) > 100 else first_sentence

    # Last fallback
    hint = concept_hint or "Note"
    return f"{hint[:80]} — Smart Note"[:100]


async def generate_metadata(state: PlainTextState) -> dict:
    """Generate title, reading time, and importance score deterministically."""
    raw = state["raw_input"]
    summary = state.get("summary", "")
    concepts = state.get("key_concepts", []) or []
    tags = state.get("tags", []) or []
    concept_hint = state.get("concept") or None

    metadata = {
        "title": _generate_title(raw, summary, concept_hint),
        "reading_time_minutes": _estimate_reading_time(raw),
        "importance_score": _estimate_importance(raw, concepts, tags, concept_hint),
    }

    return {
        "metadata": metadata,
        "agent_steps": [
            f"✅ Title: {metadata['title'][:40]}",
            f"⏱️ Reading time: {metadata['reading_time_minutes']} min",
            f"⭐ Importance: {metadata['importance_score']}/10",
        ],
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
