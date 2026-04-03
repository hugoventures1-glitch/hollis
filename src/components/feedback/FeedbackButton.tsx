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
        style={{ background: "#1C1C1C", border: "1px solid #282828", color: "#555" }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLElement;
          el.style.color       = "#FAFAFA";
          el.style.borderColor = "#383838";
          el.style.transform   = "scale(1.1)";
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLElement;
          el.style.color       = "#555";
          el.style.borderColor = "#282828";
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
              background: "#111111",
              border:     "1px solid #222222",
              boxShadow:  "0 24px 64px rgba(0,0,0,0.7)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-start justify-between px-5 pt-5 pb-4"
              style={{ borderBottom: "1px solid #1A1A1A" }}
            >
              <div>
                <div className="text-[14px] font-semibold" style={{ color: "#FAFAFA" }}>
                  Share feedback
                </div>
                <div className="text-[12px] mt-0.5" style={{ color: "#555" }}>
                  We read every message.
                </div>
              </div>
              <button
                onClick={close}
                className="w-6 h-6 flex items-center justify-center rounded-md transition-colors mt-0.5"
                style={{ color: "#444" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#FAFAFA")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#444")}
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
                  background:  "#0C0C0C",
                  border:      "1px solid #222",
                  color:       "#FAFAFA",
                  padding:     "12px 14px",
                  caretColor:  "#FAFAFA",
                  lineHeight:  1.6,
                  transition:  "border-color 0.15s",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#333")}
                onBlur={(e)  => (e.currentTarget.style.borderColor = "#222")}
                autoFocus
              />

              {/* Screenshot area */}
              {screenshotPreview ? (
                <div
                  className="relative rounded-xl overflow-hidden"
                  style={{ border: "1px solid #222" }}
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
                    style={{ background: "rgba(0,0,0,0.75)", color: "#FAFAFA" }}
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
                  style={{ border: "1px dashed #222", color: "#444", transition: "border-color 0.15s, color 0.15s" }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = "#333";
                    el.style.color       = "#888";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = "#222";
                    el.style.color       = "#444";
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
                  background: canSend ? "#FAFAFA" : "#1C1C1C",
                  color:      canSend ? "#0C0C0C" : "#333",
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
