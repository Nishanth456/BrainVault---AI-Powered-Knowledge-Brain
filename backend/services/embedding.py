import httpx
from backend.config import settings


async def generate_embedding(text: str) -> list[float]:
    """
    Generate embeddings using Ollama (local, free, private).
    Model: nomic-embed-text (768 dimensions)
    Run first: ollama pull nomic-embed-text

    In Phase 0 this is a stub that returns a zero vector if Ollama is not running.
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{settings.OLLAMA_BASE_URL}/api/embeddings",
                json={
                    "model": settings.OLLAMA_EMBED_MODEL,
                    "prompt": text[:8000]   # Truncate if too long
                }
            )
            response.raise_for_status()
            return response.json()["embedding"]
    except Exception as e:
        print(f"⚠️ Ollama embedding failed (is Ollama running?): {e}")
        # Return a zero vector as fallback — won't break the pipeline in Phase 0
        return [0.0] * settings.EMBED_DIMENSION
