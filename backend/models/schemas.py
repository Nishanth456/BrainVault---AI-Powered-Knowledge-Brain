import uuid
from datetime import datetime
from sqlalchemy import String, Text, Integer, ARRAY, ForeignKey, BigInteger, func, Float
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

    # GitHub-specific fields
    repo_stars: Mapped[int | None] = mapped_column(Integer)
    repo_language: Mapped[str | None] = mapped_column(Text)
    tech_stack: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    architecture_summary: Mapped[str | None] = mapped_column(Text)

    # YouTube-specific fields
    video_duration_seconds: Mapped[int | None] = mapped_column(Integer)
    channel_name: Mapped[str | None] = mapped_column(Text)
    thumbnail_path: Mapped[str | None] = mapped_column(Text)
    chapters: Mapped[dict | None] = mapped_column(Text)  # JSON string of chapters
    transcript: Mapped[str | None] = mapped_column(Text)
    playlist_id: Mapped[str | None] = mapped_column(Text)

    # Course-specific fields
    instructor: Mapped[str | None] = mapped_column(Text)
    rating: Mapped[float | None] = mapped_column(Float)
    price: Mapped[str | None] = mapped_column(Text)
    syllabus: Mapped[str | None] = mapped_column(Text) # JSON string of syllabus
    prerequisites: Mapped[list[str] | None] = mapped_column(ARRAY(Text))

    # Certification-specific fields
    issuer: Mapped[str | None] = mapped_column(Text)
    issue_date: Mapped[str | None] = mapped_column(Text) # ISO format string
    valid_until: Mapped[str | None] = mapped_column(Text)
    cert_id: Mapped[str | None] = mapped_column(Text)
    exam_topics: Mapped[list[str] | None] = mapped_column(ARRAY(Text))

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=datetime.utcnow)

    # Phase 12 fields
    is_bookmarked: Mapped[bool] = mapped_column(default=False, nullable=False, server_default="false")
    deleted_at: Mapped[datetime | None] = mapped_column(nullable=True)

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
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    knowledge_item: Mapped["KnowledgeItem"] = relationship(back_populates="attachments")


class IngestionJob(Base):
    __tablename__ = "ingestion_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status: Mapped[str] = mapped_column(String(20), default="queued")
    raw_input: Mapped[str] = mapped_column(Text, nullable=False)
    detected_type: Mapped[str | None] = mapped_column(String(50))
    knowledge_item_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("knowledge_items.id"), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=datetime.utcnow)


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=datetime.utcnow)

    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="session",
        order_by="ChatMessage.created_at",
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("chat_sessions.id"))
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # user | assistant | system
    content: Mapped[str | None] = mapped_column(Text)
    citations: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    session: Mapped["ChatSession"] = relationship(back_populates="messages")


class LearningPath(Base):
    __tablename__ = "learning_paths"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str | None] = mapped_column(Text)
    topic: Mapped[str] = mapped_column(Text, nullable=False)
    stages: Mapped[str | None] = mapped_column(Text)                        # JSON string of stage dicts
    gaps: Mapped[list[str] | None] = mapped_column(ARRAY(Text))             # detected knowledge gap topics
    total_items: Mapped[int | None] = mapped_column(Integer, default=0)
    completed_stages: Mapped[list[str] | None] = mapped_column(ARRAY(Text)) # titles of completed stages
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=datetime.utcnow)


# ── Phase 11: User Profile ────────────────────────────────────────────────────

from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB

class UserProfile(Base):
    __tablename__ = "user_profile"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    full_name: Mapped[str | None] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(Text)
    linkedin_url: Mapped[str | None] = mapped_column(Text)
    github_url: Mapped[str | None] = mapped_column(Text)
    website_url: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    education: Mapped[list | None] = mapped_column(PG_JSONB)
    experience: Mapped[list | None] = mapped_column(PG_JSONB)
    skills: Mapped[dict | None] = mapped_column(PG_JSONB)
    certifications: Mapped[list | None] = mapped_column(PG_JSONB)
    projects: Mapped[list | None] = mapped_column(PG_JSONB)
    publications: Mapped[list | None] = mapped_column(PG_JSONB)
    achievements: Mapped[list | None] = mapped_column(PG_JSONB)
    resume_path: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=datetime.utcnow)

