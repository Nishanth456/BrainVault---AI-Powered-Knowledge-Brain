"""
youtube_agent.py — YouTube video/playlist ingestion LangGraph subgraph.

Pipeline:
  resolve_url → fetch_metadata → fetch_transcript → detect_chapters
  → summarize_per_chapter → overall_summary → extract_concepts
  → score_difficulty → place_in_tree → generate_metadata → END
"""
import json
import re
from langgraph.graph import StateGraph, END
from typing import TypedDict, Optional

from backend.services.llm import call_llm
from backend.tools.youtube_client import resolve_youtube_url


# ── YouTube-specific state ─────────────────────────────────────────────────────

class YouTubeState(TypedDict):
    url: str
    concept: Optional[str]
    video_id: Optional[str]
    playlist_id: Optional[str]
    type: Optional[str]  # youtube_video | youtube_playlist
    metadata: Optional[dict]
    transcript: Optional[list[dict]]
    thumbnail_path: Optional[str]
    chapters: Optional[list[dict]]
    chapter_summaries: Optional[list[dict]]
    summary: Optional[str]
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


# ── Node 1: Resolve YouTube URL ───────────────────────────────────────────────

async def resolve_youtube_node(state: YouTubeState) -> dict:
    """Resolve URL into video or playlist metadata."""
    url = state["url"].strip()
    try:
        data = await resolve_youtube_url(url)
    except Exception as e:
        return {
            "type": "youtube_video",
            "error": f"Failed to resolve YouTube URL: {e}",
            "agent_steps": ["❌ Failed to resolve YouTube URL"],
        }

    item_type = data.get("type", "youtube_video")

    # ── Playlist branch ─────────────────────────────────────────────────────────
    if item_type == "youtube_playlist":
        playlist_title = data.get("title") or (data.get("metadata") or {}).get("title", "Untitled Playlist")
        return {
            "type": "youtube_playlist",
            "playlist_id": data.get("playlist_id"),
            "metadata": {
                "title": playlist_title,
                "channel": data.get("channel", "Unknown Channel"),
                "description": data.get("description", ""),
                "video_count": data.get("video_count") or 0,
                "source_url": data.get("source_url", url),
            },
            "transcript": [],
            "thumbnail_path": data.get("thumbnail_path"),
            "chapters": [],
            "agent_steps": [
                f"✅ Resolved YouTube playlist",
                f"📋 {playlist_title}",
            ],
        }

    # ── Single video branch ───────────────────────────────────────────────────
    metadata = data.get("metadata") or {}
    return {
        "type": item_type,
        "video_id": data.get("video_id"),
        "playlist_id": data.get("playlist_id"),
        "metadata": metadata,
        "transcript": data.get("transcript", []),
        "thumbnail_path": data.get("thumbnail_path"),
        "chapters": metadata.get("chapters", []),
        "agent_steps": [
            f"✅ Resolved {item_type.replace('_', ' ')}",
            f"🎬 {metadata.get('title') or 'Untitled'}",
            f"⏱️ {metadata.get('duration_text') or '0:00'} · {len(data.get('transcript', []))} transcript segments",
        ],
    }


# ── Node 2: Summarize per chapter (video only) ─────────────────────────────────

