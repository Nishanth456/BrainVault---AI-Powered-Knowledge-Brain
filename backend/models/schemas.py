import uuid
from datetime import datetime
from sqlalchemy import String, Text, Integer, ARRAY, ForeignKey, BigInteger, func
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
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=datetime.utcnow)

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
