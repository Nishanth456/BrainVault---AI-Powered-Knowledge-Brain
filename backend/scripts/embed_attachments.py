import asyncio
import sys
import os

# Ensure backend module is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from sqlalchemy import select
from backend.models.database import AsyncSessionLocal
from backend.models.schemas import Attachment, KnowledgeItem
from backend.services.embedding import generate_embedding
from backend.services.qdrant import upsert_knowledge_item
from backend.services.text_chunker import chunk_text

async def main():
    print("Fetching attachments with extracted text...")
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Attachment).join(KnowledgeItem).where(Attachment.extracted_text != None)
        )
        attachments = result.scalars().all()

    print(f"Found {len(attachments)} attachments. Generating chunks and embeddings...")
    
    for att in attachments:
        if not att.extracted_text or not att.extracted_text.strip():
            continue
            
        chunks = chunk_text(att.extracted_text, chunk_size=1500, overlap=200)
        print(f"Processing attachment {att.filename} (ID: {att.id}) -> {len(chunks)} chunks")
        
        for i, chunk in enumerate(chunks):
            chunk_content = f"Document: {att.filename}\nPart {i+1}\nContent: {chunk}"
            vector = await generate_embedding(chunk_content)
            upsert_knowledge_item(
                item_id=str(att.knowledge_item_id),
                vector=vector,
                payload={
                    "type": "attachment_chunk",
                    "title": att.filename or "Attachment",
                    "summary": chunk,
                    "knowledge_tree": "", # Can't easily backfill this from the attachment relation without a bigger query, empty is fine for now
                    "key_concepts": [],
                    "difficulty": 3,
                }
            )
        print(f"✅ Upserted chunks for {att.filename}")
        
    print("🎉 Backfill complete!")

if __name__ == "__main__":
    asyncio.run(main())
