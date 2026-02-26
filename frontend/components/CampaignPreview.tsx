"use client";

import { useState } from "react";
import type { CampaignDraft } from "@/lib/api";

interface Props {
  data: CampaignDraft;
}

export function CampaignPreview({ data }: Props) {
  const [tab, setTab] = useState<"email" | "sms">("email");

  return (
    <div className="mt-3 rounded-xl border border-violet-500/30 bg-[#16161f] overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-[#2a2a3a]">
        <TabButton active={tab === "email"} onClick={() => setTab("email")}>
          ✉️ Email
        </TabButton>
        <TabButton active={tab === "sms"} onClick={() => setTab("sms")}>
          💬 SMS
        </TabButton>
      </div>

      {tab === "email" ? (
        <EmailPreview email={data.email} />
      ) : (
        <SMSPreview sms={data.sms} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "text-violet-400 border-b-2 border-violet-500 bg-violet-500/5"
          : "text-gray-500 hover:text-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

function EmailPreview({ email }: { email: CampaignDraft["email"] }) {
  return (
    <div className="p-4">
      {/* Email header */}
      <div className="space-y-1.5 mb-4 pb-4 border-b border-[#2a2a3a]">
        <div className="flex gap-2 text-xs">
          <span className="text-gray-600 w-16">From</span>
          <span className="text-gray-400">Hive &lt;noreply@hive.co&gt;</span>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="text-gray-600 w-16">Subject</span>
          <span className="text-white font-medium">{email.subject}</span>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="text-gray-600 w-16">Preview</span>
          <span className="text-gray-500">{email.preview_text}</span>
        </div>
      </div>

      {/* Email body */}
      <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
        {email.body}
      </div>

      {/* Mock CTA button */}
      <div className="mt-4 pt-4 border-t border-[#2a2a3a]">
        <div className="inline-block px-5 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-lg cursor-default">
          Get Tickets →
        </div>
      </div>
    </div>
  );
}

function SMSPreview({ sms }: { sms: CampaignDraft["sms"] }) {
  const charCount = sms.body.length;
  const isOver = charCount > 160;

  return (
    <div className="p-4 flex justify-center">
      {/* Phone mockup */}
      <div className="w-64">
        <div className="bg-[#1e1e2a] rounded-2xl p-4 border border-[#2a2a3a]">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center text-xs text-violet-400 font-bold">
              H
            </div>
            <div>
              <p className="text-xs text-white font-medium">Hive</p>
              <p className="text-xs text-gray-600">SMS Marketing</p>
            </div>
          </div>
          <div className="bg-[#0f0f14] rounded-xl p-3">
            <p className="text-sm text-gray-200 leading-relaxed">{sms.body}</p>
          </div>
          <p className={`text-xs mt-2 text-right ${isOver ? "text-red-400" : "text-gray-600"}`}>
            {charCount}/160 chars
          </p>
        </div>
      </div>
    </div>
  );
}
