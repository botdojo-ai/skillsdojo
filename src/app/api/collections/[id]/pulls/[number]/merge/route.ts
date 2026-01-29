import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/db/data-source";
import { SkillCollection } from "@/entities/SkillCollection";
import { PullRequest } from "@/entities/PullRequest";
import { Skill } from "@/entities/Skill";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/middleware";
import { DatabaseGitBackend } from "@/lib/git/db-backend";

/**
 * Parse YAML frontmatter from skill content
 */
function parseSkillFrontmatter(content: string): { name?: string; description?: string; metadata?: Record<string, unknown> } {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const yaml = match[1];
  const result: Record<string, unknown> = {};

  for (const line of yaml.split("\n")) {
    const kvMatch = line.match(/^(\w[\w-]*): (.*)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      let value: unknown = kvMatch[2];

      // Parse booleans
      if (value === "true") value = true;
      else if (value === "false") value = false;
      // Parse arrays (simple case)
      else if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
        try {
          value = JSON.parse(value);
        } catch {
          // Keep as string if not valid JSON
        }
      }

      result[key] = value;
    }
  }

  return {
    name: result.name as string | undefined,
    description: result.description as string | undefined,
    metadata: result,
  };
}

/**
 * Sync skills from git files to database
 * @param allowDeletions - If true, archive skills that don't exist in git
 */
async function syncSkillsFromGit(
  ds: ReturnType<typeof getDataSource> extends Promise<infer T> ? T : never,
  git: DatabaseGitBackend,
  collection: SkillCollection,
  branch: string,
  userId: string,
  allowDeletions: boolean = false
): Promise<void> {
  const skillRepo = ds.getRepository(Skill);
  const collectionRepo = ds.getRepository(SkillCollection);

  // Get all SKILL.md files from git
  const files = await git.listFiles(branch);
  const skillFiles = files.filter((f) => f.path.endsWith("/SKILL.md") || f.path === "SKILL.md");

  // Get current skills in database that have a corresponding git file (path-based skills)
  const currentSkills = await skillRepo.find({
    where: { collectionId: collection.id, archivedAt: undefined },
  });
  const currentSkillPaths = new Map(currentSkills.map((s) => [s.path, s]));

  // Track paths we've processed from git
  const processedPaths = new Set<string>();
  let skillCountDelta = 0;

  // Process each skill file - add or update
  for (const file of skillFiles) {
    // Extract skill path from file path (e.g., "hello-world/SKILL.md" -> "hello-world")
    const skillPath = file.path.replace(/\/SKILL\.md$/, "").replace(/^SKILL\.md$/, "");
    if (!skillPath) continue;

    processedPaths.add(skillPath);

    // Read content
    const content = await git.readBlob(file.blobSha);
    if (!content) continue;

    const contentStr = content.toString("utf-8");
    const parsed = parseSkillFrontmatter(contentStr);

    const existingSkill = currentSkillPaths.get(skillPath);

    if (existingSkill) {
      // Update existing skill
      existingSkill.name = parsed.name || skillPath;
      existingSkill.description = parsed.description || null;
      existingSkill.metadata = parsed.metadata || null;
      existingSkill.modifiedAt = new Date();
      existingSkill.modifiedById = userId;
      await skillRepo.save(existingSkill);
    } else {
      // Create new skill
      const newSkill = skillRepo.create({
        accountId: collection.accountId,
        collectionId: collection.id,
        path: skillPath,
        name: parsed.name || skillPath,
        description: parsed.description || null,
        metadata: parsed.metadata || null,
        dependencies: [],
        createdById: userId,
        modifiedById: userId,
      });
      await skillRepo.save(newSkill);
      skillCountDelta++;
    }
  }

  // Archive skills that were deleted from git (only if allowDeletions is true)
  if (allowDeletions) {
    for (const [path, skill] of currentSkillPaths) {
      if (!processedPaths.has(path)) {
        skill.archivedAt = new Date();
        skill.modifiedById = userId;
        await skillRepo.save(skill);
        skillCountDelta--;
      }
    }
  }

  // Update collection skill count
  if (skillCountDelta !== 0) {
    await collectionRepo.increment({ id: collection.id }, "skillCount", skillCountDelta);
  }
}

