"""
learning_path_agent.py — Phase 9 Learning Path Generator.

Pipeline:
  search_content → group_and_order → END

search_content: Qdrant vector search for topic-related items (limit 50)
group_and_order: Single LLM call (Groq 70B) to:
  - Group items into 3-7 logical learning stages
  - Order stages from foundational to advanced
  - Detect 1-4 knowledge gaps (important missing subtopics)
"""
from typing import TypedDict
from langgraph.graph import StateGraph, END
from backend.services.qdrant import search_knowledge
from backend.services.llm import call_llm_json
import json


class LearningPathState(TypedDict):
    topic: str
    raw_results: list
    ordered_stages: list
    gaps: list
    total_items: int


async def search_content(state: LearningPathState) -> LearningPathState:
    """Search Qdrant for all content semantically related to the topic."""
    results = await search_knowledge(query=state["topic"], limit=50)
    state["raw_results"] = results
    return state


async def group_and_order(state: LearningPathState) -> LearningPathState:
    """
    Single LLM call: group content by concept, order progressively, detect gaps.
    Uses Groq llama-3.3-70b-versatile for best reasoning quality.
    """
    results = state["raw_results"]
    if not results:
        state["ordered_stages"] = []
        state["gaps"] = [f"No content found about '{state['topic']}'. Start by saving some resources!"]
        state["total_items"] = 0
        return state

    # Prepare compact item summaries for the LLM
    items_summary = []
    for r in results:
        items_summary.append({
            "id": r.get("knowledge_item_id") or r.get("id", ""),
            "title": r.get("title", "Untitled"),
            "type": r.get("type", "note"),
            "summary": (r.get("summary") or "")[:200],
            "difficulty": r.get("difficulty") or 3,
            "knowledge_tree": r.get("knowledge_tree") or "",
            "key_concepts": r.get("key_concepts") or [],
        })

    prompt = f"""You are building a personalized learning roadmap for the topic: "{state['topic']}"

Here are the saved knowledge items that are relevant (JSON list):
{json.dumps(items_summary, indent=2)[:8000]}

Your task:
1. Group these items into 3-7 logical learning stages (concepts/subtopics)
2. Order the stages from foundational to advanced
3. Identify 1-4 knowledge gaps (important subtopics with NO items in the list above)

Return a JSON object with:
{{
  "stages": [
    {{
      "title": "Stage title (concise concept name)",
      "level": "Beginner",
      "concept_summary": "1-2 sentence description of what this stage covers",
      "item_ids": ["id1", "id2"]
    }}
  ],
  "gaps": ["Subtopic A", "Subtopic B"]
}}

Valid level values: "Beginner", "Intermediate", "Advanced", "Expert"

Rules:
- Every item must appear in exactly one stage
- Stages must be ordered from most foundational to most advanced
- Stage titles should be specific (e.g. "RAG Evaluation Techniques" not "Advanced Topics")
- Gaps should be genuinely missing — only list if important for the learning journey
- If only 1-2 items exist, create fewer stages (1-2 is fine)
"""

    result = await call_llm_json(prompt, model="groq/llama-3.3-70b-versatile", max_tokens=2000)

    raw_stages = result.get("stages", [])
    gaps = result.get("gaps", [])

    # Enrich stages with full item details
    item_lookup = {r.get("knowledge_item_id") or r.get("id", ""): r for r in results}
    enriched_stages = []
    all_assigned_ids: set[str] = set()

    for stage in raw_stages:
        item_ids = stage.get("item_ids", [])
        items = []
        for iid in item_ids:
            item = item_lookup.get(iid)
            if item:
                all_assigned_ids.add(iid)
                items.append({
                    "id": iid,
                    "title": item.get("title", "Untitled"),
                    "type": item.get("type", "note"),
                    "difficulty": item.get("difficulty") or 3,
                    "knowledge_tree": item.get("knowledge_tree") or "",
                    "summary": (item.get("summary") or "")[:150],
                })
        if items:  # only include stages that have items
            enriched_stages.append({
                "title": stage.get("title", "Stage"),
                "level": stage.get("level", "Intermediate"),
                "concept_summary": stage.get("concept_summary", ""),
                "item_ids": item_ids,
                "items": items,
            })

    # Catch any items the LLM missed → put in a catch-all stage
    unassigned = [r for r in results if (r.get("knowledge_item_id") or r.get("id", "")) not in all_assigned_ids]
    if unassigned:
        enriched_stages.append({
            "title": "Additional Resources",
            "level": "Intermediate",
            "concept_summary": "Other relevant items from your knowledge base.",
            "item_ids": [r.get("knowledge_item_id") or r.get("id", "") for r in unassigned],
            "items": [{
                "id": r.get("knowledge_item_id") or r.get("id", ""),
                "title": r.get("title", "Untitled"),
                "type": r.get("type", "note"),
                "difficulty": r.get("difficulty") or 3,
                "knowledge_tree": r.get("knowledge_tree") or "",
                "summary": (r.get("summary") or "")[:150],
            } for r in unassigned],
        })

    state["ordered_stages"] = enriched_stages
    state["gaps"] = gaps
    state["total_items"] = sum(len(s["items"]) for s in enriched_stages)
    return state


# Build the LangGraph subgraph
graph = StateGraph(LearningPathState)
graph.add_node("search_content", search_content)
graph.add_node("group_and_order", group_and_order)
graph.set_entry_point("search_content")
graph.add_edge("search_content", "group_and_order")
graph.add_edge("group_and_order", END)

learning_path_agent = graph.compile()
