# Navigation Refactor Plan: GitHub-Style Structure

## Current Problems

### Redundant Paths to Same Resources
| Resource | Dashboard Path | Public Path |
|----------|---------------|-------------|
| Collection | `/dashboard/collections/{id}` | `/{account}/{collection}` |
| Skill Detail | `/dashboard/collections/{id}/skills/{skillId}` | `/{account}/{collection}/{skill}` |
| Skill Edit | `/dashboard/collections/{id}/skills/{skillId}/edit` | ❌ None |
| Pull Requests | `/dashboard/collections/{id}/pulls` | ❌ None |

### Issues
1. **Two ways to view the same collection** - confusing UX
2. **Dashboard uses database IDs**, public pages use slugs - inconsistent
3. **Editing only accessible via dashboard** - breaks mental model
4. **Code duplication** - similar fetch/display logic in two places
5. **Navigation bounces** between `/dashboard` and `/{account}` contexts

---

## GitHub's Pattern (What We're Adopting)

```
/{owner}                          → Profile/org overview
/{owner}/{repo}                   → Repository home (Code tab)
/{owner}/{repo}/issues            → Issues tab
/{owner}/{repo}/pulls             → Pull requests tab
/{owner}/{repo}/settings          → Settings tab (owner only)
/{owner}/{repo}/blob/{path}       → File view
```

**Key principles:**
- One canonical path per resource (no dashboard duplicates)
- Tabs provide context switching within a resource
- Settings are a tab, not a separate area
- Owner actions appear contextually (not in separate dashboard)

---

## Proposed New Structure

### Account Level
| Route | Purpose |
|-------|---------|
| `/{account}` | Account profile - shows collections grid |
| `/{account}/settings` | Account settings (keep as-is) |
| `/{account}/settings/api-keys` | API keys (keep as-is) |

### Collection Level (GitHub repo equivalent)
| Route | Purpose | Tabs |
|-------|---------|------|
| `/{account}/{collection}` | Collection overview | **Overview** / Skills / Pulls / Settings |
| `/{account}/{collection}/skills` | Skills list view | Overview / **Skills** / Pulls / Settings |
| `/{account}/{collection}/pulls` | Pull requests list | Overview / Skills / **Pulls** / Settings |
| `/{account}/{collection}/pulls/{number}` | PR detail view | (back nav to pulls) |
| `/{account}/{collection}/settings` | Collection settings | Overview / Skills / Pulls / **Settings** |

### Skill Level
| Route | Purpose |
|-------|---------|
| `/{account}/{collection}/{skill}` | Skill detail/viewer |
| `/{account}/{collection}/{skill}/edit` | Skill editor (owner only) |
| `/{account}/{collection}/skills/new` | Create new skill |

### Dashboard (Simplified)
| Route | Purpose |
|-------|---------|
| `/dashboard` | Redirect to `/{currentUser}` OR simple landing with "View Profile" CTA |

---

## Migration Plan

### Phase 1: Create Collection Tab Navigation Component
Create a reusable `CollectionTabs` component:
```tsx
// src/components/collection-tabs.tsx
<Tabs>
  <Tab href="/{account}/{collection}">Overview</Tab>
  <Tab href="/{account}/{collection}/skills">Skills</Tab>
  <Tab href="/{account}/{collection}/pulls">Pull Requests</Tab>
  <Tab href="/{account}/{collection}/settings">Settings</Tab> {/* owner only */}
</Tabs>
```

### Phase 2: Consolidate Collection Pages
1. Move `/dashboard/collections/[id]/page.tsx` logic into `/{account}/{collection}`
2. Add tabs to existing `[account]/[collection]/page.tsx`
3. Create `[account]/[collection]/skills/page.tsx` for skills list view
4. Delete `/dashboard/collections/[id]/page.tsx`

### Phase 3: Move Pull Requests to Public Routes
1. Create `[account]/[collection]/pulls/page.tsx`
2. Create `[account]/[collection]/pulls/[number]/page.tsx`
3. Move logic from dashboard PR pages
4. Delete `/dashboard/collections/[id]/pulls/` folder

