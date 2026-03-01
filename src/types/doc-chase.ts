// ── Document Chasing — shared TypeScript types ────────────────────────────────

export type DocChaseRequestStatus = "pending" | "active" | "received" | "cancelled";
export type DocChaseSequenceStatus = "active" | "completed" | "cancelled";
export type DocChaseMessageStatus = "scheduled" | "sent" | "cancelled";

export const DOCUMENT_TYPES = [
  "Signed Application",
  "Loss Runs",
  "Signed ACORD 130",
  "Signed ACORD 125",
  "Expiring Policy Declaration",
  "Driver Schedule",
  "Other (specify)",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

// ── Core entities ─────────────────────────────────────────────────────────────

export interface DocChaseRequest {
  id: string;
  user_id: string;
  client_name: string;
  client_email: string;
  client_phone: string | null;
  document_type: string;
  policy_id: string | null;
  notes: string | null;
  status: DocChaseRequestStatus;
  received_at: string | null;
  escalation_level: "email" | "sms" | "phone_script";
  escalation_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocChaseSequence {
  id: string;
  user_id: string;
  request_id: string;
  sequence_status: DocChaseSequenceStatus;
  created_at: string;
  completed_at: string | null;
}

export interface DocChaseMessage {
  id: string;
  sequence_id: string;
  touch_number: 1 | 2 | 3 | 4;
  scheduled_for: string;
  sent_at: string | null;
  status: DocChaseMessageStatus;
  subject: string;
  body: string;
  channel: "email" | "sms" | "phone_script";
  phone_script: string | null;
  created_at: string;
}

// ── Enriched view types (returned by API) ─────────────────────────────────────

/** Returned by GET /api/doc-chase — list view with summary data joined in. */
export interface DocChaseRequestSummary extends DocChaseRequest {
  sequence: Pick<DocChaseSequence, "id" | "sequence_status" | "created_at"> | null;
  touches_sent: number;
  touches_total: number;
  last_contact: string | null; // ISO timestamp of last sent_at
}

/** Returned by GET /api/doc-chase/[id] — full detail with messages. */
export interface DocChaseRequestDetail extends DocChaseRequest {
  sequence: DocChaseSequence | null;
  messages: DocChaseMessage[];
}

// ── API request bodies ────────────────────────────────────────────────────────

export interface CreateDocChaseBody {
  client_name: string;
  client_email: string;
  client_phone?: string;
  document_type: string;
  policy_id?: string;
  notes?: string;
  agent_name?: string;
  agent_email?: string;
}

export interface PatchDocChaseBody {
  status: DocChaseRequestStatus;
}

// ── Touch draft (from Claude) ─────────────────────────────────────────────────

export type TouchChannel = "email" | "sms" | "phone_script";

export interface TouchDraft {
  subject: string;
  body: string;
  channel: TouchChannel;
  phone_script?: string | null; // Only for touch 4 phone_script channel
}
