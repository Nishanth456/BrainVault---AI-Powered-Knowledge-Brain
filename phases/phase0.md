# ⚙️ Phase 0 — Full Stack Skeleton

> **Goal**: Every service runs. The entire UI shell exists. Data flows from input box to database.
> No AI intelligence yet. No real agents yet. Just solid plumbing from top to bottom.

---

## ✅ What You Ship at the End of Phase 0

```
1. docker-compose up         → PostgreSQL + Qdrant + Redis + MinIO all green
2. uvicorn main:app          → Backend starts on http://localhost:8000
3. npm run dev               → Frontend starts on http://localhost:3000
4. Open the app              → See the full BrainVault UI with sidebar navigation
5. Paste any text in input   → Hits the API → Job queued → Celery picks it up
6. Input type is detected    → Groq returns "plaintext" / "url" / etc.
7. Row saved to PostgreSQL   → knowledge_items table has the entry
8. "✅ Saved to your brain"  → Toast notification fires in frontend
9. All sidebar pages load    → Each shows a beautiful empty state
```

---

## 📁 Folder Structure to Create

```
brainvault/
├── backend/
│   ├── main.py
│   ├── config.py
│   ├── requirements.txt
│   ├── .env
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── ingest.py
│   │   ├── knowledge.py
│   │   └── health.py
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── orchestrator.py       ← LangGraph master graph (stubs)
│   │   └── state.py              ← BrainVaultState TypedDict
│   ├── models/
│   │   ├── __init__.py
│   │   ├── database.py           ← SQLAlchemy engine + session
│   │   └── schemas.py            ← KnowledgeItem, Attachment ORM models
│   ├── services/
│   │   ├── __init__.py
│   │   ├── llm.py                ← LiteLLM wrapper
│   │   ├── embedding.py          ← Ollama embedding calls
│   │   ├── qdrant.py             ← Qdrant client + helpers
│   │   └── minio.py              ← MinIO client + helpers
│   └── tasks/
│       ├── __init__.py
│       └── ingestion.py          ← Celery task that runs the LangGraph
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx              ← Dashboard / Home
│   │   ├── knowledge/
│   │   │   ├── linkedin/page.tsx
│   │   │   ├── blogs/page.tsx
│   │   │   ├── papers/page.tsx
│   │   │   ├── interviews/page.tsx
│   │   │   ├── notes/page.tsx
│   │   │   ├── pdfs/page.tsx
│   │   │   ├── github/page.tsx
│   │   │   ├── youtube/page.tsx
│   │   │   ├── courses/page.tsx
│   │   │   └── certifications/page.tsx
│   │   ├── chat/page.tsx
│   │   ├── search/page.tsx
│   │   ├── learning/page.tsx
│   │   └── graph/page.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   └── Header.tsx
│   │   ├── dashboard/
│   │   │   ├── UniversalInput.tsx
│   │   │   └── AgentProgressStream.tsx
│   │   └── ui/                   ← shadcn/ui components live here
│   ├── lib/
│   │   ├── api.ts
│   │   └── utils.ts
│   ├── package.json
│   └── tailwind.config.ts
│
└── infrastructure/
    ├── docker-compose.yml
    └── postgres/
        └── init.sql
```

---

## 🐳 Step 1 — Infrastructure (Docker)

### `infrastructure/docker-compose.yml`

```yaml
version: "3.9"

services:

  postgres:
    image: postgres:16-alpine
    container_name: brainvault-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: brainvault
      POSTGRES_USER: brainvault
      POSTGRES_PASSWORD: brainvault_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U brainvault"]
      interval: 10s
      timeout: 5s
      retries: 5

  qdrant:
    image: qdrant/qdrant:latest
    container_name: brainvault-qdrant
    restart: unless-stopped
    ports:
      - "6333:6333"     # REST API
      - "6334:6334"     # gRPC
    volumes:
      - qdrant_storage:/qdrant/storage
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:6333/healthz || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: brainvault-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio:latest
    container_name: brainvault-minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"     # S3 API
      - "9001:9001"     # MinIO Console (browser UI)
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  qdrant_storage:
  minio_data:
```

### `infrastructure/postgres/init.sql`

