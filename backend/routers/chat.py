import json
import uuid
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from backend.models.database import get_db
from backend.models.schemas import ChatSession, ChatMessage
from backend.services.chat_service import answer_with_rag

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("")
async def chat_stream(request: dict, db: AsyncSession = Depends(get_db)):
    """
    SSE endpoint for streaming RAG chat.
    Body: { "message": "...", "session_id": "..." | null, "filters": { "type": "..." } | null }
    """
    user_message = request.get("message", "").strip()
    if not user_message:
        raise HTTPException(status_code=400, detail="message is required")

    session_id = request.get("session_id")
    filters = request.get("filters")

    # Resolve or create session
    if session_id:
        try:
            sid = uuid.UUID(session_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid session_id")
        result = await db.execute(
            select(ChatSession).where(ChatSession.id == sid)
        )
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
    else:
        session = ChatSession(title=user_message[:60])
        db.add(session)
        await db.flush()
        sid = session.id

    # Save user message
    db.add(ChatMessage(session_id=sid, role="user", content=user_message))
    await db.commit()

    async def event_stream():
        full_answer = ""
        citations = []
        async for event in answer_with_rag(user_message, session_id=str(sid), filters=filters):
            if event["type"] == "token":
                full_answer += event["data"]
            elif event["type"] == "citations":
                citations = event["data"]
            yield f"event: {event['type']}\ndata: {json.dumps(event['data'])}\n\n"

        # Save assistant message
        async with db.begin():
            db.add(
                ChatMessage(
                    session_id=sid,
                    role="assistant",
                    content=full_answer,
                    citations=[json.dumps(c) for c in citations] if citations else None,
                )
            )
        yield f"event: done\ndata: {json.dumps({'session_id': str(sid)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/sessions")
async def list_sessions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChatSession).order_by(ChatSession.updated_at.desc())
    )
    sessions = result.scalars().all()
    # Auto-prune sessions beyond 20
    if len(sessions) > 20:
        from sqlalchemy import delete
        from backend.models.schemas import ChatMessage
        to_delete = sessions[20:]
        for session in to_delete:
            await db.execute(delete(ChatMessage).where(ChatMessage.session_id == session.id))
            await db.delete(session)
        await db.commit()
        sessions = sessions[:20]
        
    return {
        "sessions": [
            {
                "id": str(s.id),
                "title": s.title,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "updated_at": s.updated_at.isoformat() if s.updated_at else None,
            }
            for s in sessions
        ]
    }

@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, db: AsyncSession = Depends(get_db)):
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session_id")
        
    result = await db.execute(select(ChatSession).where(ChatSession.id == sid))
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    from sqlalchemy import delete
    from backend.models.schemas import ChatMessage
    await db.execute(delete(ChatMessage).where(ChatMessage.session_id == sid))
    await db.delete(session)
    await db.commit()
    
    return {"success": True}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, db: AsyncSession = Depends(get_db)):
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.id == sid)
        .options(selectinload(ChatSession.messages))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "id": str(session.id),
        "title": session.title,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "updated_at": session.updated_at.isoformat() if session.updated_at else None,
        "messages": [
            {
                "id": str(m.id),
                "role": m.role,
                "content": m.content,
                "citations": [json.loads(c) for c in m.citations] if m.citations else [],
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in session.messages
        ],
    }
