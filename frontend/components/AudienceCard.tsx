"use client";

import type { AudienceResult, Fan } from "@/lib/api";

interface Props {
  data: AudienceResult;
}

export function AudienceCard({ data }: Props) {
  return (
    <div className="mt-3 rounded-xl border border-violet-500/30 bg-[#16161f] overflow-hidden">
      {/* Header stats */}
      <div className="px-4 py-3 border-b border-[#2a2a3a]">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-mono text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded">
            {data.segment_id}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Fans matched" value={data.count.toLocaleString()} accent />
          <Stat label="Avg. spend" value={`$${data.avg_spent.toFixed(0)}`} />
          <Stat label="Open rate" value={`${(data.open_rate * 100).toFixed(0)}%`} />
        </div>
      </div>

      {/* Fan preview */}
      {data.fans.length > 0 && (
        <div className="px-4 py-3">
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Preview</p>
          <div className="space-y-1.5">
            {data.fans.map((fan) => (
              <FanRow key={fan.id} fan={fan} />
            ))}
            {data.count > 5 && (
              <p className="text-xs text-gray-600 pt-1">
                + {(data.count - 5).toLocaleString()} more fans
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-semibold ${accent ? "text-violet-400" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

function FanRow({ fan }: { fan: Fan }) {
  const monthsAgo = Math.round(
    (Date.now() - new Date(fan.last_purchase_date).getTime()) / (1000 * 60 * 60 * 24 * 30)
  );

  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 font-semibold shrink-0">
          {fan.first_name[0]}
        </div>
        <span className="text-gray-300">
          {fan.first_name} {fan.last_name}
        </span>
        <span className="text-gray-600">{fan.city}, {fan.state}</span>
      </div>
      <div className="flex items-center gap-3 text-gray-500">
        <span>{fan.genres[0]}</span>
        <span>${fan.total_spent.toFixed(0)} spent</span>
        <span className="text-gray-600">{monthsAgo}mo ago</span>
      </div>
    </div>
  );
}
