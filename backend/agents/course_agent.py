"""
course_agent.py — Udemy/Coursera/General Course ingestion LangGraph subgraph.
"""
import json
from langgraph.graph import StateGraph, END
from typing import TypedDict, Optional
from bs4 import BeautifulSoup

from backend.services.llm import call_llm
from backend.tools.blog_scraper import _fetch_with_playwright
from backend.agents.github_agent import AI_CONCEPTS_LIST


# ── State ──────────────────────────────────────────────────────────────────────

class CourseState(TypedDict):
    url: str
    concept: Optional[str]
    raw_html: Optional[str]
    clean_text: Optional[str]
    
    title: Optional[str]
    instructor: Optional[str]
    rating: Optional[float]
    price: Optional[str]
    syllabus: Optional[str]
    prerequisites: Optional[list[str]]
    duration_minutes: Optional[int]
    
    summary: Optional[str]
    key_concepts: Optional[list[str]]
    tags: Optional[list[str]]
    difficulty: Optional[int]
    knowledge_tree: Optional[str]
    knowledge_domain: Optional[str]
    metadata_payload: Optional[dict]
    agent_steps: list[str]
    error: Optional[str]


# ── Node 1: Fetch ─────────────────────────────────────────────────────────────

async def fetch_course_page_node(state: CourseState) -> dict:
    url = state["url"].strip()
    try:
        html = await _fetch_with_playwright(url)
        if not html:
            raise Exception("Empty HTML returned")
            
        soup = BeautifulSoup(html, "lxml")
        
        # Remove scripts, styles
        for el in soup(["script", "style", "nav", "footer", "iframe"]):
            el.decompose()
            
        text = soup.get_text(separator="\n", strip=True)
        # Limit to 15,000 chars to avoid blowing up Groq 6K TPM context window
        text = text[:15000]
        
        return {
            "raw_html": html[:1000], 
            "clean_text": text,
            "agent_steps": ["✅ Fetched course page via Playwright"]
        }
    except Exception as e:
        return {
            "error": f"Failed to fetch course: {e}",
            "agent_steps": ["❌ Failed to fetch course page"]
        }


# ── Node 2: Extract Info ──────────────────────────────────────────────────────

async def extract_course_info_node(state: CourseState) -> dict:
    if state.get("error"): return {}
    
    prompt = f"""You are an expert data extractor. Extract course details from the following page text.
    Return ONLY a JSON object with these keys:
    - title (string)
    - instructor (string)
    - rating (float, e.g. 4.5. If not found, use 0.0)
    - price (string, e.g. "$19.99" or "Free". If not found, use "Unknown")
    - prerequisites (array of strings, what to know before taking this)
    - duration_minutes (integer, total course length in minutes. Convert hours to minutes. Output a single integer, NO math expressions like 7 * 60. If not found, use 0)
    
    Text:
    {state['clean_text'][:6000]}
    """
    
    response = await call_llm(prompt, model="groq/llama-3.3-70b-versatile", temperature=0.1, response_format={"type": "json_object"}, max_tokens=400)
    
    try:
        # Strip markdown code blocks
        clean_json = response.replace("```json", "").replace("```", "").strip()
        data = json.loads(clean_json)
        return {
            "title": data.get("title", "Unknown Course"),
            "instructor": data.get("instructor", "Unknown Instructor"),
            "rating": float(data.get("rating", 0.0)),
            "price": data.get("price", "Unknown"),
            "prerequisites": data.get("prerequisites", []),
            "duration_minutes": int(data.get("duration_minutes", 0)),
            "agent_steps": [f"✅ Extracted course details: {data.get('title')}"]
        }
    except Exception as e:
        return {
            "error": f"Failed to parse course info: {e}",
            "agent_steps": ["❌ Failed to extract course info"]
        }


# ── Node 3: Extract Syllabus ──────────────────────────────────────────────────

