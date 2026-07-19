import re

def refactor_knowledge_py():
    with open('backend/routers/knowledge.py.bak', 'r') as f:
        content = f.read()

    # 1. Add new imports
    if "from sqlalchemy import func" not in content:
        content = content.replace("from sqlalchemy import text, select", 
                                  "from sqlalchemy import text, select, func\nfrom datetime import datetime, timezone\nfrom fastapi import HTTPException")
    
    if "from typing import Optional" not in content:
        content = content.replace("from fastapi import APIRouter", "from typing import Optional\nfrom fastapi import APIRouter")

    # 2. Add Stats endpoint near the top
    stats_code = """
@router.get("/stats")
async def get_knowledge_stats(db: AsyncSession = Depends(get_db)):
    \"\"\"Real dashboard stats: total items, breakdown by type, recent activity.\"\"\"
    total = await db.scalar(
        select(func.count()).select_from(KnowledgeItem).where(KnowledgeItem.deleted_at.is_(None))
    )

    type_counts = await db.execute(
        select(KnowledgeItem.type, func.count().label("count"))
        .where(KnowledgeItem.deleted_at.is_(None))
        .group_by(KnowledgeItem.type)
    )
    by_type = {row.type: row.count for row in type_counts}

    recent = await db.execute(
        select(KnowledgeItem)
        .where(KnowledgeItem.deleted_at.is_(None))
        .order_by(KnowledgeItem.created_at.desc())
        .limit(5)
    )

    return {
        "total": total,
        "by_type": by_type,
        "bookmarked": await db.scalar(
            select(func.count()).where(
                KnowledgeItem.is_bookmarked.is_(True),
                KnowledgeItem.deleted_at.is_(None),
            )
        ),
        "recent": [
            {
                "id": str(item.id),
                "type": item.type,
                "title": item.title,
                "created_at": item.created_at.isoformat() if item.created_at else None,
            }
            for item in recent.scalars()
        ],
    }
"""
    # Insert stats before @router.get("") (which is list_knowledge_items)
    content = content.replace('@router.get("")\nasync def list_knowledge_items', stats_code + '\n@router.get("")\nasync def list_knowledge_items')

    # 3. Refactor all get_*_items
    pattern = re.compile(
        r'async def (get_\w+_items)\(\s*limit: int = Query\(default=20, le=100\),\s*offset: int = Query\(default=0\),\s*db: AsyncSession = Depends\(get_db\),\s*\):\s*"""(.*?)"""\s*result = await db\.execute\(\s*select\(KnowledgeItem\)\s*\.options\(selectinload\(KnowledgeItem\.attachments\)\)\s*\.where\((.*?)\)\s*\.order_by\(KnowledgeItem\.created_at\.desc\(\)\)\s*\.limit\(limit\)\s*\.offset\(offset\)\s*\)',
        re.DOTALL
    )

    def replacer(match):
        func_name = match.group(1)
        docstring = match.group(2)
        where_clause = match.group(3)
        
        new_signature = f"""async def {func_name}(
    domain: Optional[str] = Query(None),
    difficulty: Optional[int] = Query(None, ge=1, le=5),
    bookmarked: Optional[bool] = Query(None),
    sort: str = Query("newest"),
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    \"\"\"{docstring}\"\"\"
    query = select(KnowledgeItem).options(selectinload(KnowledgeItem.attachments)).where(
        {where_clause},
        KnowledgeItem.deleted_at.is_(None)
    )

    if domain:
        query = query.where(KnowledgeItem.knowledge_domain == domain)
    if difficulty:
        query = query.where(KnowledgeItem.difficulty == difficulty)
    if bookmarked is not None:
        query = query.where(KnowledgeItem.is_bookmarked.is_(bookmarked))

    if sort == "oldest":
        query = query.order_by(KnowledgeItem.created_at.asc())
    elif sort == "difficulty":
        query = query.order_by(KnowledgeItem.difficulty.desc().nullslast())
    elif sort == "importance":
        query = query.order_by(KnowledgeItem.importance_score.desc().nullslast())
    else:
        query = query.order_by(KnowledgeItem.created_at.desc())

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)"""
        return new_signature

    content = pattern.sub(replacer, content)

    # 4. Refactor delete and add trash/restore/bookmark
    trash_code = """
@router.patch("/{item_id}/bookmark")
async def toggle_bookmark(item_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KnowledgeItem).where(KnowledgeItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    item.is_bookmarked = not item.is_bookmarked
    await db.commit()
    return {"id": item_id, "is_bookmarked": item.is_bookmarked}

@router.delete("/{item_id}")
async def soft_delete_knowledge(item_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KnowledgeItem).where(KnowledgeItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    item.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return {"id": item_id, "deleted": True}

@router.post("/{item_id}/restore")
async def restore_knowledge(item_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KnowledgeItem).where(KnowledgeItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    item.deleted_at = None
    await db.commit()
    return {"id": item_id, "restored": True}

@router.get("/trash")
async def list_trash(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(KnowledgeItem)
        .where(KnowledgeItem.deleted_at.is_not(None))
        .order_by(KnowledgeItem.deleted_at.desc())
    )
    items = result.scalars().all()
    return [
        {
            "id": str(item.id),
            "type": item.type,
            "title": item.title,
            "summary": item.summary,
            "source_url": item.source_url,
            "difficulty": item.difficulty,
            "knowledge_domain": item.knowledge_domain,
            "created_at": item.created_at.isoformat() if item.created_at else None,
            "is_bookmarked": item.is_bookmarked,
        }
        for item in items
    ]
"""
    # Replace old delete endpoint
    delete_pattern = re.compile(r'@router\.delete\("/\{item_id\}"\).*?return \{"message": "Deleted successfully"\}', re.DOTALL)
    content = delete_pattern.sub(trash_code, content)
    
    # Move /trash to before /{item_id}
    # Because @router.get("/{item_id}") will catch /trash if it's declared first.
    # The current order is get_knowledge_item "/{item_id}" then delete_knowledge_item.
    # Actually wait! The trash code replaced delete_knowledge_item, which was *after* get_knowledge_item.
    # I MUST fix this order.
    # Let's just find `@router.get("/{item_id}")` and put `/trash` BEFORE it.
    
    # First, undo the trash code replacement:
    content = delete_pattern.sub('', content)
    
    # Now inject `trash_code` right above `@router.get("/{item_id}")`
    get_item_pattern = r'@router\.get\("/\{item_id\}"\)\s*async def get_knowledge_item'
    content = re.sub(get_item_pattern, trash_code + r'\n@router.get("/{item_id}")\nasync def get_knowledge_item', content)

    # 5. Inject "is_bookmarked": item.is_bookmarked, in all dictionary comprehensions
    content = re.sub(r'("created_at"\s*:\s*item\.created_at\.isoformat\(\),)', r'"is_bookmarked": item.is_bookmarked,\n            \1', content)

    with open('backend/routers/knowledge.py', 'w') as f:
        f.write(content)

if __name__ == "__main__":
    refactor_knowledge_py()