```sql
-- Run automatically on first postgres startup

CREATE TABLE IF NOT EXISTS knowledge_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL,           -- 'linkedin', 'blog', 'pdf', 'note', etc.
    title TEXT,
    summary TEXT,
    source_url TEXT,
    author TEXT,
    raw_content TEXT,
    key_concepts TEXT[],                 -- array of concept strings
    tags TEXT[],
    difficulty INTEGER CHECK (difficulty BETWEEN 1 AND 5),
    reading_time_minutes INTEGER,
    importance_score INTEGER CHECK (importance_score BETWEEN 1 AND 10),
    knowledge_tree TEXT,                 -- e.g. "AI > LLMs > RAG"
    knowledge_domain TEXT,              -- top-level: "AI", "Python", "SQL"
    knowledge_subdomain TEXT,
    knowledge_topic TEXT,
    embedding_id TEXT,                  -- Qdrant point ID
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_item_id UUID REFERENCES knowledge_items(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    minio_path TEXT NOT NULL,           -- bucket/filename path in MinIO
    file_type VARCHAR(20),              -- 'pdf', 'image', 'video'
    file_size_bytes BIGINT,
    page_count INTEGER,
    extracted_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingestion_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'queued', -- 'queued', 'running', 'done', 'failed'
    raw_input TEXT NOT NULL,
    detected_type VARCHAR(50),
    knowledge_item_id UUID REFERENCES knowledge_items(id),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_knowledge_items_type ON knowledge_items(type);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_domain ON knowledge_items(knowledge_domain);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_created_at ON knowledge_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attachments_knowledge_item_id ON attachments(knowledge_item_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status ON ingestion_jobs(status);
```

### How to start everything

```bash
# from project root
cd infrastructure
docker-compose up -d

# verify all services are healthy
docker-compose ps

# check logs if something fails
docker-compose logs postgres
docker-compose logs qdrant
```

---

## 🐍 Step 2 — Backend (FastAPI)

### `backend/requirements.txt`

```
# Web framework
fastapi==0.115.0
uvicorn[standard]==0.30.6

# Database
sqlalchemy==2.0.32
asyncpg==0.29.0
alembic==1.13.2
psycopg2-binary==2.9.9

# Task queue
celery==5.4.0
redis==5.0.8

# Vector DB
qdrant-client==1.11.1

# Object storage
minio==7.2.8

# LLM abstraction
litellm==1.44.0

# LangGraph + LangChain
langgraph==0.2.20
langchain-core==0.3.5

# Validation
pydantic==2.8.2
pydantic-settings==2.4.0

# HTTP client
httpx==0.27.2

# Utilities
python-multipart==0.0.9
python-dotenv==1.0.1
uuid==1.30
```

### `backend/.env`

```env
# Database
DATABASE_URL=postgresql+asyncpg://brainvault:brainvault_dev@localhost:5432/brainvault
DATABASE_URL_SYNC=postgresql://brainvault:brainvault_dev@localhost:5432/brainvault

# Redis / Celery
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1

# Qdrant
QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_COLLECTION_NAME=brainvault

# MinIO
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET_NAME=brainvault-files
MINIO_SECURE=false

# LLM APIs — get free keys below:
# Groq: https://console.groq.com (no credit card)
# Google AI Studio: https://aistudio.google.com (no credit card)
GROQ_API_KEY=your_groq_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here

# Ollama (local — no key needed)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBED_MODEL=nomic-embed-text
EMBED_DIMENSION=768

# App
APP_ENV=development
FRONTEND_URL=http://localhost:3000
```

### `backend/config.py`

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    DATABASE_URL_SYNC: str
    REDIS_URL: str
    CELERY_BROKER_URL: str
    CELERY_RESULT_BACKEND: str

    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_COLLECTION_NAME: str = "brainvault"

    MINIO_ENDPOINT: str
    MINIO_ACCESS_KEY: str
    MINIO_SECRET_KEY: str
    MINIO_BUCKET_NAME: str = "brainvault-files"
    MINIO_SECURE: bool = False

    GROQ_API_KEY: str
    GEMINI_API_KEY: str
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_EMBED_MODEL: str = "nomic-embed-text"
    EMBED_DIMENSION: int = 768

    FRONTEND_URL: str = "http://localhost:3000"

    class Config:
        env_file = ".env"

settings = Settings()
```

### `backend/models/database.py`

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from backend.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
```

### `backend/models/schemas.py`

