# fastapi/app.py

import os
from uuid import UUID
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Depends, Header
from pydantic import BaseModel
from google import genai

#orm
from sqlalchemy import text
from sqlalchemy.orm import Session

from db.db import engine, Base, get_db
from db.models import User, Conversation, Message
from contextlib import asynccontextmanager
from routers.conversations import get_current_user


#Import routers:
from routers.conversations import router as conversations_router

#Create DB and relations:
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create database tables if they do not already exist.
    Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(title="AI API", lifespan=lifespan)

#add these router endpoint:
app.include_router(conversations_router)


@app.get("/api/whoami")
def whoami(
    x_authenticated_user: str = Header(...),
):
    return {
        "authenticated": True,
        "user_id": x_authenticated_user,
    }

class ChatRequest(BaseModel):
    conversation_id: UUID
    message: str


@app.get("/api/health")
def health():
    return {
        "status": "ok"
    }

@app.get("/api/db-health")
def db_health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

        return {"database": "connected"}

    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Database connection failed",
        ) from exc


@app.get("/api/admin/overview")
def admin_overview():
    api_key = os.environ.get("GEMINI_API_KEY")
    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

    return {
        "platform": "AI Lab",
        "environment": "local",
        "ai_provider": "Google Gemini",
        "model": model,
        "api_key_configured": bool(api_key),
        "capabilities": {
            "chat": True,
            "admin_overview": True,
        },
    }



@app.post("/api/chat")
def chat(
    request: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    api_key = os.environ.get("GEMINI_API_KEY")

    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is not configured",
        )

    # 1. Find the conversation belonging to this user.
    conversation = (
        db.query(Conversation)
        .filter(
            Conversation.id == request.conversation_id,
            Conversation.user_id == user.id,
        )
        .first()
    )

    if conversation is None:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found",
        )

    # 2. Load previous messages from PostgreSQL.
    history = [
        {
            "role": "user" if msg.role == "user" else "model",
            "parts": [{"text": msg.content}],
        }
        for msg in conversation.messages
    ]

    # 3. Add the new user message to the database.
    user_message = Message(
        conversation_id=conversation.id,
        role="user",
        content=request.message,
    )

    db.add(user_message)

    # Give a new conversation its first-message title.
    if conversation.title == "New chat":
        conversation.title = request.message[:60]

    conversation.updated_at = datetime.now(timezone.utc)

    db.commit()

    # 4. Add the new message to Gemini's conversation context.
    history.append({
        "role": "user",
        "parts": [{"text": request.message}],
    })

    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    client = genai.Client(api_key=api_key)

    try:
        response = client.models.generate_content(
            model=model,
            contents=history,
        )

        answer = response.text

        if not answer:
            raise RuntimeError("Gemini returned an empty response")

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="The AI provider request failed",
        ) from exc

    # 5. Save Gemini's response in PostgreSQL.
    assistant_message = Message(
        conversation_id=conversation.id,
        role="assistant",
        content=answer,
    )

    db.add(assistant_message)
    conversation.updated_at = datetime.now(timezone.utc)

    db.commit()

    return {
        "conversation_id": str(conversation.id),
        "answer": answer,
    }
