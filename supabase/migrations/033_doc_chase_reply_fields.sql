-- Add inbound reply tracking to doc_chase_requests.
-- When a client emails back and no policy match exists, the webhook stores
-- the reply here so the broker can review and manually mark as received.
ALTER TABLE doc_chase_requests
  ADD COLUMN IF NOT EXISTS last_client_reply TEXT,
  ADD COLUMN IF NOT EXISTS last_client_reply_at TIMESTAMPTZ;
