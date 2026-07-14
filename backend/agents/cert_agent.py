"""
cert_agent.py — Certification/Credential ingestion LangGraph subgraph.
"""
import json
from langgraph.graph import StateGraph, END
from typing import TypedDict, Optional
from bs4 import BeautifulSoup

from backend.services.llm import call_llm
from backend.tools.blog_scraper import _fetch_with_playwright
from backend.agents.github_agent import AI_CONCEPTS_LIST


# ── State ──────────────────────────────────────────────────────────────────────

class CertState(TypedDict):
    url: str
    concept: Optional[str]
    raw_html: Optional[str]
    clean_text: Optional[str]
    
    title: Optional[str]
    issuer: Optional[str]
    issue_date: Optional[str]
    valid_until: Optional[str]
    cert_id: Optional[str]
    exam_topics: Optional[list[str]]
    
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

async def fetch_cert_page_node(state: CertState) -> dict:
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
        text = text[:15000]
        
        return {
            "raw_html": html[:1000], 
            "clean_text": text,
            "agent_steps": ["✅ Fetched certification page via Playwright"]
        }
    except Exception as e:
        return {
            "error": f"Failed to fetch cert: {e}",
            "agent_steps": ["❌ Failed to fetch certification page"]
        }


# ── Node 2: Extract Info ──────────────────────────────────────────────────────

async def extract_cert_info_node(state: CertState) -> dict:
    if state.get("error"): return {}
    
    prompt = f"""You are an expert data extractor. Extract certification/credential details from the following page text.
    Return ONLY a JSON object with these keys:
    - title (string, e.g. "AWS Certified Solutions Architect")
    - issuer (string, e.g. "Amazon Web Services")
    - issue_date (string ISO format YYYY-MM-DD or "Unknown")
    - valid_until (string ISO format YYYY-MM-DD or "Unknown")
    - cert_id (string, e.g. credential ID or validation number)
    - exam_topics (array of strings, core domains covered)
    
    Text:
    {state['clean_text'][:10000]}
    """
    
    response = await call_llm(prompt, model="groq/llama-3.3-70b-versatile", temperature=0.1, response_format={"type": "json_object"})
    
    try:
        clean_json = response.replace("```json", "").replace("```", "").strip()
        data = json.loads(clean_json)
        return {
            "title": data.get("title", "Unknown Certification"),
            "issuer": data.get("issuer", "Unknown Issuer"),
            "issue_date": data.get("issue_date", "Unknown"),
            "valid_until": data.get("valid_until", "Unknown"),
            "cert_id": str(data.get("cert_id", "Unknown")),
            "exam_topics": data.get("exam_topics", []),
            "agent_steps": [f"✅ Extracted certification details: {data.get('title')}"]
        }
    except Exception as e:
        return {
            "error": f"Failed to parse cert info: {e}",
            "agent_steps": ["❌ Failed to extract cert info"]
        }


# ── Node 3: Generate Summary & Metadata ───────────────────────────────────────

async def summarize_cert_node(state: CertState) -> dict:
    if state.get("error"): return {}
    
    prompt = f"""Summarize this certification in 2-3 concise sentences.
    Focus on what it validates.
    
    CRITICAL RULES:
    - Output ONLY the summary sentences.
    - Do NOT start with "Here is a summary" or any meta-preface.
    
    Cert Title: {state.get('title')}
    Text:
    {state['clean_text'][:5000]}
    """
    
    summary = await call_llm(prompt, model="groq/llama-3.3-70b-versatile")
    
    import re
    summary = re.sub(r"(?i)^here\s*(?:is|'s)\s*a\s*(?:\d+-\d+\s*sentence\s*)?summary[^\n]*", "", summary).strip()
    
    return {
        "summary": summary,
        "agent_steps": ["✅ Generated certification summary"]
    }


async def extract_concepts_node(state: CertState) -> dict:
    if state.get("error"): return {}
    
    prompt = f"""Extract 5 to 10 key technical concepts tested in this certification.
    Return ONLY a comma-separated list of strings.
    
    Text: {state['clean_text'][:5000]}
    """
    
    res = await call_llm(prompt, model="groq/llama-3.3-70b-versatile")
    concepts = [c.strip() for c in res.split(",") if c.strip()]
    return {
        "key_concepts": concepts,
        "agent_steps": ["✅ Extracted key concepts"]
    }


async def map_knowledge_tree_node(state: CertState) -> dict:
    if state.get("error"): return {}
    
    prompt = f"""Map this certification into our knowledge tree.
    Our top-level domains include: {", ".join(AI_CONCEPTS_LIST[:20])} (and general SWE/Tech).
    
    Cert Title: {state.get('title')}
    Concepts: {state.get('key_concepts', [])}
    
    Respond in format: Domain > Subdomain > Topic
    Example: AI > Machine Learning > ML Engineering
    IMPORTANT: Return EXACTLY ONE single path. Do not return multiple paths or a list.
    Respond with NOTHING ELSE.
    """
    
    tree_path = await call_llm(prompt, model="groq/llama-3.3-70b-versatile", temperature=0)
    tree_path = tree_path.strip().split("\n")[0].strip()
    domain = tree_path.split(">")[0].strip() if ">" in tree_path else tree_path
    
    return {
        "knowledge_tree": tree_path,
        "knowledge_domain": domain,
        "difficulty": 4, # hardcoded
        "tags": ["certification", domain.lower()],
        "agent_steps": [f"✅ Placed in tree: {tree_path}"]
    }


# ── Subgraph definition ───────────────────────────────────────────────────────

cert_subgraph = StateGraph(CertState)

cert_subgraph.add_node("fetch_cert", fetch_cert_page_node)
cert_subgraph.add_node("extract_info", extract_cert_info_node)
cert_subgraph.add_node("summarize", summarize_cert_node)
cert_subgraph.add_node("concepts", extract_concepts_node)
cert_subgraph.add_node("map_tree", map_knowledge_tree_node)

cert_subgraph.set_entry_point("fetch_cert")

cert_subgraph.add_edge("fetch_cert", "extract_info")
cert_subgraph.add_edge("extract_info", "summarize")
cert_subgraph.add_edge("summarize", "concepts")
cert_subgraph.add_edge("concepts", "map_tree")
cert_subgraph.add_edge("map_tree", END)
