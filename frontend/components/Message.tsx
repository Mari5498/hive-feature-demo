import type { Message } from "@/lib/api";
import { AudienceCard } from "./AudienceCard";
import { CampaignPreview } from "./CampaignPreview";

interface Props {
  message: Message;
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div className={`max-w-[85%] ${isUser ? "max-w-[70%]" : "w-full"}`}>
        {!isUser && (
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center">
              <span className="text-xs text-white">H</span>
            </div>
            <span className="text-xs text-gray-500">Hive Agent</span>
          </div>
        )}

        {message.contents.map((content, i) => {
          if (content.kind === "text") {
            return (
              <div
                key={i}
                className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  isUser
                    ? "bg-violet-600 text-white rounded-tr-sm"
                    : "bg-[#16161f] border border-[#2a2a3a] text-gray-200 rounded-tl-sm"
                }`}
              >
                {content.text}
              </div>
            );
          }

          if (content.kind === "audience") {
            if (content.data.count === 0) return null;
            return <AudienceCard key={i} data={content.data} />;
          }

          if (content.kind === "campaign") {
            return <CampaignPreview key={i} data={content.data} />;
          }

          if (content.kind === "scheduled") {
            const d = content.data;
            const sendDate = new Date(d.send_at).toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            });
            return (
              <div
                key={i}
                className="mt-3 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/30 text-sm"
              >
                <p className="text-green-400 font-medium mb-1">✓ Campaign Scheduled</p>
                <p className="text-gray-400">
                  <span className="text-white">{d.audience_size.toLocaleString()} fans</span> will receive your {d.event_name} campaign on{" "}
                  <span className="text-white">{sendDate}</span>
                </p>
                <p className="text-xs text-gray-600 mt-1 font-mono">ID: {d.campaign_id}</p>
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
