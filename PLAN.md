# SkillsDojo.ai - Implementation Plan

## Key Decisions

| Decision | Choice | Notes |
|----------|--------|-------|
| **Database** | PostgreSQL + TypeORM | Production-ready, FTS support, Vercel Postgres |
| **Authentication** | Email/password (JWT) | Google OAuth planned for later |
| **Deployment** | Vercel | Serverless, easy CI/CD |
| **Search** | PostgreSQL FTS | Simple full-text search, upgrade later if needed |
| **Public Skills** | Browse without login | Landing page + public skills catalog |
| **Skill Dependencies** | URI in SKILL.md | Format: `accountname/collection/skill` |

---

## Executive Summary

SkillsDojo.ai is a platform for managing, sharing, and distributing AI agent skills compatible with the [Agent Skills open standard](https://agentskills.io). It functions as a "GitHub for Skills" - providing version control, collaboration, access control, and distribution through both a web interface and CLI.

---

## 1. Core Concepts

### 1.1 Skill Structure (Agent Skills Standard)

Each skill follows the Anthropic/Agent Skills standard:

```
my-skill/
├── SKILL.md              # Main instructions (required)
├── template.md           # Optional: Template for Claude to fill in
├── examples/
│   └── sample.md         # Optional: Example output
└── scripts/
    └── validate.sh       # Optional: Validation script
```

**SKILL.md Format:**
```yaml
---
name: skill-name
description: What the skill does
argument-hint: "[arg1] [arg2]"
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Grep, Glob
model: claude-opus-4-5-20251101
context: fork
agent: Explore
dependencies:                          # Optional: skills this depends on
  - anthropic/core-skills/file-utils   # Format: accountname/collection/skill
  - myorg/internal/data-parser
---

Markdown instructions here...
```

### 1.2 Key Entities

| Entity | Description |
|--------|-------------|
| **Skill** | Single skill with SKILL.md + supporting files, backed by git |
| **Skill Collection** | Group of related skills (like a GitHub org/repo) |
| **User** | Account holder who can create/manage skills |
| **Team** | Group of users with shared access to collections |
| **MCP Link** | Reference to external MCP server (repo + docker image) |
| **Pull Request** | Proposed changes to a skill awaiting review |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         SkillsDojo.ai                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │   Next.js    │  │   MCP Server │  │        CLI           │   │
│  │   Web App    │  │   (Expose    │  │   (skillsdojo)      │   │
│  │              │  │    Skills)   │  │                      │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │
│         │                 │                      │               │
│         └────────────┬────┴──────────────────────┘               │
│                      │                                           │
│              ┌───────▼────────┐                                  │
│              │   API Routes   │                                  │
│              │   (Next.js)    │                                  │
│              └───────┬────────┘                                  │
│                      │                                           │
│    ┌─────────────────┼─────────────────┐                        │
│    │                 │                 │                        │
│    ▼                 ▼                 ▼                        │
│ ┌──────────┐  ┌──────────┐      ┌───────────┐                   │
│ │PostgreSQL│  │ Git      │      │ Auth      │                   │
│ │ (Data)   │  │ Storage  │      │ (JWT)     │                   │
│ └──────────┘  └──────────┘      └───────────┘                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Frontend** | Next.js 14+ (App Router) | SSR, API routes, modern React |
| **UI** | Tailwind CSS + shadcn/ui | Rapid development, consistent design |
| **Editor** | Monaco Editor | VS Code-like editing experience |
| **Database** | PostgreSQL + TypeORM | Production-ready, FTS support, Vercel Postgres |
| **Git Backend** | isomorphic-git | Pure JS git implementation, works in-process |
| **Auth** | Custom JWT | Email/password, Google OAuth later |
| **Search** | PostgreSQL FTS | Full-text search on skills, descriptions |
| **CLI** | Commander.js + Ink | Node.js CLI with React-like rendering |
| **MCP Server** | @modelcontextprotocol/sdk | Official MCP implementation |

---

## 4. Database Schema (TypeORM + SQLite)

### 4.1 Git Storage Strategy

**Recommended Approach: Git Object Storage in Database**

Store git repositories directly in SQLite using git's native object model. This gives us a true "GitHub for Skills" where everything is in the database - portable, backupable, and queryable.

```
┌─────────────────────────────────────────────────────────────┐
│                    GIT OBJECT MODEL                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  COMMIT ──────► TREE ──────► BLOB (file content)           │
│    │             │                                          │
│    │             └──────► TREE (subdirectory)              │
│    │                        └──► BLOB                       │
│    ▼                                                        │
│  COMMIT (parent)                                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Database Tables for Git:**

```sql
-- Git objects (blobs, trees, commits, tags)
CREATE TABLE git_objects (
  sha TEXT PRIMARY KEY,           -- SHA-1 hash of content
  repo_id UUID NOT NULL,          -- Which repository
  type TEXT NOT NULL,             -- 'blob' | 'tree' | 'commit' | 'tag'
  content BYTEA NOT NULL,         -- Compressed object content
  size INTEGER NOT NULL,          -- Uncompressed size
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (repo_id) REFERENCES skill_collections(id)
);

-- Git references (branches, tags, HEAD)
CREATE TABLE git_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL,
  ref_name TEXT NOT NULL,         -- 'refs/heads/main', 'HEAD', 'refs/tags/v1'
  sha TEXT,                       -- Points to commit SHA (null if symbolic)
  symbolic_ref TEXT,              -- For symbolic refs like HEAD -> refs/heads/main
  UNIQUE(repo_id, ref_name),
  FOREIGN KEY (repo_id) REFERENCES skill_collections(id)
);

-- Index for fast file lookups (denormalized for queries)
CREATE TABLE git_file_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL,
  branch TEXT NOT NULL,
  path TEXT NOT NULL,             -- 'SKILL.md', 'examples/foo.md'
  blob_sha TEXT NOT NULL,         -- Points to git_objects
  mode TEXT DEFAULT '100644',     -- File mode
  UNIQUE(repo_id, branch, path),
  FOREIGN KEY (repo_id) REFERENCES skill_collections(id),
  FOREIGN KEY (blob_sha) REFERENCES git_objects(sha)
);

-- Full-text search index on skills
CREATE INDEX skills_fts_idx ON skills USING GIN (to_tsvector('english', name || ' ' || description));
```

**Why store git in the database?**
- **Portable**: Single database file contains everything
- **Queryable**: SQL queries across all repos (search file contents, find duplicates)
- **Atomic**: Database transactions ensure consistency
- **Backupable**: One file to backup, replicate, or move
- **No filesystem overhead**: No thousands of loose object files

**How it works with isomorphic-git:**

isomorphic-git supports custom backends. We implement a SQLite backend:

```typescript
// lib/git/sqlite-backend.ts
import { SqliteGitBackend } from './sqlite-git-backend';

const backend = new SqliteGitBackend(db, repoId);

// All git operations work through the database
await git.clone({ fs: backend, dir: '/', url: remoteUrl });
await git.commit({ fs: backend, dir: '/', message: 'Update skill' });
await git.log({ fs: backend, dir: '/' });
```

**Content Deduplication:**
- Same file content across branches/repos stored once (by SHA)
- Example: 100 forks of a skill collection share most objects
- Only changed files create new blobs

### 4.2 Base Entity & Standard Fields

All entities inherit from base classes with standard audit fields, soft delete, and account scoping.

```typescript
// entities/base/BaseEntity.ts
import {
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
  BeforeInsert,
  BeforeUpdate
} from 'typeorm';

/**
 * Standard audit fields for all tables:
 * - accountId: Multi-tenant isolation
 * - createdById, modifiedById: Who made changes
 * - createdAt, modifiedAt: When (UTC)
 * - archivedAt, archivedById: Soft delete
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Multi-tenant: ALL records scoped to account
  @Column()
  @Index()
  accountId: string;

  @ManyToOne('Account', { nullable: false })
  account: any;

  // Audit: created
  @Column()
  createdById: string;

  @ManyToOne('User')
  createdBy: any;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  // Audit: modified
  @Column({ nullable: true })
  modifiedById: string;

  @ManyToOne('User', { nullable: true })
  modifiedBy: any;

  @UpdateDateColumn({ type: 'timestamptz' })
  modifiedAt: Date;

  // Soft delete: archive instead of delete
  @Column({ type: 'timestamptz', nullable: true })
  @Index()
  archivedAt: Date | null;

  @Column({ nullable: true })
  archivedById: string;

  @ManyToOne('User', { nullable: true })
  archivedBy: any;

  // Ensure UTC
  @BeforeInsert()
  @BeforeUpdate()
  ensureUTC() {
    const toUTC = (d: Date | null) => d ? new Date(d.toISOString()) : null;
    this.createdAt = toUTC(this.createdAt)!;
    this.modifiedAt = toUTC(this.modifiedAt)!;
    this.archivedAt = toUTC(this.archivedAt);
  }
}

/**
 * System entities (Account, User) - no account scoping
 */
export abstract class SystemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  createdById: string;

  @Column({ nullable: true })
  modifiedById: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  modifiedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  @Index()
  archivedAt: Date | null;

  @Column({ nullable: true })
  archivedById: string;
}

/**
 * Immutable entities (GitObject) - no audit fields needed
 * Content-addressed, never modified or deleted
 */
export abstract class ImmutableEntity {
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
```

### 4.3 CRUD Service Base Class

```typescript
// lib/db/base-service.ts
import { Repository, SelectQueryBuilder, FindOptionsWhere } from 'typeorm';
import { BaseEntity } from '@/entities/base/BaseEntity';

export interface RequestContext {
  accountId: string;
  userId: string;
}

/**
 * Base service with automatic account scoping, soft delete, and audit fields
 */
export abstract class BaseService<T extends BaseEntity> {
  constructor(
    protected repo: Repository<T>,
    protected ctx: RequestContext
  ) {}

  // === QUERIES (auto-filter by account + exclude archived) ===

  protected query(alias: string): SelectQueryBuilder<T> {
    return this.repo.createQueryBuilder(alias)
      .where(`${alias}.accountId = :accountId`, { accountId: this.ctx.accountId })
      .andWhere(`${alias}.archivedAt IS NULL`);
  }

  async findAll(options?: { includeArchived?: boolean }): Promise<T[]> {
    const qb = this.query('entity');
    if (options?.includeArchived) {
      qb.orWhere('entity.archivedAt IS NOT NULL');
    }
    return qb.getMany();
  }

  async findById(id: string): Promise<T | null> {
    return this.query('entity')
      .andWhere('entity.id = :id', { id })
      .getOne();
  }

  async findByIds(ids: string[]): Promise<T[]> {
    return this.query('entity')
      .andWhere('entity.id IN (:...ids)', { ids })
      .getMany();
  }

  async findOne(where: FindOptionsWhere<T>): Promise<T | null> {
    return this.repo.findOne({
      where: {
        ...where,
        accountId: this.ctx.accountId,
        archivedAt: null
      } as any
    });
  }

  async exists(id: string): Promise<boolean> {
    const count = await this.query('entity')
      .andWhere('entity.id = :id', { id })
      .getCount();
    return count > 0;
  }

  // === MUTATIONS ===

  async create(data: Partial<T>): Promise<T> {
    const entity = this.repo.create({
      ...data,
      accountId: this.ctx.accountId,
      createdById: this.ctx.userId,
      modifiedById: this.ctx.userId
    } as any);
    return this.repo.save(entity);
  }

  async createMany(items: Partial<T>[]): Promise<T[]> {
    const entities = items.map(data => this.repo.create({
      ...data,
      accountId: this.ctx.accountId,
      createdById: this.ctx.userId,
      modifiedById: this.ctx.userId
    } as any));
    return this.repo.save(entities);
  }

  async update(id: string, data: Partial<T>): Promise<T | null> {
    // Verify record exists and belongs to account
    const existing = await this.findById(id);
    if (!existing) return null;

    await this.repo.update(id, {
      ...data,
      modifiedById: this.ctx.userId,
      modifiedAt: new Date()
    } as any);

    return this.findById(id);
  }

  async updateMany(ids: string[], data: Partial<T>): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .update()
      .set({
        ...data,
        modifiedById: this.ctx.userId,
        modifiedAt: new Date()
      } as any)
      .where('id IN (:...ids)', { ids })
      .andWhere('accountId = :accountId', { accountId: this.ctx.accountId })
      .andWhere('archivedAt IS NULL')
      .execute();
    return result.affected || 0;
  }

  // === SOFT DELETE (Archive) ===

  async archive(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) return false;

