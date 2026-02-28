export type SearchResultType =
  | "policy"
  | "certificate"
  | "client"
  | "coi_request"
  | "doc_chase"
  | "outbox_draft";

export interface SearchResult {
  id: string;
  _type: SearchResultType;
  policy_name?: string;
  client_name?: string;
  carrier?: string;
  expiration_date?: string;
  premium?: number;
  campaign_stage?: string;
  status?: string;
  certificate_number?: string;
  insured_name?: string;
  holder_name?: string;
  holder_city?: string;
  holder_state?: string;
  name?: string;
  email?: string;
  phone?: string;
  business_type?: string;
  primary_state?: string;
  requester_name?: string;
  requester_email?: string;
  coverage_types?: string[];
  created_at?: string;
  document_type?: string;
  client_email?: string;
  subject?: string;
  sent_at?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  summary: string;
}

export const SEARCH_DISPLAY_ORDER: SearchResultType[] = [
  "policy",
  "certificate",
  "client",
  "coi_request",
  "doc_chase",
  "outbox_draft",
];

export const SUGGESTED_SEARCH_QUERIES = [
  "GL policies expiring next 60 days",
  "pending COI requests",
  "workers comp over $5,000 premium",
  "pending renewals",
  "which clients haven't been contacted",
  "outstanding document requests",
];
