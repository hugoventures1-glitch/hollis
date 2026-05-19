"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export const TEMPLATE_VARIABLES = [
  { key: "client_first_name", label: "Client First Name" },
  { key: "client_name",       label: "Client Name"       },
  { key: "policy_name",       label: "Policy Name"       },
  { key: "carrier",           label: "Carrier"           },
  { key: "agent_name",        label: "Agent Name"        },
  { key: "agency_name",       label: "Agency Name"       },
];

/** Renders template body text with {{variable}} tokens as styled inline chips. */
export function VariableBodyPreview({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/({{[^}]+}})/g);
  return (
    <pre className={className ?? "text-[12px] text-text-secondary whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto"}>
      {parts.map((part, i) => {
        const match = part.match(/^{{(.+)}}$/);
        if (match) {
          return (
            <span
              key={i}
              className="inline-flex items-center px-1.5 py-px rounded bg-surface-raised border border-border text-[11px] text-text-secondary font-mono mx-0.5 align-baseline"
            >
              {match[1].replace(/_/g, " ")}
            </span>
          );
        }
        return part;
      })}
    </pre>
  );
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
}

/**
 * Textarea with an @ mention–style variable picker.
 * Type @ to open the picker, keep typing to filter, Enter/Tab or click to insert {{variable}}.
 * Use rows={1} + resize-none for a single-line subject field.
 */
export function VariableTextarea({ value, onChange, rows = 10, placeholder, className }: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const [query, setQuery] = useState("");
  const [triggerIndex, setTriggerIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const filtered = TEMPLATE_VARIABLES.filter(
    (v) =>
      !query ||
      v.label.toLowerCase().includes(query.toLowerCase()) ||
      v.key.includes(query.toLowerCase()),
  );

  const insertVariable = useCallback(
    (varKey: string) => {
      if (triggerIndex === null || !textareaRef.current) return;
      const cursor = textareaRef.current.selectionStart;
      const before = value.slice(0, triggerIndex);
      const after = value.slice(cursor);
      onChange(before + `{{${varKey}}}` + after);
      setShowPicker(false);
      setTriggerIndex(null);
      const newCursor = triggerIndex + `{{${varKey}}}`.length;
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(newCursor, newCursor);
      }, 0);
    },
    [triggerIndex, value, onChange],
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    const cursor = e.target.selectionStart ?? newValue.length;
    const textBeforeCursor = newValue.slice(0, cursor);
    const atIdx = textBeforeCursor.lastIndexOf("@");
    if (atIdx !== -1) {
      const afterAt = textBeforeCursor.slice(atIdx + 1);
      if (!afterAt.includes(" ") && !afterAt.includes("\n")) {
        setTriggerIndex(atIdx);
        setQuery(afterAt);
        setSelectedIndex(0);
        setShowPicker(true);
        return;
      }
    }
    setShowPicker(false);
    setTriggerIndex(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showPicker || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (filtered[selectedIndex]) {
        e.preventDefault();
        insertVariable(filtered[selectedIndex].key);
      }
    } else if (e.key === "Escape") {
      setShowPicker(false);
      setTriggerIndex(null);
    }
  };

  // Close picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setShowPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={rows}
        placeholder={placeholder}
        className={
          className ??
          "w-full bg-background border border-border rounded-lg px-3 py-2.5 text-[13px] text-text-primary outline-none focus:border-[#555555] placeholder-text-tertiary resize-y font-mono leading-relaxed"
        }
      />
      <p className="mt-1 text-[11px] text-text-tertiary">
        Type <kbd className="px-1 py-px rounded bg-surface-raised border border-border font-mono text-[10px] text-text-tertiary">@</kbd> to insert a variable
      </p>

      {showPicker && filtered.length > 0 && (
        <div
          ref={pickerRef}
          className="absolute z-50 top-full mt-1 left-0 w-64 rounded-lg border border-border bg-surface shadow-xl overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-border">
            <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Insert variable</p>
          </div>
          <ul>
            {filtered.map((v, i) => (
              <li key={v.key}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertVariable(v.key);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                    i === selectedIndex
                      ? "bg-surface-raised text-text-primary"
                      : "text-text-secondary hover:bg-surface-raised hover:text-text-primary"
                  }`}
                >
                  <span className="text-[12px] font-medium flex-1">{v.label}</span>
                  <span className="text-[10px] text-zinc-600 font-mono shrink-0">{`{{${v.key}}}`}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