async def summarize_per_chapter(state: YouTubeState) -> dict:
    """Generate a summary for each chapter using transcript segments."""
    # Playlists have no per-chapter transcript; skip straight to metadata.
    if state.get("type") == "youtube_playlist":
        return {
            "chapter_summaries": [],
            "summary": "",
            "agent_steps": ["⏭️ Playlist: skipping chapter summarization"],
        }

    chapters = state.get("chapters") or []
    transcript = state.get("transcript") or []
    metadata = state.get("metadata") or {}
    title = metadata.get("title", "Untitled Video")

    if not chapters:
        # If no chapters, create a single pseudo-chapter for the whole video
        full_text = " ".join([seg.get("text") or "" for seg in transcript])
        chapters = [{"title": title, "start_seconds": 0, "start_text": "0:00"}]

    chapter_summaries = []
    for ch in chapters:
        start = ch.get("start_seconds", 0)
        # Collect transcript segments that fall within this chapter
        # (until the next chapter start, or all remaining if last)
        ch_text = " ".join([
            seg.get("text") or "" for seg in transcript
            if seg.get("start_seconds", 0) >= start
        ])
        # Limit to avoid huge prompts
        ch_text = ch_text[:4000]

        if not ch_text.strip():
            chapter_summaries.append({
                "title": ch.get("title") or "",
                "start_seconds": start,
                "start_text": ch.get("start_text") or "",
                "summary": "No transcript available for this section.",
            })
            continue

        summary = await call_llm(
            prompt=f"""Summarize this YouTube video chapter in 2-3 sentences.
Focus on the key technical insight or learning.

Chapter: {ch.get('title') or ''}
Transcript:
{ch_text}

CRITICAL RULES:
- Output ONLY the summary sentences.
- Do NOT start with "Here is a summary" or "This chapter discusses".
- Do NOT use bullet points or numbered lists.""",
            model="groq/llama-3.1-8b-instant",
            system="You are a video content summarizer. Return only the summary with no meta commentary.",
            max_tokens=200,
        )

        for pattern in [
            r"(?i)^here\s+is\s+a?\s*summary[^\n]*",
            r"(?i)^this\s+chapter\s+(discusses|is)[^\n]*",
            r"(?i)^in\s+summary[^\n]*",
        ]:
            summary = re.sub(pattern, "", summary).strip()

        chapter_summaries.append({
            "title": ch.get("title") or "",
            "start_seconds": start,
            "start_text": ch.get("start_text") or "",
            "summary": summary,
        })

    return {
        "chapter_summaries": chapter_summaries,
        "agent_steps": [f"✅ Summarized {len(chapter_summaries)} chapter(s)"],
    }


# ── Node 3: Overall summary ───────────────────────────────────────────────────

async def generate_overall_summary(state: YouTubeState) -> dict:
    """Create an overall summary from chapter summaries (video) or playlist metadata."""
    metadata = state.get("metadata") or {}

    # ── Playlist branch ─────────────────────────────────────────────────────
    if state.get("type") == "youtube_playlist":
        title = metadata.get("title", "Untitled Playlist")
        description = metadata.get("description") or ""
        video_count = metadata.get("video_count") or 0

        summary = await call_llm(
            prompt=f"""Create a concise 3-4 sentence summary of this YouTube playlist.
Title: {title}
Description: {description}
Videos: {video_count}

CRITICAL RULES:
- Output ONLY the summary sentences.
- Do NOT start with "Here is a summary" or "This playlist is about".
- Do NOT use bullet points or numbered lists.""",
            model="groq/llama-3.1-8b-instant",
            system="You are a video content summarizer. Return only the summary with no meta commentary.",
            max_tokens=300,
        )

        for pattern in [
            r"(?i)^here\s+is\s+a?\s*summary[^\n]*",
            r"(?i)^this\s+playlist\s+(is\s+about|discusses|contains)[^\n]*",
            r"(?i)^in\s+summary[^\n]*",
        ]:
            summary = re.sub(pattern, "", summary).strip()

        return {
            "summary": summary,
            "agent_steps": ["✅ Playlist summary generated"],
        }

    # ── Single video branch ───────────────────────────────────────────────────
    chapter_summaries = state.get("chapter_summaries") or []
    title = metadata.get("title", "Untitled Video")

    combined = "\n\n".join([
        f"{ch.get('title') or ''}: {ch.get('summary') or ''}"
        for ch in chapter_summaries
    ])[:6000]

    summary = await call_llm(
        prompt=f"""Create an overall summary of this YouTube video in 4-5 sentences.
Title: {title}

Chapter summaries:
{combined}

CRITICAL RULES:
- Output ONLY the summary sentences.
- Do NOT start with "Here is a summary" or "This video is about".
- Do NOT use bullet points or numbered lists.""",
        model="groq/llama-3.1-8b-instant",
        system="You are a video content summarizer. Return only the summary with no meta commentary.",
        max_tokens=300,
    )

    for pattern in [
        r"(?i)^here\s+is\s+a?\s*summary[^\n]*",
        r"(?i)^this\s+video\s+(is\s+about|discusses)[^\n]*",
        r"(?i)^in\s+summary[^\n]*",
    ]:
        summary = re.sub(pattern, "", summary).strip()

    return {
        "summary": summary,
        "agent_steps": ["✅ Overall video summary generated"],
    }


# ── Node 4: Extract concepts + tags ────────────────────────────────────────────

