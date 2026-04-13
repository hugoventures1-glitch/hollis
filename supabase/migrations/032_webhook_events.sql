-- Debug observability for inbound/outbound Resend webhooks.
-- Every gate inside the webhook handlers writes a row here so we can
-- diagnose silent drops without depending on Vercel runtime logs.

create table public.webhook_events (
  id            uuid primary key default gen_random_uuid(),
  endpoint      text not null,
  gate          text not null,
  email_id      text,
  sender_email  text,
  policy_id     uuid,
  user_id       uuid,
  http_status   integer,
  detail        jsonb,
  created_at    timestamptz not null default now()
);

create index webhook_events_endpoint_created_at_idx
  on public.webhook_events (endpoint, created_at desc);

create index webhook_events_email_id_idx
  on public.webhook_events (email_id);

create index webhook_events_sender_email_idx
  on public.webhook_events (sender_email);

alter table public.webhook_events enable row level security;
-- Service-role only — no broker-facing policy needed.
