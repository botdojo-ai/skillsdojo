# Pull Request Push & Skill Set Zip Download Plan

## Executive Summary

This plan adds two major features to Skills-Dojo:
1. **Enhanced PR Push** - Improve the existing push functionality for both CLI and MCP
2. **Zip Download** - Enable downloading skill collections as zip archives via CLI and MCP

## Current State Analysis

### ✅ Already Implemented
- **CLI Push**: `packages/cli/src/commands/push.ts` - Creates PRs from local changes
- **CLI PR Management**: `packages/cli/src/commands/pr.ts` - List, view, merge, close PRs
- **MCP PR Tools**: `src/lib/mcp/tools.ts` - Create, list, view, merge PRs via MCP
- **DownloadToken Entity**: `src/entities/DownloadToken.ts` - Database schema for secure downloads

### ❌ Missing Implementation
- **Zip Download API Endpoints** - No routes to generate/download zips
- **CLI Download Command** - No `sdojo download` command
- **MCP Download Tool** - No MCP tool for downloading collections as zip
- **Zip Generation Logic** - No service to create zip archives from git storage

---

## Implementation Plan

### Phase 1: Backend API - Zip Download Infrastructure

#### 1.1 Create Zip Generation Service

**File**: `src/services/zip.service.ts`

**Responsibilities**:
- Generate zip archives from git file trees
- Support filtering by skill paths
- Handle both full collections and individual skills
- Stream zip data for memory efficiency

**Key Methods**:
```typescript
class ZipService {
  // Generate zip for entire collection
  async generateCollectionZip(collectionId: string, branch?: string): Promise<Buffer>
  
  // Generate zip for specific skills
  async generateSkillsZip(collectionId: string, skillPaths: string[], branch?: string): Promise<Buffer>
  
  // Generate zip for single skill
  async generateSkillZip(collectionId: string, skillPath: string, branch?: string): Promise<Buffer>
}
```

**Dependencies**:
- `jszip` or `archiver` npm package for zip creation
- `DatabaseGitBackend` for reading files from git storage

#### 1.2 Create Download Token Service

**File**: `src/services/download-token.service.ts`

**Responsibilities**:
- Generate secure, time-limited download tokens
- Validate and consume tokens
- Clean up expired tokens

**Key Methods**:
```typescript
class DownloadTokenService {
  // Create a download token for a collection/skill
  async createToken(params: {
    collectionId: string;
    skillId?: string;
    branch?: string;
    expiresInMinutes?: number;
  }): Promise<string>
  
  // Validate and retrieve token data
  async validateToken(token: string): Promise<DownloadToken | null>
  
  // Mark token as used
  async consumeToken(token: string): Promise<void>
  
  // Clean up expired tokens (cron job)
  async cleanupExpiredTokens(): Promise<number>
}
```

#### 1.3 Create API Endpoints

**Files to Create**:

1. **`src/app/api/collections/[id]/download/route.ts`**
   - `POST /api/collections/:id/download` - Generate download token
   - Returns: `{ downloadToken: string, expiresAt: Date }`
   - Auth: Required (read permission)

2. **`src/app/api/collections/[id]/download/[token]/route.ts`**
   - `GET /api/collections/:id/download/:token` - Download zip file
   - Returns: Zip file stream with proper headers
   - Auth: Not required (token validates access)

3. **`src/app/api/skills/download/route.ts`**
   - `POST /api/skills/download` - Download specific skills
   - Body: `{ collectionId, skillPaths[] }`
   - Returns: `{ downloadToken: string, expiresAt: Date }`

**Example Flow**:
```
1. CLI: POST /api/collections/abc123/download
   Response: { downloadToken: "dt_xyz789", expiresAt: "2024-01-15T12:00:00Z" }

2. CLI: GET /api/collections/abc123/download/dt_xyz789
   Response: [ZIP FILE STREAM]
   Headers: Content-Disposition: attachment; filename="my-collection.zip"
```

---

### Phase 2: CLI Implementation

#### 2.1 Add Download Command

**File**: `packages/cli/src/commands/download.ts`

