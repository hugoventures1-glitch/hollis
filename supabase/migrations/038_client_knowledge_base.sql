-- Add freeform knowledge base text field to clients
-- Brokers can type, paste, or import text; Hollis reads it when answering questions about the client.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS knowledge_base TEXT;
