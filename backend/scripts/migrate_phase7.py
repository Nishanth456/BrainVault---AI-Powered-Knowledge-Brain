"""
Phase 7 migration: add GitHub/YouTube columns to knowledge_items if missing.
"""
import asyncio
import asyncpg

DSN = "postgresql://brainvault:brainvault_dev@localhost:5432/brainvault"

COLUMNS = [
    ("repo_stars", "INTEGER"),
    ("repo_language", "TEXT"),
    ("tech_stack", "TEXT[]"),
    ("architecture_summary", "TEXT"),
    ("video_duration_seconds", "INTEGER"),
    ("channel_name", "TEXT"),
    ("thumbnail_path", "TEXT"),
    ("chapters", "TEXT"),
    ("transcript", "TEXT"),
    ("playlist_id", "TEXT"),
]


async def migrate():
    conn = await asyncpg.connect(DSN)
    try:
        existing = {
            row["column_name"]
            for row in await conn.fetch(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'knowledge_items'"
            )
        }
        for name, dtype in COLUMNS:
            if name in existing:
                print(f"Column {name} already exists, skipping")
                continue
            await conn.execute(f"ALTER TABLE knowledge_items ADD COLUMN {name} {dtype}")
            print(f"Added column {name} {dtype}")
        print("Migration complete")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
