# MCP Server & Apps Implementation Plan for Skills-Dojo

## Executive Summary

This document outlines the plan to create an MCP (Model Context Protocol) server for Skills-Dojo that:
1. Exposes skill collections as MCP resources and tools
2. Provides interactive UI for pull requests and agent file editing using MCP Apps (SEP-1865)
3. Supports OAuth 2.1 authentication for installation in tools like Claude Desktop, Anthropic API, and other MCP clients
4. Uses the "bundling trick" from BotDojo to embed rich UI widgets in chat interfaces

---

## 1. Architecture Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      MCP Clients                                 │
│  (Claude Desktop, Anthropic API, ChatGPT, Custom Apps)          │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTPS + OAuth 2.1
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Skills-Dojo MCP Server                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Transport Layer (Streamable HTTP + SSE)                     ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ OAuth 2.1 Layer (RFC 9728, RFC 7591, PKCE)                  ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ MCP Protocol Handler (JSON-RPC 2.0)                         ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ Core Features:                                               ││
│  │  • Tools (skill operations, PR management)                   ││
│  │  • Resources (skill files, collections)                      ││
│  │  • Prompts (skill templates)                                 ││
│  │  • MCP Apps (SEP-1865 UI widgets)                           ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Skills-Dojo Backend                            │
│  (PostgreSQL, Git Backend, Auth Services)                        │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 MCP Apps UI Architecture (SEP-1865)

The "bundling trick" from BotDojo uses a **double-iframe architecture** for secure UI embedding:

```
MCP Client (Claude Chat)
  └─ Outer Iframe (origin: mcp-app-proxy.skillsdojo.ai)
      └─ Inner Iframe (srcdoc with CSP headers)
          └─ MCP App HTML (skill editor, PR reviewer, etc.)
```

**Key Benefits:**
- **Origin Isolation**: Prevents app access to host cookies/localStorage
- **CSP Injection**: Security headers applied before rendering
- **Message Routing**: Transparent JSON-RPC forwarding via `postMessage`

---

## 2. OAuth 2.1 Authentication Implementation

### 2.1 OAuth Flow Overview

Following RFC 9728 (Protected Resource Discovery) and RFC 7591 (Dynamic Client Registration):

```
1. Client discovers MCP server URL
2. Client fetches /.well-known/oauth-protected-resource
3. Client discovers auth server via /.well-known/oauth-authorization-server
4. Client performs Dynamic Client Registration (optional)
5. Client initiates Authorization Code flow with PKCE
6. User approves on Skills-Dojo consent page
7. Client exchanges code for JWT access token
8. Client uses Bearer token for MCP requests
```

### 2.2 Collection-Scoped MCP Server URLs

Each collection is exposed as a **separate MCP server** with unique URLs:

```
MCP Server URL: https://skillsdojo.ai/api/mcp/{account}/{collection}
```

This allows users to connect multiple collections independently in Claude or other MCP clients.

**Example:**
- `https://skillsdojo.ai/api/mcp/acme-corp/code-review-skills` → Acme's code review collection
- `https://skillsdojo.ai/api/mcp/acme-corp/devops-skills` → Acme's devops collection
- `https://skillsdojo.ai/api/mcp/community/public-skills` → Community public collection

### 2.3 Required OAuth Endpoints (Per-Collection)

| Endpoint | Purpose |
|----------|---------|
| `/api/mcp/{account}/{collection}/.well-known/oauth-protected-resource` | RFC 9728 protected resource discovery |
| `/.well-known/oauth-authorization-server` | OAuth server metadata (shared) |
| `/.well-known/jwks.json` | Public keys for JWT verification (shared) |
| `/api/mcp/{account}/{collection}/oauth/register` | Dynamic client registration |
| `/api/mcp/{account}/{collection}/oauth/authorize` | Authorization endpoint |
| `/api/mcp/{account}/{collection}/oauth/token` | Token exchange endpoint |
| `/api/mcp/oauth/code-complete` | Internal: store auth code after consent (shared) |

