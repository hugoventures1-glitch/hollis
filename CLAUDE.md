# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Hollis** is an AI-powered renewal automation platform for insurance brokers. It automates the renewal lifecycle (email/SMS/scripts/questionnaires), validates policy coverage, processes Certificate of Insurance (COI) requests, and routes broker decisions through a three-tier autonomy system backed by Claude AI.

The platform is built with **Next.js 14 (App Router)**, **Supabase (Postgres + Auth + Storage)**, **Resend** for email, **Twilio** for SMS, and **Claude** (Anthropic) for AI classification and drafting. The UI uses **Tailwind CSS** with a custom design token system.

## Commands

```bash
npm run dev       # Start dev server on :3000
npm run build     # TypeScript check + production build
npm run lint      # Run ESLint
npm start         # Run production server
```

No test runner is configured — testing is manual or via CI.

Environment: copy `.env.example` to `.env.local`. Required vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `FROM_EMAIL`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`. Stripe and Twilio vars for payments/SMS.

---

## Architecture

### Three-Tier Autonomy Engine

The core mechanic of the system. Every inbound signal (email, SMS, manual note) and outbound action routes through `src/lib/renewals/tier-routing.ts`:

- **Tier 1** — Autonomous: Hollis acts without broker review (confident, low-risk intents)
- **Tier 2** — Approval queue: Action is held for broker to approve/edit/reject before sending
- **Tier 3** — Hard escalation: Broker must manually intervene (claims, cancellations, legal)

New brokers start in **learning mode** — all actions queue as Tier 2 until the broker approves 5 actions, then Hollis switches to autonomous mode (Tier 1 by default, Tier 2 on flags, Tier 3 on hard stops). The inbox shows a learning mode progress indicator until the threshold is reached.

### Inbound Signal Pipeline

All inbound signals (emails, SMS, manual notes) go through a single unified pipeline in `src/lib/agent/process-signal.ts`. The steps are:

1. Write `inbound_signals` record (with full email threading metadata)
2. Upload any attachments to Supabase storage (`doc-chase-attachments` bucket)
3. Classify intent via Claude (`src/lib/agent/intent-classifier.ts`)
4. Build and persist `renewal_flags` to `policies.renewal_flags` (`src/lib/agent/flag-writer.ts`)
5. Route to tier (`src/lib/renewals/tier-routing.ts`)
6. **Tier 1 — auto-execute:**
   - `out_of_office`: pause campaign and send acknowledgment
   - `soft_query` / `coverage_question`: draft and send reply via `responder.ts`
   - `confirm_renewal`: mark policy confirmed, close any open doc-chase
   - `cross_sell_signal`: confirm renewal + queue Tier 2 follow-up for broker
   - `declined_churn`: set stage to `declined`, cancel pending touchpoints
7. **Tier 2 — pre-generate draft** and enqueue in `approval_queue` for broker review
8. **Tier 3 — write escalation** to `approval_queue`, notify broker

Intent taxonomy lives in `src/types/agent.ts`. Autonomous intents include `confirm_renewal`, `soft_query`, `out_of_office`. Always-escalate intents include `active_claim_mentioned`, `cancel_policy`, `legal_dispute`.

Entry points: `POST /api/agent/signal` (manual) and `POST /api/webhooks/resend/inbound` (email webhook).

### Responder Module (`src/lib/agent/responder.ts`)

Generates outbound emails for autonomous (Tier 1) and pre-drafted (Tier 2) responses using Claude Haiku:

- **`generateQueryResponse()`** — Replies to `soft_query` / `coverage_question`. Follows strict rules: only answers what was asked, never invents coverage data, never adds filler phrases like "let me know if you need anything else"
- **`generateAckEmail()`** — Brief acknowledgments for `confirm_renewal`, `request_callback`, `document_received`

Uses broker's standing orders and client knowledge base as context when available.

### Flag Writer (`src/lib/agent/flag-writer.ts`)

Builds and persists `renewal_flags` JSONB on the `policies` table after each signal:

- **Flags are sticky** — once set to `true`, they stay `true` regardless of future signals
- **`days_to_expiry`** is runtime-only and never written to the database
- Supported flags: `active_claim`, `insurer_declined`, `premium_increase_pct`, `business_restructure`, `third_party_contact`, `silent_client`, `call_script_rejected`

### Renewal Campaign Stages

Policies flow through ordered stages:

```
pending → email_90_sent → email_60_sent → sms_30_sent → script_14_ready
→ questionnaire_sent → submission_sent → recommendation_sent
→ final_notice_sent → confirmed | lapsed | declined
```

The daily cron (`/api/cron/renewals`) fetches active policies, fires due `campaign_touchpoints`, and logs everything. Cron safety: atomic claim mechanism in `cron_job_runs` prevents duplicate sends across concurrent runs.

---

## Features

### Inbox

The broker's unified work queue, built from the `approval_queue` table. Lives at `/inbox`.

**Item types rendered in the inbox:**

| Type | When it appears | What the broker does |
|------|----------------|---------------------|
| `decision` | Tier 2 pre-draft waiting for approval | Review/edit email, then approve or reject |
| `escalation` | Tier 3 hard stop | Read context + prior thread, send custom reply or mark resolved |
| `todo` | Rejected script or manual follow-up task | Complete checklist items, then confirm done |
| `doc_chase` | Outstanding document request | Track received docs, mark complete |

**Key components** (`src/app/(dashboard)/inbox/_components/`):
- `InboxListView.tsx` — List with type pills, client names, expiry countdowns, unread indicators
- `EscalationDetail.tsx` — Shows what Hollis previously sent (via `/api/agent/escalation/[id]/thread`), allows broker to compose and send a custom email reply
- `DecisionDetail.tsx` — Shows AI-drafted email with confidence score; broker can edit before approving
- `TodoDetail.tsx` — Checklist-style task completion
- `DocChaseDetail.tsx` — Document tracking per request

**Email threading:** All replies from Hollis and brokers carry `In-Reply-To`, `References`, `Thread-Index`, and `Thread-Topic` headers so conversations stay threaded in Gmail/Outlook.

**Attachments:** Inbound attachments are auto-uploaded to Supabase storage. Signed URLs are generated on-demand in detail views; PDFs/images open in a full-screen modal preview.

### Escalation APIs

- `GET /api/agent/escalation/[id]/thread` — Fetches the most recent outbound message (from `campaign_touchpoints` or `hollis_actions`) sent before the escalation, giving the broker context on what the client is responding to
- `POST /api/agent/escalation/[id]/custom-reply` — Broker sends a custom reply email from the escalation detail view; logged to `send_logs` and `hollis_actions`

### Call Script Rejection

`POST /api/renewals/[id]/reject-script` — Broker rejects the 14-day call script touchpoint. Side effects:
- Sets `renewal_flags.call_script_rejected = true` (sticky)
- Marks pending `script_14` touchpoints as `skipped`
- Triggers health score refresh (applies penalty)
- Creates a Tier 3 escalation so it appears in the broker's inbox

### Audit Timeline (`src/components/renewals/AuditTimeline.tsx`)

Visual event timeline on the policy detail page. Events are color-coded and icon-tagged by type:

- **Neutral** — signal received, notes
- **Green** — client confirmed, email sent, doc received
- **Orange** — Tier 2 draft queued
- **Red** — Tier 3 escalation, lapse risk

Shows message body previews and timestamps.

### Settings (`src/components/settings/`)

Settings UI is split into sections, each as its own component:

| Section | What it controls |
|---------|-----------------|
| `ProfileSection` | Broker name, title, phone |
| `AccountSection` | Password reset, plan/billing |
| `EmailSection` | From name, reply-to, CC self, signature |
| `TemplatesSection` | Edit email/SMS/script templates with `{{variable}}` preview |
| `NotificationsSection` | Toggle alerts: renewal fired, doc chase, COI requested, gap detected, daily summary |
| `LeadTimesSection` | Adjust touchpoint timing (how many days before expiry each step fires) |

---

## Key Business Logic Files

| File | Purpose |
|------|---------|
| `src/lib/agent/process-signal.ts` | Full inbound signal pipeline (steps 1–8) |
| `src/lib/agent/intent-classifier.ts` | Claude-powered intent + flag detection |
| `src/lib/agent/responder.ts` | Drafts Tier 1 auto-replies and Tier 2 pre-drafts |
| `src/lib/agent/flag-writer.ts` | Builds and persists `renewal_flags` on policies |
| `src/lib/renewals/tier-routing.ts` | Core decision engine: learning vs. autonomous modes |
| `src/lib/renewals/generate.ts` | Fills broker-approved templates with policy data |
| `src/lib/renewals/health-score.ts` | Policy risk scoring (0–100: healthy/at_risk/critical/stalled) |
| `src/lib/policy-checker/analyze.ts` | Coverage gap detection vs. client requirements |
| `src/lib/policy-checker/extract.ts` | Claude PDF/image extraction (limits, deductibles, endorsements) |
| `src/lib/coi/check-coverage.ts` | ACORD 25 COI coverage validation |
| `src/lib/logAction.ts` | Fire-and-forget audit logger (never blocks caller) |
| `src/app/api/cron/renewals/route.ts` | Daily cron driver |

---

## Database (Supabase/PostgreSQL)

All tables have RLS enabled — users see only their own rows via `auth.uid() = user_id`. The service-role (admin) client bypasses RLS for cron and internal operations; use it only when required.

Key tables:

| Table | Purpose |
|-------|---------|
| `policies` | Core policy records: `campaign_stage`, `health_score`, `renewal_flags` (JSONB) |
| `campaign_touchpoints` | Scheduled emails/SMS/scripts with status lifecycle |
| `send_logs` | Delivery tracking per touchpoint |
| `inbound_signals` | Raw inbound emails/SMS with threading metadata |
| `parser_outcomes` | Classifier results used for few-shot examples |
| `approval_queue` | Tier 2 drafts and Tier 3 escalations waiting for broker action |
| `policy_checks` / `policy_check_documents` / `policy_check_flags` | Policy document analysis |
| `coi_requests` / `certificates` / `certificate_holders` | COI workflow |
| `hollis_actions` | Append-only audit trail for every system action |
| `cron_job_runs` | Idempotent cron execution records |

JSONB columns carry rich structured data: `policies.renewal_flags`, `policies.coverage_data`, `inbound_signals.classification_result`, `certificates.coverage_snapshot`.

---

## Auth & Middleware

`src/middleware.ts` refreshes Supabase sessions on every request and protects all routes except: `/login`, `/signup`, `/api/auth/*`, `/certificates/request`, `/api/coi/request`, `/api/cron/*` (secret-protected via `CRON_SECRET` bearer token), and `/q` (public questionnaire).

## Supabase Clients

Three clients in `src/lib/supabase/`:
- **server client** — per-request, respects RLS (use in API routes for user-scoped data)
- **admin client** — service role, bypasses RLS (use for cron jobs and cross-user ops)
- **browser client** — client-side, anon key

## Path Alias

`@/*` resolves to `./src/*` (configured in `tsconfig.json`).
