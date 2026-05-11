"use client";

import { useState, useRef } from "react";
import { MessageCircle, X, Paperclip, Send, Check } from "lucide-react";

export default function FeedbackButton() {
  const [open, setOpen]                         = useState(false);
  const [message, setMessage]                   = useState("");
  const [screenshot, setScreenshot]             = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [status, setStatus]                     = useState<"idle" | "sending" | "sent">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setScreenshot(file);
    const reader = new FileReader();
    reader.onload = (e) => setScreenshotPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const close = () => {
    setOpen(false);
    setMessage("");
    setScreenshot(null);
    setScreenshotPreview(null);
    setStatus("idle");
  };

  const handleSubmit = async () => {
    if (!message.trim() || status !== "idle") return;
    setStatus("sending");

    const form = new FormData();
    form.append("message", message.trim());
    if (screenshot) form.append("screenshot", screenshot);

    const res = await fetch("/api/feedback", { method: "POST", body: form });
    if (res.ok) {
      setStatus("sent");
      setTimeout(close, 1800);
    } else {
      setStatus("idle");
    }
  };

  const canSend = message.trim().length > 0 && status === "idle";

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(true)}
        title="Share feedback"
        className="fixed bottom-6 right-6 z-40 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLElement;
          el.style.color       = "var(--text-primary)";
          el.style.borderColor = "var(--text-tertiary)";
          el.style.transform   = "scale(1.1)";
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLElement;
          el.style.color       = "var(--text-secondary)";
          el.style.borderColor = "var(--border)";
          el.style.transform   = "scale(1)";
        }}
      >
        <MessageCircle size={17} strokeWidth={1.6} />
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-6 pointer-events-none">
          {/* Backdrop */}
          <div
            className="absolute inset-0 pointer-events-auto"
            style={{ background: "rgba(0,0,0,0.25)" }}
            onClick={close}
          />

          {/* Panel */}
          <div
            className="relative flex flex-col rounded-2xl pointer-events-auto"
            style={{
              width:     360,
              background: "var(--surface)",
              border:     "1px solid var(--border)",
              boxShadow:  "var(--shadow)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-start justify-between px-5 pt-5 pb-4"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <div>
                <div className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  Share feedback
                </div>
                <div className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  We read every message.
                </div>
              </div>
              <button
                onClick={close}
                className="w-6 h-6 flex items-center justify-center rounded-md transition-colors mt-0.5"
                style={{ color: "var(--text-secondary)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
              >
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 flex flex-col gap-3">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us what's working, what's not, or just say hi..."
                className="w-full resize-none rounded-xl text-[13px] outline-none"
                style={{
                  height:      110,
                  background:  "var(--background)",
                  border:      "1px solid var(--border)",
                  color:       "var(--text-primary)",
                  padding:     "12px 14px",
                  caretColor:  "var(--text-primary)",
                  lineHeight:  1.6,
                  transition:  "border-color 0.15s",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--text-tertiary)")}
                onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--border)")}
                autoFocus
              />

              {/* Screenshot area */}
              {screenshotPreview ? (
                <div
                  className="relative rounded-xl overflow-hidden"
                  style={{ border: "1px solid var(--border)" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={screenshotPreview}
                    alt="Screenshot preview"
                    className="w-full object-cover"
                    style={{ maxHeight: 120 }}
                  />
                  <button
                    onClick={() => { setScreenshot(null); setScreenshotPreview(null); }}
                    className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(0,0,0,0.75)", color: "#FFFFFF" }}
                  >
                    <X size={10} />
                  </button>
                </div>
              ) : (
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-xl px-4 py-3 cursor-pointer"
                  style={{ border: "1px dashed var(--border)", color: "var(--text-tertiary)", transition: "border-color 0.15s, color 0.15s" }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = "var(--text-tertiary)";
                    el.style.color       = "var(--text-secondary)";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = "var(--border)";
                    el.style.color       = "var(--text-tertiary)";
                  }}
                >
                  <Paperclip size={13} strokeWidth={1.6} />
                  <span className="text-[12px]">Add a screenshot</span>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </div>

            {/* Footer */}
            <div className="px-5 pb-5">
              <button
                onClick={handleSubmit}
                disabled={!canSend}
                className="w-full h-9 rounded-xl text-[13px] font-medium flex items-center justify-center gap-2 transition-all duration-200"
                style={{
                  background: canSend ? "var(--text-primary)" : "var(--surface-raised)",
                  color:      canSend ? "var(--text-inverse)" : "var(--text-tertiary)",
                  cursor:     canSend ? "pointer"  : "default",
                }}
              >
                {status === "sent" ? (
                  <><Check size={14} /> Sent — thank you!</>
                ) : status === "sending" ? (
                  "Sending..."
                ) : (
                  <><Send size={14} strokeWidth={1.6} /> Send</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
