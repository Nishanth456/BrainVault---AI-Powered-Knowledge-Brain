"""
github_agent.py — GitHub repository ingestion LangGraph subgraph.

Pipeline:
  parse_url → fetch_metadata → fetch_readme → fetch_structure
  → detect_tech_stack → summarize_readme → extract_architecture
  → classify_purpose → generate_metadata → place_in_tree → END
"""
import json
import re
from langgraph.graph import StateGraph, END
from typing import TypedDict, Optional

from backend.services.llm import call_llm
from backend.tools.github_client import resolve_github_url


# ── GitHub-specific state ───────────────────────────────────────────────────────

class GitHubState(TypedDict):
    url: str
    concept: Optional[str]
    owner: Optional[str]
    repo: Optional[str]
    metadata: Optional[dict]
    readme: Optional[str]
    structure: Optional[list[dict]]
    key_files: Optional[dict]
    tech_stack: Optional[list[str]]
    summary: Optional[str]
    architecture_summary: Optional[str]
    purpose: Optional[str]
    key_concepts: Optional[list[str]]
    tags: Optional[list[str]]
    difficulty: Optional[int]
    knowledge_tree: Optional[str]
    knowledge_domain: Optional[str]
    metadata_payload: Optional[dict]
    agent_steps: list[str]
    error: Optional[str]


# ── Shared taxonomy (keep in sync with other agents) ───────────────────────────

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


# ── Node 1: Parse and fetch repo data ─────────────────────────────────────────

async def fetch_github_repo_node(state: GitHubState) -> dict:
    """Parse GitHub URL and fetch metadata, README, and structure."""
    url = state["url"].strip()
    try:
        data = await resolve_github_url(url)
    except Exception as e:
        return {
            "error": f"Failed to fetch GitHub repo: {e}",
            "agent_steps": ["❌ Failed to fetch GitHub repository"],
        }

    metadata = data.get("metadata", {})
    structure = data.get("structure", [])
    readme = data.get("readme", "")
    key_files = data.get("key_files", {})

    return {
        "owner": data.get("owner"),
        "repo": data.get("repo"),
        "metadata": metadata,
        "readme": readme,
        "structure": structure,
        "key_files": key_files,
        "agent_steps": [
            f"✅ Fetched {metadata.get('full_name', 'repo')} metadata",
            f"⭐ {metadata.get('stars', 0)} stars · {metadata.get('language', 'Unknown language')}",
            f"✅ README ({len(readme):,} chars) and {len(structure)} top-level files fetched",
        ],
    }


# ── Node 2: Detect tech stack ─────────────────────────────────────────────────

async def detect_tech_stack(state: GitHubState) -> dict:
    """Infer tech stack from repo language, topics, and key files."""
    metadata = state.get("metadata") or {}
    key_files = state.get("key_files") or {}
    structure = state.get("structure") or []

    language = metadata.get("language", "")
    topics = metadata.get("topics", [])
    file_names = [item.get("path") or "" for item in structure]

    # Build a compact context for the LLM
    file_hints = []
    for name, content in key_files.items():
        if content:
            snippet = content[:500].replace("\n", " ")
            file_hints.append(f"{name}: {snippet}")

    context = f"""Primary language: {language}
Topics: {', '.join([t for t in topics if t]) if topics else 'None'}
Top-level files: {', '.join([n for n in file_names[:30] if n])}
Key file snippets:
{'\n'.join([h for h in file_hints[:8] if h])}
"""

    response = await call_llm(
        prompt=f"""Infer the tech stack of this GitHub repository.
Return ONLY a JSON object:
{{
  "tech_stack": ["tech1", "tech2", "tech3"],
  "frameworks": ["framework1", "framework2"]
}}

{context}

Return ONLY valid JSON, nothing else.""",
        model="groq/llama-3.1-8b-instant",
        system="You are a tech stack analyzer. Return only valid JSON.",
        max_tokens=200,
        temperature=0,
    )

    try:
        clean = response.strip().strip("```json").strip("```").strip()
        data = json.loads(clean)
        tech_stack = data.get("tech_stack", []) + data.get("frameworks", [])
    except Exception:
        tech_stack = [language] if language else []

    # Deduplicate and clean
    tech_stack = list(dict.fromkeys([t.strip() for t in tech_stack if t.strip()]))

    return {
        "tech_stack": tech_stack,
        "agent_steps": [f"✅ Tech stack detected: {', '.join([t for t in tech_stack[:6] if t])}"],
    }


# ── Node 3: Summarize README ───────────────────────────────────────────────────

