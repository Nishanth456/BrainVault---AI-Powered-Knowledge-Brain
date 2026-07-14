"""
learning_paths.py — Phase 9 Learning Path API router.

Endpoints:
  POST /api/learning-path/generate   → Run agent, return path (transient, not saved)
  POST /api/learning-path/save       → Persist a generated path to PostgreSQL
  GET  /api/learning-path            → List all saved paths (newest first)
  GET  /api/learning-path/{id}       → Get a single saved path with full stage data
  PATCH /api/learning-path/{id}      → Update name or completed_stages
  DELETE /api/learning-path/{id}     → Delete a saved path
"""
import json
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.database import get_db
from backend.agents.learning_path_agent import learning_path_agent

router = APIRouter(prefix="/api/learning-path", tags=["learning-paths"])


# ── Pydantic models ──────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    topic: str


class SaveRequest(BaseModel):
    topic: str
    name: str | None = None
    stages: list[dict]
    gaps: list[str]
    total_items: int


class UpdateRequest(BaseModel):
    name: str | None = None
    completed_stages: list[str] | None = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/generate")
async def generate_learning_path(req: GenerateRequest):
    """
    Generate a personalized learning path for a given topic.
    Searches Qdrant for related content, groups + orders via LLM.
    Returns the path as JSON — does NOT save it automatically.
    """
    state = await learning_path_agent.ainvoke({"topic": req.topic})
    return {
        "topic": req.topic,
        "stages": state.get("ordered_stages", []),
        "gaps": state.get("gaps", []),
        "total_items": state.get("total_items", 0),
    }


@router.post("/save")
async def save_learning_path(req: SaveRequest, db: AsyncSession = Depends(get_db)):
    """Persist a generated learning path to the database."""
    path_id = uuid.uuid4()
    now = datetime.utcnow()
    await db.execute(text("""
        INSERT INTO learning_paths (id, name, topic, stages, gaps, total_items, completed_stages, created_at, updated_at)
        VALUES (:id, :name, :topic, :stages, :gaps, :total_items, :completed_stages, :created_at, :updated_at)
    """), {
        "id": str(path_id),
        "name": req.name or f"Learning Path: {req.topic}",
        "topic": req.topic,
        "stages": json.dumps(req.stages),
        "gaps": req.gaps,
        "total_items": req.total_items,
        "completed_stages": [],
        "created_at": now,
        "updated_at": now,
    })
    await db.commit()
    return {"id": str(path_id), "message": "Saved successfully"}


@router.get("")
async def list_learning_paths(db: AsyncSession = Depends(get_db)):
    """List all saved learning paths ordered by creation date descending."""
    result = await db.execute(text("""
        SELECT id, name, topic, gaps, total_items, completed_stages, created_at
        FROM learning_paths
        ORDER BY created_at DESC
    """))
    rows = result.fetchall()
    return [
        {
            "id": str(row.id),
            "name": row.name,
            "topic": row.topic,
            "gaps": row.gaps or [],
            "total_items": row.total_items or 0,
            "completed_stages": row.completed_stages or [],
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


@router.get("/{path_id}")
async def get_learning_path(path_id: str, db: AsyncSession = Depends(get_db)):
    """Get a single saved learning path including full stage + item data."""
    result = await db.execute(text("""
        SELECT id, name, topic, stages, gaps, total_items, completed_stages, created_at
        FROM learning_paths WHERE id = :id
    """), {"id": path_id})
    row = result.fetchone()
    if not row:
        return {"error": "Learning path not found"}

    stages = []
    if row.stages:
        try:
            stages = json.loads(row.stages)
        except Exception:
            stages = []

    return {
        "id": str(row.id),
        "name": row.name,
        "topic": row.topic,
        "stages": stages,
        "gaps": row.gaps or [],
        "total_items": row.total_items or 0,
        "completed_stages": row.completed_stages or [],
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.patch("/{path_id}")
async def update_learning_path(path_id: str, req: UpdateRequest, db: AsyncSession = Depends(get_db)):
    """Update the name or completed_stages of a saved learning path."""
    updates: list[str] = []
    params: dict = {"id": path_id, "updated_at": datetime.utcnow()}

    if req.name is not None:
        updates.append("name = :name")
        params["name"] = req.name
    if req.completed_stages is not None:
        updates.append("completed_stages = :completed_stages")
        params["completed_stages"] = req.completed_stages

    if not updates:
        return {"message": "Nothing to update"}

    updates.append("updated_at = :updated_at")
    await db.execute(
        text(f"UPDATE learning_paths SET {', '.join(updates)} WHERE id = :id"),
        params,
    )
    await db.commit()
    return {"message": "Updated successfully"}


@router.delete("/{path_id}")
async def delete_learning_path(path_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a saved learning path by ID."""
    await db.execute(text("DELETE FROM learning_paths WHERE id = :id"), {"id": path_id})
    await db.commit()
    return {"message": "Deleted successfully"}