    await this.repo.update(id, {
      archivedAt: new Date(),
      archivedById: this.ctx.userId,
      modifiedById: this.ctx.userId,
      modifiedAt: new Date()
    } as any);
    return true;
  }

  async archiveMany(ids: string[]): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .update()
      .set({
        archivedAt: new Date(),
        archivedById: this.ctx.userId,
        modifiedById: this.ctx.userId,
        modifiedAt: new Date()
      } as any)
      .where('id IN (:...ids)', { ids })
      .andWhere('accountId = :accountId', { accountId: this.ctx.accountId })
      .andWhere('archivedAt IS NULL')
      .execute();
    return result.affected || 0;
  }

  async restore(id: string): Promise<boolean> {
    // Find including archived
    const existing = await this.repo.findOne({
      where: {
        id,
        accountId: this.ctx.accountId
      } as any
    });
    if (!existing || !existing.archivedAt) return false;

    await this.repo.update(id, {
      archivedAt: null,
      archivedById: null,
      modifiedById: this.ctx.userId,
      modifiedAt: new Date()
    } as any);
    return true;
  }

  // === UTILITIES ===

  async count(where?: FindOptionsWhere<T>): Promise<number> {
    return this.query('entity')
      .andWhere(where || {})
      .getCount();
  }

  // Paginated list
  async paginate(options: {
    page?: number;
    limit?: number;
    orderBy?: string;
    orderDir?: 'ASC' | 'DESC';
  } = {}): Promise<{ items: T[]; total: number; page: number; totalPages: number }> {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    const qb = this.query('entity');

    if (options.orderBy) {
      qb.orderBy(`entity.${options.orderBy}`, options.orderDir || 'DESC');
    } else {
      qb.orderBy('entity.createdAt', 'DESC');
    }

    const [items, total] = await qb
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }
}

// === Usage Example ===
// class SkillService extends BaseService<Skill> {
//   constructor(ctx: RequestContext) {
//     super(getRepository(Skill), ctx);
//   }
//
//   async findBySlug(slug: string): Promise<Skill | null> {
//     return this.query('skill')
//       .andWhere('skill.slug = :slug', { slug })
//       .getOne();
//   }
// }
```

### 4.4 Request Context Middleware

```typescript
// lib/auth/context.ts
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { RequestContext } from '@/lib/db/base-service';

export async function getRequestContext(
  request: NextRequest,
  accountSlug?: string
): Promise<RequestContext | null> {
  // Try session auth first
  const session = await getServerSession();
  if (session?.user) {
    const accountId = accountSlug
      ? await resolveAccountId(accountSlug, session.user.id)
      : session.user.personalAccountId;

    return {
      accountId,
      userId: session.user.id
    };
  }

  // Try API key auth
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer sk_')) {
    const apiKey = await validateApiKey(authHeader.slice(7));
    if (apiKey) {
      return {
        accountId: apiKey.accountId,
        userId: apiKey.createdById // API key acts as creator
      };
    }
  }

  return null;
}

// Helper for API routes
export function withContext<T>(
  handler: (ctx: RequestContext, request: NextRequest) => Promise<T>
) {
  return async (request: NextRequest, params?: any): Promise<Response> => {
    const ctx = await getRequestContext(request, params?.accountSlug);
    if (!ctx) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
      const result = await handler(ctx, request);
      return Response.json(result);
    } catch (error: any) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  };
}
```

### 4.5 Database Indexes

```sql
-- Standard indexes for all tables with BaseEntity
-- Run via migration

-- Account + archived (most common query pattern)
CREATE INDEX idx_{table}_account_archived ON {table} (account_id, archived_at);

-- Account + created (sorting by date)
CREATE INDEX idx_{table}_account_created ON {table} (account_id, created_at DESC);

-- Modified tracking
CREATE INDEX idx_{table}_modified ON {table} (modified_at DESC);

-- Specific table indexes
CREATE INDEX idx_skill_collection_slug ON skill_collection (account_id, slug) WHERE archived_at IS NULL;
CREATE INDEX idx_skill_path ON skill (account_id, collection_id, path) WHERE archived_at IS NULL;
CREATE INDEX idx_api_key_hash ON api_key (key_hash) WHERE archived_at IS NULL;
CREATE INDEX idx_git_object_repo ON git_object (repo_id, type);
CREATE INDEX idx_git_ref_repo ON git_ref (repo_id, ref_name);
```

### 4.6 Entity Definitions

```typescript
// entities/GitObject.ts
// Note: Git objects use ImmutableEntity - content-addressed, never modified
@Entity()
export class GitObject extends ImmutableEntity {
  @PrimaryColumn()
  sha: string; // SHA-1 hash (primary key, not UUID)

  @Column()
  @Index()
  repoId: string;

  @Column()
  type: 'blob' | 'tree' | 'commit' | 'tag';

  @Column({ type: 'blob' })
  content: Buffer; // Compressed content

  @Column()
  size: number; // Uncompressed size

  @ManyToOne(() => SkillCollection)
  repo: SkillCollection;
}

// entities/GitRef.ts
@Entity()
export class GitRef {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  repoId: string;

  @Column()
  refName: string; // 'refs/heads/main', 'HEAD'

  @Column({ nullable: true })
  sha: string; // Commit SHA (null if symbolic)

  @Column({ nullable: true })
  symbolicRef: string; // For HEAD -> refs/heads/main

  @ManyToOne(() => SkillCollection)
  repo: SkillCollection;

  @Index(['repoId', 'refName'], { unique: true })
  repoRef: string;
}

// entities/GitFileIndex.ts (denormalized for fast queries)
@Entity()
export class GitFileIndex {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  repoId: string;

  @Column()
  branch: string;

  @Column()
  path: string; // 'SKILL.md', 'examples/sample.md'

  @Column()
  blobSha: string;

  @Column({ default: '100644' })
  mode: string;

  @ManyToOne(() => SkillCollection)
  repo: SkillCollection;

  @Index(['repoId', 'branch', 'path'], { unique: true })
  repoFilePath: string;
}

// entities/SkillLink.ts
// Tracks when a skill is imported from another collection (like git subtree)
@Entity()
export class SkillLink extends BaseEntity {
  // Inherits: id, accountId, createdById, modifiedById, createdAt, modifiedAt, archivedAt

  // The skill in this collection (the copy)
  @ManyToOne(() => Skill)
  localSkill: Skill;

  @Column()
  @Index()
  localSkillId: string;

  // The source skill (where it was imported from)
  @Column()
  @Index()
  sourceCollectionId: string;

  @Column()
  sourceSkillId: string;

  @Column()
  sourceSkillPath: string; // Original path in source collection

  // Git tracking
  @Column()
  sourceCommitSha: string; // Commit SHA when imported/last updated

  @Column({ type: 'timestamptz', nullable: true })
  lastSyncedAt: Date; // When we last pulled from source (UTC)

  @Column({ nullable: true })
  localCommitSha: string; // Our commit SHA after import

  // Sync status
  @Column({ default: 'synced' })
  status: 'synced' | 'behind' | 'ahead' | 'diverged';

  @Column({ nullable: true })
  upstreamCommitSha: string; // Latest known commit in source

  // Relations
  @ManyToOne(() => SkillCollection)
  sourceCollection: SkillCollection;
}

// entities/Account.ts
// Accounts are like GitHub organizations - users can belong to multiple
// Uses SystemEntity (no account scoping - Account IS the top-level entity)
@Entity()
export class Account extends SystemEntity {
  // Inherits: id, createdById, modifiedById, createdAt, modifiedAt, archivedAt

  @Column({ unique: true })
  @Index()
  slug: string; // URL-friendly identifier (e.g., 'acme-corp')

  @Column()
  name: string; // Display name (e.g., 'Acme Corporation')

  @Column({ default: 'organization' })
  type: 'personal' | 'organization'; // Personal accounts are 1:1 with users

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ nullable: true })
  website: string;

  @OneToMany(() => AccountMembership, membership => membership.account)
  memberships: AccountMembership[];

  @OneToMany(() => SkillCollection, collection => collection.account)
  collections: SkillCollection[];

  @OneToMany(() => ApiKey, apiKey => apiKey.account)
  apiKeys: ApiKey[];
}

// entities/AccountMembership.ts
// Links users to accounts with roles
// Uses SystemEntity (cross-account entity)
@Entity()
export class AccountMembership extends SystemEntity {
  // Inherits: id, createdById, modifiedById, createdAt, modifiedAt, archivedAt

  @ManyToOne(() => User, user => user.memberships)
  user: User;

  @Column()
  @Index()
  userId: string;

  @ManyToOne(() => Account, account => account.memberships)
  account: Account;

  @Column()
  @Index()
  accountId: string;

  @Column({ default: 'member' })
  role: 'owner' | 'admin' | 'member' | 'viewer';

  @Index(['userId', 'accountId'], { unique: true })
  userAccount: string;
}

// entities/ApiKey.ts
// API keys scoped to specific collections within an account
@Entity()
export class ApiKey {
  // ApiKey extends BaseEntity - scoped to account
  // Inherits: id, accountId, createdById, modifiedById, createdAt, modifiedAt, archivedAt

  @Column()
  name: string; // e.g., "Production API", "Claude Code Integration"

  @Column({ unique: true })
  @Index()
  keyHash: string; // Hashed key (never store plain)

  @Column()
  keyPrefix: string; // First 8 chars for display (sk_live_abc1****)

  // Scoped access - which collections this key can access
  @OneToMany(() => ApiKeyScope, scope => scope.apiKey)
  scopes: ApiKeyScope[];

  @Column({ type: 'simple-array' })
  permissions: string[]; // ['skills:read', 'skills:write', 'collections:read']

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date; // UTC

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt: Date; // UTC

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  rateLimit: number; // Requests per minute (null = unlimited)
}

// entities/ApiKeyScope.ts
// Defines which collections an API key can access
@Entity()
export class ApiKeyScope extends BaseEntity {
  // Inherits: id, accountId, createdById, modifiedById, createdAt, modifiedAt, archivedAt

  @ManyToOne(() => ApiKey, apiKey => apiKey.scopes, { onDelete: 'CASCADE' })
  apiKey: ApiKey;

  @Column()
  @Index()
  apiKeyId: string;

  @ManyToOne(() => SkillCollection)
  collection: SkillCollection;

  @Column()
  @Index()
  collectionId: string;

  @Column({ default: 'read' })
  access: 'read' | 'write' | 'admin';

  @Index(['apiKeyId', 'collectionId'], { unique: true })
  keyCollection: string;
}

// entities/User.ts
// Uses SystemEntity - users are global, not account-scoped
@Entity()
export class User extends SystemEntity {
  // Inherits: id, createdById, modifiedById, createdAt, modifiedAt, archivedAt

  @Column({ unique: true })
  @Index()
  username: string;

  @Column({ unique: true })
  @Index()
  email: string;

  @Column()
  passwordHash: string;

  @Column({ nullable: true })
  avatarUrl: string;

  // Personal account (1:1 - created automatically on signup)
  @OneToOne(() => Account)
  @JoinColumn()
  personalAccount: Account;

  @Column({ nullable: true })
  personalAccountId: string;

  // All account memberships (personal + organizations)
  @OneToMany(() => AccountMembership, membership => membership.user)
  memberships: AccountMembership[];

  @OneToMany(() => AccessToken, token => token.user)
  tokens: AccessToken[]; // User auth tokens (for CLI login)

  @ManyToMany(() => Team, team => team.members)
  teams: Team[];
}

// entities/Team.ts
// Teams are scoped to accounts
@Entity()
export class Team extends BaseEntity {
  // Inherits: id, accountId, createdById, modifiedById, createdAt, modifiedAt, archivedAt

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @ManyToMany(() => User, user => user.teams)
  @JoinTable()
  members: User[];

  @OneToMany(() => TeamPermission, perm => perm.team)
  permissions: TeamPermission[];
}

// entities/SkillCollection.ts
@Entity()
export class SkillCollection extends BaseEntity {
  // Inherits: id, accountId, createdById, modifiedById, createdAt, modifiedAt, archivedAt

  @Column()
  name: string;

  @Column()
  @Index()
  slug: string; // URL-friendly name

  @Column({ nullable: true })
  description: string;

  @Column({ default: false })
  @Index()
  isPublic: boolean;

  @Column({ nullable: true })
  @Index()
  forkedFromId: string;

  @OneToMany(() => Skill, skill => skill.collection)
  skills: Skill[];

  // API keys that have access to this collection
  @OneToMany(() => ApiKeyScope, scope => scope.collection)
  apiKeyScopes: ApiKeyScope[];

  @Column({ default: 0 })
  starCount: number;

  @Column({ default: 0 })
  forkCount: number;
}

// entities/Skill.ts
@Entity()
export class Skill extends BaseEntity {
  // Inherits: id, accountId, createdById, modifiedById, createdAt, modifiedAt, archivedAt

  @Column()
  name: string;

  @Column()
  @Index()
  slug: string;

  @Column({ nullable: true })
  description: string;

  @Column()
  @Index()
  path: string; // Path within the collection repo

  @ManyToOne(() => SkillCollection, collection => collection.skills)
  collection: SkillCollection;

  @Column()
  @Index()
  collectionId: string;

  @OneToMany(() => McpLink, link => link.skill)
  mcpLinks: McpLink[];

  @Column({ type: 'simple-json', nullable: true })
  frontmatter: {
    name?: string;
    description?: string;
    argumentHint?: string;
    disableModelInvocation?: boolean;
    userInvocable?: boolean;
    allowedTools?: string[];
    model?: string;
    context?: 'fork';
    agent?: string;
  };
}

// entities/McpLink.ts
@Entity()
export class McpLink extends BaseEntity {
  // Inherits: id, accountId, createdById, modifiedById, createdAt, modifiedAt, archivedAt

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  repoUrl: string; // Git repo URL

