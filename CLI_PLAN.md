# SkillsDojo CLI Plan

## Overview

The SkillsDojo CLI (`sdojo`) enables developers to manage skill collections from the command line, similar to how `git` and `gh` work together. Users can clone collections, edit skills locally, and push changes as pull requests.

## Account Model

- **Personal accounts**: When a user signs up, they provide a username which becomes their account slug (e.g., `paulhenry`). This is their personal account.
- **Placeholder accounts**: For public skills imported from external sources, we create fake/placeholder accounts:
  - `anthropic` → for Anthropic's official skills
  - `modelcontextprotocol` → for MCP official servers
  - `community` → for community-contributed skills
- **URL format**: `<account>/<collection>/<skill-path>` (e.g., `anthropic/core-skills/code-review`)

The import script should create these placeholder accounts automatically when importing skills from external sources.

## Architecture

### Core Concept: Local Workspace + Remote API

Since SkillsDojo stores git objects in the database (not actual git repos), the CLI will:

1. **Clone** - Download collection files to a local `.skillsdojo/` workspace
2. **Edit** - Users edit files locally with their preferred tools
3. **Push** - Upload changes via API, creating a Pull Request

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Local Files   │────▶│  SkillsDojo CLI  │────▶│  SkillsDojo API │
│  (.skillsdojo/) │◀────│                  │◀────│   (REST/JWT)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Package Structure

```
packages/
└── cli/
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   ├── index.ts              # Entry point
    │   ├── commands/
    │   │   ├── auth.ts           # login, logout, whoami
    │   │   ├── clone.ts          # Clone collection
    │   │   ├── pull.ts           # Pull latest changes
    │   │   ├── push.ts           # Push changes (create PR)
    │   │   ├── status.ts         # Show local changes
    │   │   ├── diff.ts           # Show diff of changes
    │   │   ├── collection.ts     # list, create, fork, delete
    │   │   ├── skill.ts          # list, create, delete, move
    │   │   ├── pr.ts             # list, view, merge, close
    │   │   ├── search.ts         # Search public skills
    │   │   └── config.ts         # Configure CLI settings
    │   ├── lib/
    │   │   ├── api.ts            # API client wrapper
    │   │   ├── auth.ts           # Token management
    │   │   ├── workspace.ts      # Local file management
    │   │   ├── diff.ts           # Diff computation
    │   │   └── config.ts         # Config file management
    │   └── utils/
    │       ├── prompts.ts        # Interactive prompts
    │       ├── output.ts         # Console formatting
    │       └── errors.ts         # Error handling
    ├── bin/
    │   └── sd.js                 # CLI binary
    └── README.md
```

---

## Commands Specification

### Authentication

#### `sd auth login`
Authenticate with SkillsDojo.

```bash
sd auth login                    # Interactive: opens browser for OAuth
sd auth login --token            # Paste API key/token manually
sd auth login -u email -p pass   # Direct credentials (for CI/scripts)
```

**Flow:**
1. Opens browser to `https://skillsdojo.ai/auth/cli?state=<random>`
2. User logs in, approves CLI access
3. Server redirects to `http://localhost:8765/callback?token=<jwt>`
4. CLI receives token, stores in `~/.skillsdojo/credentials`

#### `sd auth logout`
Clear stored credentials.

#### `sd auth whoami`
Show current authenticated user and account.

```
$ sd auth whoami
Logged in as: paul@example.com
Account: paulhenry (Personal)
API: https://skillsdojo.ai
```

#### `sd auth switch <account>`
Switch active account context (for users with multiple accounts).

---

### Collections

#### `sd clone <account>/<collection> [directory]`
Clone a collection to local workspace.

```bash
sd clone anthropic/core-skills
sd clone anthropic/core-skills ./my-skills
sd clone paulhenry/private-collection  # Requires auth
```

**Creates:**
```
core-skills/
├── .skillsdojo/
│   ├── config.json       # Remote info, branch, account
│   └── index.json        # File hashes for change detection
├── code-review/
│   └── SKILL.md
├── debugging/
│   └── SKILL.md
└── README.md
```

#### `sd collection list`
List your collections.

```
$ sd collection list
NAME                VISIBILITY   SKILLS   STARS   FORKS
paulhenry/my-skills    private       12       -       -
paulhenry/shared       public        45      23       5
org/team-skills        private       67       -       -
```

