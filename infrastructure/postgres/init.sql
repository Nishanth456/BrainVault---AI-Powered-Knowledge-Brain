-- BrainVault PostgreSQL Schema
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

    -- GitHub-specific fields
    repo_stars INTEGER,
    repo_language TEXT,
    tech_stack TEXT[],
    architecture_summary TEXT,

    -- YouTube-specific fields
    video_duration_seconds INTEGER,
    channel_name TEXT,
    thumbnail_path TEXT,                -- MinIO path to thumbnail image
    chapters TEXT,                      -- JSON string of chapter markers
    transcript TEXT,
    playlist_id TEXT,

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
