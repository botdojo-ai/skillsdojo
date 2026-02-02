# 🎉 MCP Download & Upload Guide

## ✅ Complete Bidirectional Workflow

The MCP server now supports **both downloading and uploading** skill collections as zip files!

---

## 📥 Download Skills (Export)

### Available MCP Tools

#### 1. `download_collection`
Download the entire skill collection as a zip file.

**Input:**
```json
{
  "branch": "main"  // optional
}
```

**Response:**
```json
{
  "success": true,
  "downloadUrl": "https://skillsdojo.ai/api/collections/.../download/dt_...",
  "expiresAt": "2026-01-30T12:00:00Z",
  "expiresInMinutes": 10,
  "message": "Download link generated successfully. Link expires in 10 minutes.",
  "instructions": "Click the download URL or copy it to download the collection as a zip file."
}
```

**Example Usage in Claude:**
```
User: "Download the entire collection as a backup"
Assistant: [Uses download_collection tool]
Response: Here's your download link (expires in 10 minutes): 
          https://skillsdojo.ai/api/collections/.../download/dt_...
```

#### 2. `download_skills`
Download specific skills as a zip file.

**Input:**
```json
{
  "skill_paths": ["code-review", "debugging"],
  "branch": "main"  // optional
}
```

**Example:**
```
User: "Download the code-review and debugging skills"
Assistant: [Uses download_skills with skill_paths]
Response: Download ready for 2 skills: https://...
```

#### 3. `export_skill`
Export a single skill as a zip file for sharing.

**Input:**
```json
{
  "skill_path": "code-review"
}
```

---

## 📤 Upload Skills (Import)

### MCP Tool: `import_from_zip`

Import skills from a zip file into the collection.

**Input:**
```json
{
  "zip_url": "https://example.com/skills.zip",
  "overwrite": false,  // optional, default: false
  "create_pull_request": true,  // optional, default: true
  "pr_title": "Import new skills",  // optional
  "pr_description": "Adding skills from backup"  // optional
}
```

**Response:**
```json
{
  "success": true,
  "action": "skills_imported",
  "message": "Skills imported successfully. Pull request created for review.",
  "imported": ["new-skill-1", "new-skill-2"],
  "updated": ["existing-skill"],
  "failed": [],
  "stats": {
    "imported": 2,
    "updated": 1,
    "failed": 0,
    "totalFiles": 3
  }
}
```

**Options:**
- **overwrite**: If `true`, updates existing skills. If `false`, skips existing skills.
- **create_pull_request**: If `true` (default), creates a PR for review. If `false`, commits directly to main.
- **pr_title/pr_description**: Custom PR title and description

**Example Usage in Claude:**
```
User: "Import skills from this backup file"
Assistant: First, let me download your file...
          [User provides URL or uploads file]
          [Uses import_from_zip tool]
Response: Successfully imported 3 skills! Pull request #42 created for review.
```

---

## 🔄 Complete Workflow Example

### Scenario: Backup, Modify, and Restore

**Step 1: Download (Backup)**
```
User: "Download my collection as a backup"
Assistant: [Uses download_collection]
Response: Download URL: https://... (expires in 10 minutes)
User downloads: my-skills.zip
```

**Step 2: Modify Locally**
```bash
# User extracts and modifies files locally
unzip my-skills.zip -d my-skills/
cd my-skills/
vim code-review/SKILL.md  # Make changes
zip -r my-skills-updated.zip *
```

**Step 3: Upload (Restore/Update)**
```
User: "Import the updated skills from my-skills-updated.zip"
User: [Uploads file or provides URL]
Assistant: [Uses import_from_zip]
Response: Successfully imported!
          - Updated: code-review
          - Pull request #42 created
```

**Step 4: Review and Merge**
```
User: "Show me PR #42"
Assistant: [Uses view_pull_request_ui]
[Shows diff viewer with changes]

User: "Merge it"
Assistant: [Uses merge_pull_request]
Response: PR #42 merged successfully!
```

---

## 🎯 Use Cases

