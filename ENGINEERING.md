# Engineering Excellence Guide

This document is the codebase constitution. Read it before writing any code. All contributors (human or AI) should follow these principles.

---

## Core Principle: Keep It Simple

> "Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away." — Antoine de Saint-Exupéry

- Write the minimum code that solves the problem
- No premature abstractions — don't create a helper for a one-time operation
- No over-engineering — don't design for hypothetical future requirements
- Three similar lines of code is better than a premature abstraction
- If you're adding a layer of indirection, you need a concrete reason

---

## What is LangGraph and Why Are We Using It?

**LangGraph** is a framework for building stateful, multi-step AI agent workflows. Think of it as a directed graph where:
- **Nodes** = steps the agent takes (calling the LLM, calling a tool)
- **Edges** = transitions between steps (conditional: "did the LLM request a tool? yes → run it, no → done")
- **State** = a shared dict that flows through the graph and accumulates results

**Why not just use a regular API call?**
A plain LLM call is `in → out`. That's fine for Q&A. But marketing workflows are inherently multi-step:
1. Understand what the user wants
2. Query the CRM with the right filters
3. Generate copy based on the results
4. Schedule the campaign when confirmed

LangGraph makes this loop explicit, controllable, and observable — each step streams events we can surface in the UI. It's also what Hive explicitly lists in their JD.

**How this project uses it:**
```
User message
    ↓
[agent node] — Claude decides what to do (call a tool or respond)
    ↓  tool call requested?
[tools node] — executes the tool (query_crm / generate_campaign_copy / schedule_campaign)
    ↓  result fed back into state
[agent node] — Claude sees the result, decides: another tool or final response?
    ... loops until Claude responds with no tool calls
    ↓
Final response streamed to user
```

The UI shows this as 5 conceptual phases (Intent → Audience Research → Strategy → Copy → Schedule) that light up based on which tool is currently running. The underlying graph is a standard ReAct loop.

**Key LangGraph concepts used:**
- `StateGraph` — the graph container
- `AgentState` — TypedDict that accumulates results across nodes
- `ToolNode` — prebuilt node that executes tool calls from the LLM's response
- `astream_events(version="v2")` — async generator that yields granular events as the graph runs

---

## Architecture Overview

```
Browser (Next.js / Vercel)
  │
  │  POST /api/chat  { messages: [...] }
  ▼
FastAPI (Railway)
  │
  │  LangGraph ReAct loop (async)
  ▼
┌──────────────────────────────────────────────────────┐
│  [agent] ←──────────────────────────────────────┐   │
│      │ decides to call tool                      │   │
│      ▼                                           │   │
│  [tools]                                         │   │
│    ├─ query_crm          → audience segment      │   │
│    ├─ generate_campaign_copy → email + SMS copy  │   │
│    └─ schedule_campaign  → campaign confirmation │   │
│      │ result added to state                     │   │
│      └─────────────────────────────────────────►┘   │
└──────────────────────────────────────────────────────┘
  │
  │  SSE stream of typed events (text/event-stream)
  ▼
Browser renders:
  - AgentPipeline (conceptual phase progress)
  - AudienceCard (segment result)
  - CampaignPreview (email + SMS)
  - Chat messages (streaming text)
```

**Data flow is one-directional.** The frontend only sends messages; all state lives in the backend agent during a request.

---

## SSE Event Schema

The SSE stream is the **only** contract between frontend and backend. Both sides must conform to this schema exactly.

```json
// Agent phase progress (tool name maps to a UI phase)
{"type": "agent_step", "node": "query_crm", "status": "running"}
{"type": "agent_step", "node": "query_crm", "status": "done"}

// node values: "analyzing" | "query_crm" | "generate_campaign_copy" | "schedule_campaign"

// Audience segment result (emitted when query_crm tool completes)
{"type": "audience_result", "data": {
  "count": 42,
  "segment_id": "seg_abc123",
  "avg_spent": 287.50,
  "open_rate": 0.64,
  "fans": [{"first_name": "...", "city": "...", "last_purchase_date": "..."}]
}}

// Campaign draft (emitted when generate_campaign_copy tool completes)
{"type": "campaign_draft", "data": {
  "email": {"subject": "...", "preview_text": "...", "body": "..."},
  "sms": {"body": "..."}
}}

// Streaming LLM text tokens
{"type": "token", "content": "I found"}

// Campaign scheduled (emitted when schedule_campaign tool completes)
{"type": "scheduled", "data": {"send_at": "2025-04-14T10:00:00", "audience_size": 42, "campaign_id": "..."}}

// Stream complete
{"type": "done"}

// Error
{"type": "error", "message": "..."}
```

