"""
knowledge.py — Knowledge item API endpoints.
Phase 1: adds /linkedin endpoint with attachments + expands /{id} to include attachments.
"""
import json
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
from sqlalchemy.orm import selectinload
from backend.models.database import get_db
from backend.models.schemas import KnowledgeItem

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


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
               reading_time_minutes, importance_score, created_at
        FROM knowledge_items
    """
    params: dict = {}

    if type:
        query += " WHERE type = :type"
        params["type"] = type

    query += " ORDER BY created_at DESC LIMIT :limit OFFSET :offset"
    params["limit"] = limit
    params["offset"] = offset

    result = await db.execute(text(query), params)
    rows = result.fetchall()
    return {"items": [dict(row._mapping) for row in rows], "total": len(rows)}


@router.get("/linkedin")
async def get_linkedin_items(
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    """Return all LinkedIn knowledge items with their attachments."""
    result = await db.execute(
        select(KnowledgeItem)
        .options(selectinload(KnowledgeItem.attachments))
        .where(KnowledgeItem.type == "linkedin")
        .order_by(KnowledgeItem.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
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
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    """Return all Interview QnA items with their attachments."""
    result = await db.execute(
        select(KnowledgeItem)
        .options(selectinload(KnowledgeItem.attachments))
        .where(KnowledgeItem.type == "interview_qna")
        .order_by(KnowledgeItem.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
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
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    """Return all AI Notes items."""
    result = await db.execute(
        select(KnowledgeItem)
        .options(selectinload(KnowledgeItem.attachments))
        .where(KnowledgeItem.type == "note")
        .order_by(KnowledgeItem.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
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
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    """Return all Blog knowledge items."""
    result = await db.execute(
        select(KnowledgeItem)
        .options(selectinload(KnowledgeItem.attachments))
        .where(KnowledgeItem.type == "blog")
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
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    """Return all GitHub repository knowledge items."""
    result = await db.execute(
        select(KnowledgeItem)
        .options(selectinload(KnowledgeItem.attachments))
        .where(KnowledgeItem.type == "github")
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
            "knowledge_tree":       item.knowledge_tree,
            "knowledge_domain":     item.knowledge_domain,
            "repo_stars":           item.repo_stars,
            "repo_language":        item.repo_language,
            "tech_stack":           item.tech_stack or [],
            "architecture_summary": item.architecture_summary,
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
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    """Return all YouTube video knowledge items."""
    result = await db.execute(
        select(KnowledgeItem)
        .options(selectinload(KnowledgeItem.attachments))
        .where(KnowledgeItem.type.in_(["youtube", "youtube_video", "youtube_playlist"]))
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
            "knowledge_tree":       item.knowledge_tree,
            "knowledge_domain":     item.knowledge_domain,
            "video_duration_seconds": item.video_duration_seconds,
            "channel_name":         item.channel_name,
            "thumbnail_path":       item.thumbnail_path,
            "chapters":             _safe_load_chapters(item.chapters),
            "transcript":           item.transcript,
            "playlist_id":          item.playlist_id,
            "video_count":          len(_safe_load_chapters(item.chapters)) if item.type == "youtube_playlist" else None,
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
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    """Return all Course knowledge items."""
    result = await db.execute(
        select(KnowledgeItem)
        .options(selectinload(KnowledgeItem.attachments))
        .where(KnowledgeItem.type == "course")
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
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    """Return all Certification knowledge items."""
    result = await db.execute(
        select(KnowledgeItem)
        .options(selectinload(KnowledgeItem.attachments))
        .where(KnowledgeItem.type == "certification")
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


@router.delete("/{item_id}")
async def delete_knowledge_item_endpoint(item_id: str):
    """Delete a single knowledge item by ID."""
    from backend.services.storage_service import delete_knowledge_item
    success = await delete_knowledge_item(item_id)
    if not success:
        return {"error": "Failed to delete knowledge item"}
    return {"message": "Deleted successfully"}
