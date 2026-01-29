import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/db/data-source";
import { SkillCollection } from "@/entities/SkillCollection";
import { PullRequest } from "@/entities/PullRequest";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/middleware";

/**
 * POST /api/collections/[id]/pulls/[number]/close
 * Close a pull request without merging
 */
export const POST = withAuth(async (
  request: AuthenticatedRequest,
  { params }: { params: Promise<{ id: string; number: string }> }
) => {
  try {
    const { id, number: numberStr } = await params;
    const prNumber = parseInt(numberStr, 10);

    if (isNaN(prNumber)) {
      return NextResponse.json(
        { error: "Invalid PR number" },
        { status: 400 }
      );
    }

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

    // Check permission (must be account member)
    if (collection.accountId !== request.context.accountId) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    // Find PR
    const pr = await prRepo.findOne({
      where: {
        collectionId: id,
        number: prNumber,
        archivedAt: undefined,
      },
    });

    if (!pr) {
      return NextResponse.json(
        { error: "Pull request not found" },
        { status: 404 }
      );
    }

    if (pr.status !== "open") {
      return NextResponse.json(
        { error: `Cannot close: PR is already ${pr.status}` },
        { status: 400 }
      );
    }

    // Close PR
    pr.status = "closed";
    pr.closedAt = new Date();
    pr.closedById = request.context.userId;
    pr.modifiedAt = new Date();
    pr.modifiedById = request.context.userId;

    await prRepo.save(pr);

    return NextResponse.json({
      message: "Pull request closed",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to close pull request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
