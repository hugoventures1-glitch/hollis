-- 035_client_reference_documents.sql
-- Documents the broker uploads so Hollis has richer context when replying
-- on the client's behalf (declarations pages, loss runs, key correspondence).

CREATE TABLE client_reference_documents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES auth.users(id),
  label              text NOT NULL,
  storage_path       text NOT NULL,
  original_filename  text NOT NULL,
  file_size_bytes    integer,
  mime_type          text,
  is_active          boolean NOT NULL DEFAULT true,
  added_by           text NOT NULL DEFAULT 'broker'
                       CHECK (added_by IN ('broker', 'ai')),
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE client_reference_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner"
  ON client_reference_documents
  FOR ALL
  USING (user_id = auth.uid());

CREATE INDEX idx_crd_client ON client_reference_documents (client_id, user_id)
  WHERE is_active = true;
