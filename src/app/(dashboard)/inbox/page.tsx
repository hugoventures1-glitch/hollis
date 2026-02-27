import { Inbox } from "lucide-react";

export default function InboxPage() {
  return (
    <div className="flex flex-col h-full bg-[#0d0d12] text-[#f5f5f7]">
      <header className="h-[56px] shrink-0 border-b border-[#1e1e2a] flex items-center px-6">
        <span className="text-[#5e5e64] text-sm font-medium">Inbox</span>
      </header>
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <div className="w-14 h-14 rounded-full bg-[#111118] border border-[#1e1e2a] flex items-center justify-center mb-4">
          <Inbox size={22} className="text-[#3a3a42]" />
        </div>
        <h2 className="text-[16px] font-semibold text-[#f5f5f7] mb-1">Inbox</h2>
        <p className="text-[13px] text-[#505057] max-w-xs">
          Notifications and messages will appear here. Coming soon.
        </p>
      </div>
    </div>
  );
}
