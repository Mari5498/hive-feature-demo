"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { streamChat } from "@/lib/api";
import type { Message, MessageContent, ChatMessage, AudienceResult, CampaignDraft, ScheduleResult } from "@/lib/api";
import { MessageBubble } from "./Message";
import { AgentPipeline } from "./AgentPipeline";

type PhaseStatus = "idle" | "running" | "done" | "error";

const EXAMPLE_PROMPTS = [
  "Find jazz fans who haven't bought tickets in the last 3 months",
  "Find high spenders who love blues or soul music",
  "Find fans in Chicago who love EDM",
];

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [phases, setPhases] = useState<Record<string, PhaseStatus>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const updatePhase = useCallback((node: string, status: PhaseStatus) => {
    setPhases((prev) => ({ ...prev, [node]: status }));
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        contents: [{ kind: "text", text: text.trim() }],
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setIsStreaming(true);
      setPhases({});

      // Build chat history for the API
      const history: ChatMessage[] = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.contents
          .filter((c) => c.kind === "text")
          .map((c) => (c as { kind: "text"; text: string }).text)
          .join("\n"),
      }));

      // Start an empty assistant message we'll fill in as events arrive
      const assistantId = crypto.randomUUID();
      const assistantMessage: Message = {
        id: assistantId,
        role: "assistant",
        contents: [],
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Accumulate text tokens before flushing to state
      let textBuffer = "";

      const flushText = () => {
        if (!textBuffer) return;
        const snapshot = textBuffer;
        textBuffer = "";
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantId) return m;
            const last = m.contents[m.contents.length - 1];
            if (last?.kind === "text") {
              return {
                ...m,
                contents: [
                  ...m.contents.slice(0, -1),
                  { kind: "text" as const, text: last.text + snapshot },
                ],
              };
            }
            return {
              ...m,
              contents: [...m.contents, { kind: "text" as const, text: snapshot }],
            };
          })
        );
      };

      const appendContent = (content: MessageContent) => {
        flushText();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, contents: [...m.contents, content] } : m
          )
        );
      };

      try {
        for await (const event of streamChat(history)) {
          if (event.type === "agent_step") {
            updatePhase(event.node, event.status);
          } else if (event.type === "token") {
            textBuffer += event.content;
            // Flush every ~50 chars to keep UI responsive without too many re-renders
            if (textBuffer.length > 50) flushText();
          } else if (event.type === "audience_result") {
            flushText();
            appendContent({ kind: "audience", data: event.data as AudienceResult });
          } else if (event.type === "campaign_draft") {
            flushText();
            appendContent({ kind: "campaign", data: event.data as CampaignDraft });
          } else if (event.type === "scheduled") {
            flushText();
            appendContent({ kind: "scheduled", data: event.data as ScheduleResult });
          } else if (event.type === "done") {
            flushText();
          } else if (event.type === "error") {
            flushText();
            appendContent({ kind: "text", text: `⚠️ ${event.message}` });
          }
        }
      } catch (err) {
        flushText();
        appendContent({
          kind: "text",
          text: `⚠️ Connection error: ${err instanceof Error ? err.message : "Unknown error"}`,
        });
      } finally {
        setIsStreaming(false);
        inputRef.current?.focus();
      }
    },
    [messages, isStreaming, updatePhase]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Agent pipeline — shown only when active */}
      <div className="px-4 pt-4">
        <AgentPipeline activePhases={phases} />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {messages.length === 0 && <EmptyState onPrompt={send} />}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 border-t border-[#2a2a3a]">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Find fans, create campaigns, schedule sends..."
            disabled={isStreaming}
            className="flex-1 bg-[#16161f] border border-[#2a2a3a] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/50 disabled:opacity-50 transition-colors"
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="px-4 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors shrink-0"
          >
            {isStreaming ? (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            ) : (
              "Send"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

function EmptyState({ onPrompt }: { onPrompt: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-16">
      <div className="w-12 h-12 rounded-2xl bg-violet-600/20 flex items-center justify-center mb-4">
        <span className="text-2xl">🎵</span>
      </div>
      <h2 className="text-white font-semibold text-lg mb-1">Campaign Intelligence</h2>
      <p className="text-gray-500 text-sm mb-6 max-w-xs">
        Find your fans, craft your message, and schedule your campaign — all in one conversation.
      </p>
      <div className="flex flex-col gap-2 w-full max-w-sm">
        {EXAMPLE_PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => onPrompt(p)}
            className="text-left px-4 py-3 rounded-xl bg-[#16161f] border border-[#2a2a3a] hover:border-violet-500/50 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
