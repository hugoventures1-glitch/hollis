// ── Coverage sub-types ──────────────────────────────────────

export interface GLCoverage {
  enabled: boolean;
  claims_made: boolean;        // true = claims-made, false = occurrence
  each_occurrence: number | null;
  damage_to_rented_premises: number | null;
  med_exp: number | null;
  personal_adv_injury: number | null;
  general_aggregate: number | null;
  products_comp_ops_agg: number | null;
  policy_number: string;
  effective: string;   // YYYY-MM-DD
  expiration: string;
  insurer: string;
}

export interface AutoCoverage {
  enabled: boolean;
  any_auto: boolean;
  owned_autos_only: boolean;
  hired_autos_only: boolean;
  non_owned_autos_only: boolean;
  combined_single_limit: number | null;
  bodily_injury_per_person: number | null;
  bodily_injury_per_accident: number | null;
  property_damage_per_accident: number | null;
  policy_number: string;
  effective: string;
  expiration: string;
  insurer: string;
}

export interface UmbrellaCoverage {
  enabled: boolean;
  is_umbrella: boolean;   // true = umbrella, false = excess
  claims_made: boolean;
  each_occurrence: number | null;
  aggregate: number | null;
  policy_number: string;
  effective: string;
  expiration: string;
  insurer: string;
}

export interface WCCoverage {
  enabled: boolean;
  el_each_accident: number | null;
  el_disease_policy_limit: number | null;
  el_disease_each_employee: number | null;
  policy_number: string;
  effective: string;
  expiration: string;
  insurer: string;
}

export interface CoverageSnapshot {
  gl?: GLCoverage;
  auto?: AutoCoverage;
  umbrella?: UmbrellaCoverage;
  wc?: WCCoverage;
}

// ── Coverage check result (from Claude) ─────────────────────

export interface CoverageCheckResult {
  passed: boolean;
  gaps: string[];
  notes: string;
}

// ── Database row types ───────────────────────────────────────

export type COIRequestStatus = "pending" | "approved" | "rejected" | "sent";
export type CertificateStatus = "draft" | "sent" | "expired" | "outdated";
export type CoverageType = "gl" | "auto" | "umbrella" | "wc";

export interface COIRequest {
  id: string;
  agent_id: string;
  requester_name: string;
  requester_email: string;
  insured_name: string;
  holder_name: string;
  holder_address: string | null;
  holder_city: string | null;
  holder_state: string | null;
  holder_zip: string | null;
  coverage_types: CoverageType[];
  required_gl_per_occurrence: number | null;
  required_gl_aggregate: number | null;
  required_auto_combined_single: number | null;
  required_umbrella_each_occurrence: number | null;
  required_umbrella_aggregate: number | null;
  required_wc_el_each_accident: number | null;
  additional_insured_language: string | null;
  project_description: string | null;
  status: COIRequestStatus;
  rejection_reason: string | null;
  coverage_check_result: CoverageCheckResult | null;
  certificate_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Certificate {
  id: string;
  user_id: string;
  request_id: string | null;
  certificate_number: string;
  insured_name: string;
  insured_address: string | null;
  producer_name: string | null;
  producer_address: string | null;
  producer_phone: string | null;
  producer_email: string | null;
  holder_name: string;
  holder_address: string | null;
  holder_city: string | null;
  holder_state: string | null;
  holder_zip: string | null;
  holder_email: string | null;
  additional_insured_language: string | null;
  coverage_snapshot: CoverageSnapshot;
  description: string | null;
  policy_id: string | null;
  status: CertificateStatus;
  has_gap: boolean;
  gap_details: string[] | null;
  sent_to_email: string | null;
  sent_at: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface CertificateHolder {
  id: string;
  user_id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  email: string | null;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

// ── Input types for API calls ────────────────────────────────

export interface GenerateCOIInput {
  request_id?: string;
  policy_id?: string;
  insured_name: string;
  insured_address?: string;
  producer_name?: string;
  producer_address?: string;
  producer_phone?: string;
  producer_email?: string;
  holder_name: string;
  holder_address?: string;
  holder_city?: string;
  holder_state?: string;
  holder_zip?: string;
  holder_email?: string;
  additional_insured_language?: string;
  description?: string;
  coverage_snapshot: CoverageSnapshot;
  // Requirements to check against (from portal request)
  requirements?: {
    coverage_types: CoverageType[];
    required_gl_per_occurrence?: number | null;
    required_gl_aggregate?: number | null;
    required_auto_combined_single?: number | null;
    required_umbrella_each_occurrence?: number | null;
    required_umbrella_aggregate?: number | null;
    required_wc_el_each_accident?: number | null;
  };
}

// ── Helpers ──────────────────────────────────────────────────

export const COI_STATUS_LABELS: Record<CertificateStatus, string> = {
  draft:    "Draft",
  sent:     "Sent",
  expired:  "Expired",
  outdated: "Outdated",
};

export const COI_REQUEST_STATUS_LABELS: Record<COIRequestStatus, string> = {
  pending:  "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
  sent:     "Sent",
};

export const COVERAGE_TYPE_LABELS: Record<CoverageType, string> = {
  gl:       "General Liability",
  auto:     "Automobile Liability",
  umbrella: "Umbrella / Excess",
  wc:       "Workers Compensation",
};

export function formatLimit(amount: number | null): string {
  if (!amount) return "—";
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}
