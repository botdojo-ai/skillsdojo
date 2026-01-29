import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/db/data-source";
import { SkillCollection } from "@/entities/SkillCollection";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/middleware";
import { DatabaseGitBackend } from "@/lib/git/db-backend";

/**
 * POST /api/collections/[id]/commit
 * Commit changes directly to the main branch
 */
export const POST = withAuth(async (
  request: AuthenticatedRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;
    const body = await request.json();

    const { files, deletedPaths, message } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "Commit message is required" },
        { status: 400 }
      );
    }

    if (!files || !Array.isArray(files)) {
      return NextResponse.json(
        { error: "Files array is required" },
        { status: 400 }
      );
    }

    const ds = await getDataSource();
    const collectionRepo = ds.getRepository(SkillCollection);

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

    // Get git backend
    const git = new DatabaseGitBackend(ds, collection.id);
    const branch = collection.defaultBranch || "main";

    // Prepare file entries
    const fileEntries: Array<{ path: string; content: string | Buffer }> = [];
    for (const file of files) {
      if (file.path && file.content !== undefined) {
        fileEntries.push({
          path: file.path,
          content: file.content,
        });
      }
    }

    // Create commit directly on the main branch
    const commitSha = await git.commit({
      branch,
      files: fileEntries,
      deletedPaths: deletedPaths || [],
      message: message.trim(),
      author: {
        name: request.context.email || "CLI User",
        email: request.context.email || "cli@skillsdojo.ai",
      },
    });

    return NextResponse.json({
      commitSha,
      message: "Changes committed successfully",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to commit changes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
