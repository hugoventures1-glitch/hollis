-- ============================================================
-- Hollis — Intelligent Policy Checker Schema
-- Migration 003
-- Depends on: 001_renewals_schema.sql (update_updated_at fn)
-- ============================================================

-- ── Clients ──────────────────────────────────────────────────
-- First-class client entity, separate from the text client_name
-- on the renewals policies table. Linking is a future migration.
CREATE TABLE IF NOT EXISTS clients (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           TEXT        NOT NULL,
  email          TEXT,
  phone          TEXT,
  business_type  TEXT,       -- e.g. "contractor", "retail", "professional_services"
  industry       TEXT,       -- e.g. "construction", "healthcare", "technology"
  num_employees  INT,
  annual_revenue NUMERIC(15,2),
  owns_vehicles  BOOLEAN     NOT NULL DEFAULT FALSE,
  num_locations  INT         NOT NULL DEFAULT 1,
  primary_state  TEXT,       -- two-letter state code
  notes          TEXT,
  extra          JSONB       NOT NULL DEFAULT '{}',  -- extensible for future fields
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Client Coverage Profiles ─────────────────────────────────
-- One-to-one with client. Flat columns (not JSONB) so:
--   (a) comparison prompts get clean structured values
--   (b) we can query by coverage requirement type for training
CREATE TABLE IF NOT EXISTS client_coverage_profiles (
  id                           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id                    UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Named insured verification
  expected_named_insured       TEXT,

  -- GL requirements
  req_gl                       BOOLEAN     NOT NULL DEFAULT FALSE,
  req_gl_each_occurrence       NUMERIC(15,2),
  req_gl_general_aggregate     NUMERIC(15,2),
  req_gl_products_agg          NUMERIC(15,2),

  -- Auto requirements
  req_auto                     BOOLEAN     NOT NULL DEFAULT FALSE,
  req_auto_csl                 NUMERIC(15,2),

  -- Umbrella / Excess requirements
  req_umbrella                 BOOLEAN     NOT NULL DEFAULT FALSE,
  req_umbrella_each_occurrence NUMERIC(15,2),
  req_umbrella_aggregate       NUMERIC(15,2),

  -- Workers Comp requirements
  req_wc                       BOOLEAN     NOT NULL DEFAULT FALSE,
  req_wc_el_each_accident      NUMERIC(15,2),

  -- Professional Liability requirements
  req_pl                       BOOLEAN     NOT NULL DEFAULT FALSE,
  req_pl_each_claim            NUMERIC(15,2),
  req_pl_aggregate             NUMERIC(15,2),

  -- Cyber Liability requirements
  req_cyber                    BOOLEAN     NOT NULL DEFAULT FALSE,
  req_cyber_each_claim         NUMERIC(15,2),
  req_cyber_aggregate          NUMERIC(15,2),

  -- Endorsement / contractual requirements
  additional_insured_required  BOOLEAN     NOT NULL DEFAULT FALSE,
  waiver_of_subrogation        BOOLEAN     NOT NULL DEFAULT FALSE,
  primary_noncontributory      BOOLEAN     NOT NULL DEFAULT FALSE,
  contractual_notes            TEXT,

  -- Business activities that affect coverage assessment
  -- e.g. ["roofing", "electrical", "demolition"]
  business_activities          TEXT[],

  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (client_id)  -- one profile per client (extensible to per-contract later)
);

-- ── Policy Checks ─────────────────────────────────────────────
-- One record per check run. Snapshots client profile at time of
-- check so training data remains accurate even if profile changes.
CREATE TABLE IF NOT EXISTS policy_checks (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id               UUID        REFERENCES clients(id) ON DELETE SET NULL,

  -- Denormalized for training queries (no join needed)
  client_business_type    TEXT,
  client_industry         TEXT,

  -- Check lifecycle
  overall_status          TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (overall_status IN ('pending','processing','complete','failed')),

  -- Results
  summary_verdict         TEXT
                          CHECK (summary_verdict IN ('all_clear','issues_found','critical_issues')),
  overall_confidence      TEXT
                          CHECK (overall_confidence IN ('high','medium','low')),
  summary_note            TEXT,       -- 1-2 sentence Claude summary

  -- Snapshot of client profile at time of check (for E&O + training)
  client_profile_snapshot JSONB,

  -- Count of documents attached
  document_count          INT         NOT NULL DEFAULT 0,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Policy Check Documents ────────────────────────────────────
-- Up to N PDFs per check. Stores raw extraction + file reference.
CREATE TABLE IF NOT EXISTS policy_check_documents (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_check_id          UUID        NOT NULL REFERENCES policy_checks(id) ON DELETE CASCADE,
  user_id                  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- File reference (Supabase Storage)
  storage_path             TEXT        NOT NULL,
  original_filename        TEXT        NOT NULL,
  file_size_bytes          INT,

  -- Extraction lifecycle
  extraction_status        TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (extraction_status IN ('pending','processing','complete','failed')),
  extraction_error         TEXT,

  -- Full structured extraction (ExtractedPolicyData JSON)
  extracted_data           JSONB,

  -- Key fields promoted to columns for querying / display
  extracted_named_insured  TEXT,
  extracted_policy_number  TEXT,
  extracted_carrier        TEXT,
  extracted_effective_date DATE,
  extracted_expiry_date    DATE,
  extracted_coverage_lines TEXT[],    -- e.g. ["gl","auto","umbrella"]

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Policy Check Flags ────────────────────────────────────────
-- One row per issue found by the comparison engine.
-- Agent annotations stored inline (not separate table) —
-- the annotated row IS the E&O documentation log entry.
CREATE TABLE IF NOT EXISTS policy_check_flags (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_check_id   UUID        NOT NULL REFERENCES policy_checks(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id       UUID        REFERENCES policy_check_documents(id) ON DELETE SET NULL,

  -- Flag classification
  flag_type         TEXT        NOT NULL
                    CHECK (flag_type IN (
                      'named_insured_mismatch',
                      'limit_below_minimum',
                      'missing_coverage',
                      'missing_endorsement',
                      'excluded_activity',
                      'coverage_gap',
                      'expiry_issue',
                      'other'
                    )),
  coverage_line     TEXT,  -- "gl","auto","umbrella","wc","pl","cyber", null = policy-level

  -- Severity and confidence
  severity          TEXT        NOT NULL CHECK (severity IN ('critical','warning','advisory')),
  confidence        TEXT        NOT NULL CHECK (confidence IN ('high','medium','low')),

  -- Human-readable content (all from Claude)
  title             TEXT        NOT NULL,  -- short label, max ~8 words
  what_found        TEXT        NOT NULL,
  what_expected     TEXT        NOT NULL,
  why_it_matters    TEXT        NOT NULL,

  -- Agent annotation (E&O documentation)
  annotation_status TEXT        CHECK (annotation_status IN ('accepted','dismissed','escalated')),
  annotation_reason TEXT,       -- required when dismissed
  annotated_at      TIMESTAMPTZ,
  annotated_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Display ordering (critical first, then sort_order within severity)
  sort_order        INT         NOT NULL DEFAULT 0,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS clients_user_id_idx         ON clients(user_id);
CREATE INDEX IF NOT EXISTS clients_business_type_idx   ON clients(business_type);

CREATE INDEX IF NOT EXISTS profiles_user_id_idx        ON client_coverage_profiles(user_id);
CREATE INDEX IF NOT EXISTS profiles_client_id_idx      ON client_coverage_profiles(client_id);

CREATE INDEX IF NOT EXISTS checks_user_id_idx          ON policy_checks(user_id);
CREATE INDEX IF NOT EXISTS checks_client_id_idx        ON policy_checks(client_id);
CREATE INDEX IF NOT EXISTS checks_status_idx           ON policy_checks(overall_status);
CREATE INDEX IF NOT EXISTS checks_created_idx          ON policy_checks(created_at DESC);

CREATE INDEX IF NOT EXISTS check_docs_check_id_idx     ON policy_check_documents(policy_check_id);
CREATE INDEX IF NOT EXISTS check_docs_user_id_idx      ON policy_check_documents(user_id);
CREATE INDEX IF NOT EXISTS check_docs_status_idx       ON policy_check_documents(extraction_status);

CREATE INDEX IF NOT EXISTS flags_check_id_idx          ON policy_check_flags(policy_check_id);
CREATE INDEX IF NOT EXISTS flags_user_id_idx           ON policy_check_flags(user_id);
CREATE INDEX IF NOT EXISTS flags_severity_idx          ON policy_check_flags(severity);
CREATE INDEX IF NOT EXISTS flags_annotation_idx        ON policy_check_flags(annotation_status);
CREATE INDEX IF NOT EXISTS flags_sort_order_idx        ON policy_check_flags(policy_check_id, sort_order);

-- ── updated_at triggers (reuse function from migration 001) ──

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON client_coverage_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER checks_updated_at
  BEFORE UPDATE ON policy_checks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER check_docs_updated_at
  BEFORE UPDATE ON policy_check_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER flags_updated_at
  BEFORE UPDATE ON policy_check_flags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row-Level Security ────────────────────────────────────────

ALTER TABLE clients                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_coverage_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_checks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_check_documents   ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_check_flags       ENABLE ROW LEVEL SECURITY;

-- clients
CREATE POLICY "clients_select" ON clients FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "clients_insert" ON clients FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "clients_update" ON clients FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "clients_delete" ON clients FOR DELETE USING (auth.uid() = user_id);

-- client_coverage_profiles
CREATE POLICY "profiles_select" ON client_coverage_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "profiles_insert" ON client_coverage_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles_update" ON client_coverage_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "profiles_delete" ON client_coverage_profiles FOR DELETE USING (auth.uid() = user_id);

-- policy_checks
CREATE POLICY "checks_select" ON policy_checks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "checks_insert" ON policy_checks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "checks_update" ON policy_checks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "checks_delete" ON policy_checks FOR DELETE USING (auth.uid() = user_id);

-- policy_check_documents
CREATE POLICY "check_docs_select" ON policy_check_documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "check_docs_insert" ON policy_check_documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "check_docs_update" ON policy_check_documents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "check_docs_delete" ON policy_check_documents FOR DELETE USING (auth.uid() = user_id);

-- policy_check_flags
CREATE POLICY "flags_select" ON policy_check_flags FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "flags_insert" ON policy_check_flags FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "flags_update" ON policy_check_flags FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "flags_delete" ON policy_check_flags FOR DELETE USING (auth.uid() = user_id);
