# Scaling the Campaign Intelligence Agent

This document describes how the demo would evolve to handle production load at Hive's scale — 1,500+ event marketers, each with tens of thousands of fan records, running concurrent campaigns.

---

## Current Demo Limitations

| Limitation | Demo approach | Production concern |
|---|---|---|
| Fan data | 80 records in `fans.json` (in-memory) | Millions of records per promoter |
| Concurrency | Single FastAPI process | Hundreds of simultaneous agent sessions |
| Auth | None | Multi-tenant isolation required |
| Persistence | No conversation history | Agents need to recall prior context |
| Cost | Uncapped LLM calls | Per-promoter usage limits |
| Observability | Console logs | Requires tracing, latency metrics |

---

## Database Layer

**Replace `fans.json` with PostgreSQL.**

```sql
-- Core tables
fans (id, promoter_id, email, phone, city, state, total_spent, subscribed_at)
fan_events (fan_id, event_id, purchased_at)
events (id, promoter_id, name, genre, venue, event_date)
campaigns (id, promoter_id, segment_id, status, scheduled_at, sent_at)
```

**Audience queries** become parameterized SQL with indexes on `(promoter_id, genre)`, `(fan_id, purchased_at)`. The `query_crm` tool issues a single SQL query instead of filtering a Python list.

**Read replicas** for analytics queries (open rates, revenue attribution) — keeps writes fast on the primary.

**Why not a vector DB?** Audience segmentation is structured filtering (genre, date range, spend), not semantic search. SQL is the right tool here. A vector DB would be appropriate if we added semantic search over unstructured fan notes or email content.

---

## Agent Concurrency

The demo runs one agent per request in a single process. In production:

```
                    ┌─────────────────────────────┐
Browser (N users)   │  Load Balancer (Railway/ALB) │
      │             └──────────┬──────────────────┘
      │                        │  routes to any instance
      ▼                        ▼
  SSE connection     ┌─────────────────────┐
  (held open         │  FastAPI instance 1  │
  ~10-30 seconds)    ├─────────────────────┤
                     │  FastAPI instance 2  │
                     ├─────────────────────┤
                     │  FastAPI instance N  │
                     └─────────────────────┘
```

- FastAPI is **async** — each `POST /api/chat` request runs as a coroutine, holding the SSE connection open while the LangGraph agent streams
- Add `--workers N` to uvicorn or use Gunicorn with uvicorn workers for multi-core
- Agent state is **request-scoped** — no shared mutable state between instances, so horizontal scaling is trivial
- SSE connections are cheap (no polling, no websocket upgrade); 1,000 concurrent streams is feasible on modest hardware

---

## Conversation Persistence (Multi-turn Memory)

The demo sends the full message history in every request. In production, use **LangGraph's checkpoint system**:

```python
from langgraph.checkpoint.postgres import PostgresSaver

checkpointer = PostgresSaver(connection_string=os.environ["DATABASE_URL"])
graph = workflow.compile(checkpointer=checkpointer)

# Each conversation has a thread_id
config = {"configurable": {"thread_id": session_id}}
graph.astream_events(input, config=config, version="v2")
```

This stores agent state (including audience results and campaign drafts) between requests. The frontend only needs to send the new message — history is retrieved from the checkpoint.

---

## Caching

**Audience queries** — same promoter, same filters, same result within a reasonable window:

```python
import hashlib, json
from redis import Redis

cache_key = f"audience:{promoter_id}:{hashlib.md5(json.dumps(filters, sort_keys=True).encode()).hexdigest()}"
cached = redis.get(cache_key)
if cached:
    return json.loads(cached)
# ... run query, then:
redis.setex(cache_key, ttl=300, value=json.dumps(result))  # 5-minute TTL
```

**LLM prompt caching** — the system prompt is the same for every request. Anthropic's prompt caching feature caches the first ~2,000 tokens, reducing cost and latency by ~90% for the cached portion.

---

## Rate Limiting

Per-promoter limits prevent runaway LLM costs and protect against abuse:

```python
# FastAPI middleware using Redis sliding window
LIMIT = 20  # requests per hour per promoter
key = f"rate:{promoter_id}"
count = redis.incr(key)
if count == 1:
    redis.expire(key, 3600)
if count > LIMIT:
    raise HTTPException(429, "Rate limit exceeded")
```

Campaign scheduling (the final step) is idempotent — if a promoter accidentally sends the same request twice, the second call returns the existing campaign rather than creating a duplicate.

---

## Authentication & Multi-tenancy

The demo has no auth. In production:

1. **JWT tokens** issued by Hive's existing Django auth — the FastAPI service validates them on every request
2. **Promoter ID extracted from the token** — all database queries and Redis keys are scoped to `promoter_id`
3. **Fan data isolation** — `SELECT ... WHERE promoter_id = ?` on every query; no risk of data leakage between accounts
4. Hive likely already has an auth service; the agent backend would be a new internal service that validates tokens from the same issuer

---

## Monitoring & Observability

The demo logs to stdout. In production:

**Structured logging** — every LangGraph node emits a JSON log line:
```json
{"event": "node_complete", "node": "audience_researcher", "duration_ms": 142, "promoter_id": "...", "fan_count": 42}
```

**Latency tracking** — each agent node is timed. Slow nodes (e.g., LLM copy generation) are candidates for optimization (streaming, smaller prompts, prompt caching).

**LLM cost tracking** — Anthropic's API returns token counts per response. Aggregate by `promoter_id` to surface usage patterns and enforce billing tiers.

**Error alerting** — tool failures (bad SQL query, LLM timeout) emit structured errors that trigger PagerDuty or Slack alerts.

**Recommended stack:** OpenTelemetry for traces → Grafana/Datadog. LangSmith for LLM-specific tracing (LangGraph natively integrates with LangSmith).

---

## Summary: Migration Path

| Phase | What changes | Effort |
|---|---|---|
| Phase 1 (demo → staging) | Replace fans.json with PostgreSQL, add JWT auth | ~1 week |
| Phase 2 (staging → beta) | Add Redis caching, LangGraph checkpointer, rate limiting | ~1 week |
| Phase 3 (beta → production) | Horizontal scaling, structured logging, LangSmith tracing | ~1 week |
| Phase 4 (production hardening) | Prompt caching, per-promoter billing, anomaly alerting | ongoing |

The demo is architected to make Phase 1 straightforward: the `query_crm` tool is a clean interface — swapping its implementation from JSON filtering to SQL is a one-file change.
