export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { getDataSource } from "@/lib/db/data-source";
import { SkillCollection } from "@/entities/SkillCollection";
import { Account } from "@/entities/Account";
import { AccountMembership } from "@/entities/AccountMembership";
import { withOptionalAuth } from "@/lib/auth/middleware";
import { TokenPayload } from "@/lib/auth/jwt";
import { RequestContext } from "@/lib/db/context";

/**
 * GET /api/collections/by-slug/[account]/[collection]
 * Get collection by account slug and collection slug
 */
export const GET = withOptionalAuth(async (
  request: NextRequest & { user?: TokenPayload; context?: RequestContext },
  { params }: { params: Promise<{ account: string; collection: string }> }
) => {
  try {
    const { account: accountSlug, collection: collectionSlug } = await params;

    const ds = await getDataSource();

    // Find account by slug
    const accountRepo = ds.getRepository(Account);
    const account = await accountRepo.findOne({
      where: { slug: accountSlug.toLowerCase() },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    // Find collection
    const collectionRepo = ds.getRepository(SkillCollection);
    const collection = await collectionRepo.findOne({
      where: {
        accountId: account.id,
        slug: collectionSlug.toLowerCase(),
        archivedAt: undefined,
      },
    });

    if (!collection) {
      return NextResponse.json(
        { error: "Collection not found" },
        { status: 404 }
      );
    }

    // Check visibility
    if (collection.visibility === "private") {
      // Must be authenticated and belong to account
      if (!request.context || request.context.accountId !== account.id) {
        return NextResponse.json(
          { error: "Collection not found" },
          { status: 404 }
        );
      }
    }

    // Check if user can edit this collection
    let canEdit = false;
    if (request.user?.userId) {
      const membershipRepo = ds.getRepository(AccountMembership);
      const membership = await membershipRepo.findOne({
        where: {
          userId: request.user.userId,
          accountId: account.id,
          archivedAt: undefined,
        },
      });
      canEdit = !!membership && ["owner", "admin", "member"].includes(membership.role);
    }

    return NextResponse.json({
      ...collection,
      account: {
        id: account.id,
        slug: account.slug,
        name: account.name,
      },
      canEdit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get collection";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