  @Column({ nullable: true })
  dockerImage: string; // e.g., "docker.io/user/mcp-server:latest"

  @Column({ nullable: true })
  dockerRegistry: string; // docker.io, ghcr.io, etc.

  @Column({ type: 'simple-json', nullable: true })
  config: Record<string, any>; // MCP server configuration

  @ManyToOne(() => Skill, skill => skill.mcpLinks)
  skill: Skill;

  @Column()
  @Index()
  skillId: string;
}

// entities/PullRequest.ts
@Entity()
export class PullRequest extends BaseEntity {
  // Inherits: id, accountId, createdById, modifiedById, createdAt, modifiedAt, archivedAt

  @Column()
  @Index()
  number: number; // PR number within collection

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column()
  sourceBranch: string;

  @Column()
  targetBranch: string;

  @Column({ type: 'text', default: 'open' })
  @Index()
  status: 'open' | 'merged' | 'closed';

  @ManyToOne(() => SkillCollection)
  collection: SkillCollection;

  @Column()
  @Index()
  collectionId: string;

  @OneToMany(() => Review, review => review.pullRequest)
  reviews: Review[];

  @OneToMany(() => Comment, comment => comment.pullRequest)
  comments: Comment[];

  @Column({ type: 'timestamptz', nullable: true })
  mergedAt: Date; // UTC

  @Column({ nullable: true })
  mergedById: string;

  @ManyToOne(() => User, { nullable: true })
  mergedBy: User;
}

// entities/Review.ts
@Entity()
export class Review extends BaseEntity {
  // Inherits: id, accountId, createdById, modifiedById, createdAt, modifiedAt, archivedAt

  @Column({ type: 'text' })
  status: 'approved' | 'changes_requested' | 'commented';

  @Column({ type: 'text', nullable: true })
  body: string;

  @ManyToOne(() => PullRequest, pr => pr.reviews)
  pullRequest: PullRequest;

  @Column()
  @Index()
  pullRequestId: string;
}

// entities/Comment.ts
@Entity()
export class Comment extends BaseEntity {
  // Inherits: id, accountId, createdById, modifiedById, createdAt, modifiedAt, archivedAt

  @Column({ type: 'text' })
  body: string;

  @Column({ nullable: true })
  filePath: string; // For inline comments

  @Column({ nullable: true })
  lineNumber: number;

  @ManyToOne(() => PullRequest, pr => pr.comments)
  pullRequest: PullRequest;

  @Column()
  @Index()
  pullRequestId: string;
}

// entities/AccessToken.ts
// User authentication tokens (for CLI login) - not account scoped
@Entity()
export class AccessToken extends SystemEntity {
  // Inherits: id, createdById, modifiedById, createdAt, modifiedAt, archivedAt

  @Column()
  name: string;

  @Column({ unique: true })
  @Index()
  tokenHash: string; // Hashed token (never store plain)

  @Column({ type: 'simple-array' })
  scopes: string[]; // ['read:skills', 'write:skills', 'admin']

  @ManyToOne(() => User, user => user.tokens)
  user: User;

  @Column()
  @Index()
  userId: string;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date; // UTC

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt: Date; // UTC
}

// entities/TeamPermission.ts
@Entity()
export class TeamPermission extends BaseEntity {
  // Inherits: id, accountId, createdById, modifiedById, createdAt, modifiedAt, archivedAt

  @ManyToOne(() => Team, team => team.permissions)
  team: Team;

  @Column()
  @Index()
  teamId: string;

  @ManyToOne(() => SkillCollection)
  collection: SkillCollection;

  @Column()
  @Index()
  collectionId: string;

  @Column({ type: 'text', default: 'read' })
  level: 'read' | 'write' | 'admin';

  @Index(['teamId', 'collectionId'], { unique: true })
  teamCollection: string;
}

// entities/Star.ts
@Entity()
export class Star extends SystemEntity {
  // Inherits: id, createdById, modifiedById, createdAt, modifiedAt, archivedAt
  // Note: Stars are cross-account (user can star any public collection)

  @ManyToOne(() => User)
  user: User;

  @Column()
  @Index()
  userId: string;

  @ManyToOne(() => SkillCollection)
  collection: SkillCollection;

  @Column()
  @Index()
  collectionId: string;

  @Index(['userId', 'collectionId'], { unique: true })
  userCollection: string;
}
```

---

## 5. Project Structure

```
skillsdojo/
├── apps/
│   ├── web/                          # Next.js web application
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx
│   │   │   │   ├── register/page.tsx
│   │   │   │   └── layout.tsx
│   │   │   ├── (dashboard)/
│   │   │   │   ├── page.tsx              # Home/explore
│   │   │   │   ├── collections/
│   │   │   │   │   ├── page.tsx          # List collections
│   │   │   │   │   ├── new/page.tsx      # Create collection
│   │   │   │   │   └── [owner]/
│   │   │   │   │       └── [collection]/
│   │   │   │   │           ├── page.tsx  # Collection view
│   │   │   │   │           ├── skills/
│   │   │   │   │           │   └── [...path]/page.tsx  # Skill view/edit
│   │   │   │   │           ├── pulls/
│   │   │   │   │           │   ├── page.tsx     # PR list
│   │   │   │   │           │   ├── new/page.tsx # Create PR
│   │   │   │   │           │   └── [number]/page.tsx # PR detail
│   │   │   │   │           ├── settings/page.tsx
│   │   │   │   │           └── tree/
│   │   │   │   │               └── [...path]/page.tsx  # File tree browser
│   │   │   │   ├── settings/
│   │   │   │   │   ├── page.tsx          # User settings
│   │   │   │   │   ├── tokens/page.tsx   # CLI auth tokens
│   │   │   │   │   └── accounts/page.tsx # List user's accounts
│   │   │   │   ├── [account]/            # Account-specific pages
│   │   │   │   │   ├── page.tsx          # Account dashboard
│   │   │   │   │   ├── settings/
│   │   │   │   │   │   ├── page.tsx      # Account settings
│   │   │   │   │   │   ├── members/page.tsx  # Manage members
│   │   │   │   │   │   └── api-keys/page.tsx # Manage API keys
│   │   │   │   └── layout.tsx
│   │   │   ├── api/
│   │   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   │   ├── collections/
│   │   │   │   │   ├── route.ts          # CRUD collections
│   │   │   │   │   └── [id]/
│   │   │   │   │       ├── route.ts
│   │   │   │   │       ├── fork/route.ts
│   │   │   │   │       ├── skills/route.ts
│   │   │   │   │       ├── pulls/route.ts
│   │   │   │   │       └── download/route.ts  # Generate download URL
│   │   │   │   ├── skills/
│   │   │   │   │   ├── import/route.ts       # Import skill from another collection
│   │   │   │   │   └── [id]/
│   │   │   │   │       ├── route.ts
│   │   │   │   │       ├── mcp-links/route.ts
│   │   │   │   │       ├── download/route.ts  # Download single skill
│   │   │   │   │       ├── link/route.ts      # Get/manage skill link
│   │   │   │   │       ├── sync/route.ts      # Check/pull updates
│   │   │   │   │       └── upstream-pr/route.ts  # Create PR to source
│   │   │   │   ├── downloads/
│   │   │   │   │   └── [token]/route.ts  # Temp download endpoint
│   │   │   │   ├── git/
│   │   │   │   │   ├── push/route.ts
│   │   │   │   │   ├── pull/route.ts
│   │   │   │   │   └── diff/route.ts
│   │   │   │   ├── tokens/route.ts        # User auth tokens (CLI)
│   │   │   │   ├── accounts/
│   │   │   │   │   ├── route.ts          # List/create accounts
│   │   │   │   │   └── [slug]/
│   │   │   │   │       ├── route.ts      # Get/update account
│   │   │   │   │       ├── members/route.ts  # Manage members
│   │   │   │   │       └── api-keys/
│   │   │   │   │           ├── route.ts  # List/create API keys
│   │   │   │   │           └── [id]/
│   │   │   │   │               ├── route.ts  # Get/revoke key
│   │   │   │   │               └── scopes/route.ts  # Manage collection access
│   │   │   │   └── mcp/
│   │   │   │       └── route.ts          # MCP server endpoint
│   │   │   ├── layout.tsx
│   │   │   └── globals.css
│   │   ├── components/
│   │   │   ├── ui/                       # shadcn/ui components
│   │   │   ├── editor/
│   │   │   │   ├── MonacoEditor.tsx
│   │   │   │   ├── SkillEditor.tsx
│   │   │   │   └── DiffViewer.tsx
│   │   │   ├── tree/
│   │   │   │   ├── FileTree.tsx
│   │   │   │   ├── FileTreeNode.tsx
│   │   │   │   └── FileTreeActions.tsx
│   │   │   ├── review/
│   │   │   │   ├── PullRequestView.tsx
│   │   │   │   ├── DiffView.tsx
│   │   │   │   ├── ReviewForm.tsx
│   │   │   │   └── CommentThread.tsx
│   │   │   ├── skill/
│   │   │   │   ├── SkillCard.tsx
│   │   │   │   ├── SkillViewer.tsx
│   │   │   │   └── McpLinkCard.tsx
│   │   │   └── layout/
│   │   │       ├── Sidebar.tsx
│   │   │       ├── Header.tsx
│   │   │       └── CommandPalette.tsx
│   │   ├── lib/
│   │   │   ├── db/
│   │   │   │   ├── data-source.ts        # TypeORM config
│   │   │   │   ├── entities/             # TypeORM entities
│   │   │   │   └── migrations/
│   │   │   ├── git/
│   │   │   │   ├── operations.ts         # isomorphic-git wrapper
│   │   │   │   ├── diff.ts
│   │   │   │   └── merge.ts
│   │   │   ├── auth/
│   │   │   │   ├── config.ts             # NextAuth config
│   │   │   │   └── permissions.ts
│   │   │   ├── skill/
│   │   │   │   ├── parser.ts             # SKILL.md parser
│   │   │   │   └── validator.ts
│   │   │   └── utils/
│   │   ├── public/
│   │   ├── next.config.js
│   │   ├── tailwind.config.js
│   │   └── package.json
│   │
│   ├── cli/                              # CLI application
│   │   ├── src/
│   │   │   ├── index.ts                  # Entry point
│   │   │   ├── commands/
│   │   │   │   ├── auth.ts               # login, logout, whoami
│   │   │   │   ├── clone.ts              # clone skill/collection
│   │   │   │   ├── import.ts             # import individual skill
│   │   │   │   ├── sync.ts               # check/pull skill updates
│   │   │   │   ├── pull.ts               # pull changes
│   │   │   │   ├── push.ts               # push changes
│   │   │   │   ├── pr.ts                 # create/list/view PRs
│   │   │   │   ├── upstream-pr.ts        # create PR to source skill
│   │   │   │   ├── merge.ts              # merge PRs
│   │   │   │   └── config.ts             # configure settings
│   │   │   ├── lib/
│   │   │   │   ├── api.ts                # API client
│   │   │   │   ├── config.ts             # Config file management
│   │   │   │   ├── git.ts                # Local git operations
│   │   │   │   └── auth.ts               # Token storage
│   │   │   └── ui/
│   │   │       ├── spinner.ts
│   │   │       └── prompts.ts
│   │   ├── bin/
│   │   │   └── skillsdojo.js
│   │   └── package.json
│   │
│   └── mcp-server/                       # MCP Server
│       ├── src/
│       │   ├── index.ts
│       │   ├── server.ts                 # MCP server implementation
│       │   ├── tools/
│       │   │   ├── list-skills.ts
│       │   │   ├── get-skill.ts
│       │   │   ├── search-skills.ts
│       │   │   └── import-skill.ts       # Import skill to collection
│       │   └── resources/
│       │       └── skill-resource.ts
│       └── package.json
│
├── packages/
│   └── shared/                           # Shared code
│       ├── src/
│       │   ├── types/                    # Shared TypeScript types
│       │   ├── constants/
│       │   └── validators/
│       └── package.json
│
├── data/                                 # Runtime data (gitignored)
│   └── skillsdojo.db                     # SQLite database (contains everything)
│
├── docker-compose.yml                    # Local development
├── turbo.json                            # Turborepo config
├── package.json
└── README.md
```

---

## 6. Key Features Implementation

### 6.1 Monaco Editor Integration

```typescript
// components/editor/SkillEditor.tsx
'use client';

import { Editor, OnMount } from '@monaco-editor/react';
import { useState, useCallback } from 'react';

interface SkillEditorProps {
  initialContent: string;
  filePath: string;
  onSave: (content: string) => Promise<void>;
  readOnly?: boolean;
}

