from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from backend.config import settings
from backend.routers import ingest, health, knowledge, files, search, chat, learning_paths
from backend.services.qdrant import ensure_collection
from backend.services.minio import ensure_bucket


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────────
    print("Starting BrainVault backend...")
    ensure_collection()   # Create Qdrant collection if missing
    ensure_bucket()        # Create MinIO bucket if missing

    # Auto-create any missing tables (idempotent — safe to run every time)
    from backend.models.database import engine, Base
    import backend.models.schemas  # noqa: F401 — import all models so Base.metadata is populated
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("BrainVault backend started")
    yield
    # ── Shutdown ─────────────────────────────────────────────────────────────
    print("BrainVault backend shutting down")



app = FastAPI(
    title="BrainVault API",
    description="AI-powered personal knowledge brain — REST API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(ingest.router)
app.include_router(knowledge.router)
app.include_router(files.router)          # Phase 1 — serve PDF/image files from MinIO
app.include_router(search.router)         # Phase 5 — semantic search
app.include_router(chat.router)           # Phase 6 — RAG chat
app.include_router(learning_paths.router) # Phase 9 — learning paths

# Future routers (added in later phases)
