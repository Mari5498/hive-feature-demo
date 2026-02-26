import { Chat } from "@/components/Chat";

export default function Home() {
  return (
    <div className="flex flex-col h-screen bg-[#0f0f14]">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a3a] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
            <span className="text-sm font-bold text-white">H</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white leading-none">
              Campaign Intelligence
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">Powered by LangGraph + Claude</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600 bg-[#16161f] border border-[#2a2a3a] px-2.5 py-1 rounded-full font-mono">
            hive.co · demo
          </span>
        </div>
      </header>

      {/* Chat — fills remaining height */}
      <main className="flex-1 overflow-hidden">
        <Chat />
      </main>
    </div>
  );
}
