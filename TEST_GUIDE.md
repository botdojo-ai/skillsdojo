# Testing Guide: Download Functionality

## 🔑 API Key

Your test API key has been configured:
```
sk_85014fe46e1c05d1bf3ebbe9f9a08315f1c653b3f67e90d58408195c9cce0a5c
```

---

## 🧪 Test Scripts

I've created two test scripts for you:

### 1. **API Endpoint Tests** (`test-download.sh`)
Tests the backend API directly using curl.

**What it tests:**
- ✅ API key authentication
- ✅ Token generation
- ✅ Zip file download
- ✅ Zip file validity
- ✅ Token single-use enforcement
- ✅ Manifest.json presence

**Run it:**
```bash
./test-download.sh
```

**Requirements:**
- Server running on `localhost:3354`
- `curl`, `jq`, and `unzip` installed
- At least one collection in your account

---

### 2. **CLI Tests** (`test-cli-download.sh`)
Tests the CLI download command.

**What it tests:**
- ✅ CLI build process
- ✅ Download command functionality
- ✅ File output
- ✅ Zip integrity

**Run it:**
```bash
./test-cli-download.sh
```

**Requirements:**
- Server running on `localhost:3354`
- Node.js installed
- At least one collection in your account

---

## 📋 Manual Testing Checklist

### Backend API Tests

#### Test 1: Generate Download Token
```bash
curl -X POST http://localhost:3354/api/collections/{collection-id}/download \
  -H "Authorization: Bearer sk_85014fe46e1c05d1bf3ebbe9f9a08315f1c653b3f67e90d58408195c9cce0a5c" \
  -H "Content-Type: application/json" \
  -d '{"branch": "main"}'
```

**Expected response:**
```json
{
  "success": true,
  "downloadToken": "dt_...",
  "downloadUrl": "http://localhost:3354/api/collections/.../download/dt_...",
  "expiresAt": "2024-01-15T12:10:00Z",
  "expiresInMinutes": 10,
  "estimatedSizeMB": "0.05",
  "collection": {
    "id": "...",
    "slug": "...",
    "name": "..."
  }
}
```

#### Test 2: Download Zip File
```bash
curl -o collection.zip \
  "http://localhost:3354/api/collections/{collection-id}/download/{token}"
```

**Expected:**
- HTTP 200 response
- Valid zip file downloaded
- File contains skill files and manifest.json

#### Test 3: Verify Token Expiration
Wait 10 minutes and try to download again with same token.

**Expected:**
- HTTP 403 response
- Error: "Invalid, expired, or already used token"

#### Test 4: Verify Single-Use Token
Try to download twice with the same token immediately.

**Expected:**
- First download: Success (HTTP 200)
- Second download: Failure (HTTP 403)

#### Test 5: Download Specific Skills
```bash
curl -X POST http://localhost:3354/api/skills/download \
  -H "Authorization: Bearer sk_85014fe46e1c05d1bf3ebbe9f9a08315f1c653b3f67e90d58408195c9cce0a5c" \
  -H "Content-Type: application/json" \
  -d '{
    "collectionId": "...",
    "skillPaths": ["code-review", "debugging"]
  }'
```

**Expected:**
- Returns download token
- Downloaded zip contains only specified skills

---

### CLI Tests

#### Test 1: Download from Collection Path
```bash
export SKILLSDOJO_TOKEN="sk_85014fe46e1c05d1bf3ebbe9f9a08315f1c653b3f67e90d58408195c9cce0a5c"
cd packages/cli
npm run build
node dist/index.js download account/collection
```

**Expected:**
- Progress indicator appears
- File downloaded to `./collection.zip`
- Success message displayed

#### Test 2: Download to Custom Path
```bash
node dist/index.js download account/collection --output ~/Downloads/my-backup.zip
```

**Expected:**
- File saved to specified path
- Parent directories created if needed

#### Test 3: Download Specific Skills
```bash
node dist/index.js download account/collection --skills "code-review,debugging"
```

**Expected:**
- Only specified skills in downloaded zip

#### Test 4: Download from Branch
```bash
node dist/index.js download account/collection --branch feature-123
```

**Expected:**
- Downloads from specified branch

#### Test 5: JSON Output
```bash
node dist/index.js download account/collection --json
```

**Expected:**
- JSON output with no progress indicators
- Contains: outputPath, collection, branch

#### Test 6: Overwrite Confirmation
```bash
# Run twice to same output file
node dist/index.js download account/collection
node dist/index.js download account/collection
```

**Expected:**
- Second run prompts for overwrite confirmation
- Can skip with `--overwrite` flag

---

### MCP Tests (Claude Desktop)

#### Setup
Add to your MCP configuration:
```json
{
  "mcpServers": {
    "skillsdojo": {
      "url": "http://localhost:3354/api/mcp/account/collection",
      "authorization_token": "Bearer sk_85014fe46e1c05d1bf3ebbe9f9a08315f1c653b3f67e90d58408195c9cce0a5c"
    }
  }
}
```