### Phase 4: Move Skill Editor to Public Routes
1. Create `[account]/[collection]/[skill]/edit/page.tsx`
2. Move logic from dashboard skill edit page
3. Add "Edit" button to skill detail page (owner only)
4. Delete `/dashboard/collections/[id]/skills/[skillId]/edit/`

### Phase 5: Consolidate Skill Creation
1. Create `[account]/[collection]/skills/new/page.tsx`
2. Move logic from dashboard skill creation
3. Delete `/dashboard/collections/[id]/skills/new/`

### Phase 6: Simplify Dashboard
1. Change `/dashboard/page.tsx` to redirect to `/{accountSlug}`
2. Keep `/dashboard/collections/new` → move to `/{account}/collections/new` OR keep as modal
3. Delete all `/dashboard/collections/[id]/...` routes

### Phase 7: Update Navigation
1. Update `nav-bar.tsx` "My Skills" to go to `/{accountSlug}`
2. Remove dashboard-specific navigation
3. Ensure all internal links use new routes

---

## Files to Delete (After Migration)

```
src/app/dashboard/collections/[id]/page.tsx
src/app/dashboard/collections/[id]/pulls/page.tsx
src/app/dashboard/collections/[id]/pulls/[number]/page.tsx
src/app/dashboard/collections/[id]/skills/new/page.tsx
src/app/dashboard/collections/[id]/skills/[skillId]/page.tsx
src/app/dashboard/collections/[id]/skills/[skillId]/edit/page.tsx
```

## Files to Create

```
src/components/collection-tabs.tsx
src/app/[account]/[collection]/skills/page.tsx
src/app/[account]/[collection]/skills/new/page.tsx
src/app/[account]/[collection]/pulls/page.tsx
src/app/[account]/[collection]/pulls/[number]/page.tsx
src/app/[account]/[collection]/[skill]/edit/page.tsx
src/app/[account]/[collection]/settings/page.tsx
src/app/[account]/collections/new/page.tsx (optional - could keep in dashboard)
```

## Files to Modify

```
src/app/[account]/[collection]/page.tsx - Add tabs, merge dashboard logic
src/app/[account]/[collection]/[skill]/page.tsx - Add edit button for owners
src/app/dashboard/page.tsx - Simplify to redirect or minimal landing
src/components/nav-bar.tsx - Update navigation links
```

---

## New URL Examples

| Action | Old URL | New URL |
|--------|---------|---------|
| View my collection | `/dashboard/collections/abc123` | `/paulhenry/my-skills` |
| Add skill to collection | `/dashboard/collections/abc123/skills/new` | `/paulhenry/my-skills/skills/new` |
| Edit a skill | `/dashboard/collections/abc123/skills/xyz/edit` | `/paulhenry/my-skills/cool-skill/edit` |
| View PRs | `/dashboard/collections/abc123/pulls` | `/paulhenry/my-skills/pulls` |
| Review a PR | `/dashboard/collections/abc123/pulls/5` | `/paulhenry/my-skills/pulls/5` |
| Collection settings | ❌ didn't exist | `/paulhenry/my-skills/settings` |

---

## Benefits

1. **Single source of truth** - One URL per resource
2. **Consistent slugs everywhere** - No ID/slug confusion
3. **Intuitive mental model** - Matches GitHub patterns users know
4. **Less code duplication** - Shared components, one fetch pattern
5. **Shareable URLs** - All URLs work for sharing (with visibility checks)
6. **Owner actions in context** - Edit/settings appear where you're viewing

---

## Open Questions

1. **Collection creation**: Keep at `/dashboard/collections/new` or move to `/{account}/collections/new`?
2. **Empty dashboard**: Should `/dashboard` redirect or show a minimal page with profile link?
3. **Layout component**: Should `[account]/[collection]/layout.tsx` handle tabs, or each page?