**Rule:** Never add undocumented event types. Update this schema first, then implement.

---

## Backend Best Practices (FastAPI)

### Route design
- One file per concern: `main.py` (routes), `agent.py` (LangGraph), `tools.py` (tools), `models.py` (Pydantic)
- Routes are thin — they receive the request, call the agent, and stream the response. No business logic in routes.
- Use `StreamingResponse` with `media_type="text/event-stream"` for SSE

### Pydantic models
- Define input/output models in `models.py`
- Validate at the boundary (request body) — trust internal data
- Use `model_validator` for cross-field validation, not inline if-blocks

### Error handling
- Fail loudly: raise `HTTPException` with a clear message rather than silently returning empty results
- If a tool call fails, emit `{"type": "error", "message": "..."}` over SSE, then `{"type": "done"}`
- Never swallow exceptions with bare `except: pass`

### Environment variables
- All secrets in `.env` (never hardcoded)
- Use `python-dotenv` — load at startup, not per-request
- Required vars: `ANTHROPIC_API_KEY`, `ALLOWED_ORIGINS`

---

## Frontend Best Practices (Next.js App Router)

### Component boundaries
- One component per file, named identically to the file (`Chat.tsx` exports `Chat`)
- Components are "dumb" by default — they receive props and render. Put logic in hooks or the parent.
- Use `"use client"` only where needed (components with event handlers or browser APIs)

### State management
- No global state library (Redux, Zustand, etc.) — this app is simple enough for `useState` + props
- Message list lives in `Chat.tsx` — it's the single source of truth for the conversation
- SSE connection lifecycle: open on send, close on `done` or error

### TypeScript
- Define types in `lib/api.ts` — import them everywhere, never use `any`
- Prefer interfaces for object shapes, types for unions and primitives

### Styling
- Tailwind only — no inline styles, no CSS modules
- Dark theme: `bg-[#0f0f14]` base, `violet-500`/`violet-600` accents
- Animations: use Tailwind's `animate-pulse` and `transition` utilities — no custom keyframes

---

## LangGraph Patterns

### StateGraph structure
- Use a standard ReAct loop: `agent` ↔ `tools`; avoid complex multi-node graphs unless complexity is warranted
- `AgentState` fields: `messages` (accumulated via `operator.add`), plus any structured results the UI needs
- Return only the keys you're updating — LangGraph merges with existing state
- Tool nodes use LangGraph's prebuilt `ToolNode` — don't reinvent this

### Tool design
- Tools are decorated with `@tool` from `langchain_core.tools`
- Tool docstrings are the LLM's prompt — write them clearly and concisely
- Tools return structured dicts, not strings
- If a tool needs an LLM internally (e.g. `generate_campaign_copy`), use Claude Haiku for cost efficiency

### Streaming
- Use `graph.astream_events(input, version="v2")` for granular event streaming
- Filter `on_tool_end` to extract structured data (audience results, campaign drafts) for UI cards
- Filter `on_chat_model_stream` for token-level text streaming
- Avoid: don't try to extract structured data from LLM tokens — extract from tool results only

---

## Standards from the Field

Rules distilled from how senior engineers use AI-assisted development tools effectively:

**On documentation:**
- This file is the source of truth — keep it under 300 lines; move detail to linked docs ([SCALING.md](SCALING.md))
- Prefer `file:line` references over embedding code snippets — code changes, references stay accurate
- Document only what's genuinely non-obvious; trust existing patterns to communicate intent
- Every rule needs an alternative: "avoid X; prefer Y" — not just "never X"

**On tooling:**
- Don't rely on an LLM to enforce code style; prefer deterministic linters/formatters
- Backend: use `ruff` for Python linting and formatting
- Frontend: use ESLint + Prettier (already configured via `create-next-app`)
- These run fast, catch style issues deterministically, and don't consume tokens

**On AI-assisted development:**
- When asking Claude to write code, point it to this doc first
- Claude follows explicit file:line patterns well — link to authoritative examples rather than writing new patterns from scratch
- Treat code review as mandatory even for AI-generated code

---

## Code Review Checklist

Before committing any code, verify:

- [ ] Does this solve the problem with the minimum code needed?
- [ ] Is there any abstraction that's only used once? (Remove it)
- [ ] Are there any hardcoded values that should be env vars?
- [ ] Does every tool/function have a clear, single purpose?
- [ ] Does the SSE event conform to the schema in this doc?
- [ ] Are TypeScript types defined (no `any`)?
- [ ] Do error paths emit SSE errors and then `done`?
- [ ] Is the code readable without comments? (If not, simplify first, then add a comment)