### 2.4 Token Structure

```typescript
interface MCPTokenPayload {
  sub: string;              // User ID who authorized
  account_id: string;       // Skills-Dojo account slug
  collection_id: string;    // Collection slug (REQUIRED - scoped to single collection)
  collection_slug: string;  // Full slug: "{account}/{collection}"
  scope: string;            // Permissions (read, write, contribute)
  type: 'mcp_access_jwt';
  iat: number;
  exp: number;              // 24 hours
}
```

**Important**: Each token grants access to exactly ONE collection. Users connecting multiple collections will have separate tokens for each.

### 2.4 Scope Definitions

| Scope | Permissions |
|-------|-------------|
| `read` | List collections, read skills, view PRs |
| `contribute` | Create PRs, add comments |
| `write` | Direct commits, merge PRs, manage collections |
| `admin` | Full account access |

---

## 3. MCP Server Features

### 3.1 Tools

#### 3.1.1 Collection Management Tools

```typescript
// List collections for the authenticated user/account
{
  name: 'list_collections',
  description: 'List skill collections the user has access to',
  inputSchema: {
    type: 'object',
    properties: {
      visibility: { enum: ['public', 'private', 'all'] },
      limit: { type: 'number', default: 20 }
    }
  }
}

// Get collection details
{
  name: 'get_collection',
  description: 'Get details of a skill collection',
  inputSchema: {
    type: 'object',
    properties: {
      account: { type: 'string' },
      collection: { type: 'string' }
    },
    required: ['account', 'collection']
  }
}
```

#### 3.1.2 Skill Management Tools

```typescript
// List skills in a collection
{
  name: 'list_skills',
  description: 'List all skills in a collection',
  inputSchema: {
    type: 'object',
    properties: {
      account: { type: 'string' },
      collection: { type: 'string' },
      path_prefix: { type: 'string' }
    },
    required: ['account', 'collection']
  }
}

// Read skill content
{
  name: 'read_skill',
  description: 'Read the SKILL.md and supporting files for a skill',
  inputSchema: {
    type: 'object',
    properties: {
      account: { type: 'string' },
      collection: { type: 'string' },
      skill_path: { type: 'string' }
    },
    required: ['account', 'collection', 'skill_path']
  }
}

// Create/update skill (with MCP App UI)
{
  name: 'edit_skill',
  description: 'Open the skill editor UI to create or modify a skill',
  inputSchema: {
    type: 'object',
    properties: {
      account: { type: 'string' },
      collection: { type: 'string' },
      skill_path: { type: 'string' },
      branch: { type: 'string', default: 'main' }
    },
    required: ['account', 'collection']
  },
  _meta: {
    'ui/resourceUri': 'ui://skill-editor'  // Links to MCP App
  }
}
```

#### 3.1.3 Pull Request Tools

```typescript
// List PRs
{
  name: 'list_pull_requests',
  description: 'List pull requests for a collection',
  inputSchema: {
    type: 'object',
    properties: {
      account: { type: 'string' },
      collection: { type: 'string' },
      status: { enum: ['open', 'merged', 'closed', 'all'] }
    },
    required: ['account', 'collection']
  }
}

// View PR with diff UI
{
  name: 'view_pull_request',
  description: 'View pull request details with diff viewer',
  inputSchema: {
    type: 'object',
    properties: {
      account: { type: 'string' },
      collection: { type: 'string' },
      pr_number: { type: 'number' }
    },
    required: ['account', 'collection', 'pr_number']
  },
  _meta: {
    'ui/resourceUri': 'ui://pr-viewer'
  }
}

// Create PR
{
  name: 'create_pull_request',
  description: 'Create a new pull request',
  inputSchema: {
    type: 'object',
    properties: {
      account: { type: 'string' },
      collection: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
      source_branch: { type: 'string' },
      target_branch: { type: 'string', default: 'main' }
    },
    required: ['account', 'collection', 'title', 'source_branch']
  }
}

// Merge PR
{
  name: 'merge_pull_request',
  description: 'Merge an approved pull request',
  inputSchema: {
    type: 'object',
    properties: {
      account: { type: 'string' },
      collection: { type: 'string' },
      pr_number: { type: 'number' }
    },
    required: ['account', 'collection', 'pr_number']
  }
}
```

