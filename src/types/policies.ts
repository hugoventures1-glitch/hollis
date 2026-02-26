// ============================================================
// Intelligent Policy Checker — TypeScript Types
// ============================================================

// ── Status / enum types ───────────────────────────────────────

export type PolicyCheckStatus = "pending" | "processing" | "complete" | "failed";
export type SummaryVerdict    = "all_clear" | "issues_found" | "critical_issues";
export type FlagSeverity      = "critical" | "warning" | "advisory";
export type FlagConfidence    = "high" | "medium" | "low";
export type AnnotationStatus  = "accepted" | "dismissed" | "escalated";
export type ExtractionStatus  = "pending" | "processing" | "complete" | "failed";

export type FlagType =
  | "named_insured_mismatch"
  | "limit_below_minimum"
  | "missing_coverage"
  | "missing_endorsement"
  | "excluded_activity"
  | "coverage_gap"
  | "expiry_issue"
  | "other";

// ── Extracted data structure (returned by Claude, stored as JSONB) ──

export interface ExtractedCoverageLine {
  coverage_type: string;            // "gl", "auto", "umbrella", "wc", "pl", "cyber", "other"
  policy_number: string | null;
  carrier: string | null;
  insurer_naic: string | null;
  effective_date: string | null;    // YYYY-MM-DD
  expiry_date: string | null;       // YYYY-MM-DD
  claims_made: boolean | null;      // true=claims-made, false=occurrence, null=unknown
  limits: Record<string, number | null>;
  deductibles: Record<string, number | null>;
  endorsements: string[];
  exclusions: string[];
  additional_insureds: string[];
  raw_notes: string | null;
}

export interface ExtractedPolicyData {
  named_insured: string | null;
  also_insured: string[];           // DBA, subsidiaries, additional named insureds
  policy_number: string | null;
  carrier: string | null;
  effective_date: string | null;    // YYYY-MM-DD
  expiry_date: string | null;       // YYYY-MM-DD
  coverage_lines: ExtractedCoverageLine[];
  endorsements: string[];           // policy-level endorsements (form #s + descriptions)
  exclusions: string[];             // policy-level exclusions
  extraction_notes: string | null;  // Claude uncertainty notes
  extraction_confidence: FlagConfidence;
}

// ── Raw flag shape from Claude (before DB insertion) ─────────

export interface RawFlag {
  flag_type: FlagType;
  coverage_line: string | null;
  severity: FlagSeverity;
  confidence: FlagConfidence;
  title: string;
  what_found: string;
  what_expected: string;
  why_it_matters: string;
  sort_order: number;
}

// ── DB row types ──────────────────────────────────────────────

