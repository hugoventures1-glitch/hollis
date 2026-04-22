-- 034_doc_chase_document_validation.sql
--
-- Adds attachment storage fields and Claude validation result columns to
-- doc_chase_requests. These are populated when a client replies with a
-- document (automated via inbound webhook) or a broker uploads one manually.

ALTER TABLE doc_chase_requests
  ADD COLUMN IF NOT EXISTS received_attachment_path          TEXT,
  ADD COLUMN IF NOT EXISTS received_attachment_filename      TEXT,
  ADD COLUMN IF NOT EXISTS received_attachment_content_type  TEXT,
  ADD COLUMN IF NOT EXISTS validation_status                 TEXT
    CHECK (validation_status IN ('pass', 'fail', 'partial', 'unreadable')),
  ADD COLUMN IF NOT EXISTS validation_summary                TEXT,
  ADD COLUMN IF NOT EXISTS validation_issues                 TEXT[],
  ADD COLUMN IF NOT EXISTS validation_confidence             TEXT
    CHECK (validation_confidence IN ('high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS validated_at                      TIMESTAMPTZ;