**Commands**:

```bash
# Download entire collection
sdojo download <account>/<collection> [directory]
sdojo download anthropic/core-skills ./my-skills.zip

# Download from current workspace
sdojo download --output ./backup.zip

# Download specific skills
sdojo download <account>/<collection> --skills code-review,debugging
sdojo download --skills "utils/*"  # Pattern matching

# Download specific branch
sdojo download <account>/<collection> --branch feature-123
```

**Implementation**:
```typescript
export const downloadCommand = new Command('download')
  .description('Download a collection or skills as a zip file')
  .argument('[collection]', 'Collection to download (account/collection)')
  .option('-o, --output <path>', 'Output file path', (cwd, slug) => `./${slug}.zip`)
  .option('-s, --skills <paths>', 'Comma-separated skill paths to download')
  .option('-b, --branch <name>', 'Branch to download from', 'main')
  .option('--overwrite', 'Overwrite existing file')
  .action(async (collection, options) => {
    // 1. Resolve collection (from arg or workspace)
    // 2. Request download token from API
    // 3. Download zip using token
    // 4. Save to output path
    // 5. Show progress with ora spinner
  });
```

#### 2.2 Add API Client Methods

**File**: `packages/cli/src/lib/api.ts`

Add methods:
```typescript
class ApiClient {
  async requestDownloadToken(collectionId: string, options?: {
    skillPaths?: string[];
    branch?: string;
  }): Promise<{ downloadToken: string; expiresAt: Date }>
  
  async downloadZip(collectionId: string, token: string, outputPath: string): Promise<void>
}
```

#### 2.3 Update Package Dependencies

**File**: `packages/cli/package.json`

Add:
```json
{
  "dependencies": {
    "node-fetch": "^3.3.2",  // For streaming downloads
    "progress": "^2.0.3"      // For download progress bar
  }
}
```

---

### Phase 3: MCP Implementation

#### 3.1 Add Download Tools

**File**: `src/lib/mcp/tools.ts`

Add new tools:

```typescript
{
  name: "download_collection",
  description: "Download the entire skill collection as a zip file. Returns a download URL that expires in 10 minutes.",
  inputSchema: {
    type: "object",
    properties: {
      branch: {
        type: "string",
        description: "Branch to download from (default: main)",
      },
    },
  },
}

{
  name: "download_skills",
  description: "Download specific skills as a zip file. Returns a download URL that expires in 10 minutes.",
  inputSchema: {
    type: "object",
    properties: {
      skill_paths: {
        type: "array",
        items: { type: "string" },
        description: "Array of skill paths to download",
      },
      branch: {
        type: "string",
        description: "Branch to download from (default: main)",
      },
    },
    required: ["skill_paths"],
  },
}

{
  name: "export_skill",
  description: "Export a single skill as a zip file for sharing. Returns a download URL.",
  inputSchema: {
    type: "object",
    properties: {
      skill_path: {
        type: "string",
        description: "Path of the skill to export",
      },
    },
    required: ["skill_path"],
  },
}
```

#### 3.2 Implement Tool Handlers

**File**: `src/lib/mcp/tools.ts`

Add implementations:
```typescript
async function downloadCollection(
  ctx: MCPServerContext,
  args: { branch?: string }
): Promise<CallToolResult> {
  const ds = await getDataSource();
  const tokenService = new DownloadTokenService(ds);
  
  // Generate download token
  const token = await tokenService.createToken({
    collectionId: ctx.collectionId,
    branch: args.branch || 'main',
    expiresInMinutes: 10,
  });
  
  const downloadUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/collections/${ctx.collectionId}/download/${token}`;
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: true,
        downloadUrl,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        message: "Download link generated successfully. Link expires in 10 minutes.",
      }, null, 2),
    }],
  };
}
```

---

### Phase 4: Enhanced PR Push Features

#### 4.1 CLI Enhancements

**File**: `packages/cli/src/commands/push.ts`

Add features:
- **Dry run mode**: `sdojo push --dry-run` - Preview what would be pushed
- **Auto-merge option**: `sdojo push --auto-merge` - Create and immediately merge (if permissions allow)
- **Draft PR**: Already implemented via `--draft` flag ✅
- **Branch selection**: `sdojo push --branch feature-123` - Push to specific branch

```typescript
pushCommand
  .option('--dry-run', 'Show what would be pushed without creating PR')
  .option('--auto-merge', 'Automatically merge PR if user has permission')
  .option('-b, --branch <name>', 'Target branch (default: main)', 'main')