#### 3.1.4 Search Tools

```typescript
// Search public skills
{
  name: 'search_skills',
  description: 'Search for skills across public collections',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'number', default: 20 }
    },
    required: ['query']
  }
}

// Import skill from public collection
{
  name: 'import_skill',
  description: 'Import a public skill into your collection',
  inputSchema: {
    type: 'object',
    properties: {
      source_account: { type: 'string' },
      source_collection: { type: 'string' },
      skill_path: { type: 'string' },
      target_account: { type: 'string' },
      target_collection: { type: 'string' }
    },
    required: ['source_account', 'source_collection', 'skill_path', 'target_account', 'target_collection']
  }
}
```

### 3.2 Resources

```typescript
// Skill collection resource
{
  uriTemplate: 'skills://{account}/{collection}',
  name: 'Skill Collection',
  mimeType: 'application/json',
  description: 'Access skill collection metadata and file list'
}

// Individual skill resource
{
  uriTemplate: 'skills://{account}/{collection}/{skill_path}',
  name: 'Skill',
  mimeType: 'text/markdown',
  description: 'Access individual skill SKILL.md content'
}

// Skill file resource
{
  uriTemplate: 'skills://{account}/{collection}/{skill_path}/{filename}',
  name: 'Skill File',
  mimeType: 'application/octet-stream',
  description: 'Access supporting files within a skill'
}
```

### 3.3 Prompts

```typescript
// New skill template
{
  name: 'new_skill_template',
  description: 'Template for creating a new skill',
  arguments: [
    { name: 'skill_name', required: true },
    { name: 'description', required: true }
  ]
}

// PR review template
{
  name: 'pr_review_template',
  description: 'Template for reviewing a pull request',
  arguments: [
    { name: 'pr_number', required: true }
  ]
}
```

---

## 4. MCP Apps (SEP-1865) UI Components

### 4.1 Skill Editor App (`ui://skill-editor`)

**Purpose**: Full-featured Monaco editor for creating/editing skills within the chat interface.

**Features**:
- Monaco editor with markdown syntax highlighting
- File tree navigation for multi-file skills
- YAML frontmatter editor
- Live preview
- Save/commit functionality via JSON-RPC

**HTML Structure**:
```typescript
{
  uri: 'ui://skill-editor',
  name: 'Skill Editor',
  mimeType: 'text/html;profile=mcp-app',
  _meta: {
    ui: {
      prefersBorder: true,
      csp: {
        connectDomains: ['https://api.skillsdojo.ai'],
        resourceDomains: ['https://cdn.skillsdojo.ai']
      }
    }
  }
}
```

### 4.2 PR Viewer App (`ui://pr-viewer`)

**Purpose**: Visual diff viewer for reviewing pull requests.

**Features**:
- Side-by-side diff view
- Unified diff view toggle
- Comment threads
- Approve/Request changes buttons
- Merge button (if authorized)

### 4.3 Collection Browser App (`ui://collection-browser`)

**Purpose**: Visual browser for exploring skill collections.

**Features**:
- Tree view of skills
- Quick preview on hover
- Import/fork buttons
- Search within collection

### 4.4 JSON-RPC Communication Protocol

All MCP Apps communicate via JSON-RPC 2.0 over `postMessage`:

**Host → App Messages**:
- `ui/initialize` - Initialize with host context
- `ui/notifications/tool-input` - Tool arguments
- `ui/notifications/tool-result` - Tool execution results
- `ui/notifications/host-context-changed` - Context updates

