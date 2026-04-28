"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, Mail, MessageSquare, Phone, Trash2, GripVertical } from "lucide-react";
import { SaveButton } from "@/components/settings/SaveButton";
import {
  DEFAULT_TIMELINE,
  validateTimeline,
  TIMELINE_MAX_TOUCHPOINTS,
} from "@/types/timeline";
import type { TimelineConfig, TimelineTouchpoint, TimelineChannel } from "@/types/timeline";

interface TimelineEditorProps {
  initialConfig: TimelineConfig;
  isReadOnly?: boolean;
  onSave: (cfg: TimelineConfig) => Promise<void>;
  onReset?: () => Promise<void>;
  daysUntilExpiry?: number;
}

const CHANNEL_LABELS: Record<TimelineChannel, string> = {
  email: "Email",
  sms: "SMS",
  call: "Call",
};

const CHANNEL_ICONS: Record<TimelineChannel, React.ElementType> = {
  email: Mail,
  sms: MessageSquare,
  call: Phone,
};

function generateId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function cloneConfig(cfg: TimelineConfig): TimelineConfig {
  return { touchpoints: cfg.touchpoints.map((t) => ({ ...t, channels: [...t.channels] })) };
}

function sortTouchpoints(tps: TimelineTouchpoint[]): TimelineTouchpoint[] {
  return [...tps].sort((a, b) => b.days_before_expiry - a.days_before_expiry);
}

