from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from database import AsyncSessionLocal
from router.auth import router as auth_router
from router.content import router as content_router
from router.library import router as library_router
from router.reading import router as reading_router
from router.suggestions import router as suggestions_router

app = FastAPI(
    title="folio API",
    description="Backend API for folio - AI-powered read later app",
    version="1.0.0"
)

# CORS Configuration
# Standard CORS config for local development and Chrome Extensions
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins (essential for Chrome extension and local dev server)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth_router)
app.include_router(content_router)
app.include_router(library_router)
app.include_router(reading_router)
app.include_router(suggestions_router)

@app.get("/")
async def hello():
    return {
        'Status': 'Backend up and running!'
    }

@app.get("/health")
async def check_health():
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return {
            'Health': 'Healthy',
            'Status': 'Success',
            'Version': 'v1.1.1'
        }
    except Exception as e:
        return {
            'Health': "Unhealthy",
            'Status': "Unsuccessful",
            'Error': str(e)
        }