```python
import uuid
from datetime import datetime
from sqlalchemy import String, Text, Integer, ARRAY, ForeignKey, BigInteger
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.models.database import Base

class KnowledgeItem(Base):
    __tablename__ = "knowledge_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(Text)
    author: Mapped[str | None] = mapped_column(Text)
    raw_content: Mapped[str | None] = mapped_column(Text)
    key_concepts: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    difficulty: Mapped[int | None] = mapped_column(Integer)
    reading_time_minutes: Mapped[int | None] = mapped_column(Integer)
    importance_score: Mapped[int | None] = mapped_column(Integer)
    knowledge_tree: Mapped[str | None] = mapped_column(Text)
    knowledge_domain: Mapped[str | None] = mapped_column(Text)
    knowledge_subdomain: Mapped[str | None] = mapped_column(Text)
    knowledge_topic: Mapped[str | None] = mapped_column(Text)
    embedding_id: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    attachments: Mapped[list["Attachment"]] = relationship(back_populates="knowledge_item")


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    knowledge_item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("knowledge_items.id"))
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    minio_path: Mapped[str] = mapped_column(Text, nullable=False)
    file_type: Mapped[str | None] = mapped_column(String(20))
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    page_count: Mapped[int | None] = mapped_column(Integer)
    extracted_text: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    knowledge_item: Mapped["KnowledgeItem"] = relationship(back_populates="attachments")


class IngestionJob(Base):
    __tablename__ = "ingestion_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status: Mapped[str] = mapped_column(String(20), default="queued")
    raw_input: Mapped[str] = mapped_column(Text, nullable=False)
    detected_type: Mapped[str | None] = mapped_column(String(50))
    knowledge_item_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("knowledge_items.id"), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)
```

### `backend/agents/state.py`

```python
from typing import TypedDict, Optional, Annotated
import operator

class BrainVaultState(TypedDict):
    # Input
    raw_input: str                        # What the user pasted
    job_id: str                           # UUID of the ingestion job

    # Detection
    input_type: Optional[str]            # 'linkedin', 'blog', 'pdf', 'plaintext', etc.
    url: Optional[str]                   # If URL-based input
    file_path: Optional[str]             # If file upload

    # Content extracted by the agent
    scraped_content: Optional[dict]
    extracted_text: Optional[str]
    attachments: Optional[list]          # List of found attachments

    # AI-generated enrichment
    title: Optional[str]
    summary: Optional[str]
    key_concepts: Optional[list[str]]
    tags: Optional[list[str]]
    difficulty: Optional[int]
    knowledge_tree: Optional[str]        # "AI > LLMs > RAG"
    knowledge_domain: Optional[str]
    metadata: Optional[dict]             # Full metadata object

    # Storage references
    knowledge_item_id: Optional[str]    # PostgreSQL UUID
    embedding_id: Optional[str]         # Qdrant point ID
    stored_files: list[str]             # MinIO paths

    # Status / Streaming
    agent_steps: Annotated[list[str], operator.add]  # Streamed to frontend
    error: Optional[str]
```

### `backend/agents/orchestrator.py`

```python
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from backend.agents.state import BrainVaultState
from backend.services.llm import detect_input_type

# ── Stub nodes (Phase 0 — just pass state through) ──────────────────────────

async def detect_input_node(state: BrainVaultState) -> dict:
    """
    REAL in Phase 0: calls Groq to classify input type.
    Everything else is a stub until Phase 1+
    """
    raw = state["raw_input"]
    input_type = await detect_input_type(raw)

    return {
        "input_type": input_type,
        "agent_steps": [f"✅ Input detected: {input_type}"]
    }

async def stub_agent_node(state: BrainVaultState) -> dict:
    """Stub for all agents — just acknowledges and stores raw input for now."""
    return {
        "title": "Untitled (Phase 0 Stub)",
        "summary": state["raw_input"][:200],
        "agent_steps": ["⚠️ Agent not yet implemented (Phase 0)"]
    }

async def store_node(state: BrainVaultState) -> dict:
    """Saves whatever we have to PostgreSQL in Phase 0."""
    from backend.services.storage_service import save_knowledge_item
    item_id = await save_knowledge_item(state)
    return {
        "knowledge_item_id": str(item_id),
        "agent_steps": ["✅ Saved to your brain"]
    }

# ── Routing ──────────────────────────────────────────────────────────────────

def route_by_type(state: BrainVaultState) -> str:
    """Route to the right agent based on detected input type."""
    input_type = state.get("input_type", "plaintext")
    routing = {
        "linkedin":   "linkedin_agent",
        "blog":       "blog_agent",
        "pdf":        "pdf_agent",
        "research":   "research_agent",
        "github":     "github_agent",
        "youtube":    "youtube_agent",
        "course":     "course_agent",
        "plaintext":  "plaintext_agent",
    }
    return routing.get(input_type, "plaintext_agent")

# ── Build the Graph ───────────────────────────────────────────────────────────

def build_master_graph():
    graph = StateGraph(BrainVaultState)

    # Entry
    graph.add_node("detect_input",    detect_input_node)

    # All agents are stubs for now (Phase 0)
    agent_names = [
        "linkedin_agent", "blog_agent", "pdf_agent", "research_agent",
        "github_agent", "youtube_agent", "course_agent", "plaintext_agent"
    ]
    for name in agent_names:
        graph.add_node(name, stub_agent_node)

    # Store node
    graph.add_node("store", store_node)

    # Routing
    graph.set_entry_point("detect_input")
    graph.add_conditional_edges("detect_input", route_by_type, {
        name: name for name in agent_names
    })

    # All agents → store
    for name in agent_names:
        graph.add_edge(name, "store")

    graph.add_edge("store", END)

    return graph.compile(checkpointer=MemorySaver())

master_graph = build_master_graph()
```

