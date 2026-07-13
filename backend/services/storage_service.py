"""
storage_service.py — Saves a completed BrainVaultState to PostgreSQL + Qdrant.
Phase 1: also saves attachments and generates/upserts embeddings.
"""
import json
import uuid
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.database import AsyncSessionLocal
from backend.agents.state import BrainVaultState


async def save_knowledge_item(state: BrainVaultState) -> uuid.UUID:
    """
    Persist the enriched state to:
    1. PostgreSQL — knowledge_items + attachments rows
    2. Qdrant — embedding vector for semantic search

    Also updates the corresponding ingestion_job status to 'done'.
    Returns the new knowledge_item UUID (or the first item id for QnA/playlists).
    """
    item_id = uuid.uuid4()
    job_id = state.get("job_id")
    input_type = state.get("input_type") or "plaintext"
    metadata = state.get("metadata") or {}

    async with AsyncSessionLocal() as db:
        qna_pairs = state.get("qna_pairs")
        inserted_items = []

        # ── Interview Q&A: one item per Q&A pair ────────────────────────────────
        if qna_pairs and len(qna_pairs) > 0:
            for pair in qna_pairs:
                q_id = uuid.uuid4()
                await db.execute(text("""
                    INSERT INTO knowledge_items (
                        id, type, title, summary, raw_content,
                        source_url, author,
                        key_concepts, tags, difficulty,
                        reading_time_minutes, importance_score,
                        knowledge_tree, knowledge_domain, embedding_id
                    ) VALUES (
                        :id, :type, :title, :summary, :raw_content,
                        :source_url, :author,
                        :key_concepts, :tags, :difficulty,
                        :reading_time_minutes, :importance_score,
                        :knowledge_tree, :knowledge_domain, :embedding_id
                    )
                """), {
                    "id":                   str(q_id),
                    "type":                 "interview_qna",
                    "title":                pair.get("q", "Untitled Question"),
                    "summary":              pair.get("a", ""),
                    "raw_content":          pair.get("a", ""),
                    "source_url":           state.get("source_url") or state.get("url") or state.get("raw_input", ""),
                    "author":               state.get("author") or "",
                    "key_concepts":         state.get("key_concepts") or [],
                    "tags":                 state.get("tags") or [],
                    "difficulty":           state.get("difficulty"),
                    "reading_time_minutes": metadata.get("reading_time_minutes"),
                    "importance_score":     metadata.get("importance_score"),
                    "knowledge_tree":       pair.get("topic", state.get("knowledge_tree")),
                    "knowledge_domain":     state.get("knowledge_domain"),
                    "embedding_id":         None,
                })
                inserted_items.append({
                    "id": str(q_id),
                    "text": f"Q: {pair.get('q')}\nA: {pair.get('a')}",
                    "topic": pair.get("topic", state.get("knowledge_tree"))
                })

        # ── YouTube playlist: single redirect item only ─────────────────────
        elif input_type == "youtube_playlist":
            playlist_id = state.get("playlist_id") or metadata.get("playlist_id")

            await db.execute(text("""
                INSERT INTO knowledge_items (
                    id, type, title, summary, raw_content,
                    source_url, author,
                    key_concepts, tags, difficulty,
                    reading_time_minutes, importance_score,
                    knowledge_tree, knowledge_domain, embedding_id,
                    video_duration_seconds, channel_name, thumbnail_path, chapters, transcript, playlist_id
                ) VALUES (
                    :id, :type, :title, :summary, :raw_content,
                    :source_url, :author,
                    :key_concepts, :tags, :difficulty,
                    :reading_time_minutes, :importance_score,
                    :knowledge_tree, :knowledge_domain, :embedding_id,
                    :video_duration_seconds, :channel_name, :thumbnail_path, :chapters, :transcript, :playlist_id
                )
            """), {
                "id":                   str(item_id),
                "type":                 "youtube_playlist",
                "title":                state.get("title") or metadata.get("title") or "Untitled Playlist",
                "summary":              state.get("summary") or "",
                "raw_content":          json.dumps({
                    "playlist_id": playlist_id,
                    "channel": metadata.get("channel"),
                    "description": metadata.get("description"),
                    "video_count": metadata.get("video_count") or 0,
                }),
                "source_url":           state.get("source_url") or state.get("raw_input", ""),
                "author":               state.get("author") or metadata.get("channel") or "",
                "key_concepts":         state.get("key_concepts") or [],
                "tags":                 state.get("tags") or [],
                "difficulty":           state.get("difficulty"),
                "reading_time_minutes": metadata.get("reading_time_minutes"),
                "importance_score":     metadata.get("importance_score"),
                "knowledge_tree":       state.get("knowledge_tree"),
                "knowledge_domain":     state.get("knowledge_domain"),
                "embedding_id":         None,
                "video_duration_seconds": None,
                "channel_name":         state.get("channel_name") or metadata.get("channel") or "",
                "thumbnail_path":       state.get("thumbnail_path"),
                "chapters":             None,
                "transcript":           None,
                "playlist_id":          playlist_id,
            })
            inserted_items.append({
                "id": str(item_id),
                "text": (state.get("extracted_text") or state.get("summary") or "")[:5000],
                "topic": state.get("knowledge_tree")
            })

        # ── Standard single knowledge item ────────────────────────────────────
        else:
            await db.execute(text("""
                INSERT INTO knowledge_items (
                    id, type, title, summary, raw_content,
                    source_url, author,
                    key_concepts, tags, difficulty,
                    reading_time_minutes, importance_score,
                    knowledge_tree, knowledge_domain, embedding_id,
                    repo_stars, repo_language, tech_stack, architecture_summary,
                    video_duration_seconds, channel_name, thumbnail_path, chapters, transcript, playlist_id
                ) VALUES (
                    :id, :type, :title, :summary, :raw_content,
                    :source_url, :author,
                    :key_concepts, :tags, :difficulty,
                    :reading_time_minutes, :importance_score,
                    :knowledge_tree, :knowledge_domain, :embedding_id,
                    :repo_stars, :repo_language, :tech_stack, :architecture_summary,
                    :video_duration_seconds, :channel_name, :thumbnail_path, :chapters, :transcript, :playlist_id
                )
            """), {
                "id":                   str(item_id),
                "type":                 input_type,
                "title":                state.get("title") or metadata.get("title") or "Untitled",
                "summary":              state.get("summary") or state.get("raw_input", "")[:500],
                "raw_content":          (state.get("raw_input") or state.get("extracted_text", ""))[:10000],
                "source_url":           state.get("source_url") or state.get("url") or state.get("raw_input", ""),
                "author":               state.get("author") or "",
                "key_concepts":         state.get("key_concepts") or [],
                "tags":                 state.get("tags") or [],
                "difficulty":           state.get("difficulty"),
                "reading_time_minutes": metadata.get("reading_time_minutes"),
                "importance_score":     metadata.get("importance_score"),
                "knowledge_tree":       state.get("knowledge_tree"),
                "knowledge_domain":     state.get("knowledge_domain"),
                "embedding_id":         None,
                "repo_stars":           state.get("repo_stars"),
                "repo_language":        state.get("repo_language"),
                "tech_stack":           state.get("tech_stack") or [],
                "architecture_summary": state.get("architecture_summary"),
                "video_duration_seconds": state.get("video_duration_seconds"),
                "channel_name":         state.get("channel_name"),
                "thumbnail_path":       state.get("thumbnail_path"),
                "chapters":             json.dumps(state.get("chapters") or []) if state.get("chapters") else None,
                "transcript":           ("\n".join([seg.get("text") or "" for seg in (state.get("transcript") or [])])[:20000]) if state.get("transcript") else None,
                "playlist_id":          state.get("playlist_id"),
            })
            inserted_items.append({
                "id": str(item_id),
                "text": (state.get("extracted_text") or state.get("summary") or state.get("raw_input", ""))[:5000],
                "topic": state.get("knowledge_tree")
            })

        # Save attachments (Phase 1: PDFs and carousel images)
        for att in (state.get("attachments") or []):
            if att.get("minio_path"):
                att_id = str(uuid.uuid4())
                await db.execute(text("""
                    INSERT INTO attachments (
                        id, knowledge_item_id, filename, minio_path,
                        file_type, file_size_bytes, page_count, extracted_text
                    ) VALUES (
                        :id, :knowledge_item_id, :filename, :minio_path,
                        :file_type, :file_size_bytes, :page_count, :extracted_text
                    )
                """), {
                    "id":                str(att_id),
                    "knowledge_item_id": str(item_id),
                    "filename":          att.get("filename", "unknown"),
                    "minio_path":        att["minio_path"],
                    "file_type":         att.get("file_type", "pdf"),
                    "file_size_bytes":   att.get("file_size_bytes"),
                    "page_count":        att.get("page_count"),
                    "extracted_text":    (att.get("extracted_text") or "")[:20000],
                })

        # Update job status to done
        if job_id:
            primary_item_id = inserted_items[0]["id"] if inserted_items else str(item_id)
            await db.execute(text("""
                UPDATE ingestion_jobs
                SET status = 'done',
                    detected_type = :detected_type,
                    knowledge_item_id = :knowledge_item_id,
                    updated_at = NOW()
                WHERE id = :job_id
            """), {
                "detected_type":      input_type,
                "knowledge_item_id":  primary_item_id,
                "job_id":             job_id,
            })

        await db.commit()

    # ── Embedding + Qdrant (best-effort — don't fail the whole save if this errors) ──
    try:
        from backend.services.embedding import generate_embedding
        from backend.services.qdrant import upsert_knowledge_item

        for item in inserted_items:
            embed_text = " ".join(filter(None, [
                state.get("title") or metadata.get("title", ""),
                item["text"],
                " ".join([c for c in (state.get("key_concepts") or []) if c]),
            ]))
            
            if embed_text.strip():
                embedding = await generate_embedding(embed_text)
                embedding_id = upsert_knowledge_item(
                    item_id=item["id"],
                    vector=embedding,
                    payload={
                        "type":           "interview_qna" if state.get("qna_pairs") else input_type,
                        "title":          state.get("title") or metadata.get("title", ""),
                        "summary":        item["text"][:500],
                        "tags":           state.get("tags") or [],
                        "key_concepts":   state.get("key_concepts") or [],
                        "difficulty":     state.get("difficulty", 3),
                        "knowledge_tree": item["topic"] or "",
                        "source_url":     state.get("source_url") or state.get("raw_input", ""),
                    }
                )

                # Write embedding_id back to PostgreSQL
                if embedding_id:
                    async with AsyncSessionLocal() as db:
                        await db.execute(text("""
                            UPDATE knowledge_items SET embedding_id = :eid WHERE id = :id
                        """), {"eid": embedding_id, "id": item["id"]})
                        await db.commit()
    except Exception as e:
        print(f"⚠️ Embedding/Qdrant upsert failed (non-fatal): {e}")

    print(f"✅ Knowledge item(s) saved: {len(inserted_items)} (type={input_type})")
    
    # Return the first item id (or job item id if not qna) so job tracking works
    return inserted_items[0]["id"] if inserted_items else item_id