#### `sd collection create <name>`
Create a new collection.

```bash
sd collection create my-new-skills
sd collection create my-new-skills --visibility public
sd collection create my-new-skills --description "My awesome skills"
```

#### `sd collection fork <account>/<collection>`
Fork a public collection to your account.

```bash
sd collection fork anthropic/core-skills
# Creates: paulhenry/core-skills (forked)
```

#### `sd collection delete <account>/<collection>`
Delete/archive a collection (with confirmation).

---

### Skills

#### `sd skill list [collection]`
List skills in a collection (current workspace or specified).

```bash
sd skill list                    # In cloned workspace
sd skill list anthropic/core     # Specific collection
sd skill list --json             # JSON output for scripting
```

#### `sd skill create <path>`
Create a new skill from template.

```bash
sd skill create data-analysis
sd skill create tools/web-scraper
```

**Creates:**
```
data-analysis/
└── SKILL.md
```

With template:
```yaml
---
name: data-analysis
description:
user-invocable: true
allowed-tools: []
---
# Data Analysis

Instructions for this skill...
```

#### `sd skill show <path>`
Display skill details and content.

#### `sd skill delete <path>`
Remove a skill from the collection.

#### `sd skill move <old-path> <new-path>`
Rename/move a skill within collection.

---

### Sync Operations

#### `sd status`
Show workspace status (like `git status`).

```
$ sd status
Collection: paulhenry/my-skills
Branch: main

Changes not yet pushed:
  modified:   code-review/SKILL.md
  new file:   data-analysis/SKILL.md
  deleted:    old-skill/SKILL.md

Run 'sd push' to create a pull request with these changes.
```

#### `sd diff [path]`
Show diff of local changes.

```bash
sd diff                      # All changes
sd diff code-review          # Specific skill
```

#### `sd pull`
Pull latest changes from remote (merge with local).

```bash
sd pull
sd pull --force              # Overwrite local changes
```

#### `sd push`
Push local changes, creating a Pull Request.

```bash
sd push
sd push --title "Add data analysis skill"
sd push --title "Fix typo" --description "Fixed spelling in SKILL.md"
sd push --draft              # Create as draft PR
```

**Interactive flow:**
```
$ sd push

Creating pull request for paulhenry/my-skills...

Changes to include:
  modified:   code-review/SKILL.md
  new file:   data-analysis/SKILL.md

? PR Title: Add data analysis skill
? Description (optional): Added a new skill for data analysis tasks

Created PR #12: Add data analysis skill
https://skillsdojo.ai/paulhenry/my-skills/pull/12
```

---

### Pull Requests

#### `sd pr list [collection]`
List pull requests.

```bash
sd pr list
sd pr list --state open
sd pr list --state merged
sd pr list paulhenry/my-skills
```

#### `sd pr view <number>`
View PR details.

```bash
sd pr view 12
```

#### `sd pr checkout <number>`
Fetch PR changes to local workspace for review.

#### `sd pr merge <number>`
Merge a pull request (if you have permission).

```bash
sd pr merge 12
sd pr merge 12 --squash
```

#### `sd pr close <number>`
Close a PR without merging.

---

### Search & Discovery

#### `sd search <query>`
Search public skills.

```bash
sd search "code review"
sd search --tag debugging
sd search --account anthropic
```

```
$ sd search "code review"

SKILL                              DESCRIPTION
anthropic/core/code-review         Review code for bugs and improvements
community/tools/pr-reviewer        Automated PR review assistant
```

---

### Configuration

#### `sd config set <key> <value>`
Set configuration options.

```bash
sd config set api.url https://skillsdojo.ai
sd config set editor code
sd config set output.format json
```

#### `sd config get <key>`
Get configuration value.

#### `sd config list`
List all configuration.

**Config file:** `~/.skillsdojo/config.json`
```json
{
  "api": {
    "url": "https://skillsdojo.ai"
  },
  "defaults": {
    "visibility": "private",
    "editor": "code"
  },
  "output": {
    "format": "table"
  }
}
```

---

## New API Endpoints Required

### CLI Authentication

#### `POST /api/auth/cli/initiate`
Start CLI auth flow.

**Request:**
```json
{
  "state": "random-string-for-security"
}
```

**Response:**
```json
{
  "authUrl": "https://skillsdojo.ai/auth/cli?state=xxx",
  "pollUrl": "/api/auth/cli/poll/xxx"
}
```