### `backend/services/llm.py`

```python
import os
from litellm import acompletion
from backend.config import settings

# Set API keys for LiteLLM
os.environ["GROQ_API_KEY"] = settings.GROQ_API_KEY
os.environ["GEMINI_API_KEY"] = settings.GEMINI_API_KEY

async def detect_input_type(raw_input: str) -> str:
    """
    LLM Call #1 (the ONLY real LLM call in Phase 0).
    Uses Groq llama-3.1-8b-instant — fast and free.
    Returns: 'linkedin' | 'blog' | 'pdf' | 'research' | 'github' | 'youtube' | 'course' | 'plaintext'
    """
    prompt = f"""Classify this input into exactly one of these categories:
linkedin, blog, pdf, research, github, youtube, course, plaintext

Rules:
- linkedin: any linkedin.com URL
- blog: Medium, Dev.to, Hashnode, Substack, or any blog post URL
- pdf: a .pdf file path or PDF URL
- research: arxiv.org URL or academic paper link
- github: github.com URL
- youtube: youtube.com or youtu.be URL
- course: Udemy, Coursera, fast.ai, DeepLearning.AI URL
- plaintext: everything else (pasted text, notes, code, conversations)

Input: {raw_input[:500]}

Respond with ONLY the category name, nothing else."""

    response = await acompletion(
        model="groq/llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=10,
        temperature=0,
    )

    detected = response.choices[0].message.content.strip().lower()

    valid_types = ["linkedin", "blog", "pdf", "research", "github", "youtube", "course", "plaintext"]
    return detected if detected in valid_types else "plaintext"


async def call_llm(
    prompt: str,
    model: str = "groq/llama-3.3-70b-versatile",
    system: str = "You are a helpful AI assistant.",
    temperature: float = 0.1,
    max_tokens: int = 1000,
    fallback_model: str = "gemini/gemini-2.0-flash"
) -> str:
    """
    Unified LLM call with automatic fallback.
    Default: Groq 70B → fallback: Gemini Flash
    """
    try:
        response = await acompletion(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt}
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        # Auto-fallback if rate limited or model unavailable
        response = await acompletion(
            model=fallback_model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt}
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content.strip()
```

### `backend/services/embedding.py`

```python
import httpx
from backend.config import settings

async def generate_embedding(text: str) -> list[float]:
    """
    Generate embeddings using Ollama (local, free, private).
    Model: nomic-embed-text (768 dimensions)
    Run first: ollama pull nomic-embed-text
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{settings.OLLAMA_BASE_URL}/api/embeddings",
            json={
                "model": settings.OLLAMA_EMBED_MODEL,
                "prompt": text[:8000]   # Truncate if too long
            }
        )
        response.raise_for_status()
        return response.json()["embedding"]
```

### `backend/services/qdrant.py`

