import { NextRequest, NextResponse } from "next/server";
import { getDataSource } from "@/lib/db/data-source";
import { SkillCollection } from "@/entities/SkillCollection";
import { DatabaseGitBackend } from "@/lib/git/db-backend";
import { withOptionalAuth } from "@/lib/auth/middleware";
import { TokenPayload } from "@/lib/auth/jwt";
import { RequestContext } from "@/lib/db/context";

/**
 * GET /api/collections/[id]/files/history/[...path]
 * Get commit history for a specific file
 */
export const GET = withOptionalAuth(async (
  request: NextRequest & { user?: TokenPayload; context?: RequestContext },
  { params }: { params: Promise<{ id: string; path: string[] }> }
) => {
  try {
    const { id: collectionId, path: pathSegments } = await params;
    const filePath = pathSegments.join("/");

    const ds = await getDataSource();

    // Get collection
    const collectionRepo = ds.getRepository(SkillCollection);
    const collection = await collectionRepo.findOne({
      where: { id: collectionId, archivedAt: undefined },
    });

    if (!collection) {
      return NextResponse.json(
        { error: "Collection not found" },
        { status: 404 }
      );
    }

    // Check visibility
    if (collection.visibility === "private") {
      if (!request.context || request.context.accountId !== collection.accountId) {
        return NextResponse.json(
          { error: "Collection not found" },
          { status: 404 }
        );
      }
    }

    // Get file history
    const git = new DatabaseGitBackend(ds, collectionId);
    const branch = collection.defaultBranch || "main";
    const history = await git.getFileHistory(branch, filePath, 50);

    return NextResponse.json({
      path: filePath,
      branch,
      history,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get file history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
