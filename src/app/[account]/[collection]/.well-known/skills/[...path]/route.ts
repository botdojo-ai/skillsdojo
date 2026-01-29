export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { getDataSource } from "@/lib/db/data-source";
import { SkillCollection } from "@/entities/SkillCollection";
import { Account } from "@/entities/Account";
import { Skill } from "@/entities/Skill";
import { GitFileIndex } from "@/entities/GitFileIndex";
import { GitObject } from "@/entities/GitObject";
import { ApiKey } from "@/entities/ApiKey";
import { ApiKeyScope } from "@/entities/ApiKeyScope";
import { IsNull } from "typeorm";
import { createHash } from "crypto";
import pako from "pako";

const API_KEY_PREFIX = "sk_";

/**
 * Extract API key from request headers
 */
function extractApiKey(request: NextRequest): string | null {
  const apiKeyHeader = request.headers.get("x-api-key");
  if (apiKeyHeader?.startsWith(API_KEY_PREFIX)) {
    return apiKeyHeader;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token.startsWith(API_KEY_PREFIX)) {
      return token;
    }
  }

  return null;
}

/**
 * Validate API key and check read permission for collection
 */
async function validateApiKeyForCollection(
  fullKey: string,
  collectionId: string,
  accountId: string
): Promise<boolean> {
  if (!fullKey.startsWith(API_KEY_PREFIX)) {
    return false;
  }

  const keyHash = createHash("sha256").update(fullKey).digest("hex");
  const keyPrefix = fullKey.substring(0, 12);

  const ds = await getDataSource();
  const apiKeyRepo = ds.getRepository(ApiKey);
  const scopeRepo = ds.getRepository(ApiKeyScope);

  const apiKey = await apiKeyRepo
    .createQueryBuilder("key")
    .where("key.keyPrefix = :keyPrefix", { keyPrefix })
    .andWhere("key.keyHash = :keyHash", { keyHash })
    .andWhere("key.accountId = :accountId", { accountId })
    .andWhere("key.archivedAt IS NULL")
    .getOne();

  if (!apiKey) {
    return false;
  }

  if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
    return false;
  }

  const scope = await scopeRepo.findOne({
    where: {
      apiKeyId: apiKey.id,
      collectionId,
    },
  });

  return !!scope;
}

/**
 * GET /[account]/[collection]/.well-known/skills/[...path]
 * Serves individual skill files for the vercel-labs/skills CLI
 *
 * Path format: /{skill-name}/{file-path}
 * Examples:
 *   /acme/my-skills/.well-known/skills/code-review/SKILL.md
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ account: string; collection: string; path: string[] }> }
) {
  try {
    const { account: accountSlug, collection: collectionSlug, path: pathSegments } = await params;

    if (!pathSegments || pathSegments.length === 0) {
      return NextResponse.json(
        { error: "File path required" },
        { status: 400 }
      );
    }

    const ds = await getDataSource();

    // Find account by slug
    const accountRepo = ds.getRepository(Account);
    const account = await accountRepo.findOne({
      where: { slug: accountSlug.toLowerCase() },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Not found" },
        { status: 404 }
      );
    }

    // Find collection
    const collectionRepo = ds.getRepository(SkillCollection);
    const collection = await collectionRepo.findOne({
      where: {
        accountId: account.id,
        slug: collectionSlug.toLowerCase(),
        archivedAt: IsNull(),
      },
    });

    if (!collection) {
      return NextResponse.json(
        { error: "Not found" },
        { status: 404 }
      );
    }

    // Check visibility - private requires API key with read permission
    if (collection.visibility === "private") {
      const apiKey = extractApiKey(request);
      if (!apiKey) {
        return NextResponse.json(
          { error: "Not found" },
          { status: 404 }
        );
      }

      const hasAccess = await validateApiKeyForCollection(
        apiKey,
        collection.id,
        account.id
      );

      if (!hasAccess) {
        return NextResponse.json(
          { error: "Not found" },
          { status: 404 }
        );
      }
    }

    // Build file path: first segment is skill name, rest is file path
    const fullPath = pathSegments.join("/");
    const skillPath = pathSegments[0];
    const fileName = pathSegments.slice(1).join("/") || "SKILL.md";

    // Try to get file from git index first
    const fileIndexRepo = ds.getRepository(GitFileIndex);
    const branch = collection.defaultBranch || "main";

    const fileEntry = await fileIndexRepo.findOne({
      where: {
        repoId: collection.id,
        branch,
        path: fullPath,
      },
    });

    if (fileEntry) {
      // Get blob content from git
      const gitObjectRepo = ds.getRepository(GitObject);
      const blob = await gitObjectRepo.findOne({
        where: {
          sha: fileEntry.blobSha,
          repoId: collection.id,
        },
      });

      if (blob && blob.type === "blob") {
        let content: string;
        try {
          const decompressed = Buffer.from(pako.inflate(blob.content));
          content = decompressed.toString("utf-8");
        } catch {
          content = blob.content.toString("utf-8");
        }

        const contentType = getContentType(fullPath);
        return new NextResponse(content, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=60",
          },
        });
      }
    }

    // Fallback: If requesting SKILL.md and no git file, generate from skill metadata
    if (fileName === "SKILL.md") {
      const skillRepo = ds.getRepository(Skill);
      const skill = await skillRepo.findOne({
        where: {
          collectionId: collection.id,
          path: skillPath,
          archivedAt: IsNull(),
        },
      });

      if (skill) {
        // Check if skill has content stored directly
        if (skill.content) {
          return new NextResponse(skill.content, {
            status: 200,
            headers: {
              "Content-Type": "text/markdown; charset=utf-8",
              "Cache-Control": "public, max-age=60",
            },
          });
        }

        // Generate default SKILL.md from metadata
        const content = generateSkillMd(skill);
        return new NextResponse(content, {
          status: 200,
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Cache-Control": "public, max-age=60",
          },
        });
      }
    }

    return NextResponse.json(
      { error: "File not found" },
      { status: 404 }
    );
  } catch (error) {
    console.error("Error fetching skill file:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function getContentType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();

  const mimeTypes: Record<string, string> = {
    "md": "text/markdown; charset=utf-8",
    "txt": "text/plain; charset=utf-8",
    "json": "application/json; charset=utf-8",
    "js": "application/javascript; charset=utf-8",
    "ts": "application/typescript; charset=utf-8",
    "tsx": "application/typescript; charset=utf-8",
    "jsx": "application/javascript; charset=utf-8",
    "py": "text/x-python; charset=utf-8",
    "yaml": "text/yaml; charset=utf-8",
    "yml": "text/yaml; charset=utf-8",
    "html": "text/html; charset=utf-8",
    "css": "text/css; charset=utf-8",
    "sh": "text/x-shellscript; charset=utf-8",
  };

  return mimeTypes[ext || ""] || "text/plain; charset=utf-8";
}

function generateSkillMd(skill: Skill): string {
  const metadata = skill.metadata || {};
  const tags = Array.isArray(metadata.tags) ? metadata.tags : [];

  return `---
name: ${skill.name}
description: ${skill.description || "A skill for AI agents"}
version: ${metadata.version || "1.0.0"}
tags: [${tags.join(", ")}]
---

# ${skill.name}

${skill.description || "A skill for AI agents."}

## Usage

Use this skill to enhance your AI agent's capabilities.
`;
}
