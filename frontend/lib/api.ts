// TypeScript types and SSE streaming client.
// All types match the SSE event schema in ENGINEERING.md exactly.

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Fan {
  id: string;
  first_name: string;
  last_name: string;
  city: string;
  state: string;
  genres: string[];
  last_purchase_date: string;
  total_spent: number;
  email_open_rate: number;
}

export interface AudienceResult {
  count: number;
  segment_id: string;
  avg_spent: number;
  open_rate: number;
  fans: Fan[];
}

export interface CampaignDraft {
  email: {
    subject: string;
    preview_text: string;
    body: string;
  };
  sms: {
    body: string;
  };
}

export interface ScheduleResult {
  campaign_id: string;
  segment_id: string;
  event_name: string;
  audience_size: number;
  send_at: string;
  status: string;
}

// All SSE event shapes
export type SSEEvent =
  | { type: "agent_step"; node: string; status: "running" | "done" | "error" }
  | { type: "audience_result"; data: AudienceResult }
  | { type: "campaign_draft"; data: CampaignDraft }
  | { type: "scheduled"; data: ScheduleResult }
  | { type: "token"; content: string }
  | { type: "done" }
  | { type: "error"; message: string };

// Message content that the Chat component renders
export type MessageContent =
  | { kind: "text"; text: string }
  | { kind: "audience"; data: AudienceResult }
  | { kind: "campaign"; data: CampaignDraft }
  | { kind: "scheduled"; data: ScheduleResult };

export interface Message {
  id: string;
  role: "user" | "assistant";
  contents: MessageContent[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Send a chat message and return an async iterator of SSE events.
 *
 * Usage:
 *   for await (const event of streamChat(messages)) { ... }
 */
export async function* streamChat(messages: ChatMessage[]): AsyncGenerator<SSEEvent> {
  const response = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by "\n\n"
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6);
      try {
        yield JSON.parse(json) as SSEEvent;
      } catch {
        // skip malformed events
      }
    }
  }
}
