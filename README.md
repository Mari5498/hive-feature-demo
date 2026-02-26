# Hive Campaign Intelligence Agent

A live demo built for Hive.co's [Product Engineer, Agentic AI](https://www.workatastartup.com/jobs/83884) role.

**What it does:** An event promoter types what they want in plain English. The agent queries the fan CRM, generates email + SMS copy, and schedules the campaign — all in one conversation, no dropdowns or forms.

**Why it exists:** Klaviyo already ships a "Marketing Agent." Hive doesn't have one yet. This demo shows what it would look like built on Hive's exact stack.

**Stack:** Next.js + TypeScript · FastAPI + LangGraph · Claude API · Vercel + Railway

---

## How It Maps to the Role

| JD requirement | Implementation |
|---|---|
| "Conversational interfaces via natural language" | Chat input → LangGraph agent parses intent, no structured forms |
| "Multi-step AI agent workflows" | LangGraph ReAct loop: query → segment → draft → schedule |
| "AI agents execute marketing operations" | Tools actually run: `query_crm`, `generate_campaign_copy`, `schedule_campaign` |
| "New interaction modes combining React + backend APIs" | Agent output renders as `AudienceCard`, `CampaignPreview`, `AgentPipeline` — not just chat text |
| "LangGraph" (explicitly named in JD) | `backend/agent.py` — `StateGraph` + `ToolNode` + `astream_events` |
| "Production-ready, scales to thousands of users" | See [SCALING.md](./SCALING.md) — DB, caching, auth, observability migration path |
| "Contribute to technical architecture" | [ENGINEERING.md](./ENGINEERING.md) written before any code — SSE schema, LangGraph patterns, simplicity rules |

---

## Architecture

```
Browser
  │  POST /api/chat { messages: [...] }
  ▼
FastAPI (Railway)
  │  LangGraph ReAct loop
  ▼
[agent: Claude Sonnet] ↔ [tools]
  ├─ query_crm              → filters 80-fan CRM, returns segment stats
  ├─ generate_campaign_copy → calls Claude Haiku, returns structured email + SMS
  └─ schedule_campaign      → returns campaign confirmation
  │  SSE stream of typed events
  ▼
Browser renders: AgentPipeline · AudienceCard · CampaignPreview · Chat
```

**A few deliberate decisions:**

- **SSE over WebSockets** — agent output is unidirectional; SSE is simpler, works over HTTP/2, no infrastructure overhead
- **Claude Haiku for copy, Sonnet for reasoning** — Haiku is fast and cheap for bounded structured output; Sonnet handles the orchestration logic. Standard model cascade pattern.
- **SQL over vector DB** — audience segmentation is structured filtering (genre, recency, spend, location). A vector DB makes sense for semantic search over unstructured content — not this feature.
- **FastAPI over Django** — lighter weight for a demo; better native async/SSE support. In production at Hive this would be a Django view or internal microservice.

---

## Local Development

**Prerequisites:** Node.js 20+, Python 3.11+, Anthropic API key

```bash
# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env          # add ANTHROPIC_API_KEY
uvicorn main:app --reload     # http://localhost:8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                   # http://localhost:3000
```

Try these prompts:
- *"Find jazz fans who haven't bought tickets in the last 3 months"*
- *"Create an email and SMS campaign for the New Orleans Jazz Festival on April 15th"*
- *"Schedule it for tomorrow at 10am"*

---

## Deployment

**Backend → Railway:** Connect repo, set root to `backend/`, add `ANTHROPIC_API_KEY` and `ALLOWED_ORIGINS` env vars. Railway picks up `Procfile` automatically.

**Frontend → Vercel:** Import repo, set root to `frontend/`, add `NEXT_PUBLIC_API_URL` pointing to the Railway URL.

---

## Project Structure

```
├── ENGINEERING.md       # Architecture, LangGraph explained, SSE schema, coding standards
├── SCALING.md           # Production migration path (DB, caching, auth, observability)
│
├── backend/
│   ├── agent.py         # LangGraph ReAct agent + SSE streaming
│   ├── tools.py         # query_crm, generate_campaign_copy, schedule_campaign
│   ├── main.py          # FastAPI app + /api/chat endpoint
│   ├── models.py        # Pydantic models
│   └── data/fans.json   # 80 mock fan records (genres, spend, engagement)
│
└── frontend/
    ├── components/
    │   ├── Chat.tsx            # SSE client + message orchestration
    │   ├── AgentPipeline.tsx   # Live phase indicator (5 steps)
    │   ├── AudienceCard.tsx    # Segment stats + fan preview
    │   └── CampaignPreview.tsx # Email + SMS tabbed preview
    └── lib/api.ts              # TypeScript types + streaming client
```

---

## What Comes Next (If Built at Hive)

- **Week 1** — Connect to Hive's Django ORM + auth; replace `fans.json` with real queries (one-file change in `tools.py`)
- **Week 2** — LangGraph checkpointer for multi-turn memory; wire up Hive's actual email/SMS APIs
- **Week 3** — LangSmith observability, prompt A/B testing, staging deploy
