"""
orchestrator.py — BrainVault master LangGraph orchestrator.

Phase 1: LinkedIn agent is wired to the real 9-node subgraph.
All other agents remain as stubs until their respective phases.
"""
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from backend.agents.state import BrainVaultState
from backend.services.llm import detect_input_type


# ── Phase 1: Real LinkedIn agent adapter ──────────────────────────────────────

async def linkedin_agent_node(state: BrainVaultState) -> dict:
    """
    Adapter: runs the LinkedIn LangGraph subgraph and merges results
    back into the master BrainVaultState.
    """
    from backend.agents.linkedin_agent import linkedin_subgraph, LinkedInState

    linkedin_state = LinkedInState(
        url=state["raw_input"].strip(),
        concept=state.get("concept") or "",
        raw_html=None,
        post_text=None,
        author=None,
        date=None,
        document_title=None,
        pdf_urls=[],
        carousel_image_urls=[],
        has_attachment=False,
        downloaded_files=[],
        combined_text=None,
        summary=None,
        key_concepts=None,
        tags=None,
        metadata=None,
        difficulty=None,
        knowledge_tree=None,
        agent_steps=[],
        error=None,
    )

    compiled = linkedin_subgraph.compile()
    result = await compiled.ainvoke(linkedin_state)

    metadata = result.get("metadata") or {}
    
    # ── Dynamic Classification ──
    # If the agent detected this is an interview QnA, override its type and mark its source.
    is_qna = result.get("is_interview_qna")
    final_type = "interview_qna" if is_qna else "linkedin"
    knowledge_domain = "LinkedIn" if is_qna else None

    return {
        "input_type":     final_type,
        "extracted_text": result.get("combined_text", ""),
        "title":          metadata.get("title", ""),
        "summary":        result.get("summary", ""),
        "key_concepts":   result.get("key_concepts") or [],
        "tags":           result.get("tags") or [],
        "difficulty":     result.get("difficulty", 3),
        "knowledge_tree": result.get("knowledge_tree", ""),
        "knowledge_domain": knowledge_domain,
        "qna_pairs":      result.get("qna_pairs") or [],
        "metadata":       metadata,
        "attachments":    result.get("downloaded_files") or [],
        "agent_steps":    result.get("agent_steps") or [],
        "error":          result.get("error"),
        # LinkedIn-specific extras merged into master state
        "source_url":     state["raw_input"].strip(),
        "author":         result.get("author", ""),
    }


# ── Phase 2: Real Plain Text / Smart Notes agent adapter ───────────────────────

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
        "extracted_text":   state["raw_input"].strip(),
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


# ── Phase 3: Real Blog agent adapter ─────────────────────────────────────────

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
    final_type = "interview_qna" if is_qna else "blog"

    # Prefer the original scraper title; only fall back to metadata title if missing
    final_title = result.get("title") or metadata.get("title", "")

    return {
        "input_type":       final_type,
        "extracted_text":   result.get("article_text", ""),
        "title":            final_title,
        "summary":          result.get("summary", ""),
        "key_concepts":     result.get("key_concepts") or [],
        "tags":             result.get("tags") or [],
        "difficulty":       result.get("difficulty", 3),
        "knowledge_tree":   result.get("knowledge_tree", ""),
        "knowledge_domain": result.get("knowledge_domain"),
        "qna_pairs":        result.get("qna_pairs") or [],
        "metadata":         metadata,
        "attachments":      [],
        "agent_steps":      result.get("agent_steps") or [],
        "error":            result.get("error"),
        "source_url":       state["raw_input"].strip(),
        "author":           result.get("author", ""),
    }


# ── Stub nodes (Phase 0 — pass state through until implemented) ────────────────

async def detect_input_node(state: BrainVaultState) -> dict:
    """REAL: calls Groq to classify input type."""
    raw = state["raw_input"]
    input_type = await detect_input_type(raw)
    return {
        "input_type": input_type,
        "agent_steps": [f"✅ Input detected: {input_type}"],
    }


async def stub_agent_node(state: BrainVaultState) -> dict:
    """Stub for agents not yet implemented."""
    return {
        "title": "Untitled (stub)",
        "summary": state["raw_input"][:200],
        "agent_steps": [f"⚠️ {state.get('input_type', 'unknown')} agent not yet implemented"],
    }


async def store_node(state: BrainVaultState) -> dict:
    """Saves the enriched state to PostgreSQL + Qdrant."""
    from backend.services.storage_service import save_knowledge_item
    item_id = await save_knowledge_item(state)
    return {
        "knowledge_item_id": str(item_id),
        "agent_steps": ["✅ Saved to your brain"],
    }


# ── Routing ───────────────────────────────────────────────────────────────────

def route_by_type(state: BrainVaultState) -> str:
    """Route to the right agent based on detected input type."""
    input_type = state.get("input_type", "plaintext")
    routing = {
        "linkedin":  "linkedin_agent",
        "blog":      "blog_agent",
        "pdf":       "pdf_agent",
        "research":  "research_agent",
        "github":    "github_agent",
        "youtube":   "youtube_agent",
        "course":    "course_agent",
        "plaintext": "plaintext_agent",
    }
    return routing.get(input_type, "plaintext_agent")


# ── Build the Graph ───────────────────────────────────────────────────────────

def build_master_graph():
    graph = StateGraph(BrainVaultState)

    # Entry node
    graph.add_node("detect_input", detect_input_node)

    # Phase 1: real LinkedIn agent
    graph.add_node("linkedin_agent", linkedin_agent_node)

    # Phase 3: real Blog agent
    graph.add_node("blog_agent", blog_agent_node)

    # All other agents: stubs until their phase
    stub_agents = [
        "pdf_agent", "research_agent",
        "github_agent", "youtube_agent", "course_agent",
    ]
    for name in stub_agents:
        graph.add_node(name, stub_agent_node)

    # Phase 2: real plaintext agent
    graph.add_node("plaintext_agent", plaintext_agent_node)

    # Store node
    graph.add_node("store", store_node)

    # Routing
    all_agents = ["linkedin_agent", "blog_agent"] + stub_agents + ["plaintext_agent"]
    graph.set_entry_point("detect_input")
    graph.add_conditional_edges("detect_input", route_by_type, {
        name: name for name in all_agents
    })

    # All agents → store
    for name in all_agents:
        graph.add_edge(name, "store")

    graph.add_edge("store", END)

    return graph.compile(checkpointer=MemorySaver())


master_graph = build_master_graph()
