from celery import Celery
from backend.config import settings
import asyncio

celery_app = Celery(
    "brainvault",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
)


async def run_ingestion_pipeline_async(job_id: str, raw_input: str, concept: str = ""):
    from backend.agents.orchestrator import master_graph
    from backend.models.database import AsyncSessionLocal
    from sqlalchemy import text
    import redis.asyncio as redis
    from backend.config import settings
    import json

    # Mark job as running
    async with AsyncSessionLocal() as db:
        await db.execute(text("""
            UPDATE ingestion_jobs SET status = 'running', updated_at = NOW()
            WHERE id = :job_id
        """), {"job_id": job_id})
        await db.commit()

    initial_state = {
        "raw_input": raw_input,
        "concept":   concept,
        "job_id": job_id,
        "stored_files": [],
        "agent_steps": [],
    }

    config = {"configurable": {"thread_id": job_id}}
    
    # Connect to Redis for pub/sub
    r = redis.from_url(settings.REDIS_URL)

    # Stream langgraph execution node by node
    try:
        async for event in master_graph.astream(initial_state, config=config, stream_mode="updates"):
            for node, output in event.items():
                if "agent_steps" in output and output["agent_steps"]:
                    for step in output["agent_steps"]:
                        await r.publish(f"job:{job_id}:steps", step)
        
        # Publish stats refresh event when done
        await r.publish("brainvault:events", json.dumps({"type": "stats_refresh"}))
    finally:
        await r.aclose()


@celery_app.task(bind=True, max_retries=3)
def run_ingestion_pipeline(self, job_id: str, raw_input: str, concept: str = ""):
    """
    Background task: run the LangGraph ingestion pipeline via Celery.
    """
    try:
        asyncio.run(run_ingestion_pipeline_async(job_id, raw_input, concept))
    except Exception as exc:
        import traceback
        tb = traceback.format_exc()
        print(f"❌ Ingestion pipeline failed for job {job_id}:\n{tb}")
        # Mark job as failed in PostgreSQL
        async def _fail(err):
            from backend.services.storage_service import mark_job_failed
            await mark_job_failed(job_id, str(err))
        asyncio.run(_fail(exc))
        self.retry(exc=exc, countdown=10)