**App → Host Messages**:
- `ui/notifications/initialized` - Ready acknowledgment
- `ui/notifications/size-change` - Iframe resize
- `ui/message` - Send message to chat
- `ui/open-link` - Open external URL
- `tools/call` - Call tools on host

---

## 5. Implementation Plan

### Phase 1: Core MCP Server (Week 1-2)

#### 5.1.1 Create MCP Server Package

Create `/packages/mcp-server/` with:

```
packages/mcp-server/
├── src/
│   ├── index.ts              # Express app setup
│   ├── transport/
│   │   ├── sse.ts            # SSE transport
│   │   └── streamable-http.ts # Streamable HTTP transport
│   ├── handlers/
│   │   ├── tools.ts          # Tool handlers
│   │   ├── resources.ts      # Resource handlers
│   │   └── prompts.ts        # Prompt handlers
│   ├── oauth/
│   │   ├── discovery.ts      # OAuth discovery endpoints
│   │   ├── authorize.ts      # Authorization flow
│   │   ├── token.ts          # Token generation
│   │   └── middleware.ts     # Token validation middleware
│   └── types.ts              # TypeScript types
├── package.json
└── tsconfig.json
```

#### 5.1.2 Implement OAuth 2.1 Flow

Based on BotDojo's implementation in [oauth.ts](../botdojo/packages/dojo-server/src/mcp/oauth.ts):

1. Protected Resource Discovery endpoint
2. OAuth Discovery endpoint
3. Dynamic Client Registration
4. Authorization redirect to consent UI
5. Token generation with JWT signing

#### 5.1.3 Implement Core Tools

Start with read-only tools:
- `list_collections`
- `get_collection`
- `list_skills`
- `read_skill`
- `search_skills`

### Phase 2: MCP Apps Integration (Week 3-4)

#### 5.2.1 Create HTML Proxy Service

