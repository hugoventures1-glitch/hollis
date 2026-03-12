"use client";

import { createContext, useContext } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  visible: boolean;
}

export interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

// ── Text colour per type ──────────────────────────────────────────────────────

const TEXT_COLOR: Record<ToastType, string> = {
  success: "#FAFAFA",
  error:   "#FF4444",
  info:    "#FAFAFA",
};

// ── Single toast UI ───────────────────────────────────────────────────────────

interface ToastCardProps {
  item: ToastItem;
  onDismiss: (id: string) => void;
}

export function ToastCard({ item, onDismiss }: ToastCardProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        background: "#111111",
        border: "1px solid #1C1C1C",
        borderRadius: 6,
        padding: "10px 16px",
        fontSize: 13,
        color: TEXT_COLOR[item.type],
        lineHeight: "1.5",
        maxWidth: 320,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        pointerEvents: "auto",
        cursor: "pointer",
        opacity: item.visible ? 1 : 0,
        transform: item.visible ? "translateX(0)" : "translateX(16px)",
        transition: "opacity 150ms ease-out, transform 150ms ease-out",
      }}
      onClick={() => onDismiss(item.id)}
      title="Click to dismiss"
    >
      <span style={{ flex: 1 }}>{item.message}</span>
    </div>
  );
}

// ── Container ─────────────────────────────────────────────────────────────────

interface ToastContainerProps {
  items: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ items, onDismiss }: ToastContainerProps) {
  if (items.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
        // Positioned left of the assistant panel toggle (which is at right:0)
        // The toggle button is ~140px wide, so right:24 keeps us clear
      }}
    >
      {items.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