```

#### 4.2 MCP Enhancements

**File**: `src/lib/mcp/tools.ts`

Enhance existing `create_pull_request` tool:
- Add validation for empty changes
- Add conflict detection
- Better error messages
- Support for auto-merge

Add new tool:
```typescript
{
  name: "push_changes",
  description: "Push local changes and create a pull request. This is a higher-level tool that automatically detects changes, creates a branch if needed, and submits a PR.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      files: {
        type: "array",
        items: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
            action: { enum: ["create", "modify", "delete"] },
          },
          required: ["path", "action"],
        },
      },
      auto_merge: { type: "boolean", default: false },
    },
    required: ["title", "files"],
  },
}
```

---

### Phase 5: Testing & Documentation

#### 5.1 Unit Tests

Create test files:
1. `src/services/__tests__/zip.service.test.ts`
2. `src/services/__tests__/download-token.service.test.ts`
3. `packages/cli/src/commands/__tests__/download.test.ts`

#### 5.2 Integration Tests

Test scenarios:
- Download full collection as zip
- Download specific skills
- Token expiration handling
- Concurrent downloads
- Large collection performance
- PR push with conflicts

#### 5.3 Documentation

Update files:
1. **`packages/cli/README.md`** - Add download command examples
2. **`CLI_PLAN.md`** - Document download workflow
3. **`mcpapp.md`** - Document MCP download tools
4. **API Documentation** - Create OpenAPI spec for download endpoints

---

## File Structure Summary

### New Files to Create

```
src/
├── services/
│   ├── zip.service.ts                           # NEW: Zip generation
│   ├── download-token.service.ts                # NEW: Token management
│   └── __tests__/
│       ├── zip.service.test.ts                  # NEW: Tests
│       └── download-token.service.test.ts       # NEW: Tests
├── app/api/collections/[id]/
│   └── download/
│       ├── route.ts                             # NEW: Generate token
│       └── [token]/
│           └── route.ts                         # NEW: Download zip
└── app/api/skills/
    └── download/
        └── route.ts                             # NEW: Multi-skill download

packages/cli/src/
├── commands/
│   ├── download.ts                              # NEW: Download command
│   ├── push.ts                                  # UPDATE: Add features
│   └── __tests__/
│       └── download.test.ts                     # NEW: Tests
└── lib/
    └── api.ts                                   # UPDATE: Add download methods
```

### Files to Update

```
src/lib/mcp/tools.ts                             # ADD: Download tools
packages/cli/src/index.ts                        # ADD: Register download command
packages/cli/package.json                        # ADD: New dependencies
package.json                                     # ADD: jszip/archiver
```

---

## Dependencies to Add

### Backend
```bash
npm install jszip                    # Zip file generation
npm install @types/jszip --save-dev  # TypeScript types
```

Alternative: `archiver` (streams-based, better for large files)
```bash
npm install archiver
npm install @types/archiver --save-dev
```

### CLI
```bash
cd packages/cli
npm install node-fetch@3              # HTTP downloads with streams
npm install progress                   # Download progress bar
npm install @types/progress --save-dev # TypeScript types
```

---

## Implementation Phases Timeline

### Phase 1: Backend (Days 1-3)
- [ ] Create ZipService
- [ ] Create DownloadTokenService  
- [ ] Create download API endpoints
- [ ] Add database migrations if needed
- [ ] Unit tests for services

### Phase 2: CLI (Days 4-5)
- [ ] Implement download command
- [ ] Add API client methods
- [ ] Add progress indicators
- [ ] Test with real collections

### Phase 3: MCP (Day 6)
- [ ] Add download tools to MCP
- [ ] Implement tool handlers
- [ ] Test with Claude Desktop

### Phase 4: Enhancements (Day 7)
- [ ] Enhanced push features (dry-run, auto-merge)
- [ ] Better error handling
- [ ] Input validation

### Phase 5: Testing & Docs (Days 8-9)
- [ ] Integration tests
- [ ] Documentation updates
- [ ] Example workflows
- [ ] Performance testing

---

## Security Considerations

### Download Tokens
- **Short-lived**: Tokens expire in 10 minutes by default
- **Single-use**: Tokens are marked as used after download
- **Secure random**: Use crypto.randomBytes for token generation
- **Rate limiting**: Limit token generation per user/collection

### Access Control
- **Token endpoint**: Requires authentication + read permission
- **Download endpoint**: Token validates access (no auth needed)
- **Private collections**: Tokens only work for authorized users

### Example Token Generation
```typescript
import { randomBytes } from 'crypto';