export function SkillEditor({
  initialContent,
  filePath,
  onSave,
  readOnly = false
}: SkillEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [isDirty, setIsDirty] = useState(false);

  const handleEditorMount: OnMount = (editor, monaco) => {
    // Register SKILL.md language support
    monaco.languages.register({ id: 'skill-markdown' });

    // Add YAML frontmatter highlighting
    monaco.languages.setMonarchTokensProvider('skill-markdown', {
      tokenizer: {
        root: [
          [/^---$/, { token: 'delimiter', next: '@frontmatter' }],
          [/./, { token: '', next: '@markdown' }],
        ],
        frontmatter: [
          [/^---$/, { token: 'delimiter', next: '@markdown' }],
          [/[a-zA-Z_-]+:/, 'key'],
          [/".*?"/, 'string'],
          [/\d+/, 'number'],
          [/true|false/, 'keyword'],
        ],
        markdown: [
          [/^#+.*$/, 'header'],
          [/\*\*.*?\*\*/, 'strong'],
          [/`.*?`/, 'code'],
          [/\[.*?\]\(.*?\)/, 'link'],
        ],
      },
    });

    // Keybindings
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSave();
    });
  };

  const handleSave = async () => {
    await onSave(content);
    setIsDirty(false);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-2 border-b">
        <span className="text-sm text-muted-foreground">{filePath}</span>
        {isDirty && (
          <span className="text-xs text-yellow-500">Unsaved changes</span>
        )}
      </div>
      <Editor
        height="100%"
        defaultLanguage="skill-markdown"
        value={content}
        onChange={(value) => {
          setContent(value || '');
          setIsDirty(true);
        }}
        onMount={handleEditorMount}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 14,
          wordWrap: 'on',
          lineNumbers: 'on',
        }}
        theme="vs-dark"
      />
    </div>
  );
}
```

### 6.2 File Tree Component

```typescript
// components/tree/FileTree.tsx
'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, File, Folder, Plus, Trash, Edit } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

interface FileTreeProps {
  tree: TreeNode[];
  selectedPath?: string;
  onSelect: (path: string) => void;
  onCreateFile: (parentPath: string, name: string) => void;
  onCreateFolder: (parentPath: string, name: string) => void;
  onDelete: (path: string) => void;
  onRename: (oldPath: string, newName: string) => void;
}

export function FileTree({
  tree,
  selectedPath,
  onSelect,
  onCreateFile,
  onCreateFolder,
  onDelete,
  onRename,
}: FileTreeProps) {
  return (
    <div className="w-64 border-r h-full overflow-auto">
      <div className="p-2 border-b flex items-center justify-between">
        <span className="text-sm font-medium">Files</span>
        <div className="flex gap-1">
          <button
            onClick={() => onCreateFile('', 'new-file.md')}
            className="p-1 hover:bg-accent rounded"
            title="New File"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={() => onCreateFolder('', 'new-folder')}
            className="p-1 hover:bg-accent rounded"
            title="New Folder"
          >
            <Folder className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="p-2">
        {tree.map((node) => (
          <TreeNodeComponent
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onCreateFile={onCreateFile}
            onCreateFolder={onCreateFolder}
            onDelete={onDelete}
            onRename={onRename}
          />
        ))}
      </div>
    </div>
  );
}