export interface Client {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  business_type: string | null;
  industry: string | null;
  num_employees: number | null;
  annual_revenue: number | null;
  owns_vehicles: boolean;
  num_locations: number;
  primary_state: string | null;
  notes: string | null;
  extra: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ClientCoverageProfile {
  id: string;
  user_id: string;
  client_id: string;

  expected_named_insured: string | null;

  req_gl: boolean;
  req_gl_each_occurrence: number | null;
  req_gl_general_aggregate: number | null;
  req_gl_products_agg: number | null;

  req_auto: boolean;
  req_auto_csl: number | null;

  req_umbrella: boolean;
  req_umbrella_each_occurrence: number | null;
  req_umbrella_aggregate: number | null;

  req_wc: boolean;
  req_wc_el_each_accident: number | null;

  req_pl: boolean;
  req_pl_each_claim: number | null;
  req_pl_aggregate: number | null;

  req_cyber: boolean;
  req_cyber_each_claim: number | null;
  req_cyber_aggregate: number | null;

  additional_insured_required: boolean;
  waiver_of_subrogation: boolean;
  primary_noncontributory: boolean;
  contractual_notes: string | null;

  business_activities: string[] | null;

  created_at: string;
  updated_at: string;
}

export interface PolicyCheck {
  id: string;
  user_id: string;
  client_id: string | null;
  client_business_type: string | null;
  client_industry: string | null;
  overall_status: PolicyCheckStatus;
  summary_verdict: SummaryVerdict | null;
  overall_confidence: FlagConfidence | null;
  summary_note: string | null;
  client_profile_snapshot: ClientCoverageProfile | null;
  document_count: number;
  created_at: string;
  updated_at: string;
}

export interface PolicyCheckDocument {
  id: string;
  policy_check_id: string;
  user_id: string;
  storage_path: string;
  original_filename: string;
  file_size_bytes: number | null;
  extraction_status: ExtractionStatus;
  extraction_error: string | null;
  extracted_data: ExtractedPolicyData | null;
  extracted_named_insured: string | null;
  extracted_policy_number: string | null;
  extracted_carrier: string | null;
  extracted_effective_date: string | null;
  extracted_expiry_date: string | null;
  extracted_coverage_lines: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface PolicyCheckFlag {
  id: string;
  policy_check_id: string;
  user_id: string;
  document_id: string | null;
  flag_type: FlagType;
  coverage_line: string | null;
  severity: FlagSeverity;
  confidence: FlagConfidence;
  title: string;
  what_found: string;
  what_expected: string;
  why_it_matters: string;
  annotation_status: AnnotationStatus | null;
  annotation_reason: string | null;
  annotated_at: string | null;
  annotated_by: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ── Joined / view types ───────────────────────────────────────

export interface PolicyCheckWithDetails extends PolicyCheck {
  policy_check_documents: PolicyCheckDocument[];
  policy_check_flags: PolicyCheckFlag[];
  clients: Pick<Client, "id" | "name" | "business_type" | "industry"> | null;
}

export interface ClientWithProfile extends Client {
  client_coverage_profiles: ClientCoverageProfile[];
}

// ── Context passed to analysis function ──────────────────────

export interface ClientContext {
  business_type: string | null;
  industry: string | null;
  owns_vehicles: boolean;
  num_employees: number | null;
  business_activities: string[] | null;
}

// ── API input types ───────────────────────────────────────────

export interface StartCheckInput {
  client_id?: string;
}

export interface ExtractDocumentInput {
  storage_path: string;
  original_filename: string;
  file_size_bytes: number;
}

export interface AnnotateFlagInput {
  annotation_status: AnnotationStatus;
  annotation_reason?: string;
}

// ── Display maps ──────────────────────────────────────────────

export const SEVERITY_LABELS: Record<FlagSeverity, string> = {
  critical: "Critical",
  warning:  "Warning",
  advisory: "Advisory",
};

export const SEVERITY_BADGE_STYLES: Record<FlagSeverity, string> = {
  critical: "bg-red-900/30 text-red-400 border border-red-700/30",
  warning:  "bg-amber-900/30 text-amber-400 border border-amber-700/30",
  advisory: "bg-blue-900/30 text-blue-400 border border-blue-700/30",
};

export const CONFIDENCE_LABELS: Record<FlagConfidence, string> = {
  high:   "High confidence",
  medium: "Medium confidence",
  low:    "Low confidence",
};

export const CONFIDENCE_STYLES: Record<FlagConfidence, string> = {
  high:   "text-[#505057] bg-[#ffffff06] border border-[#ffffff0f]",
  medium: "text-amber-500/70 bg-amber-900/10 border border-amber-800/20",
  low:    "text-orange-500/70 bg-orange-900/10 border border-orange-800/20",
};

export const FLAG_TYPE_LABELS: Record<FlagType, string> = {
  named_insured_mismatch: "Named Insured Mismatch",
  limit_below_minimum:    "Limit Below Minimum",
  missing_coverage:       "Missing Coverage",
  missing_endorsement:    "Missing Endorsement",
  excluded_activity:      "Excluded Activity",
  coverage_gap:           "Coverage Gap",
  expiry_issue:           "Expiry Issue",
  other:                  "Other",
};

export const VERDICT_STYLES: Record<SummaryVerdict, { bg: string; text: string; label: string }> = {
  all_clear:       { bg: "bg-[#00d4aa]/[0.06] border border-[#00d4aa]/25", text: "text-[#00d4aa]", label: "All Clear" },
  issues_found:    { bg: "bg-amber-950/30 border border-amber-800/40",      text: "text-amber-400",  label: "Issues Found" },
  critical_issues: { bg: "bg-red-950/30 border border-red-800/40",          text: "text-red-400",    label: "Critical Issues" },
};

export const EXTRACTION_STATUS_STYLES: Record<ExtractionStatus, string> = {
  pending:    "bg-[#ffffff08] text-[#8a8b91] border border-[#ffffff10]",
  processing: "bg-blue-900/20 text-blue-400 border border-blue-800/30",
  complete:   "bg-[#00d4aa]/10 text-[#00d4aa] border border-[#00d4aa]/25",
  failed:     "bg-red-900/30 text-red-400 border border-red-700/30",
};

export const ANNOTATION_LABELS: Record<AnnotationStatus, string> = {
  accepted:  "Accepted",
  dismissed: "Dismissed",
  escalated: "Escalated",
};

// ── Helpers ───────────────────────────────────────────────────

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function flagCountsByVerdict(flags: Pick<PolicyCheckFlag, "severity">[]): {
  critical: number;
  warning: number;
  advisory: number;
} {
  return {
    critical: flags.filter(f => f.severity === "critical").length,
    warning:  flags.filter(f => f.severity === "warning").length,
    advisory: flags.filter(f => f.severity === "advisory").length,
  };
}