async def extract_syllabus_node(state: CourseState) -> dict:
    if state.get("error"): return {}
    
    prompt = f"""You are an expert data extractor. Extract the course syllabus/curriculum from the following text.
    Return ONLY a JSON object with a single key "syllabus" containing an array of modules/sections. 
    Each module object should have a "title" and a list of "lessons".
    Example: {{"syllabus": [{{"title": "Intro to AI", "lessons": ["What is AI?", "History"]}}]}}
    
    Text:
    {state['clean_text'][:8000]}
    """
    
    response = await call_llm(prompt, model="groq/llama-3.3-70b-versatile", temperature=0.1, response_format={"type": "json_object"}, max_tokens=1500)
    
    try:
        clean_json = response.replace("```json", "").replace("```", "").strip()
        # Parse it just to validate
        data = json.loads(clean_json)
        syllabus = data.get("syllabus", [])
        if not isinstance(syllabus, list):
            syllabus = []
        return {
            "syllabus": json.dumps(syllabus),
            "agent_steps": [f"✅ Extracted syllabus ({len(syllabus)} modules)"]
        }
    except Exception as e:
        return {
            "syllabus": "[]",
            "agent_steps": ["⚠️ Failed to extract syllabus, skipping"]
        }


# ── Node 4: Generate Summary & Metadata ───────────────────────────────────────

async def summarize_course_node(state: CourseState) -> dict:
    if state.get("error"): return {}
    
    prompt = f"""Summarize this course in 3-5 concise sentences.
    Focus on what the student will learn.
    
    Course Title: {state.get('title')}
    Text:
    {state['clean_text'][:3000]}
    """
    
    summary = await call_llm(prompt, model="groq/llama-3.3-70b-versatile", max_tokens=150)
    
    return {
        "summary": summary.strip(),
        "agent_steps": ["✅ Generated course summary"]
    }


async def extract_concepts_node(state: CourseState) -> dict:
    if state.get("error"): return {}
    
    prompt = f"""Extract 5 to 10 key technical concepts taught in this course.
    Return ONLY a comma-separated list of strings.
    
    Text: {state['clean_text'][:3000]}
    """
    
    res = await call_llm(prompt, model="groq/llama-3.3-70b-versatile", max_tokens=150)
    concepts = [c.strip() for c in res.split(",") if c.strip()]
    return {
        "key_concepts": concepts,
        "agent_steps": ["✅ Extracted key concepts"]
    }


async def map_knowledge_tree_node(state: CourseState) -> dict:
    if state.get("error"): return {}
    
    prompt = f"""Map this course into our knowledge tree.
    Our top-level domains include: {", ".join(AI_CONCEPTS_LIST[:20])} (and general SWE/Tech).
    
    Course Title: {state.get('title')}
    Concepts: {state.get('key_concepts', [])}
    
    Respond in format: Domain > Subdomain > Topic
    Example: AI > Large Language Models > Prompt Engineering
    IMPORTANT: Return EXACTLY ONE single path. Do not return multiple paths or a list.
    Respond with NOTHING ELSE.
    """
    
    tree_path = await call_llm(prompt, model="groq/llama-3.3-70b-versatile", temperature=0, max_tokens=50)
    tree_path = tree_path.strip().split("\n")[0].strip()
    domain = tree_path.split(">")[0].strip() if ">" in tree_path else tree_path
    
    return {
        "knowledge_tree": tree_path,
        "knowledge_domain": domain,
        "difficulty": 3, # hardcoded or could be inferred
        "tags": ["course", domain.lower()],
        "agent_steps": [f"✅ Placed in tree: {tree_path}"]
    }


# ── Subgraph definition ───────────────────────────────────────────────────────

course_subgraph = StateGraph(CourseState)

course_subgraph.add_node("fetch_course", fetch_course_page_node)
course_subgraph.add_node("extract_info", extract_course_info_node)
course_subgraph.add_node("extract_syllabus", extract_syllabus_node)
course_subgraph.add_node("summarize", summarize_course_node)
course_subgraph.add_node("concepts", extract_concepts_node)
course_subgraph.add_node("map_tree", map_knowledge_tree_node)

course_subgraph.set_entry_point("fetch_course")

course_subgraph.add_edge("fetch_course", "extract_info")
course_subgraph.add_edge("extract_info", "extract_syllabus")
course_subgraph.add_edge("extract_syllabus", "summarize")
course_subgraph.add_edge("summarize", "concepts")
course_subgraph.add_edge("concepts", "map_tree")
course_subgraph.add_edge("map_tree", END)
