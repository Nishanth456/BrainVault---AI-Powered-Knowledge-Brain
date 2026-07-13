import httpx
from backend.config import settings


async def generate_embedding(text: str) -> list[float]:
    """
    Generate embeddings using Gemini (text-embedding-004).

    Falls back to Ollama if Gemini is not configured, and finally to a zero
    vector so the pipeline never hard-fails.
    """
    # ── 1. Try Gemini first ───────────────────────────────────────────────────
    if settings.GEMINI_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent",
                    params={"key": settings.GEMINI_API_KEY},
                    json={
                        "content": {
                            "parts": [{"text": text[:8000]}]
                        },
                        "outputDimensionality": settings.EMBED_DIMENSION,
                    }
                )
                response.raise_for_status()
                data = response.json()
                embedding = data["embedding"]["values"]
                print(f"✅ Gemini embedding generated ({len(embedding)} dims)")
                return embedding
        except Exception as e:
            print(f"⚠️ Gemini embedding failed: {e}")

    # ── 2. Fall back to Ollama (legacy local path) ─────────────────────────────
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{settings.OLLAMA_BASE_URL}/api/embeddings",
                json={
                    "model": settings.OLLAMA_EMBED_MODEL,
                    "prompt": text[:8000]
                }
            )
            response.raise_for_status()
            return response.json()["embedding"]
    except Exception as e:
        print(f"⚠️ Ollama embedding failed (is Ollama running?): {e}")

    # ── 3. Final fallback ──────────────────────────────────────────────────────
    print("⚠️ Returning zero vector as embedding fallback")
    return [0.0] * settings.EMBED_DIMENSION
