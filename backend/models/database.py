from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool
from backend.config import settings

# Use NullPool to prevent connection pooling issues when Celery spins up new event loops via asyncio.run()
db_url = settings.DATABASE_URL
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

# Fix Neon specific URL parameters that crash asyncpg
db_url = db_url.replace("sslmode=require", "ssl=require")
db_url = db_url.replace("&channel_binding=require", "")
db_url = db_url.replace("?channel_binding=require", "")

engine = create_async_engine(db_url, echo=False, poolclass=NullPool)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