#### Test 1: download_collection
**User prompt:**
```
Download the entire collection as a backup
```

**Expected:**
- Assistant uses `download_collection` tool
- Returns download URL
- URL works and downloads valid zip

#### Test 2: download_skills
**User prompt:**
```
Download the code-review and debugging skills
```

**Expected:**
- Assistant uses `download_skills` tool
- Validates skills exist
- Returns download URL
- Downloaded zip contains only those skills

#### Test 3: export_skill
**User prompt:**
```
Export the data-analysis skill so I can share it
```

**Expected:**
- Assistant uses `export_skill` tool
- Returns download URL
- Downloaded zip contains single skill

---

## 🔍 Validation Checks

### Zip File Validation
```bash
# List contents
unzip -l collection.zip

# Extract
unzip collection.zip -d test-extract/

# Check manifest
cat test-extract/manifest.json | jq '.'
```

**Expected in manifest.json:**
```json
{
  "version": "1.0",
  "exportedAt": "2024-01-15T10:30:00Z",
  "collection": {
    "id": "...",
    "slug": "...",
    "name": "...",
    "description": "..."
  },
  "skills": [
    {
      "path": "code-review",
      "name": "Code Review",
      "description": "...",
      "metadata": {},
      "dependencies": []
    }
  ],
  "stats": {
    "totalSkills": 1,
    "totalFiles": 1
  }
}
```

### File Structure
```
collection.zip
├── manifest.json
├── code-review/
│   └── SKILL.md
├── debugging/
│   └── SKILL.md
└── ...
```

---

## 🐛 Common Issues

### Issue: "Collection not found"
**Cause:** Invalid collection ID or path
**Fix:** 
- Verify collection exists
- Check account/collection slug format
- Ensure you have access

### Issue: "Token expired"
**Cause:** Token older than 10 minutes
**Fix:** Generate new token and download immediately

### Issue: "Invalid token"
**Cause:** Token already used or invalid
**Fix:** Generate fresh token (tokens are single-use)

### Issue: "Permission denied"
**Cause:** Trying to download private collection without access
**Fix:** Authenticate with proper credentials

### Issue: Download hangs
**Cause:** Large collection or slow network
**Fix:** 
- Check server logs
- Try downloading smaller skill subset first
- Increase timeout settings

### Issue: Corrupted zip
**Cause:** Download interrupted
**Fix:** Delete partial file and retry

---

## 📊 Performance Benchmarks

Run these to verify performance:

### Small Collection (1-10 skills)
```bash
time ./test-download.sh
```
**Expected:** < 2 seconds

### Medium Collection (10-50 skills)
```bash
# Should complete in < 5 seconds
```

### Token Generation
```bash
# Should be < 100ms
```

---

## ✅ Success Criteria

All tests should pass:
- [ ] API authentication works
- [ ] Token generation succeeds
- [ ] Zip download succeeds
- [ ] Zip file is valid
- [ ] Manifest.json is present and valid
- [ ] Token single-use works
- [ ] Token expiration works
- [ ] CLI download works
- [ ] Specific skills download works
- [ ] Branch selection works
- [ ] MCP tools work
- [ ] Access control enforced

---

## 🔄 Continuous Testing

### During Development
```bash
# Watch mode
npm run dev

# In another terminal
./test-download.sh
```

### Before Commit
```bash
npm run build
npm run test  # (when tests are added)
./test-download.sh
./test-cli-download.sh
```

### Before Deployment
- Run all manual tests
- Verify in staging environment
- Test with real collections
- Test token cleanup cron

---

## 📝 Test Results Template

Document your test results:

```markdown
## Test Results - [Date]

### API Tests
- [ ] Token generation: ✅/❌
- [ ] Zip download: ✅/❌
- [ ] Token expiration: ✅/❌
- [ ] Single-use: ✅/❌
- [ ] Access control: ✅/❌

### CLI Tests
- [ ] Basic download: ✅/❌
- [ ] Custom output: ✅/❌
- [ ] Specific skills: ✅/❌
- [ ] Branch selection: ✅/❌
- [ ] JSON output: ✅/❌

### MCP Tests
- [ ] download_collection: ✅/❌
- [ ] download_skills: ✅/❌
- [ ] export_skill: ✅/❌

### Performance
- Token generation: ___ ms
- Small collection: ___ seconds
- Medium collection: ___ seconds

### Issues Found
1. [Description]
2. [Description]

### Notes
[Any additional observations]
```

---

## 🚀 Next Steps After Testing

1. **If all tests pass:**
   - Document any edge cases found
   - Update implementation if needed
   - Proceed to staging deployment

2. **If tests fail:**
   - Document failure details
   - Check server logs
   - Fix issues and retest

3. **Performance optimization:**
   - If downloads are slow, consider async generation
   - If token generation is slow, check database
   - If zip is too large, verify compression

---

**Happy Testing! 🎉**
