export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { getDataSource } from "@/lib/db/data-source";
import { SkillCollection } from "@/entities/SkillCollection";
import { Account } from "@/entities/Account";
import { Skill } from "@/entities/Skill";
import { GitFileIndex } from "@/entities/GitFileIndex";
import { ApiKey } from "@/entities/ApiKey";
import { ApiKeyScope } from "@/entities/ApiKeyScope";
import { IsNull } from "typeorm";
import { createHash } from "crypto";

interface SkillIndexEntry {
  name: string;
  description: string;
  files: string[];
  hash?: string;
}

interface SkillsIndex {
  skills: SkillIndexEntry[];
}

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

  // Find API key by prefix and hash
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

  // Check expiration
  if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
    return false;
  }

  // Check if API key has read permission for this collection
  const scope = await scopeRepo.findOne({
    where: {
      apiKeyId: apiKey.id,
      collectionId,
    },
  });

  // Any permission (read, contribute, write) allows reading
  return !!scope;
}

/**
 * GET /[account]/[collection]/.well-known/skills/index.json
 * Returns skills index for the vercel-labs/skills CLI well-known provider
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ account: string; collection: string }> }
) {
  try {
    const { account: accountSlug, collection: collectionSlug } = await params;

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

    // Get all skills in this collection
    const skillRepo = ds.getRepository(Skill);
    const skills = await skillRepo.find({
      where: {
        collectionId: collection.id,
        archivedAt: IsNull(),
      },
      order: { path: "ASC" },
    });

    // Get file index for each skill
    const fileIndexRepo = ds.getRepository(GitFileIndex);

    const skillEntries: SkillIndexEntry[] = await Promise.all(
      skills.map(async (skill) => {
        // Get files for this skill
        const files = await fileIndexRepo
          .createQueryBuilder("file")
          .where("file.repoId = :repoId", { repoId: collection.id })
          .andWhere("file.branch = :branch", { branch: collection.defaultBranch || "main" })
          .andWhere("(file.path LIKE :pathPrefix OR file.path = :exactPath)", {
            pathPrefix: `${skill.path}/%`,
            exactPath: skill.path,
          })
          .getMany();

        // Get relative file paths
        const filePaths = files.map((f) => {
          if (f.path === skill.path) {
            return "SKILL.md";
          }
          return f.path.startsWith(skill.path + "/")
            ? f.path.slice(skill.path.length + 1)
            : f.path;
        });

        // If no files found, assume SKILL.md exists
        if (filePaths.length === 0) {
          filePaths.push("SKILL.md");
        }

        // Compute hash from file SHAs for change detection
        const hash = files.length > 0
          ? files.map(f => f.blobSha).sort().join("").slice(0, 16)
          : undefined;

        return {
          name: skill.path,
          description: skill.description || "",
          files: filePaths,
          hash,
        };
      })
    );

    const response: SkillsIndex = {
      skills: skillEntries,
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (error) {
    console.error("Error fetching skills index:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
