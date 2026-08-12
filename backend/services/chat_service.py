import json
import string
from backend.services.qdrant import search_knowledge
from backend.services.llm import stream_rag_response


async def build_rag_context(query: str, limit: int = 8, filters: dict | None = None) -> tuple[str, list[dict]]:
    """
    Search Qdrant and format retrieved items as a numbered context string.
    Returns (context_string, sources).
    """
    results = await search_knowledge(query, limit=limit, filters=filters)
    results = sorted(results, key=lambda x: x.get("score", 0), reverse=True)

    sources = []
    context_parts = []

    for idx, r in enumerate(results, start=1):
        source = {
            "index": idx,
            "id": r.get("id"),
            "type": r.get("type"),
            "title": r.get("title") or "Untitled",
            "author": r.get("author"),
            "summary": r.get("summary") or "",
            "knowledge_tree": r.get("knowledge_tree"),
            "score": r.get("score", 0),
        }
        sources.append(source)
        
        if source['type'] == "attachment_chunk":
            content = source['summary']
        else:
            content = source['summary'][:800]
            
        context_parts.append(
            f"Source [{idx}]:\n"
            f"Title: {source['title']}\n"
            f"Type: {source['type']}\n"
            f"Content: {content}\n"
            f"Key concepts: {', '.join(r.get('key_concepts') or [])}\n"
        )

    return "\n\n".join(context_parts), sources


async def answer_with_rag(query: str, session_id: str | None = None, filters: dict | None = None):
    """
    Generator that yields SSE events:
      {"type": "token", "data": "..."}
      {"type": "citations", "data": [...]}
    """
    clean_query = query.strip().lower().translate(str.maketrans('', '', string.punctuation))
    greetings = {"hi", "hello", "hey", "greetings", "good morning", "good afternoon", "good evening", "howdy", "sup"}
    bot_questions = {"who are you", "what are you", "what can you do", "help"}

    if clean_query in greetings:
        system = "You are BrainVault, a personal knowledge assistant. The user just greeted you."
        prompt = f"User says: {query}\n\nRespond with a friendly, brief greeting and offer to help them search or summarize their knowledge base."
        sources = []
    elif clean_query in bot_questions:
        system = "You are BrainVault, a personal knowledge assistant."
        prompt = f"User asked: {query}\n\nExplain briefly that you help them search, summarize, and understand the contents of their personal knowledge base."
        sources = []
    else:
        context, sources = await build_rag_context(query, limit=8, filters=filters)
    
        is_single_doc = bool(filters and filters.get("item_id"))
        
        system = (
            "You are BrainVault, a personal knowledge assistant. "
            "Answer the user's question using ONLY the provided sources from their knowledge base. "
            "If the sources don't contain enough information, say so honestly. "
            "Format your answer cleanly with markdown."
        )
        
        if not is_single_doc:
            system += " Cite sources inline using bracketed numbers like [1] or [2] when you use them."
        prompt = f"Question: {query}\n\nSources:\n{context}\n\nAnswer:"

    full_answer = ""
    async for token in stream_rag_response(system, prompt):
        full_answer += token
        yield {"type": "token", "data": token}

    yield {"type": "citations", "data": sources}
