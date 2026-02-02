# Schema Update Required

The `download_tokens` table needs to be updated with the new `accountId` column.

## Option 1: Restart Server (Recommended)

If you have `synchronize: true` in your TypeORM config, just **restart the dev server**:

```bash
# Stop the server (Ctrl+C in the server terminal)
# Then start it again
npm run dev
```

TypeORM will automatically add the missing column.

## Option 2: Manual SQL Update

If synchronize is disabled, run this SQL:

```sql
ALTER TABLE download_tokens 
ADD COLUMN IF NOT EXISTS "accountId" uuid NOT NULL;

CREATE INDEX IF NOT EXISTS "IDX_download_tokens_accountId" ON download_tokens ("accountId");
```

## After Updating

Run the test again:
```bash
./test-download.sh
```

## What Changed

The `DownloadToken` entity now requires:
- `accountId` - The account that owns the collection
- `userId` (via BaseEntity's `createdById`) - The user who generated the token

This allows for better tracking and multi-tenant isolation.