function TreeNodeComponent({
  node,
  depth,
  selectedPath,
  onSelect,
  onCreateFile,
  onCreateFolder,
  onDelete,
  onRename,
}: {
  node: TreeNode;
  depth: number;
  selectedPath?: string;
  onSelect: (path: string) => void;
  onCreateFile: (parentPath: string, name: string) => void;
  onCreateFolder: (parentPath: string, name: string) => void;
  onDelete: (path: string) => void;
  onRename: (oldPath: string, newName: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(depth < 2);
  const [isHovered, setIsHovered] = useState(false);

  const isSelected = selectedPath === node.path;
  const isDirectory = node.type === 'directory';

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 py-1 px-2 rounded cursor-pointer group',
          isSelected ? 'bg-accent' : 'hover:bg-accent/50'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => {
          if (isDirectory) {
            setIsOpen(!isOpen);
          }
          onSelect(node.path);
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {isDirectory ? (
          isOpen ? (
            <ChevronDown className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0" />
          )
        ) : (
          <File className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm truncate flex-1">{node.name}</span>
        {isHovered && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(node.path);
              }}
              className="p-0.5 hover:bg-destructive/20 rounded"
            >
              <Trash className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
      {isDirectory && isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNodeComponent
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onCreateFile={onCreateFile}
              onCreateFolder={onCreateFolder}
              onDelete={onDelete}
              onRename={onRename}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

### 6.3 Pull Request Review Interface

```typescript
// components/review/PullRequestView.tsx
'use client';

import { useState } from 'react';
import { DiffViewer } from './DiffViewer';
import { ReviewForm } from './ReviewForm';
import { CommentThread } from './CommentThread';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface PullRequestViewProps {
  pullRequest: {
    id: string;
    number: number;
    title: string;
    description: string;
    status: 'open' | 'merged' | 'closed';
    author: { username: string; avatarUrl: string };
    sourceBranch: string;
    targetBranch: string;
    createdAt: string;
    reviews: Review[];
    comments: Comment[];
  };
  diff: DiffFile[];
  onApprove: () => Promise<void>;
  onRequestChanges: (comment: string) => Promise<void>;
  onMerge: () => Promise<void>;
  onComment: (body: string, filePath?: string, line?: number) => Promise<void>;
}

export function PullRequestView({
  pullRequest,
  diff,
  onApprove,
  onRequestChanges,
  onMerge,
  onComment,
}: PullRequestViewProps) {
  const [activeTab, setActiveTab] = useState('conversation');

  const canMerge = pullRequest.status === 'open' &&
    pullRequest.reviews.some(r => r.status === 'approved');

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold">{pullRequest.title}</h1>
          <Badge variant={
            pullRequest.status === 'open' ? 'default' :
            pullRequest.status === 'merged' ? 'success' : 'secondary'
          }>
            {pullRequest.status}
          </Badge>
        </div>
        <p className="text-muted-foreground">
          {pullRequest.author.username} wants to merge{' '}
          <code className="px-1 bg-muted rounded">{pullRequest.sourceBranch}</code>
          {' '}into{' '}
          <code className="px-1 bg-muted rounded">{pullRequest.targetBranch}</code>
        </p>
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="conversation">Conversation</TabsTrigger>
              <TabsTrigger value="files">
                Files Changed ({diff.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="conversation" className="mt-4">
              <div className="space-y-4">
                {pullRequest.description && (
                  <div className="p-4 border rounded-lg">
                    <p className="whitespace-pre-wrap">{pullRequest.description}</p>
                  </div>
                )}

                {pullRequest.comments.map((comment) => (
                  <CommentThread key={comment.id} comment={comment} />
                ))}

                <ReviewForm
                  onApprove={onApprove}
                  onRequestChanges={onRequestChanges}
                  onComment={(body) => onComment(body)}
                />
              </div>
            </TabsContent>

            <TabsContent value="files" className="mt-4">
              <div className="space-y-4">
                {diff.map((file) => (
                  <DiffViewer
                    key={file.path}
                    file={file}
                    onComment={(line, body) => onComment(body, file.path, line)}
                    comments={pullRequest.comments.filter(c => c.filePath === file.path)}
                  />
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="w-64 shrink-0">
          <div className="border rounded-lg p-4 space-y-4 sticky top-4">
            <div>
              <h3 className="font-medium mb-2">Reviews</h3>
              {pullRequest.reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">No reviews yet</p>
              ) : (
                <div className="space-y-2">
                  {pullRequest.reviews.map((review) => (
                    <div key={review.id} className="flex items-center gap-2">
                      <Badge variant={
                        review.status === 'approved' ? 'success' :
                        review.status === 'changes_requested' ? 'destructive' : 'secondary'
                      }>
                        {review.status}
                      </Badge>
                      <span className="text-sm">{review.reviewer.username}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {pullRequest.status === 'open' && (
              <Button
                onClick={onMerge}
                disabled={!canMerge}
                className="w-full"
              >
                {canMerge ? 'Merge Pull Request' : 'Awaiting Approval'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 6.4 SQLite Git Backend for isomorphic-git

```typescript
// lib/git/sqlite-backend.ts
import { DataSource } from 'typeorm';
import { GitObject, GitRef, GitFileIndex } from '@/lib/db/entities';
import pako from 'pako'; // For compression

/**
 * Custom filesystem backend for isomorphic-git that stores everything in SQLite
 */
export class SqliteGitBackend {
  private cache = new Map<string, any>();

  constructor(
    private db: DataSource,
    private repoId: string
  ) {}

  // Read a file (for isomorphic-git)
  async readFile(filepath: string, options?: { encoding?: string }): Promise<Uint8Array | string> {
    // Handle special git files
    if (filepath.startsWith('.git/objects/')) {
      return this.readGitObject(filepath);
    }
    if (filepath.startsWith('.git/refs/') || filepath === '.git/HEAD') {
      return this.readGitRef(filepath);
    }

    // Regular file from working tree (read from file index)
    const branch = 'HEAD'; // Or parse from context
    const relativePath = filepath.replace(/^\//, '');

    const fileIndex = await this.db.getRepository(GitFileIndex).findOne({
      where: { repoId: this.repoId, branch, path: relativePath }
    });

    if (!fileIndex) {
      throw new Error(`ENOENT: ${filepath}`);
    }

    const blob = await this.db.getRepository(GitObject).findOne({
      where: { sha: fileIndex.blobSha }
    });

    if (!blob) {
      throw new Error(`ENOENT: blob not found for ${filepath}`);
    }

    const content = pako.inflate(blob.content);
    return options?.encoding === 'utf8'
      ? new TextDecoder().decode(content)
      : content;
  }

  // Write a file
  async writeFile(filepath: string, data: Uint8Array | string): Promise<void> {
    if (filepath.startsWith('.git/objects/')) {
      await this.writeGitObject(filepath, data);
      return;
    }
    if (filepath.startsWith('.git/refs/') || filepath === '.git/HEAD') {
      await this.writeGitRef(filepath, data);
      return;
    }

    // Regular file - will be staged and committed
    const content = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const sha = await this.hashObject(content, 'blob');

    // Store blob
    await this.db.getRepository(GitObject).upsert({
      sha,
      repoId: this.repoId,
      type: 'blob',
      content: Buffer.from(pako.deflate(content)),
      size: content.length
    }, ['sha']);

    // Update file index
    const relativePath = filepath.replace(/^\//, '');
    await this.db.getRepository(GitFileIndex).upsert({
      repoId: this.repoId,
      branch: 'HEAD',
      path: relativePath,
      blobSha: sha
    }, ['repoId', 'branch', 'path']);
  }

  // Read git object by path (.git/objects/ab/cdef123...)
  private async readGitObject(filepath: string): Promise<Uint8Array> {
    const sha = this.pathToSha(filepath);
    const obj = await this.db.getRepository(GitObject).findOne({
      where: { sha, repoId: this.repoId }
    });

    if (!obj) {
      throw new Error(`ENOENT: ${filepath}`);
    }

    return obj.content;
  }

  // Write git object
  private async writeGitObject(filepath: string, data: Uint8Array | string): Promise<void> {
    const sha = this.pathToSha(filepath);
    const content = typeof data === 'string' ? new TextEncoder().encode(data) : data;

    // Parse object type from content header
    const type = this.parseObjectType(content);

    await this.db.getRepository(GitObject).upsert({
      sha,
      repoId: this.repoId,
      type,
      content: Buffer.from(content),
      size: content.length
    }, ['sha']);
  }

  // Read git ref
  private async readGitRef(filepath: string): Promise<string> {
    const refName = filepath.replace('.git/', '').replace(/^\//, '');

    const ref = await this.db.getRepository(GitRef).findOne({
      where: { repoId: this.repoId, refName }
    });

    if (!ref) {
      throw new Error(`ENOENT: ${filepath}`);
    }

    if (ref.symbolicRef) {
      return `ref: ${ref.symbolicRef}\n`;
    }
    return `${ref.sha}\n`;
  }

  // Write git ref
  private async writeGitRef(filepath: string, data: Uint8Array | string): Promise<void> {
    const refName = filepath.replace('.git/', '').replace(/^\//, '');
    const content = typeof data === 'string' ? data : new TextDecoder().decode(data);

    const isSymbolic = content.startsWith('ref: ');
    const sha = isSymbolic ? null : content.trim();
    const symbolicRef = isSymbolic ? content.replace('ref: ', '').trim() : null;

    await this.db.getRepository(GitRef).upsert({
      repoId: this.repoId,
      refName,
      sha,
      symbolicRef
    }, ['repoId', 'refName']);
  }

  // List directory contents
  async readdir(filepath: string): Promise<string[]> {
    if (filepath === '.git/objects') {
      // Return 2-char prefixes of all object SHAs
      const objects = await this.db.getRepository(GitObject)
        .createQueryBuilder('obj')
        .select('DISTINCT SUBSTR(obj.sha, 1, 2)', 'prefix')
        .where('obj.repoId = :repoId', { repoId: this.repoId })
        .getRawMany();
      return objects.map(o => o.prefix);
    }

    if (filepath.match(/^\.git\/objects\/[0-9a-f]{2}$/)) {
      // Return object files in this prefix directory
      const prefix = filepath.slice(-2);
      const objects = await this.db.getRepository(GitObject)
        .createQueryBuilder('obj')
        .select('SUBSTR(obj.sha, 3)', 'suffix')
        .where('obj.repoId = :repoId AND obj.sha LIKE :prefix', {
          repoId: this.repoId,
          prefix: `${prefix}%`
        })
        .getRawMany();
      return objects.map(o => o.suffix);
    }

    if (filepath === '.git/refs/heads') {
      const refs = await this.db.getRepository(GitRef).find({
        where: { repoId: this.repoId }
      });
      return refs
        .filter(r => r.refName.startsWith('refs/heads/'))
        .map(r => r.refName.replace('refs/heads/', ''));
    }

    // Working tree directory
    const files = await this.db.getRepository(GitFileIndex).find({
      where: { repoId: this.repoId, branch: 'HEAD' }
    });

    const dir = filepath.replace(/^\//, '');
    const entries = new Set<string>();

    for (const file of files) {
      if (dir === '' || file.path.startsWith(dir + '/')) {
        const relative = dir === '' ? file.path : file.path.slice(dir.length + 1);
        const firstPart = relative.split('/')[0];
        entries.add(firstPart);
      }
    }

    return Array.from(entries);
  }

  // Check if path exists
  async stat(filepath: string): Promise<{ isFile: () => boolean; isDirectory: () => boolean }> {
    // Implementation for stat
  }

  // Hash content to get SHA
  private async hashObject(content: Uint8Array, type: string): Promise<string> {
    const header = `${type} ${content.length}\0`;
    const full = new Uint8Array([...new TextEncoder().encode(header), ...content]);
    const hashBuffer = await crypto.subtle.digest('SHA-1', full);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private pathToSha(filepath: string): string {
    // .git/objects/ab/cdef123... -> abcdef123...
    const match = filepath.match(/objects\/([0-9a-f]{2})\/([0-9a-f]+)/);
    return match ? match[1] + match[2] : '';
  }

  private parseObjectType(content: Uint8Array): 'blob' | 'tree' | 'commit' | 'tag' {
    // Parse git object header to get type
    const header = new TextDecoder().decode(content.slice(0, 10));
    if (header.startsWith('blob')) return 'blob';
    if (header.startsWith('tree')) return 'tree';
    if (header.startsWith('commit')) return 'commit';
    if (header.startsWith('tag')) return 'tag';
    return 'blob';
  }
}
```

### 6.5 Git Operations Using SQLite Backend

```typescript
// lib/git/operations.ts
import git from 'isomorphic-git';
import { SqliteGitBackend } from './sqlite-backend';
import { getDataSource } from '@/lib/db/data-source';

export interface GitConfig {
  author: {
    name: string;
    email: string;
  };
}

export async function getBackend(repoId: string): Promise<SqliteGitBackend> {
  const ds = await getDataSource();
  return new SqliteGitBackend(ds, repoId);
}

export async function initRepo(
  repoId: string,
  config: GitConfig
): Promise<void> {
  const backend = await getBackend(repoId);

  await git.init({
    fs: backend,
    dir: '/',
    defaultBranch: 'main',
  });
}

export async function forkRepo(
  sourceRepoId: string,
  targetRepoId: string
): Promise<void> {
  const ds = await getDataSource();

  // Copy all git objects (they're content-addressed, so safe to share)
  await ds.query(`
    INSERT INTO git_object (sha, repo_id, type, content, size, created_at)
    SELECT sha, ?, type, content, size, CURRENT_TIMESTAMP
    FROM git_object WHERE repo_id = ?
    ON CONFLICT (sha) DO NOTHING
  `, [targetRepoId, sourceRepoId]);

  // Copy refs
  await ds.query(`
    INSERT INTO git_ref (id, repo_id, ref_name, sha, symbolic_ref)
    SELECT ?, ?, ref_name, sha, symbolic_ref
    FROM git_ref WHERE repo_id = ?
  `, [crypto.randomUUID(), targetRepoId, sourceRepoId]);

  // Copy file index
  await ds.query(`
    INSERT INTO git_file_index (id, repo_id, branch, path, blob_sha, mode)
    SELECT ?, ?, branch, path, blob_sha, mode
    FROM git_file_index WHERE repo_id = ?
  `, [crypto.randomUUID(), targetRepoId, sourceRepoId]);
}

export async function commitChanges(
  repoId: string,
  message: string,
  author: GitConfig['author']
): Promise<string> {
  const backend = await getBackend(repoId);

  // Stage all changes
  await git.statusMatrix({ fs: backend, dir: '/' }).then(async (status) => {
    await Promise.all(
      status.map(([filepath, , worktreeStatus]) =>
        worktreeStatus
          ? git.add({ fs: backend, dir: '/', filepath })
          : git.remove({ fs: backend, dir: '/', filepath })
      )
    );
  });

  // Commit
  const sha = await git.commit({
    fs: backend,
    dir: '/',
    message,
    author: {
      name: author.name,
      email: author.email,
    },
  });

  return sha;
}

export async function createBranch(
  repoId: string,
  branchName: string,
  startPoint?: string
): Promise<void> {
  const backend = await getBackend(repoId);

  await git.branch({
    fs: backend,
    dir: '/',
    ref: branchName,
    checkout: true,
    object: startPoint,
  });
}

export async function mergeBranch(
  repoId: string,
  sourceBranch: string,
  targetBranch: string,
  author: GitConfig['author']
): Promise<{ success: boolean; conflicts?: string[] }> {
  const backend = await getBackend(repoId);

  try {
    await git.checkout({
      fs: backend,
      dir: '/',
      ref: targetBranch,
    });

    await git.merge({
      fs: backend,
      dir: '/',
      ours: targetBranch,
      theirs: sourceBranch,
      author: {
        name: author.name,
        email: author.email,
      },
    });

    return { success: true };
  } catch (error: any) {
    if (error.code === 'MergeConflictError') {
      return { success: false, conflicts: error.data.filepaths };
    }
    throw error;
  }
}

export async function getDiff(
  repoId: string,
  commitA: string,
  commitB: string
): Promise<DiffFile[]> {
  const backend = await getBackend(repoId);
  const changes: DiffFile[] = [];

  // Compare trees
  await git.walk({
    fs: backend,
    dir: '/',
    trees: [git.TREE({ ref: commitA }), git.TREE({ ref: commitB })],
    map: async (filepath, [A, B]) => {
      if (!A && B) {
        // Added
        const content = await B.content();
        changes.push({
          path: filepath,
          status: 'added',
          additions: content ? new TextDecoder().decode(content).split('\n').length : 0,
          deletions: 0,
          content: content ? new TextDecoder().decode(content) : '',
        });
      } else if (A && !B) {
        // Deleted
        const content = await A.content();
        changes.push({
          path: filepath,
          status: 'deleted',
          additions: 0,
          deletions: content ? new TextDecoder().decode(content).split('\n').length : 0,
          content: content ? new TextDecoder().decode(content) : '',
        });
      } else if (A && B) {
        const aOid = await A.oid();
        const bOid = await B.oid();
        if (aOid !== bOid) {
          // Modified
          const aContent = await A.content();
          const bContent = await B.content();
          changes.push({
            path: filepath,
            status: 'modified',
            additions: 0, // Calculate from diff
            deletions: 0,
            oldContent: aContent ? new TextDecoder().decode(aContent) : '',
            content: bContent ? new TextDecoder().decode(bContent) : '',
          });
        }
      }
      return null;
    },
  });

  return changes;
}

export async function getFileTree(repoId: string, ref = 'HEAD'): Promise<TreeNode[]> {
  const backend = await getBackend(repoId);
  const files: TreeNode[] = [];

  await git.walk({
    fs: backend,
    dir: '/',
    trees: [git.TREE({ ref })],
    map: async (filepath, [entry]) => {
      if (!entry || filepath === '.') return null;

      const type = await entry.type();
      files.push({
        name: path.basename(filepath),
        path: filepath,
        type: type === 'tree' ? 'directory' : 'file',
      });
      return null;
    },
  });

  return buildTreeStructure(files);
}

function buildTreeStructure(files: TreeNode[]): TreeNode[] {
  const root: TreeNode[] = [];
  const map = new Map<string, TreeNode>();

  // Sort by path depth
  files.sort((a, b) => a.path.split('/').length - b.path.split('/').length);

  for (const file of files) {
    const parts = file.path.split('/');
    const parentPath = parts.slice(0, -1).join('/');

    if (parentPath === '') {
      root.push(file);
    } else {
      const parent = map.get(parentPath);
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(file);
      }
    }

    map.set(file.path, file);
  }

  return root;
}

interface DiffFile {
  path: string;
  status: 'added' | 'deleted' | 'modified';
  additions: number;
  deletions: number;
  content: string;
  oldContent?: string;
}

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}
```

---

## 7. CLI Implementation

### 7.1 CLI Structure

```typescript
// cli/src/index.ts
#!/usr/bin/env node

import { Command } from 'commander';
import { authCommands } from './commands/auth';
import { cloneCommands } from './commands/clone';
import { pullCommands } from './commands/pull';
import { pushCommands } from './commands/push';
import { prCommands } from './commands/pr';

const program = new Command();

program
  .name('skillsdojo')
  .description('CLI for SkillsDojo.ai - AI Agent Skills Platform')
  .version('1.0.0');

// Auth commands
program
  .command('login')
  .description('Authenticate with SkillsDojo.ai')
  .option('-t, --token <token>', 'Use a personal access token')
  .action(authCommands.login);

program
  .command('logout')
  .description('Log out from SkillsDojo.ai')
  .action(authCommands.logout);

program
  .command('whoami')
  .description('Show current authenticated user')
  .action(authCommands.whoami);

// Clone commands
program
  .command('clone <owner/collection>')
  .description('Clone a skill collection')
  .option('--skill <name>', 'Clone only a specific skill')
  .option('-o, --output <dir>', 'Output directory')
  .action(cloneCommands.clone);

// Pull/Push commands
program
  .command('pull')
  .description('Pull latest changes')
  .action(pullCommands.pull);

program
  .command('push')
  .description('Push local changes')
  .option('-m, --message <msg>', 'Commit message')
  .action(pushCommands.push);

// PR commands
program
  .command('pr')
  .description('Manage pull requests')
  .addCommand(
    new Command('create')
      .description('Create a new pull request')
      .option('-t, --title <title>', 'PR title')
      .option('-b, --body <body>', 'PR description')
      .option('--base <branch>', 'Base branch (default: main)')
      .action(prCommands.create)
  )
  .addCommand(
    new Command('list')
      .description('List pull requests')
      .option('--state <state>', 'Filter by state (open, merged, closed)')
      .action(prCommands.list)
  )
  .addCommand(
    new Command('view <number>')
      .description('View a pull request')
      .action(prCommands.view)
  )
  .addCommand(
    new Command('merge <number>')
      .description('Merge a pull request')
      .action(prCommands.merge)
  );

program.parse();
```

### 7.2 Clone Command Implementation

```typescript
// cli/src/commands/clone.ts
import { createWriteStream } from 'fs';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import ora from 'ora';
import chalk from 'chalk';
import extract from 'extract-zip';
import { ApiClient } from '../lib/api';
import { getConfig } from '../lib/config';

export const cloneCommands = {
  async clone(
    collectionPath: string,
    options: { skill?: string; output?: string; branch?: string }
  ) {
    const spinner = ora('Fetching collection info...').start();

    try {
      const config = await getConfig();
      const api = new ApiClient(config.apiUrl, config.token);

      const [owner, collection] = collectionPath.split('/');

      if (!owner || !collection) {
        spinner.fail('Invalid collection path. Use format: owner/collection');
        process.exit(1);
      }

      // Get collection info
      const collectionInfo = await api.getCollection(owner, collection);

      if (!collectionInfo) {
        spinner.fail(`Collection ${collectionPath} not found`);
        process.exit(1);
      }

      const outputDir = options.output || collection;
      const branch = options.branch || 'main';

      // Request download URL from API
      spinner.text = 'Generating download link...';

      let downloadUrl: string;

      if (options.skill) {
        // Download single skill
        const skill = await api.getSkill(collectionInfo.id, options.skill);
        const response = await api.createSkillDownload(skill.id, branch);
        downloadUrl = response.downloadUrl;
      } else {
        // Download entire collection
        const response = await api.createCollectionDownload(collectionInfo.id, branch);
        downloadUrl = response.downloadUrl;
      }

      // Download zip file
      spinner.text = 'Downloading...';
      const tempZip = join(process.cwd(), `.skillsdojo-${Date.now()}.zip`);

      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      const fileStream = createWriteStream(tempZip);
      await pipeline(response.body as any, fileStream);

      // Extract zip
      spinner.text = 'Extracting...';
      await mkdir(outputDir, { recursive: true });
      await extract(tempZip, { dir: join(process.cwd(), outputDir) });

      // Clean up temp file
      await rm(tempZip);

      // Create .skillsdojo config for tracking
      await writeFile(
        join(outputDir, '.skillsdojo.json'),
        JSON.stringify({
          collection: {
            id: collectionInfo.id,
            owner,
            name: collection,
          },
          branch,
          remoteUrl: `${config.apiUrl}/collections/${owner}/${collection}`,
          clonedAt: new Date().toISOString(),
        }, null, 2)
      );

      spinner.succeed(
        `Cloned ${chalk.cyan(`${owner}/${collection}`)} (${branch}) to ${chalk.cyan(outputDir)}`
      );

      console.log(`
${chalk.dim('Next steps:')}
  ${chalk.cyan('cd')} ${outputDir}
  ${chalk.cyan('skillsdojo pull')}   # Pull latest changes
  ${chalk.cyan('skillsdojo push')}   # Push your changes
  ${chalk.cyan('skillsdojo pr create')} # Create a pull request
`);
    } catch (error: any) {
      spinner.fail(`Clone failed: ${error.message}`);
      process.exit(1);
    }
  },
};

// cli/src/lib/api.ts
export class ApiClient {
  constructor(
    private baseUrl: string,
    private token: string
  ) {}

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || response.statusText);
    }

    return response.json();
  }

  async getCollection(owner: string, name: string) {
    return this.request<Collection>(`/collections/${owner}/${name}`);
  }

  async getSkill(collectionId: string, skillSlug: string) {
    return this.request<Skill>(`/collections/${collectionId}/skills/${skillSlug}`);
  }

  async createCollectionDownload(collectionId: string, branch = 'main') {
    return this.request<{ downloadUrl: string; expiresAt: string }>(
      `/collections/${collectionId}/download`,
      {
        method: 'POST',
        body: JSON.stringify({ branch }),
      }
    );
  }

  async createSkillDownload(skillId: string, branch = 'main') {
    return this.request<{ downloadUrl: string; expiresAt: string }>(
      `/skills/${skillId}/download`,
      {
        method: 'POST',
        body: JSON.stringify({ branch }),
      }
    );
  }

  // ... other methods
}
```

---

## 8. MCP Server Implementation

```typescript
// mcp-server/src/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SkillsDojoClient } from './client';

export async function createMcpServer(config: {
  apiUrl: string;
  token: string;
}) {
  const client = new SkillsDojoClient(config.apiUrl, config.token);

  const server = new Server(
    {
      name: 'skillsdojo',
      version: '1.0.0',
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'list_skills',
          description: 'List available skills in a collection',
          inputSchema: {
            type: 'object',
            properties: {
              collection: {
                type: 'string',
                description: 'Collection name (owner/name format)',
              },
            },
          },
        },
        {
          name: 'get_skill',
          description: 'Get a specific skill content (SKILL.md and supporting files)',
          inputSchema: {
            type: 'object',
            properties: {
              collection: {
                type: 'string',
                description: 'Collection name (owner/name format)',
              },
              skill: {
                type: 'string',
                description: 'Skill name',
              },
            },
            required: ['collection', 'skill'],
          },
        },
        {
          name: 'search_skills',
          description: 'Search for skills by keyword across all public collections',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query',
              },
              limit: {
                type: 'number',
                description: 'Maximum results (default: 10)',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'download_skill',
          description: 'Get a temporary download URL for a skill or collection',
          inputSchema: {
            type: 'object',
            properties: {
              collection: {
                type: 'string',
                description: 'Collection name (owner/name format)',
              },
              skill: {
                type: 'string',
                description: 'Skill name (optional - omit to download entire collection)',
              },
              branch: {
                type: 'string',
                description: 'Branch name (default: main)',
              },
            },
            required: ['collection'],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'list_skills': {
        const skills = await client.listSkills(args?.collection as string);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(skills, null, 2),
            },
          ],
        };
      }

      case 'get_skill': {
        const skill = await client.getSkill(
          args?.collection as string,
          args?.skill as string
        );
        return {
          content: [
            {
              type: 'text',
              text: skill.content,
            },
          ],
        };
      }

      case 'search_skills': {
        const results = await client.searchSkills(
          args?.query as string,
          (args?.limit as number) || 10
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'download_skill': {
        const collection = args?.collection as string;
        const skill = args?.skill as string | undefined;
        const branch = (args?.branch as string) || 'main';

        const download = skill
          ? await client.createSkillDownload(collection, skill, branch)
          : await client.createCollectionDownload(collection, branch);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                downloadUrl: download.downloadUrl,
                expiresAt: download.expiresAt,
                instructions: 'Download and extract the zip file to use the skills locally.',
              }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  // List available resources (skills as resources)
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const collections = await client.listAccessibleCollections();
    const resources = [];

    for (const collection of collections) {
      const skills = await client.listSkills(
        `${collection.owner.username}/${collection.slug}`
      );
      for (const skill of skills) {
        resources.push({
          uri: `skillsdojo://${collection.owner.username}/${collection.slug}/${skill.slug}`,
          name: `${collection.name} / ${skill.name}`,
          description: skill.description,
          mimeType: 'text/markdown',
        });
      }
    }

    return { resources };
  });

  // Read a skill as a resource
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    // Parse: skillsdojo://owner/collection/skill
    const match = uri.match(/^skillsdojo:\/\/([^/]+)\/([^/]+)\/(.+)$/);

    if (!match) {
      throw new Error(`Invalid URI: ${uri}`);
    }

    const [, owner, collection, skillSlug] = match;
    const skill = await client.getSkill(`${owner}/${collection}`, skillSlug);

    return {
      contents: [
        {
          uri,
          mimeType: 'text/markdown',
          text: skill.content,
        },
      ],
    };
  });

  return server;
}

// Entry point
async function main() {
  const server = await createMcpServer({
    apiUrl: process.env.SKILLSDOJO_API_URL || 'http://localhost:3000/api',
    token: process.env.SKILLSDOJO_TOKEN || '',
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

---

## 9. API Routes

### 9.1 Download API

The download system generates temporary public URLs for downloading skills/collections as zip files.

```typescript
// entities/DownloadToken.ts
@Entity()
export class DownloadToken extends BaseEntity {
  // Inherits: id, accountId, createdById, modifiedById, createdAt, modifiedAt, archivedAt

  @Column({ unique: true })
  @Index()
  token: string; // Short random token for URL

  @Column()
  type: 'skill' | 'collection';

  @Column()
  @Index()
  targetId: string; // Skill or collection ID

  @Column({ nullable: true })
  branch: string; // Optional branch (default: main)

  @Column({ type: 'timestamptz' })
  @Index()
  expiresAt: Date; // Token expiration (e.g., 1 hour) - UTC
}

// app/api/collections/[id]/download/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { getDataSource } from '@/lib/db/data-source';
import { DownloadToken } from '@/lib/db/entities/DownloadToken';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { branch = 'main' } = await request.json();

  const ds = await getDataSource();
  const tokenRepo = ds.getRepository(DownloadToken);

  // Create download token (expires in 1 hour)
  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await tokenRepo.save({
    token,
    type: 'collection',
    targetId: params.id,
    branch,
    expiresAt,
  });

  const downloadUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/downloads/${token}`;

  return NextResponse.json({
    downloadUrl,
    expiresAt: expiresAt.toISOString(),
  });
}

// app/api/downloads/[token]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import archiver from 'archiver';
import { getDataSource } from '@/lib/db/data-source';
import { DownloadToken } from '@/lib/db/entities/DownloadToken';
import { getFileTree, getFileContent } from '@/lib/git/operations';

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const ds = await getDataSource();
  const tokenRepo = ds.getRepository(DownloadToken);

  // Find and validate token
  const downloadToken = await tokenRepo.findOne({
    where: { token: params.token },
  });

  if (!downloadToken) {
    return NextResponse.json({ error: 'Invalid download token' }, { status: 404 });
  }

  if (new Date() > downloadToken.expiresAt) {
    await tokenRepo.delete(downloadToken.id);
    return NextResponse.json({ error: 'Download token expired' }, { status: 410 });
  }

  // Get files from git
  const repoId = downloadToken.targetId;
  const branch = downloadToken.branch || 'main';
  const files = await getFileTree(repoId, branch);

  // Create zip archive
  const archive = archiver('zip', { zlib: { level: 9 } });
  const chunks: Buffer[] = [];

  archive.on('data', (chunk) => chunks.push(chunk));

  // Add all files to archive
  for (const file of flattenTree(files)) {
    if (file.type === 'file') {
      const content = await getFileContent(repoId, branch, file.path);
      archive.append(content, { name: file.path });
    }
  }

  await archive.finalize();
  const zipBuffer = Buffer.concat(chunks);

  // Clean up token after use (one-time download) or keep for multiple downloads
  // await tokenRepo.delete(downloadToken.id);

  // Get collection name for filename
  const collection = await ds.getRepository(SkillCollection).findOne({
    where: { id: repoId },
  });

  return new NextResponse(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${collection?.slug || 'skills'}-${branch}.zip"`,
      'Content-Length': zipBuffer.length.toString(),
    },
  });
}

function flattenTree(nodes: TreeNode[], prefix = ''): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    const path = prefix ? `${prefix}/${node.name}` : node.name;
    result.push({ ...node, path });
    if (node.children) {
      result.push(...flattenTree(node.children, path));
    }
  }
  return result;
}
```

### 9.2 Collections API

```typescript
// app/api/collections/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getDataSource } from '@/lib/db/data-source';
import { SkillCollection } from '@/lib/db/entities/SkillCollection';
import { initRepo } from '@/lib/git/operations';
import { authOptions } from '@/lib/auth/config';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const search = searchParams.get('search');

  const ds = await getDataSource();
  const repo = ds.getRepository(SkillCollection);

  const query = repo.createQueryBuilder('collection')
    .leftJoinAndSelect('collection.owner', 'owner')
    .where('collection.isPublic = :isPublic', { isPublic: true });

  if (search) {
    query.andWhere(
      '(collection.name LIKE :search OR collection.description LIKE :search)',
      { search: `%${search}%` }
    );
  }

  const [collections, total] = await query
    .orderBy('collection.starCount', 'DESC')
    .skip((page - 1) * limit)
    .take(limit)
    .getManyAndCount();

  return NextResponse.json({
    collections,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { name, description, isPublic } = body;

  const ds = await getDataSource();
  const repo = ds.getRepository(SkillCollection);

  // Generate slug
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // Check for existing
  const existing = await repo.findOne({
    where: { ownerId: session.user.id, slug },
  });

  if (existing) {
    return NextResponse.json(
      { error: 'Collection with this name already exists' },
      { status: 400 }
    );
  }

  // Create collection
  const collection = repo.create({
    name,
    slug,
    description,
    isPublic: isPublic ?? false,
    ownerId: session.user.id,
  });

  await repo.save(collection);

  // Initialize git repo
  const repoPath = await initRepo(collection.id, 'main', {
    author: {
      name: session.user.name || 'Unknown',
      email: session.user.email || 'unknown@example.com',
    },
  });

  collection.repoPath = repoPath;
  await repo.save(collection);

  return NextResponse.json(collection, { status: 201 });
}
```

---

## 10. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Project setup (Next.js, TypeORM, SQLite)
- [ ] Database schema and migrations
- [ ] User authentication (NextAuth)
- [ ] Basic CRUD for collections and skills
- [ ] Git storage layer with isomorphic-git

### Phase 2: Core UI (Week 3-4)
- [ ] Dashboard and navigation
- [ ] Collection list/create/view pages
- [ ] Monaco Editor integration
- [ ] File tree component
- [ ] Skill viewer/editor

### Phase 3: Git Operations (Week 5-6)
- [ ] Branch management
- [ ] Commit and history viewing
- [ ] Diff generation and display
- [ ] Fork functionality

### Phase 4: Collaboration (Week 7-8)
- [ ] Pull request creation
- [ ] Review interface with inline comments
- [ ] Merge functionality
- [ ] Team management
- [ ] Access control

### Phase 5: CLI (Week 9-10)
- [ ] Authentication (token-based)
- [ ] Clone command
- [ ] Pull/push commands
- [ ] PR commands
- [ ] Configuration management

### Phase 6: MCP Integration (Week 11-12)
- [ ] MCP server implementation
- [ ] Skill as MCP resources
- [ ] Search and discovery tools
- [ ] Docker image integration
- [ ] MCP link management

### Phase 7: Polish (Week 13-14)
- [ ] Search functionality
- [ ] Stars and trending
- [ ] Activity feeds
- [ ] Notifications
- [ ] Documentation

---

## 11. Skill Import & Sync (Git Subtree-like Behavior)

Individual skills can be imported from other collections while tracking their source. This works similar to `git subtree` - files are copied but we track provenance for updates and upstream PRs.

### 11.1 How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│  Collection A (source)                                          │
│  └── skills/                                                    │
│      └── cool-api-skill/                                        │
│          ├── SKILL.md          commit: abc123                   │
│          └── examples/                                          │
└─────────────────────────────────────────────────────────────────┘
                    │
                    │  IMPORT (copies files + creates SkillLink)
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Collection B (your collection)                                 │
│  └── skills/                                                    │
│      ├── my-original-skill/    (no link - you created it)      │
│      └── cool-api-skill/       (linked to A/cool-api-skill)    │
│          ├── SKILL.md          sourceCommit: abc123             │
│          └── examples/                                          │
└─────────────────────────────────────────────────────────────────┘
```

### 11.2 Import Skill Operation

```typescript
// lib/skills/import.ts
export async function importSkill(
  targetCollectionId: string,
  sourceCollectionId: string,
  sourceSkillSlug: string,
  options: {
    targetPath?: string;  // Custom path in target (default: same as source)
    branch?: string;      // Source branch (default: main)
  } = {}
): Promise<{ skill: Skill; link: SkillLink }> {
  const ds = await getDataSource();

  // Get source skill and its files
  const sourceSkill = await ds.getRepository(Skill).findOne({
    where: { collectionId: sourceCollectionId, slug: sourceSkillSlug }
  });

  if (!sourceSkill) {
    throw new Error('Source skill not found');
  }

  // Get current commit SHA from source
  const sourceBackend = await getBackend(sourceCollectionId);
  const sourceCommitSha = await git.resolveRef({
    fs: sourceBackend,
    dir: '/',
    ref: options.branch || 'main'
  });

  // Get all files from source skill
  const sourceFiles = await getSkillFiles(sourceCollectionId, sourceSkill.path, sourceCommitSha);

  // Copy files to target collection
  const targetBackend = await getBackend(targetCollectionId);
  const targetPath = options.targetPath || sourceSkill.path;

  for (const file of sourceFiles) {
    const targetFilePath = file.path.replace(sourceSkill.path, targetPath);
    await targetBackend.writeFile(targetFilePath, file.content);
  }

  // Create commit in target
  const localCommitSha = await git.commit({
    fs: targetBackend,
    dir: '/',
    message: `Import skill "${sourceSkill.name}" from ${sourceCollectionId}`,
    author: { name: 'SkillsDojo', email: 'system@skillsdojo.ai' }
  });

  // Create skill record in target
  const skill = await ds.getRepository(Skill).save({
    name: sourceSkill.name,
    slug: sourceSkill.slug,
    description: sourceSkill.description,
    path: targetPath,
    collectionId: targetCollectionId,
    frontmatter: sourceSkill.frontmatter
  });

  // Create link to track provenance
  const link = await ds.getRepository(SkillLink).save({
    localSkillId: skill.id,
    sourceCollectionId,
    sourceSkillId: sourceSkill.id,
    sourceSkillPath: sourceSkill.path,
    sourceCommitSha,
    localCommitSha,
    lastSyncedAt: new Date(),
    status: 'synced'
  });

  return { skill, link };
}
```

### 11.3 Check for Updates

```typescript
// lib/skills/sync.ts
export async function checkSkillUpdates(
  skillLinkId: string
): Promise<{
  hasUpdates: boolean;
  behind: number;      // Commits behind source
  ahead: number;       // Local commits ahead
  status: 'synced' | 'behind' | 'ahead' | 'diverged';
}> {
  const ds = await getDataSource();
  const link = await ds.getRepository(SkillLink).findOne({
    where: { id: skillLinkId }
  });

  if (!link) throw new Error('Skill link not found');

  // Get current commit from source
  const sourceBackend = await getBackend(link.sourceCollectionId);
  const latestSourceCommit = await git.resolveRef({
    fs: sourceBackend,
    dir: '/',
    ref: 'main'
  });

  // Check if source has new commits since our last sync
  const sourceCommits = await git.log({
    fs: sourceBackend,
    dir: '/',
    ref: 'main'
  });

  // Find how many commits since our sourceCommitSha
  let behind = 0;
  for (const commit of sourceCommits) {
    if (commit.oid === link.sourceCommitSha) break;
    behind++;
  }

  // Check if we have local changes
  const localBackend = await getBackend(link.localSkillId);
  // Compare local files with what was imported...
  const ahead = await countLocalChanges(link);

  // Determine status
  let status: 'synced' | 'behind' | 'ahead' | 'diverged';
  if (behind === 0 && ahead === 0) status = 'synced';
  else if (behind > 0 && ahead === 0) status = 'behind';
  else if (behind === 0 && ahead > 0) status = 'ahead';
  else status = 'diverged';

  // Update link status
  await ds.getRepository(SkillLink).update(link.id, {
    upstreamCommitSha: latestSourceCommit,
    status
  });

  return { hasUpdates: behind > 0, behind, ahead, status };
}
```

### 11.4 Pull Updates from Source

```typescript
// lib/skills/sync.ts
export async function pullSkillUpdates(
  skillLinkId: string,
  options: { force?: boolean } = {}
): Promise<{ updated: boolean; conflicts?: string[] }> {
  const ds = await getDataSource();
  const link = await ds.getRepository(SkillLink).findOneOrFail({
    where: { id: skillLinkId },
    relations: ['localSkill']
  });

  const status = await checkSkillUpdates(skillLinkId);

  if (status.status === 'synced') {
    return { updated: false };
  }

  if (status.status === 'diverged' && !options.force) {
    // Need to handle merge or force
    return {
      updated: false,
      conflicts: ['Local changes exist. Use force to overwrite or create PR first.']
    };
  }

  // Get updated files from source
  const sourceFiles = await getSkillFiles(
    link.sourceCollectionId,
    link.sourceSkillPath,
    link.upstreamCommitSha!
  );

  // Update local files
  const localBackend = await getBackend(link.localSkill.collectionId);

  for (const file of sourceFiles) {
    const localPath = file.path.replace(link.sourceSkillPath, link.localSkill.path);
    await localBackend.writeFile(localPath, file.content);
  }

  // Commit the update
  const newCommitSha = await git.commit({
    fs: localBackend,
    dir: '/',
    message: `Update skill "${link.localSkill.name}" from upstream (${link.upstreamCommitSha?.slice(0, 7)})`,
    author: { name: 'SkillsDojo', email: 'system@skillsdojo.ai' }
  });

  // Update link
  await ds.getRepository(SkillLink).update(link.id, {
    sourceCommitSha: link.upstreamCommitSha,
    localCommitSha: newCommitSha,
    lastSyncedAt: new Date(),
    status: 'synced'
  });

  return { updated: true };
}
```

### 11.5 Create Upstream PR (Push Changes Back)

When you modify an imported skill and want to contribute back:

```typescript
// lib/skills/upstream-pr.ts
export async function createUpstreamPR(
  skillLinkId: string,
  prInfo: {
    title: string;
    description: string;
  }
): Promise<PullRequest> {
  const ds = await getDataSource();
  const link = await ds.getRepository(SkillLink).findOneOrFail({
    where: { id: skillLinkId },
    relations: ['localSkill', 'sourceCollection']
  });

  // Get local skill files
  const localFiles = await getSkillFiles(
    link.localSkill.collectionId,
    link.localSkill.path,
    'HEAD'
  );

  // Create a branch in the source collection for the PR
  const branchName = `pr/skill-update-${link.localSkill.slug}-${Date.now()}`;
  const sourceBackend = await getBackend(link.sourceCollectionId);

  // Create branch from the commit we originally imported
  await git.branch({
    fs: sourceBackend,
    dir: '/',
    ref: branchName,
    object: link.sourceCommitSha
  });

  await git.checkout({
    fs: sourceBackend,
    dir: '/',
    ref: branchName
  });

  // Apply our changes to the source skill path
  for (const file of localFiles) {
    const sourcePath = file.path.replace(link.localSkill.path, link.sourceSkillPath);
    await sourceBackend.writeFile(sourcePath, file.content);
  }

  // Commit changes
  await git.commit({
    fs: sourceBackend,
    dir: '/',
    message: prInfo.title,
    author: { name: 'SkillsDojo', email: 'upstream-pr@skillsdojo.ai' }
  });

  // Create PR in source collection
  const prRepo = ds.getRepository(PullRequest);
  const prNumber = await getNextPRNumber(link.sourceCollectionId);

  const pr = await prRepo.save({
    number: prNumber,
    title: prInfo.title,
    description: prInfo.description,
    sourceBranch: branchName,
    targetBranch: 'main',
    status: 'open',
    collectionId: link.sourceCollectionId,
    authorId: getCurrentUserId(), // From session
    // Track that this is an upstream PR from another collection
    metadata: {
      type: 'upstream',
      fromCollectionId: link.localSkill.collectionId,
      fromSkillId: link.localSkillId,
      skillLinkId: link.id
    }
  });

  return pr;
}
```

### 11.6 UI for Linked Skills

```typescript
// components/skill/LinkedSkillBadge.tsx
export function LinkedSkillBadge({ link }: { link: SkillLink }) {
  const statusColors = {
    synced: 'bg-green-100 text-green-800',
    behind: 'bg-yellow-100 text-yellow-800',
    ahead: 'bg-blue-100 text-blue-800',
    diverged: 'bg-red-100 text-red-800'
  };

  return (
    <div className="flex items-center gap-2">
      <Badge className={statusColors[link.status]}>
        <Link2 className="h-3 w-3 mr-1" />
        Linked
      </Badge>
      <span className="text-xs text-muted-foreground">
        from {link.sourceCollection.owner.username}/{link.sourceCollection.slug}
      </span>
      {link.status === 'behind' && (
        <Button size="sm" variant="outline" onClick={() => pullUpdates(link.id)}>
          <ArrowDown className="h-3 w-3 mr-1" />
          Pull Updates
        </Button>
      )}
      {link.status === 'ahead' && (
        <Button size="sm" variant="outline" onClick={() => createUpstreamPR(link.id)}>
          <ArrowUp className="h-3 w-3 mr-1" />
          Create PR
        </Button>
      )}
    </div>
  );
}
```

### 11.7 CLI Commands for Skill Import

```typescript
// CLI commands
program
  .command('import <source> [target-path]')
  .description('Import a skill from another collection')
  .option('--collection <id>', 'Target collection (default: current)')
  .action(async (source, targetPath, options) => {
    // source format: owner/collection/skill or owner/collection:skill
    const [ownerCollection, skillSlug] = source.split(':');
    const [owner, collection] = ownerCollection.split('/');

    const spinner = ora(`Importing skill ${skillSlug}...`).start();

    const result = await api.importSkill({
      sourceOwner: owner,
      sourceCollection: collection,
      sourceSkill: skillSlug,
      targetCollectionId: options.collection || getCurrentCollection(),
      targetPath
    });

    spinner.succeed(`Imported ${skillSlug} → ${result.skill.path}`);
    console.log(`  Source: ${owner}/${collection}:${skillSlug}`);
    console.log(`  Commit: ${result.link.sourceCommitSha.slice(0, 7)}`);
  });

program
  .command('sync [skill]')
  .description('Check and pull updates for linked skills')
  .option('--all', 'Sync all linked skills')
  .option('--check', 'Only check for updates, don\'t pull')
  .action(async (skill, options) => {
    const links = options.all
      ? await api.getLinkedSkills(getCurrentCollection())
      : [await api.getSkillLink(skill)];

    for (const link of links) {
      const status = await api.checkSkillUpdates(link.id);
      console.log(`${link.localSkill.name}: ${status.status}`);

      if (status.behind > 0) {
        console.log(`  ${status.behind} commits behind`);
        if (!options.check) {
          await api.pullSkillUpdates(link.id);
          console.log(`  ✓ Updated`);
        }
      }
      if (status.ahead > 0) {
        console.log(`  ${status.ahead} local changes`);
      }
    }
  });

program
  .command('upstream-pr <skill>')
  .description('Create a PR to the source collection for a linked skill')
  .option('-t, --title <title>', 'PR title')
  .option('-m, --message <message>', 'PR description')
  .action(async (skill, options) => {
    const link = await api.getSkillLink(skill);
    const pr = await api.createUpstreamPR(link.id, {
      title: options.title || `Update ${skill}`,
      description: options.message || ''
    });
    console.log(`Created upstream PR #${pr.number}`);
    console.log(`  ${pr.sourceCollection.owner}/${pr.sourceCollection.slug}/pulls/${pr.number}`);
  });
```

### 11.8 Git Subtree Alternative (Full Git Integration)

If you want actual git subtree behavior (where the history merges), it's more complex but possible:

```typescript
// Alternative: True git subtree merge
// This preserves commit history from the source skill

export async function importSkillAsSubtree(
  targetCollectionId: string,
  sourceCollectionId: string,
  sourceSkillPath: string,
  targetPath: string
): Promise<void> {
  const targetBackend = await getBackend(targetCollectionId);
  const sourceBackend = await getBackend(sourceCollectionId);

  // Get commits that touched the skill path in source
  const skillCommits = await git.log({
    fs: sourceBackend,
    dir: '/',
    ref: 'main',
    // Filter to commits affecting this path
  });

  // For each commit, cherry-pick the changes to the skill
  // and apply them to the target with path rewriting
  for (const commit of skillCommits.reverse()) {
    const changes = await getCommitChanges(sourceBackend, commit.oid, sourceSkillPath);

    // Rewrite paths and apply to target
    for (const change of changes) {
      const targetFilePath = change.path.replace(sourceSkillPath, targetPath);
      if (change.type === 'delete') {
        await targetBackend.unlink(targetFilePath);
      } else {
        await targetBackend.writeFile(targetFilePath, change.content);
      }
    }

    // Commit with original message + metadata
    await git.commit({
      fs: targetBackend,
      dir: '/',
      message: `[subtree] ${commit.commit.message}\n\nOriginal-commit: ${commit.oid}\nSource: ${sourceCollectionId}/${sourceSkillPath}`,
      author: commit.commit.author
    });
  }
}
```

**Trade-offs:**

| Approach | Pros | Cons |
|----------|------|------|
| **Copy + Link** (recommended) | Simple, clear provenance, easy sync | No commit history preserved |
| **Git Subtree** | Full history, proper git semantics | Complex, harder to understand, merge conflicts |
| **Git Submodule** | Lightweight, always in sync | Not self-contained, external dependency |

---

## 12. Multi-Account & Scoped API Keys

Users can belong to multiple accounts (like GitHub organizations) and create API keys scoped to specific collections.

### 12.1 Account Model

```
┌─────────────────────────────────────────────────────────────────┐
│                          User: alice                             │
├─────────────────────────────────────────────────────────────────┤
│  Personal Account: @alice (auto-created)                        │
│  └── Collections: my-skills, experiments                        │
│                                                                  │
│  Organization: @acme-corp (role: admin)                         │
│  └── Collections: internal-tools, customer-facing               │
│                                                                  │
│  Organization: @open-source-skills (role: member)               │
│  └── Collections: community-skills                              │
└─────────────────────────────────────────────────────────────────┘
```

### 12.2 Account Roles

| Role | Permissions |
|------|-------------|
| `owner` | Full control, can delete account, manage billing |
| `admin` | Manage members, create/delete collections, manage API keys |
| `member` | Create collections, push to assigned collections |
| `viewer` | Read-only access to collections |

### 12.3 API Key System

API keys are scoped to specific collections within an account:

```typescript
// Create API key with scoped access
const apiKey = await createApiKey({
  accountId: 'acme-corp-id',
  name: 'Production MCP Server',
  permissions: ['skills:read', 'collections:read'],
  scopes: [
    { collectionId: 'internal-tools-id', access: 'read' },
    { collectionId: 'customer-facing-id', access: 'read' }
  ],
  expiresAt: null, // Never expires (or set date)
  rateLimit: 1000  // Requests per minute
});

// Returns: sk_live_abc123... (only shown once!)
```

### 12.4 API Key Permissions

```typescript
// Available permissions
type Permission =
  | 'skills:read'      // Read skill content
  | 'skills:write'     // Create/update skills
  | 'collections:read' // List collections
  | 'collections:write'// Create/update collections
  | 'collections:admin'// Delete collections, manage settings
  | 'api-keys:read'    // List API keys (not secrets)
  | 'api-keys:write';  // Create/revoke API keys

// Scope access levels
type ScopeAccess = 'read' | 'write' | 'admin';
```

### 12.5 API Key Validation

```typescript
// lib/auth/api-key.ts
export async function validateApiKey(
  key: string,
  requiredPermission: Permission,
  collectionId?: string
): Promise<{ valid: boolean; apiKey?: ApiKey; error?: string }> {
  const ds = await getDataSource();

  // Hash the key to look it up
  const keyHash = hashApiKey(key);
  const apiKey = await ds.getRepository(ApiKey).findOne({
    where: { keyHash, isActive: true },
    relations: ['scopes', 'account']
  });

  if (!apiKey) {
    return { valid: false, error: 'Invalid API key' };
  }

  // Check expiration
  if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
    return { valid: false, error: 'API key expired' };
  }

  // Check permission
  if (!apiKey.permissions.includes(requiredPermission)) {
    return { valid: false, error: 'Missing permission: ' + requiredPermission };
  }

  // Check collection scope (if specified)
  if (collectionId) {
    const scope = apiKey.scopes.find(s => s.collectionId === collectionId);
    if (!scope) {
      return { valid: false, error: 'Collection not in API key scope' };
    }
  }

  // Update last used
  await ds.getRepository(ApiKey).update(apiKey.id, {
    lastUsedAt: new Date()
  });

  return { valid: true, apiKey };
}

