export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { getDataSource } from "@/lib/db/data-source";
import { SkillCollection } from "@/entities/SkillCollection";
import { PullRequest } from "@/entities/PullRequest";
import { AccountMembership } from "@/entities/AccountMembership";
import { withOptionalAuth } from "@/lib/auth/middleware";
import { TokenPayload } from "@/lib/auth/jwt";
import { RequestContext } from "@/lib/db/context";

/**
 * GET /api/collections/[id]/pulls
 * List pull requests for a collection
 */
export const GET = withOptionalAuth(async (
  request: NextRequest & { user?: TokenPayload; context?: RequestContext },
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "20", 10));
    const status = searchParams.get("status") as "open" | "merged" | "closed" | null;

    const ds = await getDataSource();
    const collectionRepo = ds.getRepository(SkillCollection);
    const prRepo = ds.getRepository(PullRequest);

    // Find collection
    const collection = await collectionRepo.findOne({
      where: { id, archivedAt: undefined },
    });

    if (!collection) {
      return NextResponse.json(
        { error: "Collection not found" },
        { status: 404 }
      );
    }

    // Check permission for private collections
    if (collection.visibility === "private") {
      if (!request.user?.userId) {
        return NextResponse.json(
          { error: "Collection not found" },
          { status: 404 }
        );
      }

      const membershipRepo = ds.getRepository(AccountMembership);
      const membership = await membershipRepo.findOne({
        where: {
          userId: request.user.userId,
          accountId: collection.accountId,
          archivedAt: undefined,
        },
      });

      if (!membership) {
        return NextResponse.json(
          { error: "Collection not found" },
          { status: 404 }
        );
      }
    }

    // Build query
    const qb = prRepo
      .createQueryBuilder("pr")
      .where("pr.collectionId = :collectionId", { collectionId: id })
      .andWhere("pr.archivedAt IS NULL");

    if (status) {
      qb.andWhere("pr.status = :status", { status });
    }

    qb.orderBy("pr.createdAt", "DESC");

    const offset = (page - 1) * limit;
    const [items, total] = await qb.skip(offset).take(limit).getManyAndCount();

    return NextResponse.json({
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list pull requests";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
