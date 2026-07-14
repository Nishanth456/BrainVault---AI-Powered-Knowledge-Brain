from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchAny,
    MatchText,
    MatchValue,
    Range,
)
from backend.config import settings
from backend.services.embedding import generate_embedding
import uuid
import re

client = QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)


def ensure_collection():
    """Create the Qdrant collection if it doesn't exist. Run at startup."""
    try:
        existing = [c.name for c in client.get_collections().collections]
        if settings.QDRANT_COLLECTION_NAME not in existing:
            client.create_collection(
                collection_name=settings.QDRANT_COLLECTION_NAME,
                vectors_config=VectorParams(
                    size=settings.EMBED_DIMENSION,   # 768 for nomic-embed-text
                    distance=Distance.COSINE
                )
            )
            print(f"Qdrant collection '{settings.QDRANT_COLLECTION_NAME}' created")
        else:
            print(f"Qdrant collection '{settings.QDRANT_COLLECTION_NAME}' already exists")
    except Exception as e:
        print(f"Qdrant collection setup failed: {e}")


def upsert_knowledge_item(
    item_id: str,
    vector: list[float],
    payload: dict
) -> str:
    """Store a knowledge item embedding with its metadata payload."""
    point_id = str(uuid.uuid4())
    client.upsert(
        collection_name=settings.QDRANT_COLLECTION_NAME,
        points=[PointStruct(
            id=point_id,
            vector=vector,
            payload={
                "knowledge_item_id": item_id,
                **payload
            }
        )]
    )
    return point_id


def search_similar(
    vector: list[float],
    limit: int = 10,
    score_threshold: float = 0.7,
    filter_payload: dict | None = None
) -> list[dict]:
    """Search for similar knowledge items by vector. Used by RAG/chat in later phases."""
    results = client.query_points(
        collection_name=settings.QDRANT_COLLECTION_NAME,
        query=vector,
        limit=limit,
        score_threshold=score_threshold,
        with_payload=True,
    ).points
    return [{"score": r.score, "payload": r.payload} for r in results]


async def search_knowledge(
    query: str,
    limit: int = 20,
    filters: dict | None = None,
) -> list[dict]:
    """
    Search Qdrant for knowledge items similar to the query.

    Uses the same Ollama embedding model as ingestion (nomic-embed-text)
    so query vectors are compatible with stored vectors.

    Args:
        query: natural language query string
        limit: max number of results
        filters: optional dict with keys:
            - types: list[str] e.g. ["linkedin", "blog", "research", "note"]
            - difficulty_max: int
            - knowledge_tree: str (exact match on the full tree path for now)

    Returns:
        List of payload dicts with added "score" and "id" fields.
    """
    vector = await generate_embedding(query)

    qdrant_filter = None
    conditions = []

    if filters:
        if filters.get("types"):
            conditions.append(
                FieldCondition(
                    key="type",
                    match=MatchAny(any=filters["types"]),
                )
            )
        if filters.get("difficulty_max") is not None:
            conditions.append(
                FieldCondition(
                    key="difficulty",
                    range=Range(lte=filters["difficulty_max"]),
                )
            )
        if filters.get("knowledge_tree"):
            conditions.append(
                FieldCondition(
                    key="knowledge_tree",
                    match=MatchAny(any=[filters["knowledge_tree"]]),
                )
            )
        if filters.get("item_id"):
            conditions.append(
                FieldCondition(
                    key="knowledge_item_id",
                    match=MatchValue(value=filters["item_id"]),
                )
            )

    if conditions:
        qdrant_filter = Filter(must=conditions)

    # ── Vector search ────────────────────────────────────────────────────────
    vector_results = client.query_points(
        collection_name=settings.QDRANT_COLLECTION_NAME,
        query=vector,
        query_filter=qdrant_filter,
        limit=limit,
        with_payload=True,
        with_vectors=False,
    ).points

    # ── Keyword search (case-insensitive token/substring match) ──────────────
    # Qdrant MatchText is case-sensitive by default. Build a set of query
    # variants and also run a client-side regex fallback over payloads so
    # lowercase queries like "fastapi" still find "FastAPI".
    query_tokens = {query, query.lower(), query.capitalize(), query.upper()}
    keyword_conditions = [
        FieldCondition(key=field, match=MatchText(text=variant))
        for field in ["title", "tags", "key_concepts", "summary"]
        for variant in query_tokens
    ]
    keyword_filter = Filter(should=keyword_conditions)
    if qdrant_filter:
        keyword_filter = Filter(must=[qdrant_filter, Filter(should=keyword_conditions)])

    keyword_results = client.query_points(
        collection_name=settings.QDRANT_COLLECTION_NAME,
        query_filter=keyword_filter,
        limit=limit * 4,
        with_payload=True,
        with_vectors=False,
    ).points

    # ── Client-side keyword fallback (covers case/accent edge cases) ─────────
    pattern = re.compile(re.escape(query), re.IGNORECASE)
    all_candidates = client.query_points(
        collection_name=settings.QDRANT_COLLECTION_NAME,
        query_filter=qdrant_filter,
        limit=200,
        with_payload=True,
        with_vectors=False,
    ).points
    keyword_ids = {str(r.id) for r in keyword_results}
    extra_keyword_results = []
    for r in all_candidates:
        if str(r.id) in keyword_ids:
            continue
        p = r.payload or {}
        text_blob = " ".join(
            str(v)
            for v in [
                p.get("title", ""),
                " ".join(p.get("tags") or []),
                " ".join(p.get("key_concepts") or []),
                p.get("summary", ""),
            ]
        )
        if pattern.search(text_blob):
            extra_keyword_results.append(r)

    keyword_results = list(keyword_results) + extra_keyword_results

    # ── Merge and deduplicate, boosting keyword hits ─────────────────────────
    seen = set()
    merged = []
    for r in keyword_results:
        kid = str(r.payload.get("knowledge_item_id") or r.id)
        if kid not in seen:
            seen.add(kid)
            merged.append({
                "id": kid,
                "score": 1.0 + float(r.score),  # keyword hits outrank pure semantic
                "embedding_id": str(r.id),
                "matched_by": "keyword",
                **(r.payload or {}),
            })

    # Only include semantic results if no keyword matches OR they are relevant enough.
    # With 768-dim Gemini embeddings on this small corpus, scores cluster around
    # 0.55-0.70. Use a moderate threshold to suppress obvious drift while still
    # returning results for natural-language questions.
    SEMANTIC_THRESHOLD = 0.62
    # When keyword matches exist, only keep semantic results that are clearly
    # related (score >= 0.68). Otherwise fall back to the base threshold.
    semantic_threshold = 0.68 if merged else SEMANTIC_THRESHOLD
    semantic_limit = limit if not merged else max(0, limit - len(merged))

    semantic_added = 0
    for r in vector_results:
        kid = str(r.payload.get("knowledge_item_id") or r.id)
        if kid not in seen:
            score = float(r.score)
            if score < semantic_threshold:
                continue
            if semantic_added >= semantic_limit:
                continue
            seen.add(kid)
            semantic_added += 1
            merged.append({
                "id": kid,
                "score": score,
                "embedding_id": str(r.id),
                "matched_by": "semantic",
                **(r.payload or {}),
            })

    return merged[:limit]
