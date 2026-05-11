"use client";

import { useState, useRef } from "react";
import { Send, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/actions/MicroToast";
import { usePostHog } from "posthog-js/react";

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
  const posthog = usePostHog();

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
      posthog.capture("coi_sent", { cert_id: certId });
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
        className="h-8 px-4 flex items-center gap-1.5 rounded-md bg-text-primary text-text-inverse text-[13px] font-semibold hover:opacity-80 transition-opacity"
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
        className="h-8 px-3 rounded-md bg-surface border border-border text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary w-52"
      />
      <button
        onClick={handleSend}
        disabled={sending || !email.trim()}
        className="h-8 px-3.5 flex items-center gap-1.5 rounded-md bg-text-primary text-text-inverse text-[13px] font-semibold hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
        {sending ? "Sending…" : "Send"}
      </button>
      <button
        onClick={() => setShowForm(false)}
        className="h-8 px-3 rounded-md border border-border text-[13px] text-text-secondary hover:text-text-primary transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