### Use Case 1: Collaborative Editing
```
Team member A:
  → Downloads collection as zip
  → Edits skills offline
  → Uploads modified zip
  → Creates PR for review

Team member B:
  → Reviews PR via MCP
  → Approves and merges
```

### Use Case 2: Bulk Skill Updates
```
User:
  → Downloads all 50 skills
  → Uses script to update all files (e.g., add new metadata field)
  → Uploads updated zip
  → MCP creates PR with all changes
```

### Use Case 3: Cross-Collection Migration
```
User:
  → Downloads skills from collection A
  → Uploads to collection B
  → Skills duplicated across collections
```

### Use Case 4: Version Control
```
User:
  → Downloads collection weekly as backup
  → Stores versioned backups: my-skills-2024-01-15.zip
  → Can restore any version by uploading
```

---

## 🔒 Security & Permissions

### Download (Export)
- **Permission**: `read` or higher
- **Access**: Public collections or owned collections
- **Authentication**: Required (JWT or API key)
- **Token**: 10-minute expiration, single-use

### Upload (Import)
- **Permission**: `write` required
- **Access**: Must own the collection
- **Authentication**: Required (JWT or API key)
- **Validation**: Zip structure validated before processing

---

## 📊 Test Results

### Download Test ✅
```
✅ Download token generated
✅ Zip downloaded (9.5 KB with 4 skills)
✅ Contains SKILL.md files
✅ Manifest.json included
✅ Token reuse blocked
```

### Import Test ✅
```
✅ Zip uploaded successfully
✅ 4 skills updated
✅ 0 failures
✅ Pull request created
✅ Changes staged for review
```

---

## 🚀 CLI Support (Future)

### Planned Commands

**Upload via CLI:**
```bash
sdojo upload <collection> --file ./skills.zip
sdojo upload <collection> --file ./skills.zip --overwrite
sdojo upload <collection> --file ./skills.zip --direct  # Skip PR
```

---

## 💡 MCP Tool Summary

| Tool | Purpose | Permission | Creates PR |
|------|---------|------------|------------|
| `download_collection` | Download all skills | read | N/A |
| `download_skills` | Download specific skills | read | N/A |
| `export_skill` | Download single skill | read | N/A |
| `import_from_zip` | Upload & import skills | write | Yes (default) |

---

## 🎨 Example MCP Conversations

### Example 1: Full Round-Trip
```
User: "Download my collection, I want to edit it"
Assistant: [download_collection] 
          Here's your download link: https://...

[User downloads, edits locally]

User: "Upload my changes"
Assistant: Please provide the zip file URL or upload it.
User: [Provides URL/file]
Assistant: [import_from_zip]
          Successfully imported! Updated 3 skills.
          Pull request #15 created for review.
```

### Example 2: Backup and Restore
```
User: "Create a backup of my skills"
Assistant: [download_collection]
          Backup ready: https://... (717 bytes)

[Later...]

User: "Restore from my backup file"
Assistant: [import_from_zip with overwrite]
          Restored 5 skills from backup.
          Pull request #16 created.
```

### Example 3: Share Skills Between Collections
```
User: "Export the code-review skill"
Assistant: [export_skill]
          Export ready: https://...

[In different collection]

User: "Import this skill zip"
Assistant: [import_from_zip]
          Imported code-review skill successfully!
```

---

## ✨ Key Features

### Download
- ✅ Full collection or specific skills
- ✅ Branch selection
- ✅ Includes manifest.json with metadata
- ✅ Secure time-limited URLs
- ✅ Single-use tokens

### Upload  
- ✅ Validates zip structure
- ✅ Creates pull requests by default
- ✅ Overwrite protection
- ✅ Detailed import results
- ✅ Handles errors gracefully
- ✅ Updates skill counts

---

## 🔮 Future Enhancements

- [ ] Web UI for drag-drop upload
- [ ] Progress tracking for large imports
- [ ] Conflict resolution UI
- [ ] Import preview/dry-run
- [ ] Incremental updates
- [ ] Import from GitHub
- [ ] Export to GitHub
- [ ] Scheduled backups

---

**Status**: ✅ FULLY FUNCTIONAL  
**Both download and upload working perfectly!** 🎊