#### `GET /api/auth/cli/poll/:state`
Poll for completed auth.

**Response (pending):**
```json
{ "status": "pending" }
```

**Response (complete):**
```json
{
  "status": "complete",
  "accessToken": "...",
  "refreshToken": "...",
  "user": { "id": "...", "email": "..." },
  "account": { "id": "...", "slug": "..." }
}
```

### Collection Files (for clone/pull/push)

#### `GET /api/collections/:id/files`
Get all files in a collection (for cloning).

**Response:**
```json
{
  "collection": {
    "id": "...",
    "slug": "my-skills",
    "account": { "slug": "paulhenry" }
  },
  "branch": "main",
  "commitSha": "abc123...",
  "files": [
    {
      "path": "code-review/SKILL.md",
      "sha": "def456...",
      "content": "---\nname: code-review\n..."
    }
  ]
}
```

#### `GET /api/collections/:id/files/:sha`
Get specific file by SHA (for efficient pulls).

#### `POST /api/collections/:id/changes`
Submit changes and create PR.

**Request:**
```json
{
  "baseSha": "abc123...",
  "title": "Add data analysis skill",
  "description": "Added a new skill for data analysis",
  "changes": [
    {
      "path": "data-analysis/SKILL.md",
      "action": "create",
      "content": "---\nname: data-analysis\n..."
    },
    {
      "path": "code-review/SKILL.md",
      "action": "modify",
      "content": "updated content..."
    },
    {
      "path": "old-skill/SKILL.md",
      "action": "delete"
    }
  ]
}
```

**Response:**
```json
{
  "pullRequest": {
    "id": "...",
    "number": 12,
    "url": "https://skillsdojo.ai/paulhenry/my-skills/pull/12"
  }
}
```

### Pull Request Operations

#### `GET /api/collections/:id/pulls`
List pull requests for collection.

**Query params:** `state=open|merged|closed`, `page`, `limit`

#### `GET /api/collections/:id/pulls/:number`
Get PR details including files changed.

#### `POST /api/collections/:id/pulls/:number/merge`
Merge a pull request.

#### `POST /api/collections/:id/pulls/:number/close`
Close a pull request.

#### `GET /api/collections/:id/pulls/:number/files`
Get files in a PR (for checkout).

---

## Local Workspace Structure

### `.skillsdojo/config.json`
```json
{
  "remote": {
    "url": "https://skillsdojo.ai",
    "account": "paulhenry",
    "collection": "my-skills",
    "collectionId": "uuid-here"
  },
  "branch": "main",
  "lastSync": "2024-01-15T10:30:00Z"
}
```

### `.skillsdojo/index.json`
Tracks file state for change detection.