/**
 * POST /api/collections/[id]/pulls/[number]/merge
 * Merge a pull request
 *
 * Query params:
 * - allowDeletions: Set to "true" to allow skill deletions
 */
export const POST = withAuth(async (
  request: AuthenticatedRequest,
  { params }: { params: Promise<{ id: string; number: string }> }
) => {
  try {
    const { id, number: numberStr } = await params;
    const prNumber = parseInt(numberStr, 10);

    // Check if deletions are allowed
    const url = new URL(request.url);
    const allowDeletions = url.searchParams.get("allowDeletions") === "true";

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
        { error: `Cannot merge: PR is ${pr.status}` },
        { status: 400 }
      );
    }

    // Merge the PR
    const git = new DatabaseGitBackend(ds, collection.id);
    const targetBranch = pr.targetBranch;

    // Get source branch commit
    const sourceSha = await git.getRef(`refs/heads/${pr.sourceBranch}`);
    if (!sourceSha) {
      return NextResponse.json(
        { error: "Source branch not found" },
        { status: 400 }
      );
    }

    // Get source commit to extract tree
    const sourceCommit = await git.readCommit(sourceSha);
    if (!sourceCommit) {
      return NextResponse.json(
        { error: "Source commit not found" },
        { status: 400 }
      );
    }

    // Get current target branch SHA
    const targetSha = await git.getRef(`refs/heads/${targetBranch}`);

    // Check for skill deletions if not explicitly allowed
    if (!allowDeletions && targetSha) {
      const targetCommit = await git.readCommit(targetSha);
      if (targetCommit) {
        // Get SKILL.md files from both branches
        const sourceFiles = await git.listFilesFromTree(sourceCommit.treeSha);
        const targetFiles = await git.listFilesFromTree(targetCommit.treeSha);

        const sourceSkillPaths = new Set(
          sourceFiles
            .filter((f) => f.path.endsWith("/SKILL.md"))
            .map((f) => f.path.replace(/\/SKILL\.md$/, ""))
        );

        const deletedSkills = targetFiles
          .filter((f) => f.path.endsWith("/SKILL.md"))
          .map((f) => f.path.replace(/\/SKILL\.md$/, ""))
          .filter((path) => !sourceSkillPaths.has(path));

        if (deletedSkills.length > 0) {
          return NextResponse.json(
            {
              error: "This PR would delete skills. Use ?allowDeletions=true to confirm.",
              deletedSkills,
            },
            { status: 400 }
          );
        }
      }
    }

    // Create merge commit
    const mergeCommitSha = await git.writeCommit({
      treeSha: sourceCommit.treeSha,
      parentSha: targetSha,
      message: `Merge PR #${pr.number}: ${pr.title}`,
      author: {
        name: request.context.email || "CLI User",
        email: request.context.email || "cli@skillsdojo.ai",
      },
    });

    // Update target branch ref
    await git.setRef(`refs/heads/${targetBranch}`, mergeCommitSha);

    // Update file index
    await git.updateFileIndex(targetBranch, sourceCommit.treeSha);

    // Sync skills from git to database
    await syncSkillsFromGit(ds, git, collection, targetBranch, request.context.userId, allowDeletions);

    // Update PR
    pr.status = "merged";
    pr.mergeCommitSha = mergeCommitSha;
    pr.mergedAt = new Date();
    pr.mergedById = request.context.userId;
    pr.modifiedAt = new Date();
    pr.modifiedById = request.context.userId;

    await prRepo.save(pr);

    return NextResponse.json({
      message: "Pull request merged",
      mergeCommitSha,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to merge pull request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
