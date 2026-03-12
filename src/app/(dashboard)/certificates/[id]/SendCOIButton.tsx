"use client";

import { useState, useRef } from "react";
import { Send, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/actions/MicroToast";

interface Props {
  certId: string;
  defaultEmail: string;
}

export function SendCOIButton({ certId, defaultEmail }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const router = useRouter();

  const handleOpen = () => {
    setShowForm(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSend = async () => {
    if (!email.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/coi/${certId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to send certificate");
      }
      toast("Certificate sent successfully", "success");
      setShowForm(false);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to send certificate", "error");
    } finally {
      setSending(false);
    }
  };

  if (!showForm) {
    return (
      <button
        onClick={handleOpen}
        className="h-8 px-4 flex items-center gap-1.5 rounded-md bg-[#FAFAFA] text-[#0C0C0C] text-[13px] font-semibold hover:bg-[#E8E8E8] transition-colors"
      >
        <Send size={12} /> Send
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSend()}
        placeholder="recipient@email.com"
        className="h-8 px-3 rounded-md bg-[#111111] border border-[#1C1C1C] text-[13px] text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#555555] w-52"
      />
      <button
        onClick={handleSend}
        disabled={sending || !email.trim()}
        className="h-8 px-3.5 flex items-center gap-1.5 rounded-md bg-[#FAFAFA] text-[#0C0C0C] text-[13px] font-semibold hover:bg-[#E8E8E8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
        {sending ? "Sending…" : "Send"}
      </button>
      <button
        onClick={() => setShowForm(false)}
        className="h-8 px-3 rounded-md border border-[#1C1C1C] text-[13px] text-[#555555] hover:text-[#FAFAFA] transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
