from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from backend.config import settings
import uuid

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
            print(f"✅ Qdrant collection '{settings.QDRANT_COLLECTION_NAME}' created")
        else:
            print(f"✅ Qdrant collection '{settings.QDRANT_COLLECTION_NAME}' already exists")
    except Exception as e:
        print(f"⚠️ Qdrant collection setup failed: {e}")


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
    results = client.search(
        collection_name=settings.QDRANT_COLLECTION_NAME,
        query_vector=vector,
        limit=limit,
        score_threshold=score_threshold,
        with_payload=True,
    )
    return [{"score": r.score, "payload": r.payload} for r in results]
