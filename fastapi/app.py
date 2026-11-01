# fastapi/app.py

import os

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from google import genai


app = FastAPI(title="AI API")


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    # Keep prompt temporarily so older clients continue to work.
    prompt: str | None = None
    messages: list[ChatMessage] = []


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
            detail="GEMINI_API_KEY is not configured",
        )

    # Use conversation history when supplied.
    if request.messages:
        contents = [
            {
                "role": "user" if message.role == "user" else "model",
                "parts": [{"text": message.content}],
            }
            for message in request.messages
            if message.role in ("user", "assistant")
        ]
    elif request.prompt:
        # Compatibility with the previous frontend.
        contents = request.prompt
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide either prompt or messages",
        )

    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    client = genai.Client(api_key=api_key)

    try:
        response = client.models.generate_content(
            model=model,
            contents=contents,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="The AI provider request failed",
        ) from exc

    return {"answer": response.text}