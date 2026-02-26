-- Make client_email nullable on policies.
-- Agents often import existing policies without client email addresses.
ALTER TABLE policies ALTER COLUMN client_email DROP NOT NULL;