```python
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from backend.config import settings
import uuid

client = QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)

def ensure_collection():
    """Create the Qdrant collection if it doesn't exist. Run at startup."""
    existing = [c.name for c in client.get_collections().collections]
    if settings.QDRANT_COLLECTION_NAME not in existing:
        client.create_collection(
            collection_name=settings.QDRANT_COLLECTION_NAME,
            vectors_config=VectorParams(
                size=settings.EMBED_DIMENSION,   # 768 for nomic-embed-text
                distance=Distance.COSINE
            )
        )
        print(f"✅ Qdrant collection '{settings.QDRANT_COLLECTION_NAME}' created")

def upsert_knowledge_item(
    item_id: str,
    vector: list[float],
    payload: dict
) -> str:
    """Store a knowledge item embedding with its metadata payload."""
    point_id = str(uuid.uuid4())
    client.upsert(
        collection_name=settings.QDRANT_COLLECTION_NAME,
        points=[PointStruct(
            id=point_id,
            vector=vector,
            payload={
                "knowledge_item_id": item_id,
                **payload
            }
        )]
    )
    return point_id
```

### `backend/services/minio.py`

```python
from minio import Minio
from minio.error import S3Error
from backend.config import settings
import io

client = Minio(
    settings.MINIO_ENDPOINT,
    access_key=settings.MINIO_ACCESS_KEY,
    secret_key=settings.MINIO_SECRET_KEY,
    secure=settings.MINIO_SECURE
)

def ensure_bucket():
    """Create the MinIO bucket if it doesn't exist. Run at startup."""
    if not client.bucket_exists(settings.MINIO_BUCKET_NAME):
        client.make_bucket(settings.MINIO_BUCKET_NAME)
        print(f"✅ MinIO bucket '{settings.MINIO_BUCKET_NAME}' created")

def upload_bytes(filename: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    """Upload raw bytes to MinIO. Returns the storage path."""
    client.put_object(
        settings.MINIO_BUCKET_NAME,
        filename,
        data=io.BytesIO(data),
        length=len(data),
        content_type=content_type
    )
    return f"{settings.MINIO_BUCKET_NAME}/{filename}"

def get_bytes(minio_path: str) -> bytes:
    """Download file bytes from MinIO by path."""
    # minio_path format: "brainvault-files/filename.pdf"
    filename = minio_path.split("/", 1)[1] if "/" in minio_path else minio_path
    response = client.get_object(settings.MINIO_BUCKET_NAME, filename)
    return response.read()
```

### `backend/tasks/ingestion.py` (Celery)

```python
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
def run_ingestion_pipeline(self, job_id: str, raw_input: str):
    """
    Background task: run the LangGraph ingestion pipeline.
    Called by the /api/ingest endpoint after creating the job record.
    """
    from backend.agents.orchestrator import master_graph

    initial_state = {
        "raw_input": raw_input,
        "job_id": job_id,
        "stored_files": [],
        "agent_steps": [],
    }

    config = {"configurable": {"thread_id": job_id}}

    try:
        # Run the LangGraph synchronously inside the Celery task
        asyncio.run(master_graph.ainvoke(initial_state, config=config))
    except Exception as exc:
        self.retry(exc=exc, countdown=10)
```

### `backend/routers/ingest.py`

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from backend.models.database import get_db
from backend.tasks.ingestion import run_ingestion_pipeline
import uuid

router = APIRouter(prefix="/api", tags=["ingest"])

class IngestRequest(BaseModel):
    raw_input: str

class IngestResponse(BaseModel):
    job_id: str
    status: str
    message: str

@router.post("/ingest", response_model=IngestResponse)
async def ingest(request: IngestRequest, db: AsyncSession = Depends(get_db)):
    """
    Accept user input, create a job record, queue the Celery task.
    Returns immediately — pipeline runs in background.
    """
    job_id = str(uuid.uuid4())

    # Create job record in PostgreSQL
    await db.execute(text("""
        INSERT INTO ingestion_jobs (id, status, raw_input)
        VALUES (:id, 'queued', :raw_input)
    """), {"id": job_id, "raw_input": request.raw_input})
    await db.commit()

    # Queue the background task
    run_ingestion_pipeline.delay(job_id, request.raw_input)

    return IngestResponse(
        job_id=job_id,
        status="queued",
        message="Processing started. Your knowledge is being analyzed."
    )


@router.get("/ingest/{job_id}/status")
async def get_job_status(job_id: str, db: AsyncSession = Depends(get_db)):
    """Check the status of an ingestion job."""
    result = await db.execute(text("""
        SELECT id, status, detected_type, error_message, created_at, updated_at
        FROM ingestion_jobs WHERE id = :job_id
    """), {"job_id": job_id})
    row = result.fetchone()
    if not row:
        return {"error": "Job not found"}
    return dict(row._mapping)
