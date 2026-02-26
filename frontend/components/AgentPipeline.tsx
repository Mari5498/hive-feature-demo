"use client";

// Visual representation of the LangGraph agent pipeline.
// Shows 5 conceptual phases that light up as the agent runs.
// Phase status is driven by SSE "agent_step" events from the backend.

interface Phase {
  id: string;
  label: string;
  icon: string;
}

const PHASES: Phase[] = [
  { id: "analyzing",       label: "Analyzing",    icon: "🧠" },
  { id: "audience_research", label: "CRM Query",  icon: "🔍" },
  { id: "strategy",        label: "Strategy",     icon: "📊" },
  { id: "copy_writing",    label: "Writing Copy", icon: "✍️" },
  { id: "scheduling",      label: "Scheduling",   icon: "📅" },
];

type PhaseStatus = "idle" | "running" | "done" | "error";

interface Props {
  activePhases: Record<string, PhaseStatus>;
}

export function AgentPipeline({ activePhases }: Props) {
  const hasActivity = Object.values(activePhases).some((s) => s !== "idle");
  if (!hasActivity) return null;

  return (
    <div className="flex items-center gap-1 px-4 py-3 bg-[#16161f] border border-[#2a2a3a] rounded-xl mb-4 overflow-x-auto">
      <span className="text-xs text-gray-500 mr-2 shrink-0 font-mono">Agent</span>
      {PHASES.map((phase, i) => {
        const status = activePhases[phase.id] ?? "idle";
        return (
          <div key={phase.id} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-300 shrink-0 ${
                status === "running"
                  ? "bg-violet-500/20 text-violet-300 border border-violet-500/50 animate-pulse"
                  : status === "done"
                  ? "bg-violet-500/10 text-violet-400 border border-violet-500/30"
                  : status === "error"
                  ? "bg-red-500/10 text-red-400 border border-red-500/30"
                  : "bg-[#1e1e2a] text-gray-600 border border-[#2a2a3a]"
              }`}
            >
              <span>{phase.icon}</span>
              <span>{phase.label}</span>
              {status === "running" && (
                <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" />
              )}
              {status === "done" && (
                <span className="text-violet-400">✓</span>
              )}
            </div>
            {i < PHASES.length - 1 && (
              <span className="text-gray-700 text-xs">→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
