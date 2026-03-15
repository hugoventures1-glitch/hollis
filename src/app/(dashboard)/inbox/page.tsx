import { Inbox } from "lucide-react";

export default function InboxPage() {
  return (
    <div className="flex flex-col h-full bg-[#0C0C0C] text-[#FAFAFA]">
      <header className="h-[56px] shrink-0 border-b border-[#1C1C1C] flex items-center px-6">
        <span className="text-[#8a8a8a] text-sm font-medium">Inbox</span>
      </header>
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <div className="w-14 h-14 rounded-full bg-[#111111] border border-[#1C1C1C] flex items-center justify-center mb-4">
          <Inbox size={22} className="text-[#6b6b6b]" />
        </div>
        <h2 className="text-[16px] font-semibold text-[#FAFAFA] mb-1">Inbox</h2>
        <p className="text-[13px] text-[#6b6b6b] max-w-xs">
          Notifications and messages will appear here. Coming soon.
        </p>
      </div>
    </div>
  );
}