function generateDownloadToken(): string {
  const prefix = 'dt_';  // Download Token
  const random = randomBytes(32).toString('base64url');
  return prefix + random;
}
```

---

## Performance Considerations

### Zip Generation
- **Stream-based**: Use streaming to avoid loading entire zip in memory
- **Caching**: Cache generated zips for frequently downloaded collections
- **Background jobs**: For large collections, generate zip asynchronously
- **Compression level**: Use medium compression (level 6) for balance

### Large Collections
- **Pagination**: For collections with 1000+ skills, consider splitting
- **Size limits**: Warn users for collections > 100MB
- **Async generation**: Show "preparing download" message for large zips

---

## Example Usage Scenarios

### Scenario 1: Backup Collection
```bash
# User wants to backup their collection locally
sdojo download paulhenry/my-skills --output ./backup.zip
```

### Scenario 2: Share Specific Skills
```bash
# User wants to share only specific skills with a colleague
sdojo download anthropic/core-skills --skills "code-review,debugging" -o share.zip
```

### Scenario 3: MCP Download in Claude
```
User: "Download the entire collection as a backup"
Assistant: [Calls download_collection tool]
Response: "Download ready: https://skillsdojo.ai/api/collections/.../download/dt_xyz (expires in 10 min)"
```

### Scenario 4: Push with Auto-Merge
```bash
# Make changes
vim code-review/SKILL.md

# Push and auto-merge (if user has permission)
sdojo push --title "Fix typo" --auto-merge
```

---

## Open Questions

1. **Zip Library Choice**: Use `jszip` (simpler) or `archiver` (better streaming)?
   - **Recommendation**: Start with `jszip` for simplicity, migrate to `archiver` if performance issues arise

2. **Async Zip Generation**: Should large collections generate zips in background?
   - **Recommendation**: Start synchronous, add async for collections > 50MB in Phase 6

3. **Caching Strategy**: Cache generated zips on disk or CDN?
   - **Recommendation**: No caching for v1 (always fresh), add caching later

4. **Download UI**: Should we add a web UI for downloading zips?
   - **Recommendation**: Yes, but separate from this plan (future enhancement)

5. **Skill Export Format**: Should exported skills include metadata (tags, dependencies)?
   - **Recommendation**: Yes, include a `manifest.json` in zip root

---

## Success Metrics

1. **CLI Adoption**: Downloads via CLI increase by 30%
2. **MCP Usage**: Download tool used in 10%+ of MCP sessions
3. **Performance**: Zip generation < 5 seconds for collections with <100 skills
4. **Error Rate**: < 1% of download requests fail
5. **Security**: Zero unauthorized downloads

---

## Future Enhancements (Post-MVP)

1. **Incremental Downloads**: Download only changed files since last download
2. **Direct GitHub Export**: Export collection to GitHub repository
3. **Import from Zip**: Upload zip to create/update collection
4. **Multi-Collection Downloads**: Download multiple collections in one zip
5. **Scheduled Backups**: Automated daily/weekly backups via CLI
6. **Download History**: Track what users have downloaded
7. **Shareable Links**: Generate public download links for specific skills
