"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  ToastContext,
  ToastContainer,
  type ToastItem,
  type ToastType,
} from "./MicroToast";

// ── Provider ──────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    setMounted(true);
    return () => {
      // Clear all timers on unmount
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    // Trigger exit animation
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, visible: false } : t))
    );
    // Remove after animation completes
    const removeTimer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timersRef.current.delete(id + "_remove");
    }, 160);
    timersRef.current.set(id + "_remove", removeTimer);
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = "success") => {
      const id = Math.random().toString(36).slice(2);

      // Add toast (hidden first for enter animation)
      setToasts((prev) => {
        const next = [
          ...prev,
          { id, message, type, visible: false },
        ];
        // Cap at 3 — drop the oldest
        return next.length > 3 ? next.slice(-3) : next;
      });

      // Trigger enter animation on next frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setToasts((prev) =>
            prev.map((t) => (t.id === id ? { ...t, visible: true } : t))
          );
        });
      });

      // Auto-dismiss after 3 seconds
      const autoTimer = setTimeout(() => dismiss(id), 3000);
      timersRef.current.set(id, autoTimer);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {mounted &&
        createPortal(
          <ToastContainer items={toasts} onDismiss={dismiss} />,
          document.body
        )}
    </ToastContext.Provider>
  );
}
