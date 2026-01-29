import { NextRequest, NextResponse } from "next/server";
import { getDataSource } from "@/lib/db/data-source";
import { SkillCollection } from "@/entities/SkillCollection";
import { DatabaseGitBackend } from "@/lib/git/db-backend";
import { withOptionalAuth } from "@/lib/auth/middleware";
import { TokenPayload } from "@/lib/auth/jwt";
import { RequestContext } from "@/lib/db/context";

/**
 * GET /api/collections/[id]/files/at/[commitSha]/[...path]
 * Get file content at a specific commit
 */
export const GET = withOptionalAuth(async (
  request: NextRequest & { user?: TokenPayload; context?: RequestContext },
  { params }: { params: Promise<{ id: string; commitSha: string; path: string[] }> }
) => {
  try {
    const { id: collectionId, commitSha, path: pathSegments } = await params;
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

    // Get file content at commit
    const git = new DatabaseGitBackend(ds, collectionId);
    const content = await git.getFileAtCommit(commitSha, filePath);

    if (content === null) {
      return NextResponse.json(
        { error: "File not found at this commit" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      path: filePath,
      commitSha,
      content,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get file";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
