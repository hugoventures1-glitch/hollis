export type TimelineChannel = "email" | "sms" | "call";

export interface TimelineTouchpoint {
  id: string;
  days_before_expiry: number;      // 1–365, must be unique within config
  channels: TimelineChannel[];     // at least one
  template_id: string | null;
  subject_line: string | null;     // email-only
  send_time: string;               // "HH:MM"
}

export interface TimelineConfig {
  touchpoints: TimelineTouchpoint[];
}

export const DEFAULT_TIMELINE: TimelineConfig = {
  touchpoints: [
    { id: "default-90", days_before_expiry: 90, channels: ["email"], template_id: null, subject_line: null, send_time: "09:00" },
    { id: "default-60", days_before_expiry: 60, channels: ["email"], template_id: null, subject_line: null, send_time: "09:00" },
    { id: "default-30", days_before_expiry: 30, channels: ["sms"],   template_id: null, subject_line: null, send_time: "09:00" },
    { id: "default-7",  days_before_expiry: 7,  channels: ["call"],  template_id: null, subject_line: null, send_time: "09:00" },
  ],
};

export const TIMELINE_MAX_TOUCHPOINTS = 10;

export function validateTimeline(cfg: TimelineConfig): string | null {
  const tps = cfg.touchpoints;
  if (tps.length === 0) return "At least one touchpoint is required.";
  if (tps.length > TIMELINE_MAX_TOUCHPOINTS) return `Maximum ${TIMELINE_MAX_TOUCHPOINTS} touchpoints allowed.`;
  for (const tp of tps) {
    if (!Number.isInteger(tp.days_before_expiry) || tp.days_before_expiry < 1 || tp.days_before_expiry > 365) {
      return `Days before expiry must be between 1 and 365.`;
    }
    if (!tp.channels || tp.channels.length === 0) {
      return `Each touchpoint must have at least one channel.`;
    }
  }
  const days = tps.map((t) => t.days_before_expiry);
  if (new Set(days).size !== days.length) return "Each touchpoint must have a unique day value.";
  return null;
}

// Resolve effective timeline: per-policy > broker default > built-in DEFAULT_TIMELINE
export function resolveTimeline(
  brokerTimeline: TimelineConfig | null | undefined,
  policyTimeline: TimelineConfig | null | undefined,
): TimelineConfig {
  if (policyTimeline?.touchpoints?.length) return policyTimeline;
  if (brokerTimeline?.touchpoints?.length) return brokerTimeline;
  return DEFAULT_TIMELINE;
}