// Middleware for API routes
export async function withApiKey(
  request: NextRequest,
  permission: Permission,
  collectionId?: string
) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer sk_')) {
    return { error: 'API key required', status: 401 };
  }

  const key = authHeader.slice(7);
  const result = await validateApiKey(key, permission, collectionId);

  if (!result.valid) {
    return { error: result.error, status: 403 };
  }

  return { apiKey: result.apiKey };
}
```

### 12.6 API Routes for Key Management

```typescript
// app/api/accounts/[slug]/api-keys/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  const ds = await getDataSource();
  const account = await ds.getRepository(Account).findOne({
    where: { slug: params.slug },
    relations: ['memberships']
  });

  // Check user has access to this account
  const membership = account?.memberships.find(m => m.userId === session.user.id);
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return forbidden();
  }

  // Get API keys (without secrets)
  const apiKeys = await ds.getRepository(ApiKey).find({
    where: { accountId: account.id },
    relations: ['scopes', 'scopes.collection', 'createdBy'],
    select: {
      id: true,
      name: true,
      keyPrefix: true, // Only show prefix, not full key
      permissions: true,
      createdAt: true,
      expiresAt: true,
      lastUsedAt: true,
      isActive: true,
      createdBy: { id: true, username: true }
    }
  });

  return NextResponse.json({ apiKeys });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  const body = await request.json();
  const { name, permissions, scopes, expiresAt, rateLimit } = body;

  // ... validate account access ...

  const ds = await getDataSource();

  // Generate API key
  const rawKey = generateApiKey(); // sk_live_...
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, 12);

  // Create key
  const apiKey = await ds.getRepository(ApiKey).save({
    name,
    keyHash,
    keyPrefix,
    accountId: account.id,
    createdById: session.user.id,
    permissions,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    rateLimit
  });

  // Create scopes
  for (const scope of scopes) {
    await ds.getRepository(ApiKeyScope).save({
      apiKeyId: apiKey.id,
      collectionId: scope.collectionId,
      access: scope.access
    });
  }

  // Return the full key ONLY ONCE
  return NextResponse.json({
    apiKey: {
      id: apiKey.id,
      name: apiKey.name,
      key: rawKey, // Full key - only returned on creation!
      keyPrefix: apiKey.keyPrefix,
      permissions: apiKey.permissions,
      scopes
    }
  }, { status: 201 });
}

