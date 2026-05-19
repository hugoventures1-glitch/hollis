-- ── Classifier v2 Schema Changes ────────────────────────────────────────────
--
-- 1. Extend campaign_stage CHECK constraint to include 'declined' and 'paused'
--    (campaign_stage is a TEXT column with a CHECK constraint, NOT a Postgres enum)
--
-- 2. Add task_type column to approval_queue for queryable broker task categorisation.
--    The new classifier maps each intent to a task_type so inbox filtering and
--    analytics don't have to dig into the proposed_action JSONB.

-- ── 1. campaign_stage ────────────────────────────────────────────────────────

ALTER TABLE policies
  DROP CONSTRAINT IF EXISTS policies_campaign_stage_check;

ALTER TABLE policies
  ADD CONSTRAINT policies_campaign_stage_check CHECK (campaign_stage IN (
    -- Existing stages
    'pending',
    'email_90_sent',
    'email_60_sent',
    'sms_30_sent',
    'script_14_ready',
    'complete',
    'questionnaire_sent',
    'submission_sent',
    'recommendation_sent',
    'final_notice_sent',
    'confirmed',
    'lapsed',
    -- New stages (classifier v2)
    'declined',  -- client explicitly leaving for another broker (declined_churn intent)
    'paused'     -- renewal paused pending client return (OOO / callback)
  ));

-- ── 2. approval_queue: task_type column ──────────────────────────────────────
-- Stores the broker-facing task category so the inbox can filter without
-- parsing the proposed_action JSONB. Nullable — backfilled to NULL on existing rows.

ALTER TABLE approval_queue
  ADD COLUMN IF NOT EXISTS task_type TEXT;

COMMENT ON COLUMN approval_queue.task_type IS
  'Broker task category derived from classified_intent. '
  'Values: retention_at_risk | contact_update_required | cross_sell_opportunity | '
  'lapse_risk | price_review | material_change_review | comms_reference | '
  'clarification_required | escalation_review | advance_stage | '
  'draft_and_send_response | create_doc_chase_request | log_document | null';

CREATE INDEX IF NOT EXISTS aq_task_type_idx
  ON approval_queue (user_id, task_type)
  WHERE status = 'pending';
