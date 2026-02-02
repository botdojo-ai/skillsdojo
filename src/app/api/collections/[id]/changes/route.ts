export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/db/data-source";
import { SkillCollection } from "@/entities/SkillCollection";
import { PullRequest } from "@/entities/PullRequest";
import { AccountMembership } from "@/entities/AccountMembership";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/middleware";
import { DatabaseGitBackend } from "@/lib/git/db-backend";

/**
 * POST /api/collections/[id]/changes
 * Submit changes and create a pull request
 */
export const POST = withAuth(async (
  request: AuthenticatedRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;
    const body = await request.json();

    const { baseSha, title, description, changes } = body;

    if (!title || !changes || !Array.isArray(changes)) {
      return NextResponse.json(
        { error: "Title and changes are required" },
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

    // Check permission - must be a member of the account
    const membershipRepo = ds.getRepository(AccountMembership);
    const membership = await membershipRepo.findOne({
      where: {
        userId: request.context.userId,
        accountId: collection.accountId,
        archivedAt: undefined,
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    // Viewers cannot submit changes
    if (membership.role === "viewer") {
      return NextResponse.json(
        { error: "Viewers cannot submit changes" },
        { status: 403 }
      );
    }

    // Get git backend
    const git = new DatabaseGitBackend(ds, collection.id);
    const branch = collection.defaultBranch || "main";

    // Get current commit
    const currentCommitSha = await git.getRef(`refs/heads/${branch}`);

    // Validate base SHA if provided
    if (baseSha && currentCommitSha && baseSha !== currentCommitSha) {
      return NextResponse.json(
        { error: "Base SHA does not match. Pull latest changes first." },
        { status: 409 }
      );
    }

    // Generate PR branch name
    const prBranchName = `pr-${Date.now()}`;

    // Create files and deletions
    const files: Array<{ path: string; content: string | Buffer }> = [];
    const deletedPaths: string[] = [];

    for (const change of changes) {
      if (change.action === "delete") {
        deletedPaths.push(change.path);
      } else if (change.content) {
        files.push({
          path: change.path,
          content: change.content,
        });
      }
    }

    // Create commit on PR branch
    // First, copy the current branch state
    if (currentCommitSha) {
      await git.setRef(`refs/heads/${prBranchName}`, currentCommitSha);
    }

    // Make the commit
    const commitSha = await git.commit({
      branch: prBranchName,
      files,
      deletedPaths,
      message: title + (description ? `\n\n${description}` : ""),
      author: {
        name: request.context.email || "CLI User",
        email: request.context.email || "cli@skillsdojo.ai",
      },
    });

    // Get next PR number for this collection
    const lastPr = await prRepo
      .createQueryBuilder("pr")
      .where("pr.collectionId = :collectionId", { collectionId: collection.id })
      .orderBy("pr.number", "DESC")
      .getOne();

    const prNumber = (lastPr?.number || 0) + 1;

    // Create pull request record
    const pr = prRepo.create({
      accountId: request.context.accountId,
      collectionId: collection.id,
      number: prNumber,
      title,
      description: description || null,
      status: "open",
      sourceBranch: prBranchName,
      targetBranch: branch,
      sourceCommitSha: commitSha,
      targetCommitSha: currentCommitSha || null,
      createdById: request.context.userId,
      modifiedById: request.context.userId,
    });

    await prRepo.save(pr);

    return NextResponse.json({
      pullRequest: {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        status: pr.status,
        url: `/${collection.accountId}/${collection.slug}/pull/${pr.number}`,
      },
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create pull request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
