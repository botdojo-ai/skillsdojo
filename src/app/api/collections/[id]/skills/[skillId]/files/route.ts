export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/middleware";
import { getDataSource } from "@/lib/db/data-source";
import { Skill } from "@/entities/Skill";
import { GitObject } from "@/entities/GitObject";
import { GitFileIndex } from "@/entities/GitFileIndex";
import { GitRef } from "@/entities/GitRef";
import { SkillCollection } from "@/entities/SkillCollection";
import * as crypto from "crypto";
import pako from "pako";

interface RouteParams {
  params: Promise<{ id: string; skillId: string }>;
}

interface SkillFile {
  path: string;
  content: string;
}

// GET /api/collections/[id]/skills/[skillId]/files - Get skill files
export const GET = withAuth(async (request: AuthenticatedRequest, context: RouteParams) => {
  const { id: collectionId, skillId } = await context.params;
  const ds = await getDataSource();

  // Verify skill exists and belongs to account
  const skillRepo = ds.getRepository(Skill);
  const skill = await skillRepo.findOne({
    where: {
      id: skillId,
      collectionId,
      accountId: request.context.accountId,
      archivedAt: undefined,
    },
  });

  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  // Get collection for repo context
  const collectionRepo = ds.getRepository(SkillCollection);
  const collection = await collectionRepo.findOne({
    where: { id: collectionId },
  });

  if (!collection) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  // Get files from git file index for this skill's path
  const fileIndexRepo = ds.getRepository(GitFileIndex);
  const skillPath = skill.path;

  const fileEntries = await fileIndexRepo
    .createQueryBuilder("file")
    .where("file.repoId = :repoId", { repoId: collectionId })
    .andWhere("file.path LIKE :pathPrefix", { pathPrefix: `${skillPath}/%` })
    .orWhere("file.path = :exactPath", { exactPath: `${skillPath}/SKILL.md` })
    .getMany();

  // Fetch content for each file
  const gitObjectRepo = ds.getRepository(GitObject);
  const files: SkillFile[] = [];

  for (const entry of fileEntries) {
    const obj = await gitObjectRepo.findOne({
      where: { sha: entry.blobSha, repoId: collectionId },
    });

    if (obj && obj.type === "blob") {
      // Get relative path within skill directory
      const relativePath = entry.path.startsWith(skillPath + "/")
        ? entry.path.slice(skillPath.length + 1)
        : entry.path;

      try {
        // Decompress content (stored with pako)
        const decompressed = Buffer.from(pako.inflate(obj.content));
        files.push({
          path: relativePath,
          content: decompressed.toString("utf-8"),
        });
      } catch {
        // If decompression fails, try reading as-is (might be uncompressed)
        files.push({
          path: relativePath,
          content: obj.content.toString("utf-8"),
        });
      }
    }
  }

  // If no files found, return default SKILL.md
  if (files.length === 0) {
    files.push({
      path: "SKILL.md",
      content: getDefaultSkillMd(skill.name, skill.description),
    });
  }

  return NextResponse.json({ files });
});

// PUT /api/collections/[id]/skills/[skillId]/files - Save skill files
export const PUT = withAuth(async (request: AuthenticatedRequest, context: RouteParams) => {
  const { id: collectionId, skillId } = await context.params;
  const body = await request.json();
  const { files } = body as { files: SkillFile[] };

  if (!files || !Array.isArray(files)) {
    return NextResponse.json({ error: "Files array required" }, { status: 400 });
  }

  const ds = await getDataSource();

  // Verify skill exists
  const skillRepo = ds.getRepository(Skill);
  const skill = await skillRepo.findOne({
    where: {
      id: skillId,
      collectionId,
      accountId: request.context.accountId,
      archivedAt: undefined,
    },
  });

  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  const gitObjectRepo = ds.getRepository(GitObject);
  const fileIndexRepo = ds.getRepository(GitFileIndex);
  const gitRefRepo = ds.getRepository(GitRef);

  // Get or create HEAD ref
  const headRef = await gitRefRepo.findOne({
    where: { repoId: collectionId, refName: "refs/heads/main" },
  });

  // Store each file as a blob
  for (const file of files) {
    const content = Buffer.from(file.content, "utf-8");
    const sha = computeSha(content);
    const fullPath = `${skill.path}/${file.path}`;

    // Check if blob already exists
    const existing = await gitObjectRepo.findOne({
      where: { sha, repoId: collectionId },
    });

    if (!existing) {
      // Compress content for storage
      const compressed = Buffer.from(pako.deflate(content));

      // Create blob object
      await gitObjectRepo.save({
        sha,
        repoId: collectionId,
        type: "blob",
        content: compressed,
        size: content.length,
      });
    }

    // Update file index
    const existingIndex = await fileIndexRepo.findOne({
      where: { repoId: collectionId, path: fullPath },
    });

    if (existingIndex) {
      existingIndex.blobSha = sha;
      await fileIndexRepo.save(existingIndex);
    } else {
      await fileIndexRepo.save({
        repoId: collectionId,
        branch: "main",
        path: fullPath,
        blobSha: sha,
        mode: "100644",
      });
    }
  }

  // Update skill's modifiedAt
  skill.modifiedAt = new Date();
  skill.modifiedById = request.context.userId;
  await skillRepo.save(skill);

  return NextResponse.json({ success: true, fileCount: files.length });
});

// Compute SHA-1 hash for git object
function computeSha(content: Buffer): string {
  const header = `blob ${content.length}\0`;
  const store = Buffer.concat([Buffer.from(header), content]);
  return crypto.createHash("sha1").update(store).digest("hex");
}

// Default SKILL.md template
function getDefaultSkillMd(name: string, description: string | null): string {
  return `---
name: ${name}
description: ${description || "A skill for AI agents"}
version: 1.0.0
tags: []
---

# ${name}

${description || "Describe what this skill does."}

## Usage

Add usage instructions here.

## Examples

Provide example scenarios.
`;
}
