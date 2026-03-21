# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Hollis** is an AI-powered renewal automation platform for insurance brokers. It automates the renewal lifecycle (email/SMS/scripts/questionnaires), validates policy coverage, processes Certificate of Insurance (COI) requests, and routes broker decisions through a three-tier autonomy system backed by Claude AI.

## Commands

```bash
npm run dev       # Start dev server on :3000
npm run build     # TypeScript check + production build
npm run lint      # Run ESLint
npm start         # Run production server
```

No test runner is configured — testing is manual or via CI.

Environment: copy `.env.example` to `.env.local`. Required vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `FROM_EMAIL`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`. Stripe and Twilio vars for payments/SMS.

## Architecture

### Three-Tier Autonomy Engine

The core mechanic of the system. Every inbound signal (email, SMS, manual note) and outbound action routes through `src/lib/renewals/tier-routing.ts`:

- **Tier 1** — Autonomous: Hollis acts without broker review (confident, low-risk intents)
- **Tier 2** — Approval queue: Action is held in `approval_queue` for broker to approve/reject
- **Tier 3** — Hard escalation: Broker must manually intervene (claims, cancellations, legal)

New brokers start in **learning mode** (all actions queued as Tier 2) until they approve 5 actions, then switch to autonomous mode (Tier 1 by default, Tier 2 on flags, Tier 3 on hard stops).

### Inbound Signal Pipeline

`POST /api/agent/signal` → `src/lib/agent/intent-classifier.ts` (Claude with few-shot examples from broker's past `parser_outcomes`) → tier router → either auto-execute or enqueue to `approval_queue`.

Intent taxonomy lives in `src/types/agent.ts`. Autonomous intents include `confirm_renewal`, `soft_query`, `out_of_office`. Always-escalate intents include `active_claim_mentioned`, `cancel_policy`, `legal_dispute`.

### Renewal Campaign Stages

Policies flow through ordered stages:
`pending` → `email_90_sent` → `email_60_sent` → `sms_30_sent` → `script_14_ready` → `questionnaire_sent` → `submission_sent` → `recommendation_sent` → `final_notice_sent` → `confirmed` | `lapsed`

The daily cron (`/api/cron/renewals`) fetches active policies, fires due `campaign_touchpoints`, and logs everything. Cron safety: atomic claim mechanism in `cron_job_runs` prevents duplicate sends across concurrent runs.

### Key Business Logic Files

| File | Purpose |
|------|---------|
| `src/lib/renewals/tier-routing.ts` | Core decision engine: learning vs. autonomous modes, flag detection |
| `src/lib/agent/intent-classifier.ts` | Claude-powered intent + flag detection from raw signals |
| `src/lib/renewals/generate.ts` | Fills broker-approved templates with policy data |
| `src/lib/renewals/health-score.ts` | Policy risk scoring (0–100, labels: healthy/at_risk/critical/stalled) |
| `src/lib/policy-checker/analyze.ts` | Coverage gap detection vs. client requirements |
| `src/lib/policy-checker/extract.ts` | Claude PDF/image extraction (limits, deductibles, endorsements) |
| `src/lib/coi/check-coverage.ts` | ACORD 25 COI coverage validation |
| `src/lib/logAction.ts` | Fire-and-forget audit logger (never blocks caller) |
| `src/app/api/cron/renewals/route.ts` | Daily cron driver |
| `src/app/api/agent/signal/route.ts` | Inbound signal processor |

### Database (Supabase/PostgreSQL)

27 migrations in `supabase/migrations/`. All tables have RLS enabled — users see only their own rows via `auth.uid() = user_id`. The service-role client (admin) bypasses RLS for cron and internal operations; use it only when required.

Key tables:
- `policies` — Core policy records with `campaign_stage`, `health_score`, `renewal_flags` (JSONB)
- `campaign_touchpoints` — Scheduled emails/SMS/scripts with status lifecycle
- `send_logs` — Delivery tracking per touchpoint
- `inbound_signals` / `parser_outcomes` / `approval_queue` — Agent tier system
- `policy_checks` / `policy_check_documents` / `policy_check_flags` — Policy document analysis
- `coi_requests` / `certificates` / `certificate_holders` — COI workflow
- `hollis_actions` — Append-only audit trail for every system action
- `cron_job_runs` — Idempotent cron execution records

JSONB columns carry rich structured data: `policies.renewal_flags`, `policies.coverage_data`, `inbound_signals.classification_result`, `certificates.coverage_snapshot`.

### Auth & Middleware

`src/middleware.ts` refreshes Supabase sessions on every request and protects all routes except: `/login`, `/signup`, `/api/auth/*`, `/certificates/request`, `/api/coi/request`, `/api/cron/*` (secret-protected via `CRON_SECRET` bearer token), and `/q` (public questionnaire).

### Supabase Clients

Three clients in `src/lib/supabase/`:
- **server client** — per-request, respects RLS (use in API routes for user-scoped data)
- **admin client** — service role, bypasses RLS (use for cron jobs and cross-user ops)
- **browser client** — client-side, anon key

### Path Alias

`@/*` resolves to `./src/*` (configured in `tsconfig.json`).
