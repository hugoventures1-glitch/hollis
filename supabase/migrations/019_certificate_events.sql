-- migration 019: certificate_events audit table
--
-- Append-only log of all status transitions on coi_requests.
-- Populated automatically by a trigger — no application code changes required.
-- Provides a dispute-proof, actor-tagged history for each certificate.

CREATE TABLE IF NOT EXISTS certificate_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id  UUID        REFERENCES certificates(id) ON DELETE CASCADE,
  coi_request_id  UUID        REFERENCES coi_requests(id) ON DELETE CASCADE,
  event_type      TEXT        NOT NULL
                  CHECK (event_type IN (
                    'submitted', 'ready_for_approval', 'approved', 'rejected', 'sent', 'expired', 'outdated'
                  )),
  actor_id        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  old_status      TEXT,
  new_status      TEXT        NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only: no UPDATE or DELETE allowed by any role
ALTER TABLE certificate_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cert_events_select" ON certificate_events
  FOR SELECT USING (
    coi_request_id IN (
      SELECT id FROM coi_requests WHERE agent_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policies for end users — inserts are done via trigger (service role)

CREATE INDEX IF NOT EXISTS certificate_events_request_idx  ON certificate_events (coi_request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS certificate_events_cert_idx     ON certificate_events (certificate_id, created_at DESC);

-- ── Trigger: record every coi_requests status change ──────────────────────────

CREATE OR REPLACE FUNCTION record_coi_request_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  -- runs as the function owner (postgres), bypassing RLS
AS $$
DECLARE
  v_event_type TEXT;
BEGIN
  -- Only fire on actual status changes
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Map status value to a human-readable event_type
  v_event_type := CASE NEW.status
    WHEN 'pending'             THEN 'submitted'
    WHEN 'ready_for_approval'  THEN 'ready_for_approval'
    WHEN 'approved'            THEN 'approved'
    WHEN 'rejected'            THEN 'rejected'
    WHEN 'sent'                THEN 'sent'
    ELSE NEW.status
  END;

  INSERT INTO certificate_events (
    coi_request_id,
    certificate_id,
    event_type,
    actor_id,
    old_status,
    new_status
  ) VALUES (
    NEW.id,
    NEW.certificate_id,
    v_event_type,
    auth.uid(),   -- NULL when called from service role (cron / webhook)
    OLD.status,
    NEW.status
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER coi_request_status_event_trg
  AFTER UPDATE OF status ON coi_requests
  FOR EACH ROW
  EXECUTE FUNCTION record_coi_request_event();

-- Also capture initial INSERT (submission)
CREATE OR REPLACE FUNCTION record_coi_request_insert_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO certificate_events (
    coi_request_id,
    certificate_id,
    event_type,
    actor_id,
    old_status,
    new_status
  ) VALUES (
    NEW.id,
    NEW.certificate_id,
    'submitted',
    auth.uid(),
    NULL,
    NEW.status
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER coi_request_insert_event_trg
  AFTER INSERT ON coi_requests
  FOR EACH ROW
  EXECUTE FUNCTION record_coi_request_insert_event();
