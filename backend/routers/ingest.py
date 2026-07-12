"""
ingest.py — Ingestion API endpoints.
Phase 1: adds GET /ingest/{job_id}/stream — real SSE progress stream.
"""
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from backend.models.database import get_db
from backend.tasks.ingestion import run_ingestion_pipeline
import uuid
import asyncio
import json

router = APIRouter(prefix="/api", tags=["ingest"])


class IngestRequest(BaseModel):
    raw_input: str
    concept: str = ""  # Optional concept label the user provides (e.g. "Guardrails")


class IngestResponse(BaseModel):
    job_id: str
    status: str
    message: str


@router.post("/ingest", response_model=IngestResponse)
async def ingest(request: IngestRequest, db: AsyncSession = Depends(get_db)):
    """
    Accept user input, create a job record, queue the Celery task.
    Returns immediately — pipeline runs in background via Celery.
    """
    job_id = str(uuid.uuid4())

    await db.execute(text("""
        INSERT INTO ingestion_jobs (id, status, raw_input)
        VALUES (:id, 'queued', :raw_input)
    """), {"id": job_id, "raw_input": request.raw_input})
    await db.commit()

    run_ingestion_pipeline.delay(job_id, request.raw_input, request.concept)

    return IngestResponse(
        job_id=job_id,
        status="queued",
        message="Processing started. Your knowledge is being analysed.",
    )


@router.get("/ingest/{job_id}/status")
async def get_job_status(job_id: str, db: AsyncSession = Depends(get_db)):
    """Check the status of an ingestion job (simple poll)."""
    result = await db.execute(text("""
        SELECT id, status, detected_type, error_message, created_at, updated_at
        FROM ingestion_jobs WHERE id = :job_id
    """), {"job_id": job_id})
    row = result.fetchone()
    if not row:
        return {"error": "Job not found"}
    return dict(row._mapping)


@router.post("/ingest/preview")
async def preview_classification(request: IngestRequest):
    """Fast classification preview for the dashboard input box."""
    from backend.services.llm import detect_input_type, call_llm

    input_type = await detect_input_type(request.raw_input)

    if input_type != "plaintext":
        return {"type": input_type, "domain": None, "tree": None}

    domain_prompt = f"""Determine the broad knowledge domain for this text. Choose exactly ONE:
Artificial Intelligence, Machine Learning, Python, System Design, SQL, Cloud Computing, DevOps, Mathematics, General

Text: {request.raw_input[:1000]}

Return ONLY the domain name."""

    domain = await call_llm(domain_prompt, model="groq/llama-3.1-8b-instant", max_tokens=20, temperature=0)
    domain = domain.strip()
    valid = {"Artificial Intelligence", "Machine Learning", "Python", "System Design", "SQL", "Cloud Computing", "DevOps", "Mathematics", "General"}
    if domain not in valid:
        domain = "General"

    return {"type": "note", "domain": domain, "tree": None}


@router.get("/ingest/{job_id}/stream")
async def stream_job_progress(job_id: str):
    """
    SSE endpoint: streams agent progress in real-time.
    Frontend connects here immediately after submitting a job.

    Events emitted:
    - {"type": "status", "status": "queued"|"running"}
    - {"type": "done", "knowledge_tree": "..."}
    - {"type": "error", "message": "..."}
    """
    async def event_generator():
        import redis.asyncio as redis
        from backend.config import settings
        from backend.models.database import AsyncSessionLocal

        r = redis.from_url(settings.REDIS_URL)
        pubsub = r.pubsub()
        await pubsub.subscribe(f"job:{job_id}:steps")

        yield f"data: {json.dumps({'type': 'status', 'status': 'connecting'})}\n\n"

        # Check initial DB status
        async with AsyncSessionLocal() as db:
            res = await db.execute(text("SELECT status FROM ingestion_jobs WHERE id = :j"), {"j": job_id})
            row = res.fetchone()
            if not row:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Job not found'})}\n\n"
                await pubsub.unsubscribe()
                await r.aclose()
                return

        timeout_counter = 0
        try:
            while timeout_counter < 300:  # 5 minutes max
                # 1. Check for new pub/sub messages (agent steps)
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message:
                    step = message["data"].decode("utf-8")
                    yield f"data: {json.dumps({'type': 'step', 'step': step})}\n\n"
                    timeout_counter = 0  # reset timeout if we are getting steps
                else:
                    timeout_counter += 1

                # 2. Check DB every few seconds to see if job is completely done or failed
                if timeout_counter % 2 == 0:
                    async with AsyncSessionLocal() as db:
                        res = await db.execute(text("""
                            SELECT ij.status, ij.detected_type, ij.error_message,
                                   ki.knowledge_tree, ki.title, ki.id as knowledge_item_id
                            FROM ingestion_jobs ij
                            LEFT JOIN knowledge_items ki ON ij.knowledge_item_id = ki.id
                            WHERE ij.id = :j
                        """), {"j": job_id})
                        row = res.fetchone()

                    if row:
                        if row.status == "done":
                            yield f"data: {json.dumps({'type': 'done', 'knowledge_tree': row.knowledge_tree or '', 'title': row.title or '', 'detected_type': row.detected_type or ''})}\n\n"
                            break
                        elif row.status == "failed":
                            yield f"data: {json.dumps({'type': 'error', 'message': row.error_message or 'Pipeline failed'})}\n\n"
                            break

            if timeout_counter >= 300:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Timed out waiting for pipeline.'})}\n\n"

        finally:
            await pubsub.unsubscribe()
            await r.aclose()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "Connection":       "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )
