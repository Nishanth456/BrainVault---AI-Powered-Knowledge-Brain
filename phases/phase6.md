# 💬 Phase 6 — AI Chat (RAG over Your Knowledge)

> **Prerequisite**: Phase 5 complete — semantic search works, Qdrant stores embeddings with full payloads, and the frontend search UI is functional.
>
> **Goal**: Open AI Chat → ask anything → BrainVault answers using ONLY your personal knowledge base, with citations showing which saved items it used.
> **UI Rule**: Chat must stream token-by-token. Every AI answer must show clickable source cards below it. The reader "Ask AI" panel must reuse the same chat components.

---

## ✅ What You Ship at the End of Phase 6

```
1. Open the Chat page at /chat
2. Type: "What do I know about prompt engineering?"
3. Backend embeds the query, searches Qdrant for top 8 relevant chunks
4. Gemini 2.5 Flash answers using ONLY the retrieved context
5. Frontend shows the response streaming in character-by-character
6. Below the answer: "📚 Sources used" with 2-4 clickable cards
7. Click a source card → opens that knowledge item's detail page
8. Open a LinkedIn PDF reader → click "Ask AI" → ask about the document
9. Chat history is stored per session in PostgreSQL
10. Suggested questions appear based on your recent saves
```

---

## 📁 New Files to Create / Update

```
backend/
├── routers/
│   ├── chat.py                 ← NEW: POST /api/chat SSE endpoint
│   └── knowledge.py            ← UPDATE: add GET /api/knowledge/{id}/context
├── services/
│   ├── qdrant.py               ← UPDATE: add search_similar() RAG helper + chunk retrieval
│   ├── llm.py                  ← UPDATE: add streaming Gemini call for RAG
│   └── chat_service.py         ← NEW: build context, call LLM, extract citations
├── models/
│   └── schemas.py              ← UPDATE: add ChatSession + ChatMessage tables
├── agents/
│   └── chat_graph.py           ← NEW: LangGraph RAG subgraph (optional but consistent)
└── main.py                     ← UPDATE: register chat router

frontend/
├── app/chat/page.tsx           ← UPDATE: full chat interface
├── components/chat/
│   ├── ChatInterface.tsx       ← NEW: message list + input + streaming
│   ├── StreamingMessage.tsx    ← NEW: token-by-token display
│   ├── SourceCitationCard.tsx  ← NEW: clickable source card
│   ├── ChatHistorySidebar.tsx  ← NEW: session list
│   └── SuggestedQuestions.tsx  ← NEW: question chips
├── components/knowledge/
│   └── LinkedInReader.tsx      ← UPDATE: replace stub AI panel with ChatInterface
├── lib/api.ts                  ← UPDATE: add sendChatMessage() SSE helper
└── app/layout.tsx              ← UPDATE: ensure /chat nav link is active
```

---

## 🐍 Backend Implementation

### 1. Database — Chat History

Add two tables to `backend/models/schemas.py`:

```python
class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=datetime.utcnow)

    messages: Mapped[list["ChatMessage"]] = relationship(back_populates="session", order_by="ChatMessage.created_at")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("chat_sessions.id"))
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # user | assistant | system
    content: Mapped[str | None] = mapped_column(Text)
    citations: Mapped[list[str] | None] = mapped_column(ARRAY(Text))  # JSON strings of source metadata
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    session: Mapped["ChatSession"] = relationship(back_populates="messages")
```

Run Alembic migration or create the tables manually.

### 2. `backend/services/qdrant.py` — RAG Retrieval

Add a helper that returns the top-k most relevant knowledge items with their full payload and a snippet of raw content if available.

```python
async def search_for_rag(
    query: str,
    limit: int = 8,
    filters: dict | None = None,
) -> list[dict]:
    """
    Retrieve top-k knowledge chunks for RAG.
    Returns payloads enriched with score and id.
    """
    results = await search_knowledge(query, limit=limit, filters=filters)
    # search_knowledge already returns payloads with score/id.
    # We just ensure the list is sorted by score descending.
    return sorted(results, key=lambda x: x.get("score", 0), reverse=True)
```

### 3. `backend/services/chat_service.py` — Context Builder

