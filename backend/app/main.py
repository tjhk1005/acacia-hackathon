import hashlib
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import APIError, APITimeoutError
from pydantic import ValidationError

from .agents import PreferencesAgent
from .models import (ChatRequest, ChatResponse, ConfirmWedding, CreateResponse,
                     CreateWedding, MessagesResponse, UpdateWedding, WeddingBrief, WeddingResponse)
from .planning import merge_brief, missing_fields, serialize_wedding
from .store import Store

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


def create_app(database_path=None, agent=None):
    owned_agent = agent is None
    configured_key = os.getenv("OPENAI_API_KEY", "").strip()
    if agent is None and configured_key:
        agent = PreferencesAgent(configured_key, os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
    path = Path(database_path or os.getenv("DATABASE_PATH", "data/weddings.sqlite3"))
    if not path.is_absolute():
        path = ROOT / path
    store = Store(path)

    @asynccontextmanager
    async def lifespan(app):
        yield
        if owned_agent and agent is not None:
            await agent.close()

    app = FastAPI(title="Ever After Planning API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[item.strip() for item in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if item.strip()],
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["Content-Type", "X-Wedding-Token"],
    )

    @app.get("/health")
    def health():
        return {"status": "ok", "ai_configured": agent is not None, "version": "0.1.0"}

    @app.post("/api/weddings", status_code=201, response_model=CreateResponse)
    def create_wedding(body: CreateWedding):
        return store.create(body.brief)

    @app.get("/api/weddings/{wedding_id}", response_model=WeddingResponse)
    def get_wedding(wedding_id: str, x_wedding_token: Optional[str] = Header(None)):
        return {"wedding": serialize_wedding(store.get(wedding_id, x_wedding_token))}

    @app.patch("/api/weddings/{wedding_id}", response_model=WeddingResponse)
    def update_wedding(wedding_id: str, body: UpdateWedding, x_wedding_token: Optional[str] = Header(None)):
        row = store.get(wedding_id, x_wedding_token)
        brief, changed = merge_brief(WeddingBrief.model_validate_json(row["brief"]), body.brief)
        status = "draft" if changed else row["status"]
        return store.save(wedding_id, body.expected_revision, brief, status)

    @app.post("/api/weddings/{wedding_id}/confirm", response_model=WeddingResponse)
    def confirm_wedding(wedding_id: str, body: ConfirmWedding, x_wedding_token: Optional[str] = Header(None)):
        row = store.get(wedding_id, x_wedding_token)
        brief = WeddingBrief.model_validate_json(row["brief"])
        if missing_fields(brief):
            raise HTTPException(422, {"message": "Complete the required wedding details first", "missing_fields": missing_fields(brief)})
        return store.save(wedding_id, body.expected_revision, brief, "confirmed")

    @app.get("/api/weddings/{wedding_id}/messages", response_model=MessagesResponse)
    def messages(wedding_id: str, x_wedding_token: Optional[str] = Header(None)):
        store.get(wedding_id, x_wedding_token)
        return {"messages": store.history(wedding_id)}

    @app.post("/api/weddings/{wedding_id}/chat", response_model=ChatResponse)
    async def chat(wedding_id: str, body: ChatRequest, x_wedding_token: Optional[str] = Header(None)):
        row = store.get(wedding_id, x_wedding_token)
        request_id = str(body.request_id)
        payload_hash = hashlib.sha256(body.model_dump_json().encode()).hexdigest()
        cached = store.replay(wedding_id, request_id, payload_hash)
        if cached is not None:
            return cached
        if row["revision"] != body.expected_revision:
            raise HTTPException(409, "The wedding changed. Fetch the latest revision and retry.")
        if agent is None:
            raise HTTPException(503, {"code": "ai_not_configured", "message": "Set OPENAI_API_KEY on the backend to enable preference chat. Brief editing still works."})
        brief = WeddingBrief.model_validate_json(row["brief"])
        try:
            result = await agent.extract(brief, store.history(wedding_id, limit=12), body.message)
            updated, changed = merge_brief(brief, result.updates)
        except APITimeoutError:
            raise HTTPException(504, "The AI request timed out. The wedding was not changed.")
        except (APIError, ValueError, ValidationError):
            raise HTTPException(502, "Could not obtain a valid AI response. The wedding was not changed.")
        status = "draft" if changed else row["status"]
        return store.save(
            wedding_id, body.expected_revision, updated, status,
            messages=[("user", body.message), ("assistant", result.reply)],
            request=(request_id, payload_hash),
            response_factory=lambda wedding: {
                "wedding": wedding, "reply": result.reply,
                "changed_fields": changed, "questions": result.questions,
                "request_id": request_id, "agent": "preferences",
            },
        )

    return app


app = create_app()
