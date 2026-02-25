-- ============================================================
-- Hollis — COI (Certificate of Insurance) Schema
-- Depends on: 001_renewals_schema.sql (update_updated_at fn)
-- ============================================================

-- ── Add coverage data column to policies ─────────────────────
ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS coverage_data JSONB DEFAULT '{}';

-- ── Certificate Holders (reusable) ───────────────────────────
CREATE TABLE IF NOT EXISTS certificate_holders (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  address     TEXT,
  city        TEXT,
  state       TEXT,
  zip         TEXT,
  email       TEXT,
  usage_count INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── COI Requests (incoming portal submissions) ────────────────
CREATE TABLE IF NOT EXISTS coi_requests (
  id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id                        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Person who submitted the request (contractor/third party)
  requester_name                  TEXT        NOT NULL,
  requester_email                 TEXT        NOT NULL,

  -- The insured (agent's client)
  insured_name                    TEXT        NOT NULL,

  -- Certificate holder
  holder_name                     TEXT        NOT NULL,
  holder_address                  TEXT,
  holder_city                     TEXT,
  holder_state                    TEXT,
  holder_zip                      TEXT,

  -- Coverage requirements
  coverage_types                  TEXT[]      NOT NULL DEFAULT '{}',
  required_gl_per_occurrence      NUMERIC,
  required_gl_aggregate           NUMERIC,
  required_auto_combined_single   NUMERIC,
  required_umbrella_each_occurrence NUMERIC,
  required_umbrella_aggregate     NUMERIC,
  required_wc_el_each_accident    NUMERIC,
  additional_insured_language     TEXT,
  project_description             TEXT,

  -- Processing
  status              TEXT  NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected', 'sent')),
  rejection_reason    TEXT,
  coverage_check_result JSONB,
  certificate_id      UUID,   -- set after COI is generated

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Certificates (issued COIs) ────────────────────────────────
CREATE TABLE IF NOT EXISTS certificates (
  id                  UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id          UUID  REFERENCES coi_requests(id) ON DELETE SET NULL,
  certificate_number  TEXT  UNIQUE,

  -- Insured
  insured_name        TEXT  NOT NULL,
  insured_address     TEXT,

  -- Producer (agent info at time of issue)
  producer_name       TEXT,
  producer_address    TEXT,
  producer_phone      TEXT,
  producer_email      TEXT,

  -- Certificate holder
  holder_name         TEXT  NOT NULL,
  holder_address      TEXT,
  holder_city         TEXT,
  holder_state        TEXT,
  holder_zip          TEXT,
  holder_email        TEXT,
  additional_insured_language TEXT,

  -- Full ACORD 25 coverage data snapshot
  coverage_snapshot   JSONB NOT NULL DEFAULT '{}',

  -- Description of operations
  description         TEXT,

  -- Link to source policy (for stale detection)
  policy_id           UUID  REFERENCES policies(id) ON DELETE SET NULL,

  -- Status
  status      TEXT  NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'sent', 'expired', 'outdated')),
  has_gap     BOOLEAN NOT NULL DEFAULT FALSE,
  gap_details TEXT[],

  -- Sending
  sent_to_email TEXT,
  sent_at       TIMESTAMPTZ,

  -- Expiry tracking (mirrors the coverage expiration dates)
  effective_date  DATE,
  expiration_date DATE,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Auto-generate certificate_number ─────────────────────────
CREATE SEQUENCE IF NOT EXISTS certificate_number_seq START 1000;

CREATE OR REPLACE FUNCTION set_certificate_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.certificate_number IS NULL THEN
    NEW.certificate_number :=
      'HOL-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
      LPAD(nextval('certificate_number_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_certificate_number
  BEFORE INSERT ON certificates
  FOR EACH ROW EXECUTE FUNCTION set_certificate_number();

-- ── updated_at triggers (reuse fn from migration 001) ────────
CREATE TRIGGER coi_requests_updated_at
  BEFORE UPDATE ON coi_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER certificates_updated_at
  BEFORE UPDATE ON certificates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER certificate_holders_updated_at
  BEFORE UPDATE ON certificate_holders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS coi_requests_agent_id_idx   ON coi_requests(agent_id);
CREATE INDEX IF NOT EXISTS coi_requests_status_idx     ON coi_requests(status);
CREATE INDEX IF NOT EXISTS certificates_user_id_idx    ON certificates(user_id);
CREATE INDEX IF NOT EXISTS certificates_status_idx     ON certificates(status);
CREATE INDEX IF NOT EXISTS certificates_policy_id_idx  ON certificates(policy_id);
CREATE INDEX IF NOT EXISTS cert_holders_user_id_idx    ON certificate_holders(user_id);

-- ── Row-Level Security ───────────────────────────────────────
ALTER TABLE coi_requests         ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificate_holders  ENABLE ROW LEVEL SECURITY;

-- coi_requests: agents see/update their own; public can INSERT (via admin client)
CREATE POLICY "coi_requests_select" ON coi_requests
  FOR SELECT USING (agent_id = auth.uid());
CREATE POLICY "coi_requests_update" ON coi_requests
  FOR UPDATE USING (agent_id = auth.uid());
-- Public INSERT is handled via service-role admin client in the API route.
-- Allow anon inserts so the portal can work without auth:
CREATE POLICY "coi_requests_public_insert" ON coi_requests
  FOR INSERT WITH CHECK (true);

-- certificates
CREATE POLICY "certificates_select" ON certificates
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "certificates_insert" ON certificates
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "certificates_update" ON certificates
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "certificates_delete" ON certificates
  FOR DELETE USING (user_id = auth.uid());

-- certificate_holders
CREATE POLICY "cert_holders_select" ON certificate_holders
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "cert_holders_insert" ON certificate_holders
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "cert_holders_update" ON certificate_holders
  FOR UPDATE USING (user_id = auth.uid());