```

### `backend/routers/health.py`

```python
from fastapi import APIRouter
from backend.services.qdrant import client as qdrant_client
from backend.config import settings

router = APIRouter(tags=["health"])

@router.get("/health")
async def health_check():
    """Verify all services are reachable."""
    status = {"status": "ok", "services": {}}

    # Check Qdrant
    try:
        qdrant_client.get_collections()
        status["services"]["qdrant"] = "ok"
    except Exception as e:
        status["services"]["qdrant"] = f"error: {e}"
        status["status"] = "degraded"

    return status
```

### `backend/main.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from backend.config import settings
from backend.routers import ingest, health
from backend.services.qdrant import ensure_collection
from backend.services.minio import ensure_bucket

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    ensure_collection()   # Create Qdrant collection if missing
    ensure_bucket()        # Create MinIO bucket if missing
    print("✅ BrainVault backend started")
    yield
    # Shutdown
    print("👋 BrainVault backend shutting down")

app = FastAPI(
    title="BrainVault API",
    version="0.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(ingest.router)

# Placeholder for future routers (added in later phases)
# app.include_router(knowledge.router)
# app.include_router(search.router)
# app.include_router(chat.router)
# app.include_router(files.router)
```

### How to run the backend

```bash
# Install Ollama (https://ollama.com)
ollama pull nomic-embed-text

# Install Python dependencies
cd backend
pip install -r requirements.txt

# Start FastAPI
uvicorn main:app --reload --port 8000

# Start Celery worker (separate terminal)
celery -A tasks.ingestion.celery_app worker --loglevel=info
```

---

## 🎨 Step 3 — Frontend (Next.js 15)

### Initialize the project

```bash
cd brainvault
npx create-next-app@latest frontend \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir=false \
  --import-alias="@/*"

cd frontend

# Install shadcn/ui
npx shadcn@latest init
# Select: Default style, Zinc base color, CSS variables: yes

# Install components we need in Phase 0
npx shadcn@latest add button input card badge toast separator

# Install additional packages
npm install framer-motion lucide-react axios
```

### `frontend/app/layout.tsx`

```tsx
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { Sidebar } from "@/components/layout/Sidebar"
import { Toaster } from "@/components/ui/toaster"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

export const metadata: Metadata = {
  title: "BrainVault — Your AI-Powered Knowledge Brain",
  description: "Capture anything. Understand everything. Learn forever.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${geist.variable} ${geistMono.variable} bg-[#0A0A0F] text-white antialiased`}>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
        <Toaster />
      </body>
    </html>
  )
}
```

### `frontend/components/layout/Sidebar.tsx`

```tsx
"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  Brain, Linkedin, BookOpen, FlaskConical, MessageSquare,
  Code2, Youtube, GraduationCap, Award, Map, MessageCircle,
  Search, Network, Settings, ChevronRight
} from "lucide-react"

const navItems = [
  { label: "Dashboard",         href: "/",                        icon: Brain },
  { label: "LinkedIn",          href: "/knowledge/linkedin",       icon: Linkedin },
  { label: "Blogs",             href: "/knowledge/blogs",          icon: BookOpen },
  { label: "Research Papers",   href: "/knowledge/papers",         icon: FlaskConical },
  { label: "Interview Q&A",     href: "/knowledge/interviews",     icon: MessageSquare },
  { label: "AI Notes",          href: "/knowledge/notes",          icon: MessageCircle },
  { label: "GitHub Repos",      href: "/knowledge/github",         icon: Code2 },
  { label: "YouTube",           href: "/knowledge/youtube",        icon: Youtube },
  { label: "Courses",           href: "/knowledge/courses",        icon: GraduationCap },
  { label: "Certifications",    href: "/knowledge/certifications", icon: Award },
  { label: "Learning Paths",    href: "/learning",                 icon: Map },
  { label: "AI Chat",           href: "/chat",                     icon: MessageCircle },
  { label: "Search",            href: "/search",                   icon: Search },
  { label: "Knowledge Graph",   href: "/graph",                    icon: Network },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 h-screen bg-[#0D0D14] border-r border-white/5 flex flex-col flex-shrink-0">
      {/* Logo */}
      <div className="p-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center">
            <Brain size={18} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm leading-none">BrainVault</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">Knowledge Brain</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 group",
                isActive
                  ? "bg-violet-600/20 text-violet-300 border border-violet-600/20"
                  : "text-zinc-400 hover:text-white hover:bg-white/5"
              )}
            >
              <Icon size={15} className="flex-shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {isActive && <ChevronRight size={12} className="text-violet-400" />}
            </Link>
          )
        })}
      </nav>

      {/* Settings */}
      <div className="p-3 border-t border-white/5">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
        >
          <Settings size={15} />
          <span>Settings</span>
        </Link>
      </div>
    </aside>
  )
}
```

### `frontend/components/dashboard/UniversalInput.tsx`

```tsx
"use client"
import { useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Sparkles, Loader2 } from "lucide-react"

