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


@celery_app.task(bind=True, max_retries=3)
def run_ingestion_pipeline(self, job_id: str, raw_input: str, concept: str = ""):
    """
    Background task: run the LangGraph ingestion pipeline.
    Called by the /api/ingest endpoint after creating the job record.

    Flow:
      1. Mark job as 'running'
      2. Invoke master_graph (detect type → stub agent → save to PG)
      3. Job is automatically marked 'done' by save_knowledge_item()
    """
    from backend.agents.orchestrator import master_graph
    from backend.services.storage_service import mark_job_failed

    async def _run():
        # Mark job as running
        from backend.models.database import AsyncSessionLocal
        from sqlalchemy import text
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
        import redis.asyncio as redis
        from backend.config import settings
        r = redis.from_url(settings.REDIS_URL)

        # Stream langgraph execution node by node
        try:
            async for event in master_graph.astream(initial_state, config=config, stream_mode="updates"):
                for node, output in event.items():
                    if "agent_steps" in output and output["agent_steps"]:
                        for step in output["agent_steps"]:
                            await r.publish(f"job:{job_id}:steps", step)
            
            # Publish stats refresh event when done
            import json
            await r.publish("brainvault:events", json.dumps({"type": "stats_refresh"}))
        finally:
            await r.aclose()

    try:
        asyncio.run(_run())
    except Exception as exc:
        print(f"❌ Ingestion pipeline failed for job {job_id}: {exc}")
        # Mark job as failed in PostgreSQL
        async def _fail():
            from backend.services.storage_service import mark_job_failed
            await mark_job_failed(job_id, str(exc))
        asyncio.run(_fail())
        self.retry(exc=exc, countdown=10)