async def summarize_readme(state: GitHubState) -> dict:
    """Generate a concise summary of what the repo does from README."""
    readme = state.get("readme", "")
    metadata = state.get("metadata") or {}
    description = metadata.get("description", "")

    text = readme[:10000]
    if description:
        text = f"Repo description: {description}\n\n{text}"

    summary = await call_llm(
        prompt=f"""Summarize what this GitHub repository does in 3-5 sentences.
Focus on the problem it solves, its main features, and who should use it.

CRITICAL RULES:
- Output ONLY the summary sentences.
- Do NOT start with "Here is a summary" or "This repository is".
- Do NOT use bullet points or numbered lists.

README:
{text}""",
        model="groq/llama-3.1-8b-instant",
        system="You are a technical documentation summarizer. Return only the summary with no meta commentary.",
        max_tokens=300,
    )

    # Strip meta prefixes
    for pattern in [
        r"(?i)^here\s+is\s+a?\s*summary[^\n]*",
        r"(?i)^this\s+repository\s+(is|does)[^\n]*",
        r"(?i)^in\s+summary[^\n]*",
    ]:
        summary = re.sub(pattern, "", summary).strip()

    return {
        "summary": summary,
        "agent_steps": ["✅ README summarized"],
    }


# ── Node 4: Extract architecture ───────────────────────────────────────────────

async def extract_architecture(state: GitHubState) -> dict:
    """Generate an architecture summary from README and structure."""
    readme = state.get("readme", "")
    structure = state.get("structure") or []
    tech_stack = state.get("tech_stack") or []

    file_names = [item.get("path") or "" for item in structure]
    text = f"""Tech stack: {', '.join([t for t in tech_stack if t])}
Top-level structure: {', '.join([n for n in file_names[:40] if n])}

README:
{readme[:8000]}
"""

    architecture = await call_llm(
        prompt=f"""Describe the architecture of this repository in 3-5 sentences.
Explain the main components, how they interact, and the overall design pattern.

CRITICAL RULES:
- Output ONLY the architecture description.
- Do NOT start with "Here is" or "The architecture is".
- Do NOT use bullet points or numbered lists.

{text}""",
        model="groq/llama-3.1-8b-instant",
        system="You are a software architecture analyst. Return only the architecture description.",
        max_tokens=350,
    )

    for pattern in [
        r"(?i)^here\s+is[^\n]*",
        r"(?i)^the\s+architecture\s+is[^\n]*",
        r"(?i)^in\s+summary[^\n]*",
    ]:
        architecture = re.sub(pattern, "", architecture).strip()

    return {
        "architecture_summary": architecture,
        "agent_steps": ["✅ Architecture overview extracted"],
    }


# ── Node 5: Classify purpose ──────────────────────────────────────────────────

async def classify_purpose(state: GitHubState) -> dict:
    """Classify the repo's purpose (tool/library/tutorial/etc.)."""
    summary = state.get("summary", "")
    tech_stack = state.get("tech_stack") or []

    response = await call_llm(
        prompt=f"""Classify this GitHub repository into exactly one category:
library, framework, tool, tutorial, template, paper-implementation, demo, other

Summary: {summary}
Tech stack: {', '.join([t for t in tech_stack if t])}

Reply with ONLY the category name. Nothing else.""",
        model="groq/llama-3.1-8b-instant",
        system="You are a repository classifier.",
        max_tokens=20,
        temperature=0,
    )

    purpose = response.strip().lower().split()[0] if response.strip() else "other"
    valid = {"library", "framework", "tool", "tutorial", "template", "paper-implementation", "demo", "other"}
    if purpose not in valid:
        purpose = "other"

    return {
        "purpose": purpose,
        "agent_steps": [f"✅ Classified as: {purpose}"],
    }


# ── Node 6: Extract concepts + tags ───────────────────────────────────────────

