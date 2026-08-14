"""
regen_linkedin_titles.py

One-off script to regenerate clean, concise AI titles for all existing
LinkedIn knowledge items stored in the database.

Run from the project root:
    python -m backend.scripts.regen_linkedin_titles
"""

import asyncio
import json
from sqlalchemy import select, update
from backend.models.database import AsyncSessionLocal
from backend.models.schemas import KnowledgeItem
from backend.services.llm import call_llm


async def generate_clean_title(summary: str, tags: list[str]) -> str:
    """Ask the LLM to produce a short, article-style title."""
    tags_str = ", ".join(tags or [])
    response = await call_llm(
        prompt=f"""Generate a short, clean article-style title (5-8 words max) for a LinkedIn post.
Write it like a book chapter or blog post headline — a concise noun phrase, NOT a sentence fragment.

Example good titles:
- 'Prompt Caching for LLM Cost Reduction'
- 'Multi-Agent AI System Design Trade-offs'
- 'Fine-Tuning vs RAG: When to Use Each'

Post summary: {summary}
Tags: {tags_str}

Return ONLY the title text, nothing else.""",
        system="You are a knowledge management expert. Generate clean, concise article-style titles.",
        max_tokens=60,
        temperature=0,
    )
    # Strip quotes if the LLM wraps in them
    title = response.strip().strip('"').strip("'").strip()
    return title or "LinkedIn Post"


async def main():
    async with AsyncSessionLocal() as session:
        # Fetch all LinkedIn items
        result = await session.execute(
            select(KnowledgeItem).where(KnowledgeItem.type == "linkedin")
        )
        items = result.scalars().all()
        print(f"Found {len(items)} LinkedIn items to update.")

        updated = 0
        for item in items:
            old_title = item.title or ""
            summary = item.summary or ""
            tags = item.tags or []

            if not summary:
                print(f"  ⏭️  Skipping {item.id} — no summary")
                continue

            new_title = await generate_clean_title(summary, tags)
            print(f"  ✅ [{item.id}]")
            print(f"     OLD: {old_title}")
            print(f"     NEW: {new_title}")

            await session.execute(
                update(KnowledgeItem)
                .where(KnowledgeItem.id == item.id)
                .values(title=new_title)
            )
            updated += 1

        await session.commit()
        print(f"\n✅ Done. Updated {updated}/{len(items)} LinkedIn titles.")


if __name__ == "__main__":
    asyncio.run(main())
