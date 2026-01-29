export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/middleware";
import { getDataSource } from "@/lib/db/data-source";
import { Skill } from "@/entities/Skill";
import { SkillCollection } from "@/entities/SkillCollection";
import { GitObject } from "@/entities/GitObject";
import { GitFileIndex } from "@/entities/GitFileIndex";
import { DatabaseGitBackend } from "@/lib/git/db-backend";
import { fetchGitHubRepoFiles } from "@/services/github.service";
import { randomUUID } from "crypto";

interface SkillMetadata {
  gitUrl?: string;
  clonedFrom?: string;
  clonedAt?: string;
  [key: string]: unknown;
}

// POST /api/skills/clone - Clone a skill to user's collection
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const body = await request.json();
    const { sourceCollectionId, sourcePath, targetCollectionId } = body;

    if (!sourceCollectionId || !sourcePath || !targetCollectionId) {
      return NextResponse.json(
        { error: "sourceCollectionId, sourcePath, and targetCollectionId are required" },
        { status: 400 }
      );
    }

    const ds = await getDataSource();
    const ctx = request.context;

    // Verify target collection belongs to user
    const targetCollection = await ds.getRepository(SkillCollection).findOne({
      where: { id: targetCollectionId, accountId: ctx.accountId },
    });

    if (!targetCollection) {
      return NextResponse.json(
        { error: "Target collection not found or access denied" },
        { status: 404 }
      );
    }

    // Get source skill
    const sourceSkill = await ds.getRepository(Skill).findOne({
      where: { collectionId: sourceCollectionId, path: sourcePath },
    });

    if (!sourceSkill) {
      return NextResponse.json(
        { error: "Source skill not found" },
        { status: 404 }
      );
    }

    // Check if skill already exists in target collection
    const existingSkill = await ds.getRepository(Skill).findOne({
      where: { collectionId: targetCollectionId, path: sourcePath },
    });

    if (existingSkill) {
      return NextResponse.json(
        { error: "A skill with this path already exists in the target collection" },
        { status: 409 }
      );
    }

    // Create new skill in target collection
    const newSkillId = randomUUID();
    const metadata = (sourceSkill.metadata || {}) as SkillMetadata;
    const newSkill = ds.getRepository(Skill).create({
      id: newSkillId,
      accountId: ctx.accountId,
      collectionId: targetCollectionId,
      path: sourceSkill.path,
      name: sourceSkill.name,
      description: sourceSkill.description,
      metadata: {
        ...metadata,
        clonedFrom: `${sourceCollectionId}/${sourcePath}`,
        clonedAt: new Date().toISOString(),
      },
      dependencies: sourceSkill.dependencies,
      createdById: ctx.userId,
      modifiedById: ctx.userId,
    });

    await ds.getRepository(Skill).save(newSkill);

    // Initialize git backend for target collection
    const gitBackend = new DatabaseGitBackend(ds, targetCollectionId);
    let filesCloned = 0;

    // Check if source skill has a GitHub URL - if so, fetch files from GitHub
    const gitUrl = metadata.gitUrl;
    if (gitUrl && gitUrl.includes("github.com")) {
      console.log(`Cloning skill ${sourcePath} from GitHub: ${gitUrl}`);

      try {
        const githubFiles = await fetchGitHubRepoFiles(gitUrl, {
          maxFiles: 200,
          maxFileSize: 1024 * 1024, // 1MB
        });

        console.log(`Fetched ${githubFiles.length} files from GitHub`);

        // Store files with skill path prefix
        for (const file of githubFiles) {
          const fullPath = `${sourcePath}/${file.path}`;
          const blobSha = await gitBackend.writeBlob(file.content);

          // Create file index entry
          const existingFileIndex = await ds.getRepository(GitFileIndex).findOne({
            where: { repoId: targetCollectionId, branch: "main", path: fullPath },
          });

          if (!existingFileIndex) {
            await ds.getRepository(GitFileIndex).save({
              id: randomUUID(),
              repoId: targetCollectionId,
              branch: "main",
              path: fullPath,
              blobSha,
              mode: file.mode || "100644",
            });
          }
          filesCloned++;
        }

        console.log(`Stored ${filesCloned} files from GitHub for skill ${sourcePath}`);
      } catch (error) {
        console.error(`Failed to fetch from GitHub, falling back to local files:`, error);
        // Fall through to copy local files
      }
    }

    // If no GitHub files were cloned, copy from source collection
    if (filesCloned === 0) {
      // Get all files from source collection's git index that belong to this skill
      const allSourceFiles = await ds.getRepository(GitFileIndex).find({
        where: { repoId: sourceCollectionId, branch: "main" },
      });

      // Filter files that belong to this skill (files starting with sourcePath/)
      const skillPrefix = sourcePath + "/";
      const skillFiles = allSourceFiles.filter(
        (f) => f.path.startsWith(skillPrefix) || f.path === sourcePath
      );

      console.log(`Cloning skill ${sourcePath}: found ${skillFiles.length} local files`);

      // Copy blobs and file index entries for this skill
      for (const file of skillFiles) {
        const sourceBlob = await ds.getRepository(GitObject).findOne({
          where: { sha: file.blobSha, repoId: sourceCollectionId },
        });

        if (sourceBlob) {
          // Check if blob already exists in target
          const existingBlob = await ds.getRepository(GitObject).findOne({
            where: { sha: file.blobSha, repoId: targetCollectionId },
          });

          if (!existingBlob) {
            await ds.getRepository(GitObject).save({
              sha: sourceBlob.sha,
              repoId: targetCollectionId,
              type: sourceBlob.type,
              content: sourceBlob.content,
              size: sourceBlob.size,
            });
          }

          // Check if file index entry already exists
          const existingFileIndex = await ds.getRepository(GitFileIndex).findOne({
            where: { repoId: targetCollectionId, branch: "main", path: file.path },
          });

          if (!existingFileIndex) {
            await ds.getRepository(GitFileIndex).save({
              id: randomUUID(),
              repoId: targetCollectionId,
              branch: "main",
              path: file.path,
              blobSha: file.blobSha,
              mode: file.mode,
            });
          }
          filesCloned++;
        }
      }
    }

    // Update collection skill count
    const skillCount = await ds.getRepository(Skill).count({
      where: { collectionId: targetCollectionId, archivedAt: undefined },
    });

    await ds.getRepository(SkillCollection).update(targetCollectionId, {
      skillCount,
      modifiedById: ctx.userId,
    });

    return NextResponse.json({
      success: true,
      skill: {
        id: newSkill.id,
        path: newSkill.path,
        name: newSkill.name,
        collectionId: targetCollectionId,
      },
      filesCloned,
    });
  } catch (error) {
    console.error("Clone error:", error);
    const message = error instanceof Error ? error.message : "Failed to clone skill";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