Deploy a proxy service (similar to BotDojo's `sdk-mcp-app-html-proxy`):

```
packages/mcp-app-proxy/
├── src/
│   ├── index.ts              # Express app
│   ├── proxy.ts              # Double-iframe proxy logic
│   └── csp.ts                # CSP injection
└── package.json
```

#### 5.2.2 Use Official MCP Apps SDK

Use the official `@modelcontextprotocol/ext-apps` SDK (released Jan 2026):

```bash
npm install @modelcontextprotocol/ext-apps
```

```typescript
// Using official React hooks
import { useMcpApp } from '@modelcontextprotocol/ext-apps/react';

export function SkillEditor() {
  const {
    toolInput,      // Current tool arguments
    toolResult,     // Tool execution results
    hostContext,    // Host state and capabilities
    sendMessage,    // Send message to chat
    openLink,       // Open external URL
    callTool        // Call tools on host
  } = useMcpApp();

  // Build skill editor UI...
}
```

Supports React, Vue, Svelte, Preact, Solid, and Vanilla JS.

#### 5.2.3 Build Skill Editor App

Create the embedded skill editor with Monaco using the official SDK:

```
packages/mcp-apps/
├── skill-editor/
│   ├── src/
│   │   ├── App.tsx           # Main app using useMcpApp()
│   │   ├── components/
│   │   │   ├── Editor.tsx    # Monaco editor wrapper
│   │   │   ├── FileTree.tsx  # File navigation
│   │   │   └── Preview.tsx   # Markdown preview
│   │   └── index.tsx
│   ├── package.json          # Uses @modelcontextprotocol/ext-apps
│   └── vite.config.ts        # Build config for HTML bundle
├── pr-viewer/
│   └── ...
└── collection-browser/
    └── ...
```

**Build Output**: Each app compiles to a single HTML file with inlined JS/CSS for the `text/html;profile=mcp-app` resource.

### Phase 3: Write Operations & PR Flow (Week 5-6)

#### 5.3.1 Implement Write Tools

- `create_skill`
- `update_skill`
- `delete_skill`
- `commit_changes`

#### 5.3.2 Implement PR Tools

- `create_pull_request`
- `view_pull_request` (with UI)
- `add_pr_comment`
- `approve_pull_request`
- `merge_pull_request`

#### 5.3.3 Build PR Viewer App

Visual diff viewer with comment support.

### Phase 4: Deployment & Testing (Week 7-8)

#### 5.4.1 API Routes Integration

Add MCP endpoints to existing Next.js app with per-collection routing:

```
src/app/api/mcp/
├── [account]/
│   └── [collection]/
│       ├── route.ts                   # Streamable HTTP transport (POST)
│       ├── sse/route.ts               # SSE transport (GET)
│       ├── .well-known/
│       │   └── oauth-protected-resource/route.ts
│       └── oauth/
│           ├── authorize/route.ts     # Per-collection authorization
│           ├── token/route.ts         # Per-collection token exchange
│           └── register/route.ts      # Per-collection client registration
├── oauth/
│   └── code-complete/route.ts         # Shared: internal code storage
└── .well-known/
    ├── oauth-authorization-server/route.ts  # Shared OAuth metadata
    └── jwks.json/route.ts                   # Shared JWKS
```

**URL Examples:**
- MCP Server: `POST /api/mcp/acme-corp/code-review-skills`
- SSE Stream: `GET /api/mcp/acme-corp/code-review-skills/sse`
- OAuth Authorize: `/api/mcp/acme-corp/code-review-skills/oauth/authorize`

#### 5.4.2 OAuth Consent UI

Create consent page at `/mcp/oauth/consent`:

```tsx
// src/app/mcp/oauth/consent/page.tsx
export default function MCPOAuthConsent() {
  // Show requested scopes
  // Show collection access
  // Approve/Deny buttons
  // Generate auth code on approve
}
```

#### 5.4.3 Testing with MCP Inspector

Use the official MCP Inspector:

```bash
npx @modelcontextprotocol/inspector
```

---

## 6. Integration with Anthropic/Claude

### 6.1 Claude Desktop Configuration

Users add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "skills-dojo": {
      "command": "npx",
      "args": ["-y", "@skillsdojo/mcp-server"],
      "env": {
        "SKILLSDOJO_API_KEY": "sk_..."
      }
    }
  }
}
```

### 6.2 Claude API (MCP Connector)

Connect multiple collections as separate MCP servers:

```typescript
const response = await anthropic.beta.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 1000,
  messages: [...],
  mcp_servers: [
    // Collection 1: Code review skills
    {
      type: "url",
      url: "https://skillsdojo.ai/api/mcp/acme-corp/code-review-skills",
      name: "acme-code-review",
      authorization_token: "mcp_eyJ..."  // Token scoped to this collection
    },
    // Collection 2: DevOps skills
    {
      type: "url",
      url: "https://skillsdojo.ai/api/mcp/acme-corp/devops-skills",
      name: "acme-devops",
      authorization_token: "mcp_eyK..."  // Separate token for this collection
    }
  ],
  tools: [
    { type: "mcp_toolset", mcp_server_name: "acme-code-review" },
    { type: "mcp_toolset", mcp_server_name: "acme-devops" }
  ],
  betas: ["mcp-client-2025-11-20"]
});
```

### 6.3 Custom Connector (Claude.ai)

Each collection is added as a separate connector:

1. User goes to Settings > Connectors > Add Custom Connector
2. Enters collection-specific URL: `https://skillsdojo.ai/api/mcp/acme-corp/code-review-skills`
3. OAuth flow initiates for that specific collection
4. User approves access to that collection only
5. Repeat for additional collections

**Result**: User can have multiple Skills-Dojo collections connected, each with its own tools and permissions.

---

## 7. File Structure Summary