```json
{
  "commitSha": "abc123...",
  "files": {
    "code-review/SKILL.md": {
      "sha": "def456...",
      "mtime": "2024-01-15T10:30:00Z"
    },
    "debugging/SKILL.md": {
      "sha": "ghi789...",
      "mtime": "2024-01-15T10:30:00Z"
    }
  }
}
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Set up CLI package with Commander.js
- [ ] Implement config file management
- [ ] Implement API client with token handling
- [ ] Add `sd auth login/logout/whoami` commands
- [ ] Add backend `/api/auth/cli/*` endpoints

### Phase 2: Collections (Week 2-3)
- [ ] Add `sd collection list/create/fork/delete`
- [ ] Implement workspace management (`.skillsdojo/`)
- [ ] Add `sd clone` command
- [ ] Add backend `/api/collections/:id/files` endpoint

### Phase 3: Sync Operations (Week 3-4)
- [ ] Add `sd status` with change detection
- [ ] Add `sd diff` with file comparison
- [ ] Add `sd pull` for fetching updates
- [ ] Implement SHA-based file comparison

### Phase 4: Push & PRs (Week 4-5)
- [ ] Add backend `/api/collections/:id/changes` endpoint
- [ ] Add `sd push` command with PR creation
- [ ] Add `sd pr list/view/merge/close`
- [ ] Add backend PR management endpoints

### Phase 5: Skills & Polish (Week 5-6)
- [ ] Add `sd skill create/list/show/delete/move`
- [ ] Add `sd search` for public skills
- [ ] Add interactive prompts and better UX
- [ ] Add JSON output mode for scripting
- [ ] Write documentation and examples

---

## Technology Stack

### CLI Framework
- **Commander.js** - Command parsing
- **Inquirer.js** - Interactive prompts
- **Chalk** - Terminal colors
- **Ora** - Spinners/loading indicators
- **cli-table3** - Table formatting

### HTTP Client
- **undici** or **node-fetch** - HTTP requests
- Token refresh middleware

### Local Storage
- JSON files in `~/.skillsdojo/` for global config
- JSON files in `.skillsdojo/` for workspace state

### Diff Library
- **diff** - Text diffing for `sd diff`

---

## Security Considerations

1. **Token Storage**
   - Store tokens in `~/.skillsdojo/credentials` with `600` permissions
   - Support for system keychain (optional enhancement)

2. **API Key Alternative**
   - Users can use API keys instead of JWT for CI/CD
   - API keys stored in environment: `SKILLSDOJO_TOKEN`

3. **Private Collection Access**
   - All private collection operations require authentication
   - API validates account membership before returning data

4. **Input Validation**
   - Validate all user input before API calls
   - Sanitize paths to prevent directory traversal

---

## Example Workflows

### Workflow 1: Contributing to Public Skills
```bash
# Fork and clone a public collection
sd collection fork anthropic/core-skills
sd clone paulhenry/core-skills

# Make changes
cd core-skills
vim code-review/SKILL.md

# Push as PR
sd push --title "Improve code review prompts"

# PR is created on paulhenry/core-skills
# (Original maintainer can be notified to pull from fork)
```

### Workflow 2: Team Collaboration
```bash
# Clone team's private collection
sd clone myorg/team-skills

# Create new skill
sd skill create data-pipeline

# Edit the skill
vim data-pipeline/SKILL.md

# Check status
sd status

# Push changes for review
sd push --title "Add data pipeline skill"

# Team reviews and merges PR #5
sd pr merge 5
```

### Workflow 3: CI/CD Integration
```bash
# Set token from environment
export SKILLSDOJO_TOKEN="sk_..."

# Clone, validate, and sync skills
sd clone myorg/production-skills --json
sd status --json | jq '.changes'

# Automated PR creation
sd push --title "Automated update $(date +%Y-%m-%d)"
```

---

## Open Questions

1. **Conflict Resolution**: How to handle conflicts when pulling changes that overlap with local edits?
   - Option A: Simple "theirs wins" or "mine wins"
   - Option B: Interactive merge (complex)
   - **Recommendation**: Start with Option A, add interactive later

2. **Branch Support**: Should we support multiple branches locally?
   - **Recommendation**: Start with main branch only, add branch support later

3. **Offline Mode**: Should clone work offline with cached data?
   - **Recommendation**: Not for v1, but design with it in mind

4. **Cross-Collection PRs**: PRs from fork to original repo?
   - **Recommendation**: v1 focuses on same-collection PRs, cross-collection later

---

## Success Metrics

1. **Adoption**: Number of CLI downloads/installs
2. **Usage**: Commands executed per user per week
3. **PR Creation**: % of PRs created via CLI vs web
4. **Time Savings**: Reduced time for common workflows

---

## Appendix: Command Reference

| Command | Description |
|---------|-------------|
| `sd auth login` | Authenticate with SkillsDojo |
| `sd auth logout` | Clear credentials |
| `sd auth whoami` | Show current user |
| `sd auth switch <account>` | Switch account context |
| `sd clone <account/collection>` | Clone collection locally |
| `sd pull` | Pull latest changes |
| `sd push` | Push changes as PR |
| `sd status` | Show local changes |
| `sd diff` | Show diff of changes |
| `sd collection list` | List your collections |
| `sd collection create <name>` | Create new collection |
| `sd collection fork <account/collection>` | Fork a collection |
| `sd collection delete <name>` | Delete collection |
| `sd skill list` | List skills |
| `sd skill create <path>` | Create new skill |
| `sd skill show <path>` | Show skill details |
| `sd skill delete <path>` | Delete skill |
| `sd skill move <old> <new>` | Move/rename skill |
| `sd pr list` | List pull requests |
| `sd pr view <number>` | View PR details |
| `sd pr checkout <number>` | Checkout PR locally |
| `sd pr merge <number>` | Merge PR |
| `sd pr close <number>` | Close PR |
| `sd search <query>` | Search public skills |
| `sd config set <key> <value>` | Set config option |
| `sd config get <key>` | Get config option |
| `sd config list` | List all config |