async def extract_github_concepts(state: GitHubState) -> dict:
    """Extract key concepts and tags from the repo."""
    summary = state.get("summary", "")
    architecture = state.get("architecture_summary", "")
    tech_stack = state.get("tech_stack") or []
    concept = state.get("concept") or ""

    response = await call_llm(
        prompt=f"""Extract key concepts and tags from this GitHub repository.
Return a JSON object with two lists:
- "concepts": 3-8 specific technical concepts
- "tags": 3-6 short tags

{f'Primary concept (must be included): {concept}' if concept else ''}

Summary: {summary}
Architecture: {architecture}
Tech stack: {', '.join([t for t in tech_stack if t])}

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
        tags = tech_stack[:6]

    return {
        "key_concepts": concepts,
        "tags": tags,
        "agent_steps": [f"✅ Extracted {len(concepts)} concepts, {len(tags)} tags"],
    }


# ── Node 7: Score difficulty ──────────────────────────────────────────────────

async def score_github_difficulty(state: GitHubState) -> dict:
    """Score repo complexity 1-5."""
    summary = state.get("summary", "")
    architecture = state.get("architecture_summary", "")
    tech_stack = state.get("tech_stack") or []

    response = await call_llm(
        prompt=f"""Rate the complexity of this GitHub repository on a scale of 1-5:
1 = Beginner / simple demo
2 = Basic utility
3 = Intermediate tool/library
4 = Advanced framework/system
5 = Expert-level infrastructure

Summary: {summary}
Architecture: {architecture}
Tech stack: {', '.join([t for t in tech_stack if t])}

Reply with ONLY the number (1, 2, 3, 4, or 5). Nothing else.""",
        model="groq/llama-3.3-70b-versatile",
        system="You are a technical complexity assessor.",
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
        "agent_steps": [f"✅ Complexity scored: {difficulty}/5"],
    }


# ── Node 8: Generate metadata ─────────────────────────────────────────────────

async def generate_github_metadata(state: GitHubState) -> dict:
    """Build metadata payload including stars, language, etc."""
    metadata = state.get("metadata") or {}
    tech_stack = state.get("tech_stack") or []
    purpose = state.get("purpose", "other")

    metadata_payload = {
        "stars": metadata.get("stars", 0),
        "forks": metadata.get("forks", 0),
        "language": metadata.get("language", ""),
        "license": metadata.get("license", ""),
        "topics": metadata.get("topics", []),
        "default_branch": metadata.get("default_branch", "main"),
        "updated_at": metadata.get("updated_at", ""),
        "purpose": purpose,
        "tech_stack": tech_stack,
    }

    return {
        "metadata_payload": metadata_payload,
        "agent_steps": ["✅ Metadata payload generated"],
    }


# ── Node 9: Place in knowledge tree ───────────────────────────────────────────

async def place_github_in_tree(state: GitHubState) -> dict:
    """Map the repo to the predefined AI_CONCEPTS_LIST taxonomy."""
    summary = state.get("summary", "")
    architecture = state.get("architecture_summary", "")
    tech_stack = state.get("tech_stack") or []
    concept = state.get("concept") or ""

    response = await call_llm(
        prompt=f"""Determine where this GitHub repository belongs in our predefined knowledge taxonomy.
You MUST choose exactly ONE concept from the provided ALLOWED_CONCEPTS list.

{f'User-provided concept (use to help pick): {concept}' if concept else ''}

ALLOWED_CONCEPTS:
{', '.join(AI_CONCEPTS_LIST)}

Return ONLY a JSON object:
{{
  "tree_path": "The EXACT concept string you chose from the ALLOWED_CONCEPTS list",
  "domain": "One of: Artificial Intelligence, Machine Learning, Python, System Design, SQL, Cloud Computing, DevOps, Mathematics, General"
}}

Summary: {summary}
Architecture: {architecture}
Tech stack: {', '.join([t for t in tech_stack if t])}

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
            chosen_path = "AI Tools"
    except Exception:
        chosen_path = "AI Tools"
        domain = "General"

    return {
        "knowledge_tree": chosen_path,
        "knowledge_domain": domain,
        "agent_steps": [f"🌳 Placed in taxonomy: {chosen_path}"],
    }


# ── Build the GitHub subgraph ─────────────────────────────────────────────────

def build_github_subgraph() -> StateGraph:
    graph = StateGraph(GitHubState)

    graph.add_node("fetch_repo",            fetch_github_repo_node)
    graph.add_node("detect_tech_stack",     detect_tech_stack)
    graph.add_node("summarize_readme",      summarize_readme)
    graph.add_node("extract_architecture",  extract_architecture)
    graph.add_node("classify_purpose",      classify_purpose)
    graph.add_node("extract_concepts",      extract_github_concepts)
    graph.add_node("score_difficulty",      score_github_difficulty)
    graph.add_node("generate_metadata",     generate_github_metadata)
    graph.add_node("place_in_tree",         place_github_in_tree)

    graph.set_entry_point("fetch_repo")
    graph.add_edge("fetch_repo",            "detect_tech_stack")
    graph.add_edge("detect_tech_stack",     "summarize_readme")
    graph.add_edge("summarize_readme",      "extract_architecture")
    graph.add_edge("extract_architecture",  "classify_purpose")
    graph.add_edge("classify_purpose",      "extract_concepts")
    graph.add_edge("extract_concepts",      "score_difficulty")
    graph.add_edge("score_difficulty",      "generate_metadata")
    graph.add_edge("generate_metadata",     "place_in_tree")
    graph.add_edge("place_in_tree",         END)

    return graph


github_subgraph = build_github_subgraph()
