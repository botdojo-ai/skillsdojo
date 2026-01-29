export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { getDataSource } from "@/lib/db/data-source";
import { SkillCollection } from "@/entities/SkillCollection";
import { Account } from "@/entities/Account";
import { withOptionalAuth } from "@/lib/auth/middleware";
import { TokenPayload } from "@/lib/auth/jwt";
import { RequestContext } from "@/lib/db/context";
import { DatabaseGitBackend } from "@/lib/git/db-backend";

/**
 * GET /api/collections/[id]/files
 * Get all files in a collection (for CLI clone)
 */
export const GET = withOptionalAuth(async (
  request: NextRequest & { user?: TokenPayload; context?: RequestContext },
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;

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

    // Check visibility
    if (collection.visibility === "private") {
      if (!request.context || request.context.accountId !== collection.accountId) {
        return NextResponse.json(
          { error: "Collection not found" },
          { status: 404 }
        );
      }
    }

    // Get account info
    const accountRepo = ds.getRepository(Account);
    const account = await accountRepo.findOne({
      where: { id: collection.accountId },
    });

    // Get files using git backend
    const git = new DatabaseGitBackend(ds, collection.id);
    const branch = collection.defaultBranch || "main";
    const commitSha = await git.getRef(`refs/heads/${branch}`);

    if (!commitSha) {
      // No commits yet - return empty files
      return NextResponse.json({
        collection: {
          id: collection.id,
          slug: collection.slug,
          name: collection.name,
          account: account ? {
            id: account.id,
            slug: account.slug,
            name: account.name,
          } : null,
        },
        branch,
        commitSha: "",
        files: [],
      });
    }

    // Get file list
    const fileEntries = await git.listFiles(branch);

    // Read file contents
    const files = await Promise.all(
      fileEntries.map(async (entry) => {
        const content = await git.readBlob(entry.blobSha);
        return {
          path: entry.path,
          sha: entry.blobSha,
          content: content ? content.toString("utf-8") : "",
        };
      })
    );

    return NextResponse.json({
      collection: {
        id: collection.id,
        slug: collection.slug,
        name: collection.name,
        account: account ? {
          id: account.id,
          slug: account.slug,
          name: account.name,
        } : null,
      },
      branch,
      commitSha,
      files,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get files";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
