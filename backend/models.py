from pydantic import BaseModel
from typing import Optional


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class Fan(BaseModel):
    id: str
    first_name: str
    last_name: str
    city: str
    state: str
    genres: list[str]
    last_purchase_date: str
    total_spent: float
    email_open_rate: float


class AudienceResult(BaseModel):
    count: int
    segment_id: str
    avg_spent: float
    open_rate: float
    fans: list[Fan]  # preview, capped at 5


class EmailDraft(BaseModel):
    subject: str
    body: str


class CampaignDraft(BaseModel):
    email: EmailDraft
    sms_body: str


class ScheduleResult(BaseModel):
    send_at: str
    audience_size: int
    campaign_id: str
