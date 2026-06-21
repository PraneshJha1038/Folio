from fastapi import FastAPI, HTTPException
from pydantic import EmailStr, field_validator, class_validators
from database import get_db, AsyncSessionLocal
from sqlalchemy import Select, text
from sqlalchemy.ext.asyncio import AsyncSession
import asyncio

app = FastAPI()

@app.get("/")
async def hello():
    return {
        'Status' : 'Backend up and running!'
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
        return{
            'Health': "Unhealthy",
            'Status': "Unsuccessful",
            'Error': str(e)
        }