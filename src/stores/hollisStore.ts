/**
 * hollisStore — global client-side data cache for the Hollis dashboard.
 *
 * All pages read from here instead of making their own Supabase calls.
 * The store is populated on first use and refreshed every 120 s in the
 * background so navigation feels instant.
 */

import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import type { Policy } from "@/types/renewals";
import type { COIRequest } from "@/types/coi";
import type { CertWithSequences } from "@/app/(dashboard)/certificates/_components/CertsTable";
import type { DocChaseRequestSummary } from "@/types/doc-chase";
import type { Draft } from "@/components/outbox/DraftEditDrawer";
import { daysUntilExpiry } from "@/types/renewals";

// ── Client row type (mirrors what ClientsTable expects) ────────────────────────

export interface HollisClient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  business_type: string | null;
  industry: string | null;
  primary_state: string | null;
  created_at: string;
}

// ── Store staleness threshold ─────────────────────────────────────────────────

export const HOLLIS_STALE_MS = 300_000; // 5 minutes

// ── Store shape ───────────────────────────────────────────────────────────────

export interface HollisStoreState {
  /** All active policies, ordered by expiration_date asc */
  policies: Policy[];
  /** Active policies expiring within 60 days */
  renewals: Policy[];
  /** All clients, ordered by name */
  clients: HollisClient[];
  /** All COI requests, ordered by created_at desc */
  coiRequests: COIRequest[];
  /** All certificates with sequence join, ordered by created_at desc */
  certificates: CertWithSequences[];
  /** Document chase requests with aggregates (from /api/doc-chase) */
  docChaseRequests: DocChaseRequestSummary[];
  /** Pending outbox drafts with joined policy data */
  outboxDrafts: Draft[];
  /** Count of pending items in the agent approval queue */
  approvalQueueCount: number;
  /** Authenticated user ID — populated on first fetch */
  userId: string | null;
  /** Epoch ms of last successful full fetch, or null if never fetched */
  lastFetched: number | null;
  /** True during the very first fetch (no cached data yet) */
  loading: boolean;
  /** True during a background refresh when cached data is already shown */
  backgroundRefreshing: boolean;
  /** Trigger a full refresh of all data */
  fetchAll: () => Promise<void>;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useHollisStore = create<HollisStoreState>((set, get) => ({
  policies: [],
  renewals: [],
  clients: [],
  coiRequests: [],
  certificates: [],
  docChaseRequests: [],
  outboxDrafts: [],
  approvalQueueCount: 0,
  userId: null,
  lastFetched: null,
  loading: false,
  backgroundRefreshing: false,

  fetchAll: async () => {
    const { loading, backgroundRefreshing, lastFetched } = get();

    // Prevent concurrent fetches
    if (loading || backgroundRefreshing) return;

    const isFirstFetch = !lastFetched;
    set({ loading: isFirstFetch, backgroundRefreshing: !isFirstFetch });

    try {
      const supabase = createClient();

      // Resolve user in parallel with data
      const [
        { data: { user } },
        policiesRes,
        clientsRes,
        coiRes,
        certsRes,
        outboxRes,
        docChaseRes,
        approvalQueueRes,
      ] = await Promise.all([
        supabase.auth.getUser(),

        supabase
          .from("policies")
          .select("*")
          .eq("status", "active")
          .order("expiration_date", { ascending: true }),

        supabase
          .from("clients")
          .select("id, name, email, phone, business_type, industry, primary_state, created_at")
          .order("name", { ascending: true }),

        supabase
          .from("coi_requests")
          .select("*")
          .order("created_at", { ascending: false }),

        supabase
          .from("certificates")
          .select("*, holder_followup_sequences!left(id, sequence_status)")
          .order("created_at", { ascending: false }),

        supabase
          .from("outbox_drafts")
          .select(
            "id, subject, body, policies(client_name, carrier, expiration_date, policy_name)"
          )
          .eq("status", "pending")
          .order("created_at", { ascending: false }),

        fetch("/api/doc-chase")
          .then((r) => (r.ok ? r.json() : { requests: [] }))
          .catch(() => ({ requests: [] })),

        supabase
          .from("approval_queue")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
      ]);

      const allPolicies = (policiesRes.data ?? []) as Policy[];
      const renewals = allPolicies.filter((p) => {
        const days = daysUntilExpiry(p.expiration_date);
        return days >= 0 && days <= 60;
      });

      // Normalize outbox join (PostgREST may return array or object for FK)
      const outboxDrafts: Draft[] = (outboxRes.data ?? []).map(
        (row: Record<string, unknown>) => {
          const raw = row.policies;
          const policy = Array.isArray(raw)
            ? (raw[0] as Draft["policies"]) ?? null
            : (raw as Draft["policies"] | null);
          return {
            id: row.id as string,
            subject: row.subject as string,
            body: row.body as string,
            policies: policy,
          };
        }
      );

      set({
        userId: user?.id ?? null,
        policies: allPolicies,
        renewals,
        clients: (clientsRes.data ?? []) as HollisClient[],
        coiRequests: (coiRes.data ?? []) as COIRequest[],
        certificates: (certsRes.data ?? []) as CertWithSequences[],
        docChaseRequests: (docChaseRes.requests ?? []) as DocChaseRequestSummary[],
        outboxDrafts,
        approvalQueueCount: approvalQueueRes.count ?? 0,
        lastFetched: Date.now(),
        loading: false,
        backgroundRefreshing: false,
      });
    } catch {
      // Non-fatal — leave cached data in place
      set({ loading: false, backgroundRefreshing: false });
    }
  },
}));