```python
import json
from backend.services.qdrant import search_for_rag
from backend.services.llm import stream_rag_response


async def build_rag_context(query: str, limit: int = 8) -> tuple[str, list[dict]]:
    """
    Search Qdrant and format retrieved items as a numbered context string.
    Returns (context_string, sources).
    """
    results = await search_for_rag(query, limit=limit)
    sources = []
    context_parts = []

    for idx, r in enumerate(results, start=1):
        source = {
            "index": idx,
            "id": r.get("id"),
            "type": r.get("type"),
            "title": r.get("title", "Untitled"),
            "author": r.get("author"),
            "summary": r.get("summary", ""),
            "knowledge_tree": r.get("knowledge_tree"),
            "score": r.get("score", 0),
        }
        sources.append(source)
        context_parts.append(
            f"[SOURCE {idx}]\n"
            f"Title: {source['title']}\n"
            f"Type: {source['type']}\n"
            f"Summary: {source['summary'][:800]}\n"
            f"Key concepts: {', '.join(r.get('key_concepts') or [])}\n"
        )

    return "\n\n".join(context_parts), sources


async def answer_with_rag(query: str, session_id: str | None = None):
    """
    Generator that yields SSE events: {type: "token", data: "..."}
    and finally {type: "citations", data: [...]}.
    """
    context, sources = await build_rag_context(query)

    system = (
        "You are BrainVault, a personal knowledge assistant. "
        "Answer the user's question using ONLY the provided sources from their knowledge base. "
        "If the sources don't contain enough information, say so honestly. "
        "Cite sources inline like [SOURCE 1] when you use them. "
        "Be concise but complete."
    )
    prompt = f"Question: {query}\n\nSources:\n{context}\n\nAnswer:"

    full_answer = ""
    async for token in stream_rag_response(system, prompt):
        full_answer += token
        yield {"type": "token", "data": token}

    yield {"type": "citations", "data": json.dumps(sources)}
```

### 4. `backend/services/llm.py` — Streaming RAG LLM

Add a streaming Gemini call:

```python
async def stream_rag_response(system: str, prompt: str):
    """
    Stream a Gemini 2.5 Flash response token-by-token.
    Yields text chunks as they arrive.
    """
    try:
        response = await acompletion(
            model="gemini/gemini-2.5-flash-preview-05-20",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            max_tokens=2000,
            stream=True,
        )
        async for chunk in response:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
    except Exception as e:
        print(f"⚠️ Gemini streaming failed: {e}")
        yield "I'm sorry, I couldn't generate a response right now. Please try again."
```

### 5. `backend/routers/chat.py` — SSE Endpoint

```python
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from backend.models.database import get_db
from backend.models.schemas import ChatSession, ChatMessage
from backend.services.chat_service import answer_with_rag
import json
import uuid

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("")
async def chat_stream(
    request: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Streaming RAG chat endpoint.
    Request: { "message": "...", "session_id": "..." | null }
    Response: text/event-stream with events:
      event: token\ndata: <chunk>
      event: citations\ndata: <json>
      event: done\ndata: <session_id>
    """
    message = request.get("message", "").strip()
    if not message:
        return StreamingResponse(iter(["event: error\ndata: Message required\n\n"]), media_type="text/event-stream")

    session_id = request.get("session_id")
    if session_id:
        session_id = str(session_id)
    else:
        # Create new session
        new_session = ChatSession(title=message[:60])
        db.add(new_session)
        await db.commit()
        await db.refresh(new_session)
        session_id = str(new_session.id)

    # Save user message
    db.add(ChatMessage(session_id=session_id, role="user", content=message))
    await db.commit()

    async def event_generator():
        full_answer = ""
        async for event in answer_with_rag(message, session_id):
            if event["type"] == "token":
                full_answer += event["data"]
                yield f"event: token\ndata: {json.dumps({'chunk': event['data']})}\n\n"
            elif event["type"] == "citations":
                # Save assistant message with citations
                db.add(ChatMessage(
                    session_id=session_id,
                    role="assistant",
                    content=full_answer,
                    citations=json.loads(event["data"]),
                ))
                await db.commit()
                yield f"event: citations\ndata: {event['data']}\n\n"
                yield f"event: done\ndata: {json.dumps({'session_id': session_id})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/sessions")
async def list_sessions(db: AsyncSession = Depends(get_db)):
    """List chat sessions with last message preview."""
    result = await db.execute(
        select(ChatSession)
        .options(selectinload(ChatSession.messages))
        .order_by(ChatSession.updated_at.desc())
        .limit(50)
    )
    sessions = result.scalars().all()
    return {
        "sessions": [
            {
                "id": str(s.id),
                "title": s.title,
                "created_at": s.created_at.isoformat(),
                "updated_at": s.updated_at.isoformat(),
                "message_count": len(s.messages),
                "last_message": (s.messages[-1].content[:120] + "...") if s.messages else None,
            }
            for s in sessions
        ]
    }


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, db: AsyncSession = Depends(get_db)):
    """Get full chat history for a session."""
    result = await db.execute(
        select(ChatSession)
        .options(selectinload(ChatSession.messages))
        .where(ChatSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        return {"error": "Session not found"}
    return {
        "id": str(session.id),
        "title": session.title,
        "messages": [
            {
                "id": str(m.id),
                "role": m.role,
                "content": m.content,
                "citations": m.citations or [],
                "created_at": m.created_at.isoformat(),
            }
            for m in session.messages
        ],
    }
```

### 6. `backend/main.py`

```python
from backend.routers import ingest, health, knowledge, files, search, chat
...
app.include_router(chat.router)        # Phase 6 — RAG chat
```

---

## ⚛️ Frontend Implementation

### 1. `frontend/lib/api.ts` — SSE Chat Helper

```typescript
export interface ChatMessage {
  role: "user" | "assistant" | "system"
  content: string
  citations?: SearchResultItem[]
}

export async function sendChatMessage(
  message: string,
  sessionId: string | null,
  onToken: (chunk: string) => void,
  onCitations: (citations: SearchResultItem[]) => void,
  onDone: (sessionId: string) => void,
  onError: (error: string) => void,
) {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, session_id: sessionId }),
  })

  if (!res.ok || !res.body) {
    onError("Failed to connect to chat")
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split("\n\n")
    buffer = lines.pop() || ""

    for (const block of lines) {
      const eventLine = block.split("\n").find(l => l.startsWith("event:"))
      const dataLine = block.split("\n").find(l => l.startsWith("data:"))
      if (!eventLine || !dataLine) continue

      const event = eventLine.replace("event:", "").trim()
      const data = dataLine.replace("data:", "").trim()

      if (event === "token") {
        const parsed = JSON.parse(data)
        onToken(parsed.chunk)
      } else if (event === "citations") {
        onCitations(JSON.parse(data))
      } else if (event === "done") {
        const parsed = JSON.parse(data)
        onDone(parsed.session_id)
      } else if (event === "error") {
        onError(data)
      }
    }
  }
}

export async function listChatSessions(): Promise<{ sessions: { id: string; title: string; last_message?: string; message_count: number; created_at: string; updated_at: string }[] }> {
  const res = await fetch(`${API_BASE}/api/chat/sessions`)
  if (!res.ok) throw new Error(`Sessions fetch failed: ${res.status}`)
  return res.json()
}

export async function getChatSession(sessionId: string): Promise<{ id: string; title: string; messages: ChatMessage[] }> {
  const res = await fetch(`${API_BASE}/api/chat/sessions/${sessionId}`)
  if (!res.ok) throw new Error(`Session fetch failed: ${res.status}`)
  return res.json()
}
```

### 2. `frontend/components/chat/ChatInterface.tsx`

A full-screen chat interface:

```tsx
"use client"
import { useState, useRef, useEffect } from "react"
import { Send, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StreamingMessage } from "./StreamingMessage"
import { SourceCitationCard } from "./SourceCitationCard"
import { SuggestedQuestions } from "./SuggestedQuestions"
import { sendChatMessage, ChatMessage as ChatMessageType, SearchResultItem } from "@/lib/api"

interface ChatInterfaceProps {
  sessionId?: string | null
  contextItemId?: string | null  // for reader "Ask AI" mode
  suggestedQuestions?: string[]
  onSessionCreated?: (id: string) => void
}

export function ChatInterface({
  sessionId: initialSessionId,
  contextItemId,
  suggestedQuestions,
  onSessionCreated,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessageType[]>([])
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentCitations, setCurrentCitations] = useState<SearchResultItem[]>([])
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId || null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isStreaming])

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return

    const userMsg = input.trim()
    setInput("")
    setMessages(prev => [...prev, { role: "user", content: userMsg }])
    setIsStreaming(true)
    setCurrentCitations([])

    let assistantContent = ""

    await sendChatMessage(
      contextItemId ? `${userMsg}\n\n(Context item: ${contextItemId})` : userMsg,
      sessionId,
      (chunk) => {
        assistantContent += chunk
        setMessages(prev => {
          const rest = prev.filter(m => m.role !== "assistant" || m.content !== assistantContent.slice(0, -chunk.length))
          return [...rest, { role: "assistant", content: assistantContent }]
        })
      },
      (citations) => {
        setCurrentCitations(citations)
      },
      (newSessionId) => {
        setSessionId(newSessionId)
        onSessionCreated?.(newSessionId)
        setIsStreaming(false)
      },
      (error) => {
        setMessages(prev => [...prev, { role: "assistant", content: `Error: ${error}` }])
        setIsStreaming(false)
      },
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#0A0A0F]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-violet-600/15 border border-violet-600/25 flex items-center justify-center mb-5">
              <Sparkles size={26} className="text-violet-400" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Ask your BrainVault</h2>
            <p className="text-sm text-zinc-500 max-w-md mb-6">
              I answer using only the knowledge you&apos;ve saved. Every response includes citations to the original items.
            </p>
            {suggestedQuestions && (
              <SuggestedQuestions questions={suggestedQuestions} onSelect={setInput} />
            )}
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === "user"
                ? "bg-violet-600 text-white rounded-br-md"
                : "bg-white/[0.05] text-zinc-200 border border-white/[0.08] rounded-bl-md"
            }`}>
              {msg.role === "assistant" && idx === messages.length - 1 && isStreaming ? (
                <StreamingMessage content={msg.content} />
              ) : (
                <div className="whitespace-pre-wrap">{msg.content}</div>
              )}
            </div>
          </div>
        ))}

        {!isStreaming && currentCitations.length > 0 && (
          <div className="pl-2">
            <p className="text-xs font-medium text-zinc-500 mb-3 flex items-center gap-1.5">
              <span>📚</span> Sources used
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentCitations.map(source => (
                <SourceCitationCard key={source.id} source={source} />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/[0.06] bg-[#0D0D14]">
        <div className="flex items-center gap-2 max-w-4xl mx-auto">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Ask anything about your knowledge..."
            className="flex-1 bg-white/[0.05] border-white/[0.08] text-white placeholder:text-zinc-600 focus-visible:ring-violet-500/40"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50"
          >
            <Send size={16} />
          </Button>
        </div>
      </div>
    </div>
  )
}
```

### 3. `frontend/components/chat/StreamingMessage.tsx`

```tsx
"use client"

interface StreamingMessageProps {
  content: string
}

export function StreamingMessage({ content }: StreamingMessageProps) {
  return (
    <div className="whitespace-pre-wrap">
      {content}
      <span className="inline-block w-2 h-4 ml-1 bg-violet-400 animate-pulse align-middle rounded-sm" />
    </div>
  )
}
```

### 4. `frontend/components/chat/SourceCitationCard.tsx`

```tsx
"use client"
import Link from "next/link"
import { FileText, ExternalLink } from "lucide-react"
import { SearchResultItem } from "@/lib/api"

interface SourceCitationCardProps {
  source: SearchResultItem
}

const typeRoute: Record<string, string> = {
  linkedin: "/knowledge/linkedin",
  blog: "/knowledge/blogs",
  research: "/knowledge/papers",
  note: "/knowledge/notes",
  interview_qna: "/knowledge/interviews",
}

export function SourceCitationCard({ source }: SourceCitationCardProps) {
  const route = typeRoute[source.type] || "/search"
  const href = source.type === "linkedin" || source.type === "research"
    ? `${route}/${source.id}/reader`
    : `${route}/${source.id}`

  return (
    <Link href={href}>
      <div className="group p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-violet-500/30 hover:bg-white/[0.05] transition-all cursor-pointer">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-600/10 flex items-center justify-center flex-shrink-0">
            <FileText size={14} className="text-violet-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-zinc-200 line-clamp-1 group-hover:text-violet-300 transition-colors">
              {source.title}
            </p>
            <p className="text-[10px] text-zinc-500 mt-0.5 flex items-center gap-1">
              <span className="capitalize">{source.type}</span>
              {source.knowledge_tree && <span>• {source.knowledge_tree}</span>}
            </p>
          </div>
          <ExternalLink size={12} className="text-zinc-600 flex-shrink-0 mt-1" />
        </div>
      </div>
    </Link>
  )
}
```

### 5. `frontend/components/chat/SuggestedQuestions.tsx`

```tsx
"use client"

interface SuggestedQuestionsProps {
  questions: string[]
  onSelect: (q: string) => void
}

export function SuggestedQuestions({ questions, onSelect }: SuggestedQuestionsProps) {
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {questions.map(q => (
        <button
          key={q}
          onClick={() => onSelect(q)}
          className="px-3 py-1.5 text-xs text-zinc-400 bg-white/[0.04] border border-white/[0.08] rounded-full hover:bg-white/[0.08] hover:text-zinc-200 transition-colors"
        >
          {q}
        </button>
      ))}
    </div>
  )
}
```

### 6. `frontend/app/chat/page.tsx`

```tsx
"use client"
import { ChatInterface } from "@/components/chat/ChatInterface"
import { ChatHistorySidebar } from "@/components/chat/ChatHistorySidebar"
import { useState } from "react"

export default function ChatPage() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="flex h-[calc(100vh-64px)] bg-[#0A0A0F]">
      <ChatHistorySidebar
        activeSessionId={sessionId}
        onSelect={setSessionId}
        refreshKey={refreshKey}
      />
      <div className="flex-1 min-w-0">
        <ChatInterface
          sessionId={sessionId}
          suggestedQuestions={[
            "What do I know about RAG?",
            "Summarize my FastAPI notes",
            "Explain prompt engineering",
            "What papers have I saved about LLMs?",
          ]}
          onSessionCreated={() => setRefreshKey(k => k + 1)}
        />
      </div>
    </div>
  )
}
```

### 7. `frontend/components/chat/ChatHistorySidebar.tsx`

```tsx
"use client"
import { useEffect, useState } from "react"
import { Plus, MessageSquare } from "lucide-react"
import { listChatSessions } from "@/lib/api"

interface ChatHistorySidebarProps {
  activeSessionId: string | null
  onSelect: (id: string | null) => void
  refreshKey: number
}

export function ChatHistorySidebar({ activeSessionId, onSelect, refreshKey }: ChatHistorySidebarProps) {
  const [sessions, setSessions] = useState<{ id: string; title: string; last_message?: string; message_count: number; updated_at: string }[]>([])

  useEffect(() => {
    listChatSessions().then(data => setSessions(data.sessions)).catch(console.error)
  }, [refreshKey])

  return (
    <div className="w-64 border-r border-white/[0.06] bg-[#0D0D14] flex flex-col flex-shrink-0">
      <div className="p-4 border-b border-white/[0.06]">
        <button
          onClick={() => onSelect(null)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors"
        >
          <Plus size={16} />
          New chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.map(s => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`w-full text-left p-3 rounded-lg transition-colors ${
              activeSessionId === s.id
                ? "bg-white/[0.08] border border-white/[0.08]"
                : "hover:bg-white/[0.04]"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare size={14} className="text-zinc-500" />
              <span className="text-xs font-medium text-zinc-300 line-clamp-1">{s.title || "New chat"}</span>
            </div>
            {s.last_message && (
              <p className="text-[10px] text-zinc-600 line-clamp-2">{s.last_message}</p>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
```

### 8. `frontend/components/knowledge/LinkedInReader.tsx` — Wire Up Ask AI

Replace the stub AI panel content with the `ChatInterface`:

```tsx
import { ChatInterface } from "@/components/chat/ChatInterface"
...
{aiPanelOpen && (
  <div className="w-96 border-l border-white/[0.06] flex flex-col bg-[#0D0D14] flex-shrink-0">
    <div className="p-4 border-b border-white/[0.05] flex items-center gap-2">
      <div className="w-6 h-6 rounded-lg bg-violet-600/20 flex items-center justify-center">
        <MessageSquare size={12} className="text-violet-400" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-white">Ask AI</h3>
        <p className="text-[11px] text-zinc-500">About this document</p>
      </div>
    </div>
    <div className="flex-1 min-h-0">
      <ChatInterface
        contextItemId={item.id}
        suggestedQuestions={[
          "Summarize this document",
          "What are the key takeaways?",
          "How does this relate to my other notes?",
        ]}
      />
    </div>
  </div>
)}
```

---

## 🧪 Testing Plan

1. **Backend health**: `GET /health` returns ok.
2. **Database**: `chat_sessions` and `chat_messages` tables exist.
3. **RAG retrieval**: Test `backend/services/chat_service.py::build_rag_context("RAG evaluation")` returns sources.
4. **Streaming endpoint**: Use curl or Python to call `POST /api/chat` and verify `event: token`, `event: citations`, `event: done`.
5. **Frontend chat**: Open `/chat`, ask a question, see streaming response + source cards.
6. **Reader chat**: Open a LinkedIn PDF reader, click "Ask AI", ask a question about the document.
7. **Chat history**: Refresh page, see previous sessions in sidebar, click to load history.

---

## ✅ Phase 6 Checklist

```
Backend
- [ ] ChatSession + ChatMessage models added
- [ ] /api/chat SSE endpoint streaming answers
- [ ] RAG context builder retrieves top 8 from Qdrant
- [ ] Gemini 2.5 Flash streaming call
- [ ] Citations returned as JSON in SSE
- [ ] Chat history endpoints: list sessions, get session
- [ ] chat router registered in main.py

Frontend
- [ ] /chat page shows full chat interface
- [ ] StreamingMessage component with cursor
- [ ] SourceCitationCard clickable → item detail
- [ ] ChatHistorySidebar lists sessions
- [ ] SuggestedQuestions chips
- [ ] LinkedInReader "Ask AI" panel wired up
- [ ] lib/api.ts sendChatMessage() consumes SSE
```