```
skills-dojo/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── mcp/
│   │   │       ├── [account]/
│   │   │       │   └── [collection]/
│   │   │       │       ├── route.ts              # Streamable HTTP (per-collection)
│   │   │       │       ├── sse/route.ts          # SSE transport (per-collection)
│   │   │       │       ├── .well-known/
│   │   │       │       │   └── oauth-protected-resource/route.ts
│   │   │       │       └── oauth/
│   │   │       │           ├── authorize/route.ts
│   │   │       │           ├── token/route.ts
│   │   │       │           └── register/route.ts
│   │   │       ├── oauth/
│   │   │       │   └── code-complete/route.ts    # Shared internal endpoint
│   │   │       └── .well-known/
│   │   │           ├── oauth-authorization-server/route.ts
│   │   │           └── jwks.json/route.ts
│   │   └── mcp/
│   │       └── oauth/
│   │           └── [account]/
│   │               └── [collection]/
│   │                   └── consent/page.tsx      # Per-collection consent UI
│   └── lib/
│       └── mcp/
│           ├── server.ts               # MCP server setup
│           ├── tools.ts                # Tool definitions (collection-aware)
│           ├── resources.ts            # Resource definitions
│           ├── prompts.ts              # Prompt definitions
│           └── oauth.ts                # OAuth handlers
├── packages/
│   ├── mcp-server/                     # Standalone MCP server (for CLI/desktop)
│   ├── mcp-app-proxy/                  # Double-iframe proxy service
│   └── mcp-apps/                       # MCP App UI components
│       ├── skill-editor/
│       ├── pr-viewer/
│       └── collection-browser/
└── mcpapp.md                           # This document
```

**Key Design**: Each `{account}/{collection}` combination is a unique MCP server with its own OAuth flow, allowing users to connect multiple collections independently.

---

## 8. Security Considerations

### 8.1 OAuth Security

- PKCE required for all authorization code flows
- Short-lived auth codes (5 minutes)
- JWT tokens with RS256 signing
- Token refresh not supported initially (user re-authorizes after 24h)

### 8.2 MCP Apps Security

- All apps run in sandboxed iframes
- CSP headers injected before rendering
- Origin isolation prevents cookie/localStorage access
- All communication logged and auditable

### 8.3 API Security

- Rate limiting on all MCP endpoints
- Scope-based authorization (read/contribute/write)
- Collection-level access control
- Audit logging for write operations

---

## 9. Design Decisions (Confirmed)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Deployment Model** | Embedded in Next.js app | Share existing auth system, simpler deployment, single codebase |
| **Token Scope** | Collection-scoped tokens | More granular security, follows BotDojo pattern, explicit user consent per collection |
| **Skill Editor** | Full Monaco Editor | VS Code-like experience, rich features for skill authoring (multi-file, syntax highlighting) |
| **MCP Apps** | All three widgets | Skill Editor, PR Viewer, and Collection Browser for complete workflow |

### Implementation Details Based on Decisions

**Next.js Integration:**
- Add `/api/mcp/` routes directly to existing app
- Reuse existing JWT auth system for OAuth token generation
- OAuth consent UI at `/mcp/oauth/consent`
- Share database connections and services

**Collection-Scoped MCP Servers:**
```
Each collection = unique MCP server URL:
  https://skillsdojo.ai/api/mcp/{account}/{collection}

OAuth flow per collection:
1. User adds connector: /api/mcp/acme/code-review-skills
2. OAuth discovers: /api/mcp/acme/code-review-skills/.well-known/oauth-protected-resource
3. User consents to: "Acme Corp / Code Review Skills" collection
4. Token issued with: { account_id: "acme", collection_id: "code-review-skills", scope: "read|write" }
5. Token grants access ONLY to that collection

Multiple collections = multiple MCP servers in Claude:
  - acme/code-review-skills → separate connector
  - acme/devops-skills → separate connector
  - community/public-skills → separate connector
```

**Monaco Editor Bundle:**
- Pre-built React app with Monaco
- Hosted on CDN (e.g., cdn.skillsdojo.ai/mcp-apps/skill-editor/)
- Lazy-loaded when tool is invoked
- ~2MB initial bundle, chunked loading for better performance