export function TimelineEditor({
  initialConfig,
  isReadOnly = false,
  onSave,
  onReset,
  daysUntilExpiry,
}: TimelineEditorProps) {
  const [draft, setDraft] = useState<TimelineConfig>(() => cloneConfig(initialConfig));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Free-form string state for each touchpoint's days input — lets users delete and retype freely
  const [daysInputs, setDaysInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Drag state
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const newCardDaysRef = useRef<HTMLInputElement | null>(null);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(initialConfig);
  const sorted = sortTouchpoints(draft.touchpoints);

  useEffect(() => {
    setDraft(cloneConfig(initialConfig));
    setDaysInputs({});
  }, [initialConfig]);

  function updateTouchpoint(id: string, patch: Partial<TimelineTouchpoint>) {
    setDraft((prev) => ({
      touchpoints: prev.touchpoints.map((t) =>
        t.id === id ? { ...t, ...patch } : t
      ),
    }));
    setSaved(false);
  }

  function removeTouchpoint(id: string) {
    setDraft((prev) => ({
      touchpoints: prev.touchpoints.filter((t) => t.id !== id),
    }));
    setExpandedId(null);
    setDaysInputs((prev) => { const next = { ...prev }; delete next[id]; return next; });
    setSaved(false);
  }

  function addTouchpoint() {
    if (draft.touchpoints.length >= TIMELINE_MAX_TOUCHPOINTS) return;
    const newTp: TimelineTouchpoint = {
      id: generateId(),
      days_before_expiry: 45,
      channels: ["email"],
      template_id: null,
      subject_line: null,
      send_time: "09:00",
    };
    setDraft((prev) => ({ touchpoints: [...prev.touchpoints, newTp] }));
    setExpandedId(newTp.id);
    setDaysInputs((prev) => ({ ...prev, [newTp.id]: "45" }));
    setSaved(false);
    setTimeout(() => {
      newCardDaysRef.current?.focus();
      newCardDaysRef.current?.select();
    }, 60);
  }

  function toggleChannel(id: string, channel: TimelineChannel, currentChannels: TimelineChannel[]) {
    const isActive = currentChannels.includes(channel);
    if (isActive && currentChannels.length === 1) return;
    const next = isActive
      ? currentChannels.filter((c) => c !== channel)
      : [...currentChannels, channel];
    updateTouchpoint(id, { channels: next });
  }

  // Days input handlers — allow free typing, commit on blur
  function handleDaysChange(id: string, raw: string) {
    setDaysInputs((prev) => ({ ...prev, [id]: raw }));
  }

  function handleDaysBlur(id: string, raw: string) {
    const num = parseInt(raw, 10);
    if (!isNaN(num) && num >= 1 && num <= 365) {
      updateTouchpoint(id, { days_before_expiry: num });
      setDaysInputs((prev) => ({ ...prev, [id]: String(num) }));
    } else {
      // Revert to current value
      const tp = draft.touchpoints.find((t) => t.id === id);
      if (tp) setDaysInputs((prev) => ({ ...prev, [id]: String(tp.days_before_expiry) }));
    }
  }

  function getDaysDisplayValue(tp: TimelineTouchpoint): string {
    return daysInputs[tp.id] !== undefined ? daysInputs[tp.id] : String(tp.days_before_expiry);
  }

  // Drag handlers — swaps days_before_expiry between dragged and drop target
  function handleDragStart(id: string) {
    setDragId(id);
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (id !== dragId) setDragOverId(id);
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const dragTp = draft.touchpoints.find((t) => t.id === dragId);
    const targetTp = draft.touchpoints.find((t) => t.id === targetId);
    if (!dragTp || !targetTp) return;

    // Swap days_before_expiry
    const dragDays = dragTp.days_before_expiry;
    const targetDays = targetTp.days_before_expiry;
    setDraft((prev) => ({
      touchpoints: prev.touchpoints.map((t) => {
        if (t.id === dragId) return { ...t, days_before_expiry: targetDays };
        if (t.id === targetId) return { ...t, days_before_expiry: dragDays };
        return t;
      }),
    }));
    setDaysInputs((prev) => ({
      ...prev,
      [dragId]: String(targetDays),
      [targetId]: String(dragDays),
    }));
    setSaved(false);
    setDragId(null);
    setDragOverId(null);
  }

  function handleDragEnd() {
    setDragId(null);
    setDragOverId(null);
  }

  async function handleSave() {
    const validationError = validateTimeline(draft);
    if (validationError) { setError(validationError); return; }
    setError(null);
    setSaving(true);
    try {
      await onSave(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!onReset) return;
    setResetting(true);
    try {
      await onReset();
    } finally {
      setResetting(false);
    }
  }

  // Today-line position
  const maxDays = sorted.length > 0 ? Math.max(...sorted.map((t) => t.days_before_expiry)) : 90;
  const minDays = sorted.length > 0 ? Math.min(...sorted.map((t) => t.days_before_expiry)) : 7;
  const showTodayLine = daysUntilExpiry !== undefined && sorted.length > 0;
  const todayLeftPct = showTodayLine
    ? Math.max(0, Math.min(100, ((maxDays - daysUntilExpiry!) / Math.max(maxDays - minDays, 1)) * 100))
    : 0;
  const todayLabel =
    daysUntilExpiry === undefined ? "" :
    daysUntilExpiry <= 0 ? "Expired" :
    `${daysUntilExpiry}d left`;

  const STAIRCASE_STEP = 40;
  const COLUMN_WIDTH = 168;
  const COLUMN_GAP = 36;
  const containerHeight = sorted.length > 0
    ? (sorted.length - 1) * STAIRCASE_STEP + 300
    : 200;

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Add button */}
      {!isReadOnly && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={addTouchpoint}
            disabled={draft.touchpoints.length >= TIMELINE_MAX_TOUCHPOINTS}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#2A2A2A] text-[13px] text-zinc-400 hover:text-[#FAFAFA] hover:border-[#3A3A3A] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={14} />
            Add touchpoint
          </button>
          {draft.touchpoints.length >= TIMELINE_MAX_TOUCHPOINTS && (
            <span className="text-[12px] text-zinc-600">Maximum {TIMELINE_MAX_TOUCHPOINTS} touchpoints</span>
          )}
        </div>
      )}

      {/* Staircase */}
      <div
        className="relative overflow-x-auto overflow-y-visible pb-4"
        style={{ minHeight: containerHeight + 24 }}
      >
        {/* Today line */}
        {showTodayLine && (
          <div
            className="absolute top-0 bottom-0 z-10 pointer-events-none"
            style={{ left: `${todayLeftPct}%` }}
          >
            <div
              className="absolute -top-5 -translate-x-1/2 text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
              style={{ background: "#1C1C1C", color: "#FAFAFA", border: "1px solid #2A2A2A" }}
            >
              {todayLabel}
            </div>
            <div className="w-px h-full" style={{ background: "#FAFAFA", opacity: 0.15 }} />
          </div>
        )}

        {/* Columns */}
        <div className="inline-flex items-start" style={{ gap: COLUMN_GAP }}>
          {sorted.map((tp, index) => {
            const isExpanded = expandedId === tp.id;
            const isOnlyOne = sorted.length === 1;
            const isDragging = dragId === tp.id;
            const isDropTarget = dragOverId === tp.id;
            const dayDuplicate = draft.touchpoints.filter(
              (t) => t.days_before_expiry === tp.days_before_expiry
            ).length > 1;
            const daysVal = getDaysDisplayValue(tp);
            const isNewCard = tp.id === expandedId && !initialConfig.touchpoints.find((t) => t.id === tp.id);

            return (
              <div
                key={tp.id}
                className="relative flex flex-col"
                style={{ width: COLUMN_WIDTH }}
              >
                {/* Day label above column */}
                <div className="text-[11px] font-medium text-zinc-600 mb-2 pl-1 tracking-wide">
                  {tp.days_before_expiry} {tp.days_before_expiry === 1 ? "day" : "days"}
                </div>

                {/* Column body — full-height background track */}
                <div
                  className="relative rounded-xl"
                  style={{
                    marginTop: index * STAIRCASE_STEP,
                    minHeight: 220,
                    background: "#0D0D0D",
                    border: `1px solid ${isDropTarget ? "#3A3A3A" : "#181818"}`,
                    transition: "border-color 0.15s",
                  }}
                  onDragOver={(e) => !isReadOnly && handleDragOver(e, tp.id)}
                  onDrop={() => !isReadOnly && handleDrop(tp.id)}
                >
                  {/* Touchpoint card — sits at top of column */}
                  <div
                    draggable={!isReadOnly}
                    onDragStart={() => !isReadOnly && handleDragStart(tp.id)}
                    onDragEnd={handleDragEnd}
                    className={`rounded-t-xl transition-all ${
                      isExpanded
                        ? "border-b border-[#1C1C1C]"
                        : ""
                    } ${isDragging ? "opacity-40" : ""}`}
                    style={{
                      background: isExpanded ? "#141414" : "#111111",
                      cursor: isReadOnly ? "default" : isExpanded ? "default" : "pointer",
                    }}
                    onClick={() => {
                      if (isReadOnly || isDragging) return;
                      setExpandedId(isExpanded ? null : tp.id);
                    }}
                  >
                    {/* Card header */}
                    <div className="px-3 py-2.5 flex items-center gap-2">
                      {!isReadOnly && (
                        <GripVertical
                          size={13}
                          className="text-zinc-700 shrink-0 cursor-grab active:cursor-grabbing"
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                      <div className="flex gap-1">
                        {tp.channels.map((ch) => {
                          const Icon = CHANNEL_ICONS[ch];
                          return <Icon key={ch} size={12} className="text-zinc-400" />;
                        })}
                      </div>
                      <span className="text-[13px] font-medium text-[#FAFAFA] flex-1 truncate">
                        {tp.channels.map((c) => CHANNEL_LABELS[c]).join(" + ")}
                      </span>
                    </div>

                    {/* Expanded edit panel */}
                    {isExpanded && !isReadOnly && (
                      <div
                        className="px-3 pb-3 pt-3 space-y-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Days before expiry */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">
                            Days before expiry
                          </label>
                          <input
                            ref={isNewCard ? newCardDaysRef : undefined}
                            type="text"
                            inputMode="numeric"
                            value={daysVal}
                            onChange={(e) => handleDaysChange(tp.id, e.target.value)}
                            onBlur={(e) => handleDaysBlur(tp.id, e.target.value)}
                            placeholder="e.g. 45"
                            className={`w-full bg-[#0C0C0C] border rounded-md px-2.5 py-1.5 text-[13px] text-[#FAFAFA] outline-none focus:border-zinc-500 placeholder-zinc-700 ${
                              dayDuplicate ? "border-red-700/60" : "border-[#2A2A2A]"
                            }`}
                          />
                          {dayDuplicate && (
                            <p className="text-[11px] text-red-400/80">Duplicate — must be unique</p>
                          )}
                        </div>

                        {/* Channel toggles */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">
                            Channel
                          </label>
                          <div className="flex gap-1.5 flex-wrap">
                            {(["email", "sms", "call"] as TimelineChannel[]).map((ch) => {
                              const active = tp.channels.includes(ch);
                              const isLast = active && tp.channels.length === 1;
                              const Icon = CHANNEL_ICONS[ch];
                              return (
                                <button
                                  key={ch}
                                  type="button"
                                  title={isLast ? "At least one channel required" : undefined}
                                  disabled={isLast}
                                  onClick={() => toggleChannel(tp.id, ch, tp.channels)}
                                  className={`flex items-center gap-1 px-2 py-1 rounded text-[12px] border transition-colors ${
                                    active
                                      ? "bg-[#1C1C1C] border-[#3A3A3A] text-[#FAFAFA]"
                                      : "bg-transparent border-[#1C1C1C] text-zinc-600 hover:border-[#2A2A2A] hover:text-zinc-400"
                                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                                >
                                  <Icon size={11} />
                                  {CHANNEL_LABELS[ch]}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Subject line (email only) */}
                        {tp.channels.includes("email") && (
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">
                              Subject
                            </label>
                            <input
                              type="text"
                              value={tp.subject_line ?? ""}
                              placeholder="e.g. Your policy renews in 90 days"
                              onChange={(e) =>
                                updateTouchpoint(tp.id, { subject_line: e.target.value || null })
                              }
                              className="w-full bg-[#0C0C0C] border border-[#2A2A2A] rounded-md px-2.5 py-1.5 text-[13px] text-[#FAFAFA] placeholder-zinc-700 outline-none focus:border-zinc-500"
                            />
                          </div>
                        )}

                        {/* Send time */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">
                            Send time
                          </label>
                          <input
                            type="time"
                            value={tp.send_time}
                            onChange={(e) =>
                              updateTouchpoint(tp.id, { send_time: e.target.value })
                            }
                            className="bg-[#0C0C0C] border border-[#2A2A2A] rounded-md px-2.5 py-1.5 text-[13px] text-[#FAFAFA] outline-none focus:border-zinc-500"
                          />
                        </div>

                        {/* Remove */}
                        {!isOnlyOne && (
                          <button
                            type="button"
                            onClick={() => removeTouchpoint(tp.id)}
                            className="flex items-center gap-1.5 text-[12px] text-zinc-700 hover:text-zinc-400 transition-colors pt-1"
                          >
                            <Trash2 size={11} />
                            Remove
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Dashed arrow connector to next column */}
                {index < sorted.length - 1 && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      right: -(COLUMN_GAP),
                      top: index * STAIRCASE_STEP + 22,
                      width: COLUMN_GAP,
                      height: STAIRCASE_STEP + 4,
                    }}
                  >
                    <svg
                      width={COLUMN_GAP}
                      height={STAIRCASE_STEP + 4}
                      viewBox={`0 0 ${COLUMN_GAP} ${STAIRCASE_STEP + 4}`}
                      fill="none"
                      overflow="visible"
                    >
                      <defs>
                        <marker id={`arr-${index}`} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
                          <path d="M0,0 L5,2.5 L0,5 Z" fill="#2A2A2A" />
                        </marker>
                      </defs>
                      <path
                        d={`M0,4 C${COLUMN_GAP * 0.4},4 ${COLUMN_GAP * 0.6},${STAIRCASE_STEP} ${COLUMN_GAP},${STAIRCASE_STEP}`}
                        stroke="#2A2A2A"
                        strokeWidth="1.5"
                        strokeDasharray="3 3"
                        markerEnd={`url(#arr-${index})`}
                      />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Validation error */}
      {error && (
        <p className="text-[13px] text-red-400/80 -mt-2">{error}</p>
      )}

      {/* Bottom bar */}
      {!isReadOnly && (
        <div className="flex items-center justify-between pt-4 border-t border-[#1C1C1C]">
          {onReset ? (
            <button
              type="button"
              onClick={handleReset}
              disabled={resetting}
              className="text-[13px] text-zinc-600 hover:text-zinc-400 transition-colors disabled:opacity-50"
            >
              {resetting ? "Resetting…" : "Reset to default"}
            </button>
          ) : (
            <div />
          )}
          <SaveButton
            saving={saving}
            saved={saved}
            onClick={handleSave}
            label="Save timeline"
            disabled={!isDirty}
          />
        </div>
      )}
    </div>
  );
}
