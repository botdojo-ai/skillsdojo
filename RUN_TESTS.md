# 🚀 Quick Start: Running Download Tests

## Prerequisites

✅ API Key added to `.env`:
```
TEST_API_KEY=sk_85014fe46e1c05d1bf3ebbe9f9a08315f1c653b3f67e90d58408195c9cce0a5c
```

## Step-by-Step Testing

### 1. Start the Development Server

Open a terminal and run:
```bash
npm run dev
```

Wait for the server to start (you should see "Ready in X ms" or similar).

### 2. Create Test Collection (First Time Only)

In a **new terminal window**, run:
```bash
./create-test-collection.sh
```

This creates a test collection with 3 skills:
- code-review
- debugging  
- testing

### 3. Run Download Tests

```bash
./test-download.sh
```

This will:
- ✅ Verify API key
- ✅ List collections
- ✅ Generate download token
- ✅ Download zip file
- ✅ Validate zip contents
- ✅ Test token reuse (should fail)

### 4. Test CLI Download

```bash
./test-cli-download.sh
```

Follow the prompts to test CLI download functionality.

---

## Expected Output

### Successful Test Run:

```
🧪 Testing Download Functionality
=================================

1️⃣  Verifying API key...
✅ API key valid!
{
  "user": {
    "id": "...",
    "email": "..."
  },
  "accounts": [...]
}

2️⃣  Listing collections...
✅ Found collections:
{
  "id": "...",
  "slug": "test-skills",
  "name": "Test Skills",
  "skillCount": 3
}

📦 Testing with collection: test-skills (...)

3️⃣  Generating download token...
✅ Download token generated!
{
  "downloadToken": "dt_...",
  "expiresAt": "...",
  "estimatedSizeMB": "0.01"
}

🔗 Download URL: http://localhost:3354/api/collections/.../download/dt_...

4️⃣  Downloading zip file...
✅ Downloaded successfully!

📊 File size: 2048 bytes (2.00 KB)

📋 Zip contents:
Archive:  ./test-test-skills.zip
  Length      Date    Time    Name
---------  ---------- -----   ----
      ...  ...              manifest.json
      ...  ...              code-review/SKILL.md
      ...  ...              debugging/SKILL.md
      ...  ...              testing/SKILL.md
---------                   -------
    total                   4 files

✅ Zip extraction successful!

📂 Extracted files:
./test-extract-test-skills/manifest.json
./test-extract-test-skills/code-review/SKILL.md
./test-extract-test-skills/debugging/SKILL.md
./test-extract-test-skills/testing/SKILL.md

📄 Manifest found:
{
  "version": "1.0",
  "exportedAt": "...",
  "collection": {
    "id": "...",
    "slug": "test-skills",
    "name": "Test Skills",
    "description": "Test collection for download functionality"
  },
  "skills": [
    {
      "path": "code-review",
      "name": "Code Review",
      "description": "Assist with code review tasks"
    },
    ...
  ],
  "stats": {
    "totalSkills": 3,
    "totalFiles": 3
  }
}

6️⃣  Testing token reuse (should fail)...
✅ Token correctly rejected (already used)

=================================
✅ All tests completed!

📁 Downloaded file: ./test-test-skills.zip
💡 You can now test:
   - CLI: sdojo download <collection>
   - MCP: Use download_collection tool in Claude

🧹 Cleanup:
   rm ./test-test-skills.zip
```

---

## Manual Testing Alternative

If the automated tests don't work, test manually:

### 1. Get Collection ID
```bash
curl "http://localhost:3354/api/collections" \
  -H "Authorization: Bearer sk_85014fe46e1c05d1bf3ebbe9f9a08315f1c653b3f67e90d58408195c9cce0a5c" \
  | jq '.items[] | {id: .id, slug: .slug}'
```

### 2. Generate Download Token
```bash
COLLECTION_ID="<from-step-1>"

curl -X POST "http://localhost:3354/api/collections/${COLLECTION_ID}/download" \
  -H "Authorization: Bearer sk_85014fe46e1c05d1bf3ebbe9f9a08315f1c653b3f67e90d58408195c9cce0a5c" \
  -H "Content-Type: application/json" \
  -d '{"branch": "main"}' | jq '.'
```

### 3. Download Zip
```bash
TOKEN="<from-step-2>"

curl -o test.zip \
  "http://localhost:3354/api/collections/${COLLECTION_ID}/download/${TOKEN}"
```

### 4. Verify Zip
```bash
unzip -l test.zip
unzip test.zip -d test-extract/
cat test-extract/manifest.json | jq '.'
```

---

## Troubleshooting

### Server not running
**Error:** `curl: (7) Failed to connect`

**Fix:**
```bash
npm run dev
```

### No collections found
**Error:** `⚠️ No collections found. Create a collection first.`

**Fix:**
```bash
./create-test-collection.sh
```

### API key invalid
**Error:** `❌ API key verification failed`

**Fix:** Check that the API key in the script matches your `.env` file.

### Port already in use
**Error:** `Port 3354 is already in use`

**Fix:**
```bash
# Find and kill the process
lsof -ti:3354 | xargs kill -9

# Or use a different port
PORT=3355 npm run dev
```

---

## Clean Up After Testing

```bash
# Remove test files
rm -f ./test-*.zip
rm -rf ./test-extract-*

# (Optional) Delete test collection via API
curl -X DELETE "http://localhost:3354/api/collections/${COLLECTION_ID}" \
  -H "Authorization: Bearer sk_85014fe46e1c05d1bf3ebbe9f9a08315f1c653b3f67e90d58408195c9cce0a5c"
```

---

## Next Steps After Testing

✅ Once tests pass:
1. Test with real collections
2. Test MCP integration in Claude Desktop
3. Test CLI from different directories
4. Test edge cases (large collections, specific skills, branches)
5. Deploy to staging environment

---

**Need Help?** Check `TEST_GUIDE.md` for comprehensive testing documentation.