**Three MCP App Widgets:**
1. `ui://skill-editor` - Full Monaco editor with file tree
2. `ui://pr-viewer` - Diff viewer with comment threads
3. `ui://collection-browser` - Visual skill browser with search

## 10. Remaining Open Questions

1. **MCP App Proxy Hosting**: Where to host the HTML proxy service?
   - Vercel Edge Functions?
   - Cloudflare Workers?
   - Same origin as main app?

2. **CLI Integration**: Should the existing CLI:
   - Use MCP internally for API calls?
   - Remain separate with its own auth?

3. **MCP Apps Bundle Strategy**: How to handle app bundles?
   - Pre-built and hosted on CDN?
   - Cached with content-addressable storage?

---

## 11. Specification Versions (Updated January 2026)

### Current Stable Versions

| Specification | Version | Status |
|---------------|---------|--------|
| **MCP Core** | 2025-11-25 | Current stable |
| **MCP Apps Extension** | 2026-01-26 | Stable (first official extension) |

### Active SEPs (Drafts in Progress)

| SEP | Feature | Purpose |
|-----|---------|---------|
| DPoP Extension | Authentication | Enhanced token security using DPoP |
| Multi-turn SSE | Transport | Improved SSE transport for complex flows |
| Server Cards (SEP-1649) | Discovery | `.well-known` based server discovery |

### Key Changes Since November 2025

1. **MCP Apps is now official** - Moved from draft (SEP-1865) to stable extension (2026-01-26)
2. **Official SDK released** - `@modelcontextprotocol/ext-apps` with React, Vue, Svelte, Preact, Solid, and Vanilla JS support
3. **Linux Foundation governance** - MCP donated to Agentic AI Foundation (AAIF)
4. **Enterprise hardening** - Focus on security, auth patterns, and SDK guidance

### MCP Apps SDK Package

```bash
npm install @modelcontextprotocol/ext-apps
```

Modules:
- `@modelcontextprotocol/ext-apps` - Core SDK
- `@modelcontextprotocol/ext-apps/react` - React hooks
- `@modelcontextprotocol/ext-apps/app-bridge` - Host implementations

---

## 12. References

### Specifications
- [MCP Core Specification (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP Apps Extension (2026-01-26)](https://github.com/modelcontextprotocol/ext-apps)
- [RFC 9728: OAuth 2.0 Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
- [RFC 7591: OAuth 2.0 Dynamic Client Registration](https://datatracker.ietf.org/doc/html/rfc7591)
- [Server Cards (SEP-1649)](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1649)

### Anthropic Documentation
- [MCP Connector API](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)
- [Custom Connectors Guide](https://support.claude.com/en/articles/11175166-about-custom-integrations-using-remote-mcp)

### BotDojo Reference Implementation
- OAuth Implementation: `../botdojo/packages/dojo-server/src/mcp/oauth.ts`
- MCP Server Registration: `../botdojo/packages-opensource/sdk-botdojo/src/mcp-server.ts`
- MCP App Protocol: `../botdojo/packages-opensource/mcp-app/src/protocol/`
- HTML Proxy: `../botdojo/packages-opensource/sdk-mcp-app-html-proxy/`
- Example MCP Server: `../botdojo/sdk-examples/mcp-server-example/`

### Additional Resources
- [MCP Apps Official Announcement (Jan 2026)](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)
- [January 2026 Core Maintainer Update](https://blog.modelcontextprotocol.io/posts/2026-01-22-core-maintainer-update/)
- [MCP Apps Initial Proposal (Nov 2025)](https://blog.modelcontextprotocol.io/posts/2025-11-21-mcp-apps/)
- [AWS: Authentication on MCP](https://aws.amazon.com/blogs/opensource/open-protocols-for-agent-interoperability-part-2-authentication-on-mcp/)
- [Atlassian Remote MCP Server](https://www.atlassian.com/blog/announcements/remote-mcp-server)
- [MCP Apps SDK API Docs](https://modelcontextprotocol.github.io/ext-apps/api/)
