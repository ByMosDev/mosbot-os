-- 020_rename_openclaw_integration_secret_columns.sql
-- Align column names with current plaintext-at-rest contract.

BEGIN;

ALTER TABLE openclaw_integration_state
  RENAME COLUMN private_key_encrypted TO private_key;

ALTER TABLE openclaw_integration_state
  RENAME COLUMN device_token_encrypted TO device_token;

COMMIT;
