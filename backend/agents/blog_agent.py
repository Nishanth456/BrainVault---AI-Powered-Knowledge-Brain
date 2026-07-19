"""
blog_agent.py — Blog article ingestion LangGraph subgraph.

Pipeline:
  fetch_blog → extract_metadata → summarize → extract_concepts
  → generate_metadata → score_difficulty → place_in_tree → detect_interview_qna → END
"""
from langgraph.graph import StateGraph, END
from typing import TypedDict, Optional
from backend.tools.blog_scraper import fetch_blog
from backend.services.llm import call_llm
import json
import re


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

    # If we already have a good title from the scraper, trust it and just clean author
    if title and len(title) > 5:
        if not author:
            response = await call_llm(
                prompt=f"""Extract the author name or publication from this blog text.
Return ONLY a JSON object:
{{
  "author": "the author name or publication"
}}

Current author hint: {author or "unknown"}

Text sample:
{text[:2000]}

Return ONLY valid JSON.""",
                model="groq/llama-3.1-8b-instant",
                system="You are a metadata extraction assistant. Return only valid JSON.",
                max_tokens=100,
                temperature=0,
            )
            try:
                clean = response.strip().strip("```json").strip("```").strip()
                data = json.loads(clean)
                final_author = data.get("author") or author or "Unknown"
            except Exception:
                final_author = author or "Unknown"
        else:
            final_author = author

        return {
            "title": title,
            "author": final_author,
            "agent_steps": [f"✅ Metadata extracted — {title} by {final_author}"],
        }

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
        prompt=f"""Summarize this blog article in 3-5 short sentenced paragraph.
Focus on the key technical insight or learning. Be specific and concise.

CRITICAL RULES:
- Output ONLY the summary sentences.
- Do NOT start with "Here is a summary", "Here is a summary of", "In summary", "This article discusses", or any similar meta-text.
- Do NOT add an introduction, conclusion, or explanation.
- Do NOT use bullet points or numbered lists.

Article:
{text}""",
        model="groq/llama-3.1-8b-instant",
        system="You are a technical knowledge extraction expert. Return only the requested summary with no meta commentary.",
        max_tokens=300,
    )

    # Strip common LLM meta-prefaces as a safety net
    meta_prefixes = [
        r"(?i)^here\s+is\s+a\s+summary[^\n]*",
        r"(?i)^here\s+is\s+the\s+summary[^\n]*",
        r"(?i)^in\s+summary[^\n]*",
        r"(?i)^this\s+article\s+discusses[^\n]*",
        r"(?i)^summary[^\n]*",
    ]
    import re
    for pattern in meta_prefixes:
        summary = re.sub(pattern, "", summary).strip()

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
    existing_title = state.get("title") or "Untitled Blog Post"

    response = await call_llm(
        prompt=f"""Rate the importance of this blog article on a scale of 1-10.
Return ONLY a JSON object:

{{
  "importance_score": <integer 1-10>
}}

Title: {existing_title}
Summary: {summary}
Concepts: {concepts}
Tags: {tags}

Return ONLY valid JSON.""",
        model="groq/llama-3.3-70b-versatile",
        system="You are a knowledge management expert. Return only valid JSON with the importance score.",
        max_tokens=100,
        temperature=0,
    )

    try:
        clean = response.strip().strip("```json").strip("```").strip()
        metadata = json.loads(clean)
        importance_score = max(1, min(10, int(metadata.get("importance_score", 5))))
    except Exception:
        importance_score = 5

    metadata = {
        "title": existing_title,
        "importance_score": importance_score,
        "reading_time_minutes": reading_time,
    }

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
        prompt=f"""You are rating technical difficulty FOR AN AI PRACTITIONER audience (developers, data scientists, ML engineers).
Judge difficulty WITHIN this field, not against the general public.

Scale:
1 = Beginner  — No prior ML/AI knowledge needed. (e.g. "What is AI?", "How to use ChatGPT", introductory overviews)
2 = Basic     — Requires general programming/tech background. (e.g. "What is a neural network?", API usage tutorials, basic Python ML)
3 = Intermediate — Requires working ML/AI knowledge. (e.g. "How does attention work?", RAG basics, fine-tuning intro, common agent patterns)
4 = Advanced  — Requires deep expertise in specific sub-domain. (e.g. RLHF internals, custom training loops, complex multi-agent orchestration, model distillation)
5 = Expert    — Cutting-edge research or highly specialized systems. (e.g. novel architectures, frontier model alignment, production-scale LLMOps at thousands of QPS)

Content summary: {summary}
Concepts covered: {concepts}

Think step by step:
- Who is the intended reader?
- What prerequisite knowledge is assumed?
- Is this introductory, practical, or research-level?

Reply with ONLY the number (1, 2, 3, 4, or 5). Nothing else.""",
        model="groq/llama-3.3-70b-versatile",
        system="You are a technical difficulty assessor for AI practitioners. Be calibrated — most practical tutorials are 2-3, most application guides are 3, only truly deep internals are 4-5.",
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
  "tree_path": "The EXACT concept string you chose from the ALLOWED_CONCEPTS list"
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
        if chosen_path not in AI_CONCEPTS_LIST:
            chosen_path = "Artificial Intelligence (AI)"
    except Exception:
        chosen_path = "Artificial Intelligence (AI)"

    return {
        "knowledge_tree": chosen_path,
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