function generateApiKey(): string {
  const prefix = 'sk_live_';
  const random = crypto.randomBytes(24).toString('base64url');
  return prefix + random;
}

function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}
```

### 12.7 UI for API Key Management

```typescript
// components/settings/ApiKeyManager.tsx
export function ApiKeyManager({ account }: { account: Account }) {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeySecret, setNewKeySecret] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">API Keys</h2>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create API Key
        </Button>
      </div>

      {/* Show new key secret (one time only) */}
      {newKeySecret && (
        <Alert>
          <AlertTitle>API Key Created</AlertTitle>
          <AlertDescription>
            Copy this key now - it won't be shown again!
            <div className="mt-2 p-2 bg-muted rounded font-mono text-sm flex items-center gap-2">
              <code>{newKeySecret}</code>
              <Button size="sm" variant="ghost" onClick={() => copyToClipboard(newKeySecret)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* API Keys List */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Key</TableHead>
            <TableHead>Collections</TableHead>
            <TableHead>Last Used</TableHead>
            <TableHead>Status</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {apiKeys.map((key) => (
            <TableRow key={key.id}>
              <TableCell>{key.name}</TableCell>
              <TableCell>
                <code className="text-muted-foreground">{key.keyPrefix}****</code>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {key.scopes.slice(0, 2).map((scope) => (
                    <Badge key={scope.id} variant="outline">
                      {scope.collection.slug}
                    </Badge>
                  ))}
                  {key.scopes.length > 2 && (
                    <Badge variant="outline">+{key.scopes.length - 2}</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {key.lastUsedAt
                  ? formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true })
                  : 'Never'}
              </TableCell>
              <TableCell>
                <Badge variant={key.isActive ? 'success' : 'secondary'}>
                  {key.isActive ? 'Active' : 'Revoked'}
                </Badge>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => editScopes(key)}>
                      Edit Scopes
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => revokeKey(key.id)}
                      className="text-destructive"
                    >
                      Revoke Key
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Create API Key Modal */}
      <CreateApiKeyModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        account={account}
        onCreated={(key, secret) => {
          setApiKeys([...apiKeys, key]);
          setNewKeySecret(secret);
          setShowCreateModal(false);
        }}
      />
    </div>
  );
}

// components/settings/CreateApiKeyModal.tsx
export function CreateApiKeyModal({ open, onClose, account, onCreated }) {
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState<string[]>(['skills:read']);
  const [selectedCollections, setSelectedCollections] = useState<{
    id: string;
    access: 'read' | 'write' | 'admin';
  }[]>([]);

  const handleCreate = async () => {
    const response = await fetch(`/api/accounts/${account.slug}/api-keys`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        permissions,
        scopes: selectedCollections
      })
    });
    const data = await response.json();
    onCreated(data.apiKey, data.apiKey.key);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create API Key</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Production MCP Server"
            />
          </div>

          <div>
            <Label>Permissions</Label>
            <div className="space-y-2 mt-2">
              {['skills:read', 'skills:write', 'collections:read'].map((perm) => (
                <div key={perm} className="flex items-center gap-2">
                  <Checkbox
                    checked={permissions.includes(perm)}
                    onCheckedChange={(checked) => {
                      setPermissions(
                        checked
                          ? [...permissions, perm]
                          : permissions.filter((p) => p !== perm)
                      );
                    }}
                  />
                  <span className="text-sm">{perm}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label>Collection Access</Label>
            <p className="text-sm text-muted-foreground mb-2">
              Select which collections this API key can access
            </p>
            {account.collections.map((collection) => (
              <div key={collection.id} className="flex items-center gap-4 py-2">
                <Checkbox
                  checked={selectedCollections.some((c) => c.id === collection.id)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedCollections([
                        ...selectedCollections,
                        { id: collection.id, access: 'read' }
                      ]);
                    } else {
                      setSelectedCollections(
                        selectedCollections.filter((c) => c.id !== collection.id)
                      );
                    }
                  }}
                />
                <span className="flex-1">{collection.name}</span>
                {selectedCollections.some((c) => c.id === collection.id) && (
                  <Select
                    value={
                      selectedCollections.find((c) => c.id === collection.id)?.access
                    }
                    onValueChange={(value) => {
                      setSelectedCollections(
                        selectedCollections.map((c) =>
                          c.id === collection.id ? { ...c, access: value } : c
                        )
                      );
                    }}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="read">Read</SelectItem>
                      <SelectItem value="write">Write</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate}>Create API Key</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 12.8 Using API Keys with MCP Server

```typescript
// MCP server configuration with scoped API key
{
  "mcpServers": {
    "skillsdojo": {
      "command": "npx",
      "args": ["@skillsdojo/mcp-server"],
      "env": {
        "SKILLSDOJO_API_URL": "https://skillsdojo.ai/api",
        "SKILLSDOJO_API_KEY": "sk_live_abc123..."  // Scoped to specific collections
      }
    }
  }
}
```

The MCP server will only have access to collections included in the API key's scopes.

---

## 13. Database Benefits & Queries

With git stored in SQLite, we can run powerful queries:

```sql
-- Find all skills mentioning "API"
SELECT DISTINCT c.name as collection, fi.path
FROM git_file_index fi
JOIN skill_collection c ON c.id = fi.repo_id
JOIN git_object o ON o.sha = fi.blob_sha
WHERE o.type = 'blob'
  AND CAST(o.content AS TEXT) LIKE '%API%';

-- Find duplicate files across all repos (by content SHA)
SELECT blob_sha, COUNT(*) as count, GROUP_CONCAT(repo_id) as repos
FROM git_file_index
GROUP BY blob_sha
HAVING count > 1;

-- Storage stats per collection
SELECT c.name,
       COUNT(DISTINCT o.sha) as objects,
       SUM(o.size) as total_size
FROM skill_collection c
JOIN git_object o ON o.repo_id = c.id
GROUP BY c.id;

-- Recent commits across all repos
SELECT c.name as collection,
       o.sha,
       json_extract(o.content, '$.message') as message
FROM git_object o
JOIN skill_collection c ON c.id = o.repo_id
WHERE o.type = 'commit'
ORDER BY o.created_at DESC
LIMIT 20;
```

---

## 12. Environment Variables

```env
# .env.local
DATABASE_URL=./data/skillsdojo.db

# Auth
NEXTAUTH_SECRET=your-secret-key
NEXTAUTH_URL=http://localhost:3000

# App
NEXT_PUBLIC_APP_URL=https://skillsdojo.ai

# MCP
MCP_SERVER_PORT=3001
```

---

## 13. Summary

SkillsDojo.ai will be:

1. **A "GitHub for Skills"** - Version-controlled skill collections with branching, PRs, and reviews
2. **Standards-compliant** - Following the Agent Skills open standard
3. **Self-contained** - Single SQLite database contains everything (metadata + git objects)
4. **Portable** - One file to backup, replicate, or migrate
5. **MCP-native** - Expose skills as MCP server resources and tools
6. **Developer-friendly** - CLI for local workflow, Monaco editor in web UI
7. **Collaborative** - Teams, access control, review workflows

The all-in-database approach using git's native object model provides:
- **Deduplication**: Same content shared across forks/branches
- **Queryability**: SQL queries across all repos
- **Atomicity**: Database transactions ensure consistency
- **Portability**: Single file contains the entire platform
