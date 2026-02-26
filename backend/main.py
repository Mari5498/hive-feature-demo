"""
Hive Campaign Intelligence — FastAPI backend

Single endpoint: POST /api/chat
Returns a Server-Sent Events stream of typed events.
See ENGINEERING.md for the full SSE event schema.
"""

import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from models import ChatRequest
from agent import run_agent_stream

load_dotenv()

# Rate limit: 5 requests/minute per IP — prevents abuse while allowing normal demo use
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Hive Campaign Intelligence API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

allowed_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/chat")
@limiter.limit("5/minute")
async def chat(request: Request, body: ChatRequest):
    messages = [m.model_dump() for m in body.messages]

    return StreamingResponse(
        run_agent_stream(messages),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable nginx buffering for SSE
        },
    )