async def extract_youtube_concepts(state: YouTubeState) -> dict:
    """Extract key concepts and tags from the video or playlist."""
    summary = state.get("summary", "")
    chapter_summaries = state.get("chapter_summaries") or []
    metadata = state.get("metadata") or {}
    tags = metadata.get("tags", [])
    concept = state.get("concept") or ""

    chapter_text = "\n".join([
        f"{ch.get('title') or ''}: {ch.get('summary') or ''}"
        for ch in chapter_summaries
    ])[:3000]

    # For playlists, use description + video count as context
    if state.get("type") == "youtube_playlist":
        description = metadata.get("description") or ""
        video_count = metadata.get("video_count") or 0
        context = f"Playlist description:\n{description}\n\nVideos: {video_count}"
    else:
        context = f"Chapter summaries: {chapter_text}"

    response = await call_llm(
        prompt=f"""Extract key concepts and tags from this YouTube content.
Return a JSON object with two lists:
- "concepts": 3-8 specific technical concepts
- "tags": 3-6 short tags

{f'Primary concept (must be included): {concept}' if concept else ''}

Overall summary: {summary}
{context}

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
        extracted_tags = data.get("tags", [])
    except Exception:
        concepts = [concept] if concept else []
        extracted_tags = []

    # Merge with YouTube tags
    all_tags = list(dict.fromkeys(extracted_tags + tags))[:8]

    return {
        "key_concepts": concepts,
        "tags": all_tags,
        "agent_steps": [f"✅ Extracted {len(concepts)} concepts, {len(all_tags)} tags"],
    }


# ── Node 5: Score difficulty ─────────────────────────────────────────────────

async def score_youtube_difficulty(state: YouTubeState) -> dict:
    """Score video difficulty 1-5."""
    summary = state.get("summary", "")
    concepts = state.get("key_concepts") or []

    response = await call_llm(
        prompt=f"""Rate the technical difficulty of this YouTube video on a scale of 1-5:
1 = Beginner
2 = Basic
3 = Intermediate
4 = Advanced
5 = Expert

Summary: {summary}
Concepts: {', '.join([c for c in concepts if c])}

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


# ── Node 6: Place in knowledge tree ───────────────────────────────────────────

async def place_youtube_in_tree(state: YouTubeState) -> dict:
    """Map the video to the predefined AI_CONCEPTS_LIST taxonomy."""
    summary = state.get("summary", "")
    concepts = state.get("key_concepts") or []
    concept = state.get("concept") or ""

    response = await call_llm(
        prompt=f"""Determine where this YouTube video belongs in our predefined knowledge taxonomy.
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
Concepts: {', '.join([c for c in concepts if c])}

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


# ── Node 7: Generate metadata ─────────────────────────────────────────────────

async def generate_youtube_metadata(state: YouTubeState) -> dict:
    """Build metadata payload for the video or playlist."""
    metadata = state.get("metadata") or {}
    chapters = state.get("chapter_summaries") or []

    if state.get("type") == "youtube_playlist":
        metadata_payload = {
            "channel": metadata.get("channel") or "",
            "video_count": metadata.get("video_count") or 0,
            "description": metadata.get("description") or "",
        }
    else:
        metadata_payload = {
            "channel": metadata.get("channel") or "",
            "duration_seconds": metadata.get("duration_seconds") or 0,
            "duration_text": metadata.get("duration_text") or "",
            "view_count": metadata.get("view_count") or 0,
            "upload_date": metadata.get("upload_date") or "",
            "categories": metadata.get("categories") or [],
            "chapter_count": len(chapters),
            "transcript_segment_count": len(state.get("transcript") or []),
        }

    return {
        "metadata_payload": metadata_payload,
        "agent_steps": ["✅ Metadata payload generated"],
    }


# ── Build the YouTube subgraph ────────────────────────────────────────────────

def build_youtube_subgraph() -> StateGraph:
    graph = StateGraph(YouTubeState)

    graph.add_node("resolve_url",             resolve_youtube_node)
    graph.add_node("summarize_chapters",      summarize_per_chapter)
    graph.add_node("overall_summary",         generate_overall_summary)
    graph.add_node("extract_concepts",        extract_youtube_concepts)
    graph.add_node("score_difficulty",        score_youtube_difficulty)
    graph.add_node("place_in_tree",           place_youtube_in_tree)
    graph.add_node("generate_metadata",       generate_youtube_metadata)

    graph.set_entry_point("resolve_url")
    graph.add_edge("resolve_url",             "summarize_chapters")
    graph.add_edge("summarize_chapters",      "overall_summary")
    graph.add_edge("overall_summary",         "extract_concepts")
    graph.add_edge("extract_concepts",        "score_difficulty")
    graph.add_edge("score_difficulty",        "place_in_tree")
    graph.add_edge("place_in_tree",           "generate_metadata")
    graph.add_edge("generate_metadata",       END)

    return graph


youtube_subgraph = build_youtube_subgraph()
