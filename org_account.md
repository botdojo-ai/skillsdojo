# Organization Account Implementation Plan

## Current State Summary

### What's Already Built
- **Account Model** (`src/entities/Account.ts`) - Supports `type: "personal" | "organization"`
- **AccountMembership Entity** (`src/entities/AccountMembership.ts`) - Has `invitedAt`, `acceptedAt` fields (unused)
- **Organization Service** (`src/services/organization.service.ts`) - Full CRUD + member management
- **Organization API Endpoints** - Create/Read/Update/Delete orgs, add/remove members by username/email
- **Role System** - owner, admin, member, viewer hierarchy
- **Download Token Pattern** (`src/services/download-token.service.ts`) - Reusable pattern for temp tokens

### What's Missing
1. **Invite Link System** - No token-based invitations
2. **Organization UI** - Settings page is a stub, no member management UI

---

## Phase 1: Invite Token System

Following the same pattern as `DownloadToken` - simple link-based invites with 7-day expiry.

### 1.1 Create OrganizationInvite Entity

```typescript
// src/entities/OrganizationInvite.ts
import { Entity, Column, Index } from "typeorm";
import { BaseEntity } from "./base/BaseEntity";

@Entity("organization_invites")
export class OrganizationInvite extends BaseEntity {
  @Column()
  @Index()
  token!: string;  // Format: oi_<base64url> (Organization Invite)

  // accountId inherited from BaseEntity - the org being invited to

  @Column({ type: "varchar", length: 50, default: "member" })
  role!: "admin" | "member" | "viewer";

  @Column({ type: "timestamptz" })
  expiresAt!: Date;

  @Column({ default: false })
  used!: boolean;

  @Column({ type: "timestamptz", nullable: true })
  usedAt!: Date | null;

  @Column({ type: "uuid", nullable: true })
  usedBy!: string | null;  // userId who accepted
}
```

### 1.2 Invite Token Service

```typescript
// src/services/organization-invite.service.ts
import { randomBytes } from 'crypto';
import { DataSource, LessThan } from 'typeorm';
import { OrganizationInvite } from '@/entities/OrganizationInvite';
import { AccountMembership } from '@/entities/AccountMembership';

export interface CreateInviteParams {
  userId: string;        // who's creating the invite
  accountId: string;     // the organization
  role?: "admin" | "member" | "viewer";
  expiresInDays?: number;  // default 7
}

export class OrganizationInviteService {
  constructor(private dataSource: DataSource) {}

  // Generate token: oi_<32 bytes base64url>
  private generateToken(): string {
    return 'oi_' + randomBytes(32).toString('base64url');
  }

  async createInvite(params: CreateInviteParams): Promise<string> {
    const { userId, accountId, role = 'member', expiresInDays = 7 } = params;
    const repo = this.dataSource.getRepository(OrganizationInvite);

    const token = this.generateToken();
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    const invite = repo.create({
      token,
      accountId,
      role,
      expiresAt,
      used: false,
      createdById: userId,
      modifiedById: userId,
    });

    await repo.save(invite);
    return token;
  }

  async validateToken(token: string): Promise<OrganizationInvite | null> {
    const repo = this.dataSource.getRepository(OrganizationInvite);
    const invite = await repo.findOne({ where: { token } });

    if (!invite) return null;
    if (invite.expiresAt < new Date()) return null;
    if (invite.used) return null;

    return invite;
  }

  async acceptInvite(token: string, userId: string): Promise<AccountMembership> {
    const invite = await this.validateToken(token);
    if (!invite) throw new Error('Invalid or expired invite');

    // Check if already a member
    const memberRepo = this.dataSource.getRepository(AccountMembership);
    const existing = await memberRepo.findOne({
      where: { accountId: invite.accountId, userId }
    });
    if (existing) throw new Error('Already a member of this organization');

    // Create membership
    const membership = memberRepo.create({
      accountId: invite.accountId,
      userId,
      role: invite.role,
      invitedAt: invite.createdAt,
      acceptedAt: new Date(),
    });
    await memberRepo.save(membership);

    // Mark invite as used
    const inviteRepo = this.dataSource.getRepository(OrganizationInvite);
    invite.used = true;
    invite.usedAt = new Date();
    invite.usedBy = userId;
    await inviteRepo.save(invite);

    return membership;
  }

  async listPendingInvites(accountId: string): Promise<OrganizationInvite[]> {
    const repo = this.dataSource.getRepository(OrganizationInvite);
    return repo.find({
      where: {
        accountId,
        used: false,
        expiresAt: LessThan(new Date()) // not expired
      }
    });
  }

  async revokeInvite(token: string): Promise<boolean> {
    const repo = this.dataSource.getRepository(OrganizationInvite);
    const result = await repo.delete({ token });
    return (result.affected || 0) > 0;
  }

  async cleanupExpired(): Promise<number> {
    const repo = this.dataSource.getRepository(OrganizationInvite);
    const result = await repo.delete({ expiresAt: LessThan(new Date()) });
    return result.affected || 0;
  }
}
```

