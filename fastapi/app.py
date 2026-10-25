# fastapi/app.py

import os

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from google import genai


app = FastAPI(title="AI API")


class ChatRequest(BaseModel):
    prompt: str


@app.get("/api/health")
def health():
    return {
        "status": "ok"
    }


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
def chat(request: ChatRequest):

    api_key = os.environ.get("GEMINI_API_KEY")

    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is not configured"
        )

    model = os.environ.get(
        "GEMINI_MODEL",
        "gemini-2.5-flash"
    )

    client = genai.Client(
        api_key=api_key
    )

    response = client.models.generate_content(
        model=model,
        contents=request.prompt
    )

    return {
        "answer": response.text
    }