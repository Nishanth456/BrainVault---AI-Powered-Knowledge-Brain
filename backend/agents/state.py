from typing import TypedDict, Optional, Annotated
import operator


class BrainVaultState(TypedDict):
    # Input
    raw_input: str                        # What the user pasted
    job_id: str                           # UUID of the ingestion job

    # Detection
    input_type: Optional[str]            # 'linkedin', 'blog', 'pdf', 'plaintext', etc.
    url: Optional[str]                   # If URL-based input
    concept: Optional[str]              # User-provided concept label (e.g. "Guardrails")
    file_path: Optional[str]             # If file upload

    # Content extracted by the agent
    scraped_content: Optional[dict]
    extracted_text: Optional[str]
    attachments: Optional[list]          # List of found attachments
    source_url: Optional[str]            # Canonical URL of the content
    author: Optional[str]                # Author name (e.g. LinkedIn post author)

    # AI-generated enrichment
    title: Optional[str]
    summary: Optional[str]
    key_concepts: Optional[list[str]]
    tags: Optional[list[str]]
    difficulty: Optional[int]
    knowledge_tree: Optional[str]        # "AI > LLMs > RAG"
    knowledge_domain: Optional[str]
    qna_pairs: Optional[list[dict]]
    metadata: Optional[dict]             # Full metadata object

    # YouTube-specific fields
    video_duration_seconds: Optional[int]
    channel_name: Optional[str]
    thumbnail_path: Optional[str]
    chapters: Optional[list]
    transcript: Optional[list]
    playlist_id: Optional[str]

    # Storage references
    knowledge_item_id: Optional[str]    # PostgreSQL UUID
    embedding_id: Optional[str]         # Qdrant point ID
    stored_files: list[str]             # MinIO paths

    # Status / Streaming
    agent_steps: Annotated[list[str], operator.add]  # Streamed to frontend
    error: Optional[str]