### 1.3 API Endpoints

```
POST   /api/organizations/[id]/invites     - Create invite link (returns token)
GET    /api/organizations/[id]/invites     - List pending invites
DELETE /api/organizations/[id]/invites/[token] - Revoke invite

GET    /api/invites/[token]                - Get invite details (public, for UI)
POST   /api/invites/[token]/accept         - Accept invite (must be logged in)
```

---

## Phase 2: Invite Flow & User Experience

### 2.1 Invite Link URL

```
https://skillsdojo.dev/invite/[token]
```

### 2.2 Accept Invite Page (`src/app/invite/[token]/page.tsx`)

**Logged In User:**
1. Click invite link → Page shows org name + role
2. Click "Join Organization"
3. POST `/api/invites/[token]/accept`
4. Redirect to org page

**Not Logged In:**
1. Click invite link → Page shows org name + role
2. Click "Sign in to join" → `/auth/login?redirect=/invite/[token]`
3. After login, back to invite page
4. Accept and redirect

**New User:**
1. Click invite link → Page shows org name + role
2. Click "Create account" → `/auth/signup?redirect=/invite/[token]`
3. After signup, back to invite page
4. Accept and redirect

### 2.3 Invite Page Component

```tsx
// src/app/invite/[token]/page.tsx
export default async function InvitePage({ params }: { params: { token: string } }) {
  // Fetch invite details from API
  // Show: org name, org avatar, role being offered, expiry
  // If logged in: "Join Organization" button
  // If not: "Sign in to join" / "Create account" buttons
}
```

---

## Phase 3: Organization Members UI

### 3.1 Members Settings Page (`src/app/[account]/settings/members/page.tsx`)

```
┌─────────────────────────────────────────────────────────┐
│ Members                              [Create Invite]    │
├─────────────────────────────────────────────────────────┤
│ Jane Smith                           Owner              │
│ John Doe                             Admin     [Remove] │
│ Bob Wilson                           Member    [Remove] │
├─────────────────────────────────────────────────────────┤
│ Pending Invites                                         │
├─────────────────────────────────────────────────────────┤
│ Invite link (member)     Expires in 6 days    [Revoke]  │
│ Invite link (admin)      Expires in 2 days    [Revoke]  │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Create Invite Modal

- Role dropdown: Admin, Member, Viewer
- Generate button → Shows link to copy
- Link format: `https://skillsdojo.dev/invite/oi_xxx...`

---

## Database Migration

```sql
CREATE TABLE organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  token VARCHAR(64) UNIQUE NOT NULL,
  role VARCHAR(50) DEFAULT 'member',
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by_id UUID REFERENCES users(id),
  modified_at TIMESTAMPTZ DEFAULT NOW(),
  modified_by_id UUID REFERENCES users(id),
  archived_at TIMESTAMPTZ,

  CONSTRAINT valid_role CHECK (role IN ('admin', 'member', 'viewer'))
);

CREATE INDEX idx_org_invites_token ON organization_invites(token);
CREATE INDEX idx_org_invites_account ON organization_invites(account_id)
  WHERE used = FALSE AND archived_at IS NULL;
```

---

## Implementation Checklist

### Core System
- [ ] Create `OrganizationInvite` entity
- [ ] Run database migration
- [ ] Create `OrganizationInviteService` (following download-token pattern)
- [ ] Create API: `POST /api/organizations/[id]/invites`
- [ ] Create API: `GET /api/organizations/[id]/invites`
- [ ] Create API: `DELETE /api/organizations/[id]/invites/[token]`
- [ ] Create API: `GET /api/invites/[token]`
- [ ] Create API: `POST /api/invites/[token]/accept`

### UI
- [ ] Create invite page: `src/app/invite/[token]/page.tsx`
- [ ] Create members settings: `src/app/[account]/settings/members/page.tsx`
- [ ] Create invite modal component
- [ ] Add copy-to-clipboard for invite links

---

## Security

- Tokens: 32 bytes random, base64url encoded (`oi_` prefix)
- 7-day default expiry
- Single-use tokens (marked used after accept)
- Only org admins/owners can create invites
- Only owner can create admin invites
- Validate org membership before creating invite
