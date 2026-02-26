"""
LangGraph agent for Hive Campaign Intelligence.

Architecture: standard ReAct loop
  [agent] ↔ [tools]

The agent node (Claude claude-sonnet-4-6) decides which tool to call.
The tools node executes it and returns the result to state.
This loops until Claude produces a response with no tool calls.

The UI shows this as 5 conceptual phases (Intent → Audience Research → Strategy →
Copy → Schedule) that light up based on which tool is currently running.

See ENGINEERING.md for the full SSE event schema and LangGraph overview.
"""

from __future__ import annotations  # enables list[X] | None syntax on Python 3.9

import json
import operator
from typing import Annotated, AsyncIterator, TypedDict, Optional

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode

from tools import query_crm, generate_campaign_copy, schedule_campaign

_TOOLS = [query_crm, generate_campaign_copy, schedule_campaign]

# Maps tool names to the UI phase labels shown in AgentPipeline
_TOOL_TO_PHASE = {
    "query_crm": "audience_research",
    "generate_campaign_copy": "copy_writing",
    "schedule_campaign": "scheduling",
}


class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], operator.add]


_llm = ChatAnthropic(model="claude-sonnet-4-6", max_tokens=2048).bind_tools(_TOOLS)

_SYSTEM_PROMPT = """You are the Hive Campaign Intelligence Agent — an AI assistant built into Hive's event marketing platform.

You help event promoters accomplish three things:
1. Find the right fan segments from their CRM using natural language
2. Generate personalized email and SMS campaign copy
3. Schedule campaigns to reach fans at the right moment

Tools available:
- query_crm: Search the fan database by genre, purchase recency, spend, or location
- generate_campaign_copy: Generate email + SMS copy for an event campaign
- schedule_campaign: Schedule a finalized campaign for delivery

Workflow:
- User asks to find fans → call query_crm with appropriate filters
- User asks to create a campaign → call generate_campaign_copy with segment context
- User confirms they want to send → call schedule_campaign
- After query_crm: summarize results (count, avg spend, open rate) and ask if they want a campaign
- After generate_campaign_copy: present the copy and ask when to schedule it
- Be concise. Event promoters are busy.

Always use the tools — don't make up fan counts or draft copy without calling the tools."""


def _agent(state: AgentState) -> dict:
    messages = [SystemMessage(content=_SYSTEM_PROMPT)] + state["messages"]
    return {"messages": [_llm.invoke(messages)]}


def _should_continue(state: AgentState) -> str:
    last = state["messages"][-1]
    if isinstance(last, AIMessage) and last.tool_calls:
        return "tools"
    return END


_tool_node = ToolNode(_TOOLS)

workflow = StateGraph(AgentState)
workflow.add_node("agent", _agent)
workflow.add_node("tools", _tool_node)
workflow.set_entry_point("agent")
workflow.add_conditional_edges("agent", _should_continue)
workflow.add_edge("tools", "agent")

graph = workflow.compile()


async def run_agent_stream(messages: list[dict]) -> AsyncIterator[str]:
    """
    Run the LangGraph agent and yield SSE-formatted event strings.

    Each yielded string is "data: {...}\\n\\n" — one SSE event.
    The frontend reads these via a streaming fetch + ReadableStream decoder.

    SSE event types emitted: agent_step, audience_result, campaign_draft,
    scheduled, token, done, error. See ENGINEERING.md for the full schema.
    """

    def _sse(event: dict) -> str:
        return f"data: {json.dumps(event)}\n\n"

    lc_messages = [
        HumanMessage(content=m["content"]) if m["role"] == "user"
        else AIMessage(content=m["content"])
        for m in messages
    ]

    initial_state: AgentState = {"messages": lc_messages}

    # Emit "analyzing" as the first step so the UI shows activity immediately
    yield _sse({"type": "agent_step", "node": "analyzing", "status": "running"})

    try:
        async for event in graph.astream_events(initial_state, version="v2"):
            kind = event["event"]
            name = event.get("name", "")

            # Tool started → emit phase as "running"
            if kind == "on_tool_start" and name in _TOOL_TO_PHASE:
                yield _sse({"type": "agent_step", "node": _TOOL_TO_PHASE[name], "status": "running"})

            # Tool finished → emit phase as "done" + structured data
            elif kind == "on_tool_end" and name in _TOOL_TO_PHASE:
                yield _sse({"type": "agent_step", "node": _TOOL_TO_PHASE[name], "status": "done"})

                output = event.get("data", {}).get("output", {})
                if isinstance(output, str):
                    try:
                        output = json.loads(output)
                    except (json.JSONDecodeError, TypeError):
                        output = {}

                if name == "query_crm" and output.get("count", 0) >= 0:
                    yield _sse({"type": "audience_result", "data": output})

                elif name == "generate_campaign_copy" and "email" in output:
                    yield _sse({"type": "campaign_draft", "data": output})

                elif name == "schedule_campaign" and "campaign_id" in output:
                    yield _sse({"type": "scheduled", "data": output})

            # LLM streaming tokens
            elif kind == "on_chat_model_stream":
                chunk = event["data"].get("chunk")
                if not chunk:
                    continue
                content = chunk.content
                if isinstance(content, str) and content:
                    yield _sse({"type": "token", "content": content})
                elif isinstance(content, list):
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "text" and block.get("text"):
                            yield _sse({"type": "token", "content": block["text"]})

            # Mark "analyzing" as done once the agent node first completes
            elif kind == "on_chain_end" and name == "agent":
                yield _sse({"type": "agent_step", "node": "analyzing", "status": "done"})

    except Exception as e:
        yield _sse({"type": "error", "message": str(e)})

    yield _sse({"type": "done"})
