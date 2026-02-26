"""
LangChain tools for the Hive Campaign Intelligence Agent.

Three tools:
  query_crm              — filters the mock fan CRM, returns structured segment data
  generate_campaign_copy — calls Claude Haiku to produce structured email + SMS copy
  schedule_campaign      — creates a mock campaign record with a confirmation ID

Tool docstrings are what the LLM reads to decide when and how to call each tool.
Keep them clear and concise. See ENGINEERING.md for the SSE schema these feed into.
"""

from __future__ import annotations  # enables list[str] | None syntax on Python 3.9


import json
import os
import re
import uuid
from datetime import datetime, date
from pathlib import Path

import anthropic
from langchain_core.tools import tool

# Load fan data once at startup — in production this would be a DB query
_fans_path = Path(__file__).parent / "data" / "fans.json"
_fans: list[dict] = json.loads(_fans_path.read_text())


def _months_since(date_str: str) -> float:
    """Return number of months between a YYYY-MM-DD date string and today."""
    purchased = datetime.strptime(date_str, "%Y-%m-%d").date()
    return (date.today() - purchased).days / 30.44


@tool
def query_crm(
    genres: list[str] | None = None,
    min_months_since_purchase: float | None = None,
    max_months_since_purchase: float | None = None,
    min_total_spent: float | None = None,
    city: str | None = None,
) -> dict:
    """
    Query the Hive CRM to find a fan segment matching the given filters.

    Use this when the user asks to find, identify, or target fans based on their
    event history, purchase recency, spending, or location.

    Args:
        genres: Filter to fans who attended events in these genres (e.g. ["Jazz", "Blues"])
        min_months_since_purchase: Fans whose last purchase was at least this many months ago
        max_months_since_purchase: Fans whose last purchase was at most this many months ago
        min_total_spent: Fans who have spent at least this amount in USD
        city: Filter to fans in this city (case-insensitive, partial match)

    Returns count, segment_id, avg_spent, open_rate, and a preview of up to 5 fans.
    """
    results = [
        fan for fan in _fans
        if (not genres or any(g.lower() in [x.lower() for x in fan["genres"]] for g in genres))
        and (min_months_since_purchase is None or _months_since(fan["last_purchase_date"]) >= min_months_since_purchase)
        and (max_months_since_purchase is None or _months_since(fan["last_purchase_date"]) <= max_months_since_purchase)
        and (min_total_spent is None or fan["total_spent"] >= min_total_spent)
        and (not city or city.lower() in fan["city"].lower())
    ]

    if not results:
        return {"count": 0, "segment_id": "", "avg_spent": 0, "open_rate": 0, "fans": []}

    return {
        "count": len(results),
        "segment_id": f"seg_{uuid.uuid4().hex[:8]}",
        "avg_spent": round(sum(f["total_spent"] for f in results) / len(results), 2),
        "open_rate": round(sum(f["email_open_rate"] for f in results) / len(results), 2),
        "fans": [
            {k: f[k] for k in ("id", "first_name", "last_name", "city", "state", "genres", "last_purchase_date", "total_spent", "email_open_rate")}
            for f in results[:5]
        ],
    }


@tool
def generate_campaign_copy(
    audience_description: str,
    event_name: str,
    event_date: str,
    tone: str = "enthusiastic",
) -> dict:
    """
    Generate personalized email and SMS campaign copy for an event.

    Use this after query_crm returns results and the user wants to create a campaign.
    This calls an LLM internally to produce production-ready copy.

    Args:
        audience_description: Who this audience is (e.g. "jazz fans who haven't bought in 3 months")
        event_name: The name of the event to promote
        event_date: The event date (e.g. "April 15, 2025")
        tone: Writing tone — "enthusiastic", "exclusive", or "casual"

    Returns structured dict with email (subject, preview_text, body) and sms (body).
    """
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    prompt = f"""Generate email and SMS marketing copy for an event.

Audience: {audience_description}
Event: {event_name}
Date: {event_date}
Tone: {tone}

Return ONLY valid JSON with this exact structure (no markdown fences, no explanation):
{{
  "email": {{
    "subject": "...",
    "preview_text": "...",
    "body": "..."
  }},
  "sms": {{
    "body": "..."
  }}
}}

Guidelines:
- Subject: compelling, personalized, under 50 characters
- Preview text: 1 sentence that complements the subject
- Email body: 3 short paragraphs — personal greeting, event highlight, clear CTA. Plain text.
- SMS: under 155 characters, punchy, includes a CTA verb (Get, Grab, Join, etc.)"""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text.strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    # Fallback if JSON parsing fails
    return {
        "email": {
            "subject": f"You're invited: {event_name}",
            "preview_text": f"Don't miss {event_name} on {event_date}",
            "body": text,
        },
        "sms": {"body": f"{event_name} — {event_date}. Get your tickets now!"},
    }


@tool
def schedule_campaign(
    segment_id: str,
    event_name: str,
    audience_size: int,
    send_at: str,
) -> dict:
    """
    Schedule a campaign to be delivered to a fan segment.

    Use this when the user has reviewed the campaign draft and confirmed they want
    to send it. The send_at time should be ISO 8601 format.

    Args:
        segment_id: The segment ID returned by query_crm
        event_name: Name of the event being promoted
        audience_size: Number of fans in the segment
        send_at: Delivery time in ISO 8601 (e.g. "2025-04-14T10:00:00")

    Returns a campaign_id and confirmation.
    """
    return {
        "campaign_id": f"cmp_{uuid.uuid4().hex[:8]}",
        "segment_id": segment_id,
        "event_name": event_name,
        "audience_size": audience_size,
        "send_at": send_at,
        "status": "scheduled",
    }
