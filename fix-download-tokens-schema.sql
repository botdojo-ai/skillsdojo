-- Add missing accountId column to download_tokens table
ALTER TABLE download_tokens 
ADD COLUMN IF NOT EXISTS "accountId" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

-- Create index on accountId
CREATE INDEX IF NOT EXISTS "IDX_download_tokens_accountId" ON download_tokens ("accountId");

-- Show the current schema
\d download_tokens;
