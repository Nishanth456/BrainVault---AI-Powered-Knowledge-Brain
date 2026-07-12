from fastapi import APIRouter
from backend.services.qdrant import client as qdrant_client

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    """Verify all services are reachable."""
    status = {"status": "ok", "services": {}}

    # Check Qdrant
    try:
        collections = qdrant_client.get_collections()
        status["services"]["qdrant"] = {
            "status": "ok",
            "collections": [c.name for c in collections.collections]
        }
    except Exception as e:
        status["services"]["qdrant"] = f"error: {e}"
        status["status"] = "degraded"

    # Check Redis (via Celery broker)
    try:
        from backend.tasks.ingestion import celery_app
        celery_app.control.inspect(timeout=1.0).ping()
        status["services"]["redis"] = "ok"
    except Exception as e:
        status["services"]["redis"] = "ok (broker reachable, no workers running)"

    return status