export function UniversalInput() {
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const { toast } = useToast()

  const handleSubmit = async () => {
    if (!input.trim()) return
    setLoading(true)
    setStatus("Sending to your brain...")

    try {
      const res = await fetch("http://localhost:8000/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_input: input.trim() }),
      })
      const data = await res.json()

      setStatus("Processing... AI is analyzing your content")

      // Poll for completion
      let attempts = 0
      const poll = setInterval(async () => {
        attempts++
        const statusRes = await fetch(`http://localhost:8000/api/ingest/${data.job_id}/status`)
        const statusData = await statusRes.json()

        if (statusData.status === "done") {
          clearInterval(poll)
          setLoading(false)
          setStatus(null)
          setInput("")
          toast({ title: "✅ Saved to your brain!", description: `Detected: ${statusData.detected_type}` })
        } else if (statusData.status === "failed" || attempts > 30) {
          clearInterval(poll)
          setLoading(false)
          setStatus(null)
          toast({ title: "❌ Processing failed", variant: "destructive" })
        }
      }, 2000)

    } catch (error) {
      setLoading(false)
      setStatus(null)
      toast({ title: "❌ Network error", variant: "destructive" })
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-3">
      <div className="relative">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste anything — a LinkedIn URL, Medium article, research paper, notes, code snippets, YouTube link..."
          className="min-h-[120px] bg-white/5 border-white/10 text-white placeholder:text-zinc-500 resize-none rounded-xl text-sm leading-relaxed focus:border-violet-500/50 focus:ring-violet-500/20"
          disabled={loading}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSubmit()
          }}
        />
      </div>

      {status && (
        <div className="flex items-center gap-2 text-sm text-zinc-400 px-1">
          <Loader2 size={13} className="animate-spin text-violet-400" />
          <span>{status}</span>
        </div>
      )}

      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-zinc-600">Ctrl+Enter to submit</p>
        <Button
          onClick={handleSubmit}
          disabled={loading || !input.trim()}
          className="bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white border-0 rounded-lg px-5 py-2 text-sm font-medium"
        >
          {loading ? (
            <><Loader2 size={14} className="animate-spin mr-2" /> Processing...</>
          ) : (
            <><Sparkles size={14} className="mr-2" /> Save to Brain</>
          )}
        </Button>
      </div>
    </div>
  )
}
```

### `frontend/app/page.tsx` (Dashboard)

```tsx
import { UniversalInput } from "@/components/dashboard/UniversalInput"
import { Brain, Zap, Database, BookOpen } from "lucide-react"

