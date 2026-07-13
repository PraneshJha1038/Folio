from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from dotenv import load_dotenv
import os
from sqlalchemy.orm import DeclarativeBase
from urllib.parse import quote_plus
load_dotenv()

DATABASE_URL = (os.getenv("DATABASE_URL"))
engine = create_async_engine(
    DATABASE_URL, #type:ignore
    pool_pre_ping= True,
    echo = os.getenv("DEBUG", "false").lower() == "true",
    pool_size = 10,
    max_overflow = 20
)

class Base(DeclarativeBase):
    pass

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_= AsyncSession,
    expire_on_commit=False
)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
