"""
knowledge.py — Knowledge item API endpoints.
Phase 1: adds /linkedin endpoint with attachments + expands /{id} to include attachments.
"""
import json
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select, func
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy.orm import selectinload
from backend.models.database import get_db
from backend.models.schemas import KnowledgeItem

from pydantic import BaseModel

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


class PatchItemBody(BaseModel):
    raw_content: Optional[str] = None
    title: Optional[str] = None


@router.patch("/{item_id}")
async def patch_knowledge_item(item_id: str, body: PatchItemBody, db: AsyncSession = Depends(get_db)):
    """Partially update a knowledge item (e.g. inline edit of raw_content)."""
    result = await db.execute(select(KnowledgeItem).where(KnowledgeItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    if body.raw_content is not None:
        item.raw_content = body.raw_content
    if body.title is not None:
        item.title = body.title
    await db.commit()
    return {"ok": True}




@router.get("/stats")
async def get_knowledge_stats(db: AsyncSession = Depends(get_db)):
    """Real dashboard stats: total items, breakdown by type, recent activity."""
    total = await db.scalar(
        select(func.count()).select_from(KnowledgeItem).where(KnowledgeItem.deleted_at.is_(None))
    )

    type_counts = await db.execute(
        select(KnowledgeItem.type, func.count().label("count"))
        .where(KnowledgeItem.deleted_at.is_(None))
        .group_by(KnowledgeItem.type)
    )
    by_type = {row.type: row.count for row in type_counts}

    recent = await db.execute(
        select(KnowledgeItem)
        .where(KnowledgeItem.deleted_at.is_(None))
        .order_by(KnowledgeItem.created_at.desc())
        .limit(5)
    )

    return {
        "total": total,
        "by_type": by_type,
        "bookmarked": await db.scalar(
            select(func.count()).where(
                KnowledgeItem.is_bookmarked.is_(True),
                KnowledgeItem.deleted_at.is_(None),
            )
        ),
        "recent": [
            {
                "id": str(item.id),
                "type": item.type,
                "title": item.title,
                "created_at": item.created_at.isoformat() if item.created_at else None,
            }
            for item in recent.scalars()
        ],
    }

@router.get("")
async def list_knowledge_items(
    type: str | None = None,
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    """List knowledge items, optionally filtered by type."""
    query = """
        SELECT id, type, title, summary, source_url, author,
               key_concepts, tags, difficulty, knowledge_tree,
               reading_time_minutes, importance_score, created_at,
               is_bookmarked
        FROM knowledge_items
        WHERE deleted_at IS NULL
    """
    params: dict = {}

    if type:
        query += " AND type = :type"
        params["type"] = type

    query += " ORDER BY created_at DESC LIMIT :limit OFFSET :offset"
    params["limit"] = limit
    params["offset"] = offset

    result = await db.execute(text(query), params)
    rows = result.fetchall()
    return {"items": [dict(row._mapping) for row in rows], "total": len(rows)}


@router.get("/linkedin")
async def get_linkedin_items(
    domain: Optional[str] = Query(None),
    difficulty: Optional[int] = Query(None, ge=1, le=5),
    bookmarked: Optional[bool] = Query(None),
    sort: str = Query("newest"),
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    """Return all LinkedIn knowledge items with their attachments."""
    query = select(KnowledgeItem).options(selectinload(KnowledgeItem.attachments)).where(
        KnowledgeItem.type == "linkedin",
        KnowledgeItem.deleted_at.is_(None)
    )

    if domain:
        query = query.where(KnowledgeItem.knowledge_domain == domain)
    if difficulty:
        query = query.where(KnowledgeItem.difficulty == difficulty)
    if bookmarked is not None:
        query = query.where(KnowledgeItem.is_bookmarked.is_(bookmarked))

    if sort == "oldest":
        query = query.order_by(KnowledgeItem.created_at.asc())
    elif sort == "difficulty":
        query = query.order_by(KnowledgeItem.difficulty.desc().nullslast())
    elif sort == "importance":
        query = query.order_by(KnowledgeItem.importance_score.desc().nullslast())
    else:
        query = query.order_by(KnowledgeItem.created_at.desc())

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    items = result.scalars().all()

    return [
        {
            "id":             str(item.id),
            "type":           item.type,
            "title":          item.title,
            "summary":        item.summary,
            "source_url":     item.source_url,
            "author":         item.author,
            "key_concepts":   item.key_concepts or [],
            "tags":           item.tags or [],
            "difficulty":     item.difficulty,
            "reading_time":   item.reading_time_minutes,
            "knowledge_tree": item.knowledge_tree,
            "knowledge_domain": item.knowledge_domain,
            "is_bookmarked": item.is_bookmarked,
            "created_at":     item.created_at.isoformat(),
            "attachments": [
                {
                    "id":         str(att.id),
                    "filename":   att.filename,
                    "minio_path": att.minio_path,
                    "file_type":  att.file_type,
                    "page_count": att.page_count,
                }
                for att in item.attachments
            ],
        }
        for item in items
    ]


@router.get("/interview")
async def get_interview_items(
    domain: Optional[str] = Query(None),
    difficulty: Optional[int] = Query(None, ge=1, le=5),
    bookmarked: Optional[bool] = Query(None),
    sort: str = Query("newest"),
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    """Return all Interview QnA items with their attachments."""
    query = select(KnowledgeItem).options(selectinload(KnowledgeItem.attachments)).where(
        KnowledgeItem.type == "interview_qna",
        KnowledgeItem.deleted_at.is_(None)
    )

    if domain:
        query = query.where(KnowledgeItem.knowledge_domain == domain)
    if difficulty:
        query = query.where(KnowledgeItem.difficulty == difficulty)
    if bookmarked is not None:
        query = query.where(KnowledgeItem.is_bookmarked.is_(bookmarked))

    if sort == "oldest":
        query = query.order_by(KnowledgeItem.created_at.asc())
    elif sort == "difficulty":
        query = query.order_by(KnowledgeItem.difficulty.desc().nullslast())
    elif sort == "importance":
        query = query.order_by(KnowledgeItem.importance_score.desc().nullslast())
    else:
        query = query.order_by(KnowledgeItem.created_at.desc())

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    items = result.scalars().all()

    return [
        {
            "id":             str(item.id),
            "type":           item.type,
            "title":          item.title,
            "summary":        item.summary,
            "source_url":     item.source_url,
            "author":         item.author,
            "key_concepts":   item.key_concepts or [],
            "tags":           item.tags or [],
            "difficulty":     item.difficulty,
            "reading_time":   item.reading_time_minutes,
            "knowledge_tree": item.knowledge_tree,
            "knowledge_domain": item.knowledge_domain,
            "is_bookmarked": item.is_bookmarked,
            "created_at":     item.created_at.isoformat(),
            "attachments": [
                {
                    "id":         str(att.id),
                    "filename":   att.filename,
                    "minio_path": att.minio_path,
                    "file_type":  att.file_type,
                    "page_count": att.page_count,
                }
                for att in item.attachments
            ],
        }
        for item in items
    ]


@router.get("/notes")
async def get_note_items(
    domain: Optional[str] = Query(None),
    difficulty: Optional[int] = Query(None, ge=1, le=5),
    bookmarked: Optional[bool] = Query(None),
    sort: str = Query("newest"),
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    """Return all AI Notes items."""
    query = select(KnowledgeItem).options(selectinload(KnowledgeItem.attachments)).where(
        KnowledgeItem.type == "note",
        KnowledgeItem.deleted_at.is_(None)
    )

    if domain:
        query = query.where(KnowledgeItem.knowledge_domain == domain)
    if difficulty:
        query = query.where(KnowledgeItem.difficulty == difficulty)
    if bookmarked is not None:
        query = query.where(KnowledgeItem.is_bookmarked.is_(bookmarked))

    if sort == "oldest":
        query = query.order_by(KnowledgeItem.created_at.asc())
    elif sort == "difficulty":
        query = query.order_by(KnowledgeItem.difficulty.desc().nullslast())
    elif sort == "importance":
        query = query.order_by(KnowledgeItem.importance_score.desc().nullslast())
    else:
        query = query.order_by(KnowledgeItem.created_at.desc())

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    items = result.scalars().all()

    return [
        {
            "id":               str(item.id),
            "type":             item.type,
            "title":            item.title,
            "summary":          item.summary,
            "raw_content":      item.raw_content,
            "source_url":       item.source_url,
            "author":           item.author,
            "key_concepts":     item.key_concepts or [],
            "tags":             item.tags or [],
            "difficulty":           item.difficulty,
            "reading_time_minutes": item.reading_time_minutes,
            "importance_score":     item.importance_score,
            "knowledge_tree":       item.knowledge_tree,
            "knowledge_domain":     item.knowledge_domain,
            "is_bookmarked": item.is_bookmarked,
            "created_at":           item.created_at.isoformat(),
            "attachments": [
                {
                    "id":         str(att.id),
                    "filename":   att.filename,
                    "minio_path": att.minio_path,
                    "file_type":  att.file_type,
                    "page_count": att.page_count,
                }
                for att in item.attachments
            ],
        }
        for item in items
    ]


@router.get("/blogs")
async def get_blog_items(
    domain: Optional[str] = Query(None),
    difficulty: Optional[int] = Query(None, ge=1, le=5),
    bookmarked: Optional[bool] = Query(None),
    sort: str = Query("newest"),
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    """Return all Blog knowledge items."""
    query = select(KnowledgeItem).options(selectinload(KnowledgeItem.attachments)).where(
        KnowledgeItem.type == "blog",
        KnowledgeItem.deleted_at.is_(None)
    )

    if domain:
        query = query.where(KnowledgeItem.knowledge_domain == domain)
    if difficulty:
        query = query.where(KnowledgeItem.difficulty == difficulty)
    if bookmarked is not None:
        query = query.where(KnowledgeItem.is_bookmarked.is_(bookmarked))

    if sort == "oldest":
        query = query.order_by(KnowledgeItem.created_at.asc())
    elif sort == "difficulty":
        query = query.order_by(KnowledgeItem.difficulty.desc().nullslast())
    elif sort == "importance":
        query = query.order_by(KnowledgeItem.importance_score.desc().nullslast())
    else:
        query = query.order_by(KnowledgeItem.created_at.desc())

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    items = result.scalars().all()

    return [
        {
            "id":                   str(item.id),
            "type":                 item.type,
            "title":                item.title,
            "summary":              item.summary,
            "source_url":           item.source_url,
            "author":               item.author,
            "key_concepts":         item.key_concepts or [],
            "tags":                 item.tags or [],
            "difficulty":           item.difficulty,
            "reading_time_minutes": item.reading_time_minutes,
            "importance_score":     item.importance_score,
            "knowledge_tree":       item.knowledge_tree,
            "knowledge_domain":     None,
            "is_bookmarked": item.is_bookmarked,
            "created_at":           item.created_at.isoformat(),
            "attachments": [
                {
                    "id":         str(att.id),
                    "filename":   att.filename,
                    "minio_path": att.minio_path,
                    "file_type":  att.file_type,
                    "page_count": att.page_count,
                }
                for att in item.attachments
            ],
        }
        for item in items
    ]


@router.get("/papers")
async def get_paper_items(
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Return all Research Paper knowledge items."""
    result = await db.execute(
        select(KnowledgeItem)
        .options(selectinload(KnowledgeItem.attachments))
        .where(KnowledgeItem.type == "research")
        .order_by(KnowledgeItem.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    items = result.scalars().all()

    return [
        {
            "id":                   str(item.id),
            "type":                 item.type,
            "title":                item.title,
            "summary":              item.summary,
            "source_url":           item.source_url,
            "author":               item.author,
            "key_concepts":         item.key_concepts or [],
            "tags":                 item.tags or [],
            "difficulty":           item.difficulty,
            "reading_time_minutes": item.reading_time_minutes,
            "importance_score":     item.importance_score,
            "knowledge_tree":       item.knowledge_tree,
            "knowledge_domain":     item.knowledge_domain,
            "is_bookmarked": item.is_bookmarked,
            "created_at":           item.created_at.isoformat(),
            "attachments": [
                {
                    "id":         str(att.id),
                    "filename":   att.filename,
                    "minio_path": att.minio_path,
                    "file_type":  att.file_type,
                    "page_count": att.page_count,
                }
                for att in item.attachments
            ],
        }
        for item in items
    ]


@router.get("/github")
async def get_github_items(
    domain: Optional[str] = Query(None),
    difficulty: Optional[int] = Query(None, ge=1, le=5),
    bookmarked: Optional[bool] = Query(None),
    sort: str = Query("newest"),
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    """Return all GitHub repository knowledge items."""
    query = select(KnowledgeItem).options(selectinload(KnowledgeItem.attachments)).where(
        KnowledgeItem.type == "github",
        KnowledgeItem.deleted_at.is_(None)
    )

    if domain:
        query = query.where(KnowledgeItem.knowledge_domain == domain)
    if difficulty:
        query = query.where(KnowledgeItem.difficulty == difficulty)
    if bookmarked is not None:
        query = query.where(KnowledgeItem.is_bookmarked.is_(bookmarked))

    if sort == "oldest":
        query = query.order_by(KnowledgeItem.created_at.asc())
    elif sort == "difficulty":
        query = query.order_by(KnowledgeItem.difficulty.desc().nullslast())
    elif sort == "importance":
        query = query.order_by(KnowledgeItem.importance_score.desc().nullslast())
    else:
        query = query.order_by(KnowledgeItem.created_at.desc())

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    items = result.scalars().all()

    return [
        {
            "id":                   str(item.id),
            "type":                 item.type,
            "title":                item.title,
            "summary":              item.summary,
            "source_url":           item.source_url,
            "author":               item.author,
            "key_concepts":         item.key_concepts or [],
            "tags":                 item.tags or [],
            "difficulty":           item.difficulty,
            "knowledge_tree":       item.knowledge_tree,
            "knowledge_domain":     item.knowledge_domain,
            "repo_stars":           item.repo_stars,
            "repo_language":        item.repo_language,
            "tech_stack":           item.tech_stack or [],
            "architecture_summary": item.architecture_summary,
            "is_bookmarked": item.is_bookmarked,
            "created_at":           item.created_at.isoformat(),
            "attachments": [
                {
                    "id":         str(att.id),
                    "filename":   att.filename,
                    "minio_path": att.minio_path,
                    "file_type":  att.file_type,
                    "page_count": att.page_count,
                }
                for att in item.attachments
            ],
        }
        for item in items
    ]


def _safe_load_chapters(chapters_raw: str | None) -> list:
    """Safely parse the chapters JSON column; return [] on any failure."""
    if not chapters_raw:
        return []
    try:
        parsed = json.loads(chapters_raw)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


@router.get("/youtube")
async def get_youtube_items(
    domain: Optional[str] = Query(None),
    difficulty: Optional[int] = Query(None, ge=1, le=5),
    bookmarked: Optional[bool] = Query(None),
    sort: str = Query("newest"),
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    """Return all YouTube video knowledge items."""
    query = select(KnowledgeItem).options(selectinload(KnowledgeItem.attachments)).where(
        KnowledgeItem.type.in_(["youtube", "youtube_video", "youtube_playlist"]),
        KnowledgeItem.deleted_at.is_(None)
    )

    if domain:
        query = query.where(KnowledgeItem.knowledge_domain == domain)
    if difficulty:
        query = query.where(KnowledgeItem.difficulty == difficulty)
    if bookmarked is not None:
        query = query.where(KnowledgeItem.is_bookmarked.is_(bookmarked))

    if sort == "oldest":
        query = query.order_by(KnowledgeItem.created_at.asc())
    elif sort == "difficulty":
        query = query.order_by(KnowledgeItem.difficulty.desc().nullslast())
    elif sort == "importance":
        query = query.order_by(KnowledgeItem.importance_score.desc().nullslast())
    else:
        query = query.order_by(KnowledgeItem.created_at.desc())

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    items = result.scalars().all()

    return [
        {
            "id":                   str(item.id),
            "type":                 item.type,
            "title":                item.title,
            "summary":              item.summary,
            "source_url":           item.source_url,
            "author":               item.author,
            "key_concepts":         item.key_concepts or [],
            "tags":                 item.tags or [],
            "difficulty":           item.difficulty,
            "knowledge_tree":       item.knowledge_tree,
            "knowledge_domain":     item.knowledge_domain,
            "video_duration_seconds": item.video_duration_seconds,
            "channel_name":         item.channel_name,
            "thumbnail_path":       item.thumbnail_path,
            "chapters":             _safe_load_chapters(item.chapters),
            "transcript":           item.transcript,
            "playlist_id":          item.playlist_id,
            "video_count":          len(_safe_load_chapters(item.chapters)) if item.type == "youtube_playlist" else None,
            "is_bookmarked": item.is_bookmarked,
            "created_at":           item.created_at.isoformat(),
            "attachments": [
                {
                    "id":         str(att.id),
                    "filename":   att.filename,
                    "minio_path": att.minio_path,
                    "file_type":  att.file_type,
                    "page_count": att.page_count,
                }
                for att in item.attachments
            ],
        }
        for item in items
    ]


@router.get("/courses")
async def get_course_items(
    domain: Optional[str] = Query(None),
    difficulty: Optional[int] = Query(None, ge=1, le=5),
    bookmarked: Optional[bool] = Query(None),
    sort: str = Query("newest"),
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    """Return all Course knowledge items."""
    query = select(KnowledgeItem).options(selectinload(KnowledgeItem.attachments)).where(
        KnowledgeItem.type == "course",
        KnowledgeItem.deleted_at.is_(None)
    )

    if domain:
        query = query.where(KnowledgeItem.knowledge_domain == domain)
    if difficulty:
        query = query.where(KnowledgeItem.difficulty == difficulty)
    if bookmarked is not None:
        query = query.where(KnowledgeItem.is_bookmarked.is_(bookmarked))

    if sort == "oldest":
        query = query.order_by(KnowledgeItem.created_at.asc())
    elif sort == "difficulty":
        query = query.order_by(KnowledgeItem.difficulty.desc().nullslast())
    elif sort == "importance":
        query = query.order_by(KnowledgeItem.importance_score.desc().nullslast())
    else:
        query = query.order_by(KnowledgeItem.created_at.desc())

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    items = result.scalars().all()

    return [
        {
            "id":                   str(item.id),
            "type":                 item.type,
            "title":                item.title,
            "summary":              item.summary,
            "source_url":           item.source_url,
            "instructor":           item.instructor,
            "rating":               item.rating,
            "price":                item.price,
            "syllabus":             _safe_load_chapters(item.syllabus), # reusing json loader
            "prerequisites":        item.prerequisites or [],
            "key_concepts":         item.key_concepts or [],
            "tags":                 item.tags or [],
            "difficulty":           item.difficulty,
            "reading_time":         item.reading_time_minutes,
            "knowledge_tree":       item.knowledge_tree,
            "knowledge_domain":     item.knowledge_domain,
            "is_bookmarked": item.is_bookmarked,
            "created_at":           item.created_at.isoformat(),
            "attachments": [
                {
                    "id":         str(att.id),
                    "filename":   att.filename,
                    "minio_path": att.minio_path,
                    "file_type":  att.file_type,
                    "page_count": att.page_count,
                }
                for att in item.attachments
            ],
        }
        for item in items
    ]


@router.get("/certifications")
async def get_certification_items(
    domain: Optional[str] = Query(None),
    difficulty: Optional[int] = Query(None, ge=1, le=5),
    bookmarked: Optional[bool] = Query(None),
    sort: str = Query("newest"),
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    """Return all Certification knowledge items."""
    query = select(KnowledgeItem).options(selectinload(KnowledgeItem.attachments)).where(
        KnowledgeItem.type == "certification",
        KnowledgeItem.deleted_at.is_(None)
    )

    if domain:
        query = query.where(KnowledgeItem.knowledge_domain == domain)
    if difficulty:
        query = query.where(KnowledgeItem.difficulty == difficulty)
    if bookmarked is not None:
        query = query.where(KnowledgeItem.is_bookmarked.is_(bookmarked))

    if sort == "oldest":
        query = query.order_by(KnowledgeItem.created_at.asc())
    elif sort == "difficulty":
        query = query.order_by(KnowledgeItem.difficulty.desc().nullslast())
    elif sort == "importance":
        query = query.order_by(KnowledgeItem.importance_score.desc().nullslast())
    else:
        query = query.order_by(KnowledgeItem.created_at.desc())

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    items = result.scalars().all()

    return [
        {
            "id":                   str(item.id),
            "type":                 item.type,
            "title":                item.title,
            "summary":              item.summary,
            "source_url":           item.source_url,
            "issuer":               item.issuer,
            "issue_date":           item.issue_date,
            "valid_until":          item.valid_until,
            "cert_id":              item.cert_id,
            "exam_topics":          item.exam_topics or [],
            "key_concepts":         item.key_concepts or [],
            "tags":                 item.tags or [],
            "difficulty":           item.difficulty,
            "knowledge_tree":       item.knowledge_tree,
            "knowledge_domain":     item.knowledge_domain,
            "is_bookmarked": item.is_bookmarked,
            "created_at":           item.created_at.isoformat(),
            "attachments": [
                {
                    "id":         str(att.id),
                    "filename":   att.filename,
                    "minio_path": att.minio_path,
                    "file_type":  att.file_type,
                    "page_count": att.page_count,
                }
                for att in item.attachments
            ],
        }
        for item in items
    ]



@router.patch("/{item_id}/bookmark")
async def toggle_bookmark(item_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KnowledgeItem).where(KnowledgeItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    item.is_bookmarked = not item.is_bookmarked
    await db.commit()
    return {"id": item_id, "is_bookmarked": item.is_bookmarked}

@router.delete("/{item_id}")
async def soft_delete_knowledge(item_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KnowledgeItem).where(KnowledgeItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    item.deleted_at = datetime.utcnow()
    await db.commit()
    return {"id": item_id, "deleted": True}

@router.post("/{item_id}/restore")
async def restore_knowledge(item_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KnowledgeItem).where(KnowledgeItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    item.deleted_at = None
    await db.commit()
    return {"id": item_id, "restored": True}

@router.get("/trash")
async def list_trash(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(KnowledgeItem)
        .where(KnowledgeItem.deleted_at.is_not(None))
        .order_by(KnowledgeItem.deleted_at.desc())
    )
    items = result.scalars().all()
    return [
        {
            "id": str(item.id),
            "type": item.type,
            "title": item.title,
            "summary": item.summary,
            "source_url": item.source_url,
            "difficulty": item.difficulty,
            "knowledge_domain": item.knowledge_domain,
            "created_at": item.created_at.isoformat() if item.created_at else None,
            "is_bookmarked": item.is_bookmarked,
        }
        for item in items
    ]

@router.get("/{item_id}")
async def get_knowledge_item(item_id: str, db: AsyncSession = Depends(get_db)):
    """Get a single knowledge item by ID, including its attachments."""
    result = await db.execute(
        select(KnowledgeItem)
        .options(selectinload(KnowledgeItem.attachments))
        .where(KnowledgeItem.id == item_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        return {"error": "Knowledge item not found"}

    return {
        "id":             str(item.id),
        "type":           item.type,
        "title":          item.title,
        "summary":        item.summary,
        "raw_content":    item.raw_content,
        "source_url":     item.source_url,
        "author":         item.author,
        "key_concepts":   item.key_concepts or [],
        "tags":           item.tags or [],
        "difficulty":     item.difficulty,
        "reading_time":   item.reading_time_minutes,
        "knowledge_tree": item.knowledge_tree,
        "knowledge_domain": item.knowledge_domain,
        "is_bookmarked": item.is_bookmarked,
            "created_at":     item.created_at.isoformat(),
        "attachments": [
            {
                "id":         str(att.id),
                "filename":   att.filename,
                "minio_path": att.minio_path,
                "file_type":  att.file_type,
                "page_count": att.page_count,
            }
            for att in item.attachments
        ],
    }





@router.get("/{item_id}/export")
async def export_knowledge(item_id: str, format: str = Query("markdown"), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KnowledgeItem).where(KnowledgeItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    
    if format == "json":
        return {
            "id": str(item.id),
            "title": item.title,
            "summary": item.summary,
            "raw_content": item.raw_content,
            "source_url": item.source_url,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        }
    else:
        # Markdown format
        md = f"# {item.title or 'Untitled'}\\n\\n"
        md += f"**Source**: {item.source_url or 'N/A'}\\n"
        md += f"**Type**: {item.type}\\n\\n"
        if item.summary:
            md += f"## Summary\\n{item.summary}\\n\\n"
        if item.raw_content:
            md += f"## Content\\n{item.raw_content}\\n"
        
        from fastapi.responses import PlainTextResponse
        return PlainTextResponse(md)

@router.get("/trash")
async def list_trash(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(KnowledgeItem)
        .where(KnowledgeItem.deleted_at.is_not(None))
        .order_by(KnowledgeItem.deleted_at.desc())
    )
    items = result.scalars().all()
    return [
        {
            "id": str(item.id),
            "type": item.type,
            "title": item.title,
            "summary": item.summary,
            "source_url": item.source_url,
            "difficulty": item.difficulty,
            "knowledge_domain": item.knowledge_domain,
            "created_at": item.created_at.isoformat() if item.created_at else None,
            "is_bookmarked": item.is_bookmarked,
        }
        for item in items
    ]

