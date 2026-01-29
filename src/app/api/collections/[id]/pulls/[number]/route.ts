export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/db/data-source";
import { SkillCollection } from "@/entities/SkillCollection";
import { PullRequest } from "@/entities/PullRequest";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/middleware";
import { DatabaseGitBackend } from "@/lib/git/db-backend";

/**
 * GET /api/collections/[id]/pulls/[number]
 * Get pull request details
 */
export const GET = withAuth(async (
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

    // Check permission
    if (collection.visibility === "private" && collection.accountId !== request.context.accountId) {
      return NextResponse.json(
        { error: "Collection not found" },
        { status: 404 }
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

    // Get file changes from the PR commit
    const git = new DatabaseGitBackend(ds, collection.id);
    const files: Array<{ path: string; action: string; content?: string }> = [];

    // Get source branch files
    if (pr.sourceCommitSha) {
      const commit = await git.readCommit(pr.sourceCommitSha);
      if (commit) {
        // Get files from source tree
        const sourceFiles = await git.listFiles(pr.sourceBranch);

        // Get target branch files for comparison
        const targetFiles = pr.targetCommitSha
          ? await git.listFiles(pr.targetBranch)
          : [];

        const targetFileMap = new Map(targetFiles.map((f) => [f.path, f.blobSha]));
        const sourceFileMap = new Map(sourceFiles.map((f) => [f.path, f.blobSha]));

        // Find changed files
        for (const [path, sha] of sourceFileMap) {
          const targetSha = targetFileMap.get(path);
          if (!targetSha) {
            // New file
            const content = await git.readBlob(sha);
            files.push({
              path,
              action: "create",
              content: content?.toString("utf-8"),
            });
          } else if (targetSha !== sha) {
            // Modified file
            const content = await git.readBlob(sha);
            files.push({
              path,
              action: "modify",
              content: content?.toString("utf-8"),
            });
          }
        }

        // Find deleted files
        for (const [path] of targetFileMap) {
          if (!sourceFileMap.has(path)) {
            files.push({
              path,
              action: "delete",
            });
          }
        }
      }
    }

    return NextResponse.json({
      ...pr,
      files,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get pull request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