async def mark_job_failed(job_id: str, error: str) -> None:
    """Mark an ingestion job as failed in PostgreSQL."""
    async with AsyncSessionLocal() as db:
        await db.execute(text("""
            UPDATE ingestion_jobs
            SET status = 'failed',
                error_message = :error,
                updated_at = NOW()
            WHERE id = :job_id
        """), {"error": error[:1000], "job_id": job_id})
        await db.commit()


async def delete_knowledge_item(item_id: str) -> bool:
    """
    Deletes a knowledge item and all associated data:
    1. Attachments from MinIO
    2. Embeddings from Qdrant
    3. Rows from PostgreSQL (attachments + knowledge_items)
    """
    from backend.services.minio import delete_object
    from backend.services.qdrant import client as qdrant_client
    from backend.config import settings

    async with AsyncSessionLocal() as db:
        # 1. Get attachments to delete from MinIO
        result = await db.execute(text("SELECT minio_path FROM attachments WHERE knowledge_item_id = :id"), {"id": item_id})
        attachments = result.fetchall()
        for row in attachments:
            if row.minio_path:
                delete_object(row.minio_path)

        # 2. Get embedding_id to delete from Qdrant
        result = await db.execute(text("SELECT embedding_id FROM knowledge_items WHERE id = :id"), {"id": item_id})
        row = result.fetchone()
        if row and row.embedding_id:
            try:
                # In Qdrant, point id is the embedding_id we saved
                qdrant_client.delete(
                    collection_name=settings.QDRANT_COLLECTION_NAME,
                    points_selector=[row.embedding_id]
                )
            except Exception as e:
                print(f"⚠️ Failed to delete from Qdrant: {e}")

        # 3. Delete from Postgres
        await db.execute(text("UPDATE ingestion_jobs SET knowledge_item_id = NULL WHERE knowledge_item_id = :id"), {"id": item_id})
        await db.execute(text("DELETE FROM attachments WHERE knowledge_item_id = :id"), {"id": item_id})
        await db.execute(text("DELETE FROM knowledge_items WHERE id = :id"), {"id": item_id})
        await db.commit()
    
    return True