export default function DashboardPage() {
  return (
    <div className="min-h-screen p-8">
      {/* Hero */}
      <div className="max-w-4xl mx-auto text-center pt-16 pb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-600/10 border border-violet-600/20 text-violet-300 text-xs mb-6">
          <Brain size={12} />
          <span>AI-Powered Knowledge Brain</span>
        </div>

        <h1 className="text-5xl font-bold text-white mb-4 leading-tight">
          Capture anything.{" "}
          <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
            Understand everything.
          </span>
        </h1>

        <p className="text-zinc-400 text-lg mb-12 max-w-xl mx-auto leading-relaxed">
          Paste any URL, text, or file. BrainVault's AI agents automatically
          extract, classify, and organize it into your personal knowledge brain.
        </p>

        {/* Universal Input */}
        <UniversalInput />
      </div>

      {/* Stats (placeholder for Phase 0) */}
      <div className="max-w-4xl mx-auto grid grid-cols-3 gap-4 mt-8">
        {[
          { label: "Knowledge Items", value: "0", icon: Database, color: "text-violet-400" },
          { label: "Domains Covered", value: "0", icon: Brain, color: "text-cyan-400" },
          { label: "Agents Ready", value: "8", icon: Zap, color: "text-emerald-400" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white/3 border border-white/5 rounded-xl p-5 text-center">
            <stat.icon size={20} className={`${stat.color} mx-auto mb-2`} />
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-xs text-zinc-500 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

### Empty state page template (use for all knowledge space pages)

```tsx
// Example: frontend/app/knowledge/linkedin/page.tsx
import { EmptyState } from "@/components/ui/EmptyState"
import { Linkedin } from "lucide-react"

export default function LinkedInPage() {
  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-2">LinkedIn Knowledge</h1>
        <p className="text-zinc-400 text-sm mb-8">
          Posts, articles, and PDF carousels from LinkedIn — intelligently organized.
        </p>
        <EmptyState
          icon={<Linkedin size={32} className="text-blue-400" />}
          title="No LinkedIn posts saved yet"
          description="Paste a LinkedIn URL in the dashboard to get started. PDF attachments will be stored and readable inside the app."
        />
      </div>
    </div>
  )
}
```

### `frontend/components/ui/EmptyState.tsx`

```tsx
interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description: string
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-white font-semibold text-lg mb-2">{title}</h3>
      <p className="text-zinc-500 text-sm max-w-sm leading-relaxed">{description}</p>
    </div>
  )
}
```

---

## 🔬 Step 4 — Verify Everything Works

### Test sequence

```bash
# 1. Start infrastructure
cd infrastructure && docker-compose up -d
docker-compose ps   # all should show "healthy"

# 2. Verify Ollama and model
ollama pull nomic-embed-text
curl http://localhost:11434/api/embeddings \
  -d '{"model":"nomic-embed-text","prompt":"test"}' | python -m json.tool

# 3. Start backend
cd backend
uvicorn main:app --reload --port 8000

# In new terminal — start Celery
cd backend
celery -A tasks.ingestion.celery_app worker --loglevel=info

# 4. Test health endpoint
curl http://localhost:8000/health

# 5. Test ingest endpoint
curl -X POST http://localhost:8000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"raw_input": "https://linkedin.com/posts/example"}'
# Should return: {"job_id": "...", "status": "queued", ...}

# 6. Check job status
curl http://localhost:8000/api/ingest/{job_id}/status

# 7. Verify PostgreSQL has the row
docker exec -it brainvault-postgres psql -U brainvault -c \
  "SELECT id, status, detected_type FROM ingestion_jobs ORDER BY created_at DESC LIMIT 3;"

# 8. Start frontend
cd frontend
npm run dev

# 9. Open http://localhost:3000
# Paste text → see processing → get toast → check PostgreSQL
```

### MinIO console (verify file storage is working)
- Open `http://localhost:9001`
- Login: `minioadmin` / `minioadmin`
- You should see the `brainvault-files` bucket

### Qdrant dashboard (verify vector DB)
- Open `http://localhost:6333/dashboard`
- You should see the `brainvault` collection

---

## ✅ Phase 0 Completion Checklist

```
Infrastructure
- [ ] docker-compose up — all 4 services healthy (PG, Qdrant, Redis, MinIO)
- [ ] MinIO bucket 'brainvault-files' exists (check console at :9001)
- [ ] Qdrant collection 'brainvault' exists (check dashboard at :6333)
- [ ] Ollama running with nomic-embed-text pulled

Backend
- [ ] uvicorn starts without errors
- [ ] GET /health returns {"status": "ok"}
- [ ] POST /api/ingest returns job_id
- [ ] Celery worker starts and picks up jobs
- [ ] Groq API key verified (detect_input_type returns a valid type)
- [ ] PostgreSQL: ingestion_jobs row created per submission
- [ ] knowledge_items table exists (empty is fine)

Frontend
- [ ] npm run dev starts without errors
- [ ] http://localhost:3000 opens — shows full layout with sidebar
- [ ] All sidebar navigation links render
- [ ] All knowledge space pages show empty state (not 404)
- [ ] Universal input box accepts text
- [ ] Submit → loading spinner appears
- [ ] After ~5 seconds → toast fires "✅ Saved to your brain!"
- [ ] Toast shows detected type correctly

Integration
- [ ] Full flow works: paste text → API → Celery → LangGraph → PostgreSQL → toast
- [ ] No 500 errors in backend logs
- [ ] No 404 errors in frontend console
```

---

> **Phase 0 done?** You now have a real app skeleton with working infrastructure.
> Next: **[Phase 1 →](./phase1.md)** — Build the LinkedIn Agent and the in-app PDF reader.
