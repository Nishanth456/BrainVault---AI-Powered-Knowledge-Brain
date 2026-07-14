"""
search.py — Semantic search across all saved knowledge.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from backend.models.database import get_db
from backend.models.schemas import KnowledgeItem
from backend.services.qdrant import search_knowledge

router = APIRouter(prefix="/api/search", tags=["search"])


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    filters: Optional[dict] = Field(default_factory=dict)
    limit: int = Field(default=20, ge=1, le=100)


class SearchResult(BaseModel):
    id: str
    type: str
    title: str
    summary: str
    source_url: Optional[str] = None
    author: Optional[str] = None
    key_concepts: list[str] = []
    tags: list[str] = []
    difficulty: Optional[int] = None
    knowledge_tree: Optional[str] = None
    knowledge_domain: Optional[str] = None
    score: float
    matched_by: Optional[str] = "semantic"
    created_at: Optional[str] = None
    attachments: list[dict] = []
    is_bookmarked: bool = False


@router.post("")
async def search(request: SearchRequest, db: AsyncSession = Depends(get_db)):
    """
    Semantic search across all knowledge items.
    Returns results grouped by type, enriched from PostgreSQL.
    """
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query is required")

    # 1. Vector search in Qdrant
    qdrant_results = await search_knowledge(
        query=request.query,
        limit=request.limit,
        filters=request.filters or {},
    )

    if not qdrant_results:
        return {"results": [], "grouped": {}}

    # 2. Enrich from PostgreSQL (source of truth for metadata + attachments)
    ids = [r["id"] for r in qdrant_results if r.get("id")]
    result = await db.execute(
        select(KnowledgeItem)
        .options(selectinload(KnowledgeItem.attachments))
        .where(KnowledgeItem.id.in_(ids), KnowledgeItem.deleted_at.is_(None))
    )
    items = result.scalars().all()
    item_map = {str(item.id): item for item in items}

    # 3. Merge Qdrant score with PG metadata, preserving Qdrant ranking
    enriched = []
    for r in qdrant_results:
        item = item_map.get(r["id"])
        if not item:
            continue

        enriched.append(SearchResult(
            id=str(item.id),
            type=item.type,
            title=item.title or "Untitled",
            summary=item.summary or "",
            source_url=item.source_url,
            author=item.author,
            key_concepts=item.key_concepts or [],
            tags=item.tags or [],
            difficulty=item.difficulty,
            knowledge_tree=item.knowledge_tree,
            knowledge_domain=item.knowledge_domain,
            score=r.get("score", 0.0) + (0.05 if item.is_bookmarked else 0.0),
            matched_by=r.get("matched_by", "semantic"),
            created_at=item.created_at.isoformat() if item.created_at else None,
            attachments=[
                {
                    "id": str(att.id),
                    "filename": att.filename,
                    "minio_path": att.minio_path,
                    "file_type": att.file_type,
                    "page_count": att.page_count,
                }
                for att in item.attachments
            ],
            is_bookmarked=item.is_bookmarked,
        ))

    # 4. Group results for frontend
    grouped = {}
    for r in enriched:
        grouped.setdefault(r.type, []).append(r)

    return {
        "results": enriched,
        "grouped": grouped,
        "filters_applied": request.filters or {},
    }
