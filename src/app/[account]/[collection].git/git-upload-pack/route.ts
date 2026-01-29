export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { getDataSource } from "@/lib/db/data-source";
import { SkillCollection } from "@/entities/SkillCollection";
import { Account } from "@/entities/Account";
import { ApiKey } from "@/entities/ApiKey";
import { ApiKeyScope } from "@/entities/ApiKeyScope";
import { IsNull } from "typeorm";
import { createHash } from "crypto";
import { generatePackfile, parsePktLines, pktLine, flushPkt, sideBandPkt } from "@/lib/git/pack-generator";

const API_KEY_PREFIX = "sk_";

/**
 * Extract Basic Auth credentials
 */
function extractBasicAuth(request: NextRequest): { username: string; password: string } | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Basic ")) {
    return null;
  }

  try {
    const base64 = authHeader.slice(6);
    const decoded = Buffer.from(base64, "base64").toString("utf-8");
    const [username, ...passwordParts] = decoded.split(":");
    const password = passwordParts.join(":");
    return { username, password };
  } catch {
    return null;
  }
}

/**
 * Validate API key for collection access
 */
async function validateApiKeyForCollection(
  apiKeyOrPassword: string,
  collectionId: string,
  accountId: string
): Promise<boolean> {
  const fullKey = apiKeyOrPassword;

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
 * POST /[account]/[collection].git/git-upload-pack
 * Git Smart HTTP protocol - pack data upload
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ account: string; collection: string }> }
) {
  try {
    const { account: accountSlug, collection: collectionSlugWithGit } = await params;
    const collectionSlug = collectionSlugWithGit.replace(/\.git$/, "");

    const ds = await getDataSource();

    // Find account
    const accountRepo = ds.getRepository(Account);
    const account = await accountRepo.findOne({
      where: { slug: accountSlug.toLowerCase() },
    });

    if (!account) {
      return new NextResponse("Repository not found", { status: 404 });
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
      return new NextResponse("Repository not found", { status: 404 });
    }

    // Check visibility
    if (collection.visibility === "private") {
      const auth = extractBasicAuth(request);
      if (!auth) {
        return new NextResponse("Authentication required", {
          status: 401,
          headers: {
            "WWW-Authenticate": 'Basic realm="SkillsDojo"',
          },
        });
      }

      const hasAccess = await validateApiKeyForCollection(
        auth.password,
        collection.id,
        account.id
      );

      if (!hasAccess) {
        return new NextResponse("Access denied", { status: 403 });
      }
    }

    // Parse request body
    const body = await request.arrayBuffer();
    const bodyBuffer = Buffer.from(body);
    const lines = parsePktLines(bodyBuffer);

    const hasDone = lines.includes("done");

    // Parse want, have, and deepen lines
    const wantShas: string[] = [];
    const haveShas: string[] = [];
    let depth: number | null = null;

    for (const line of lines) {
      if (line === "flush" || line === "done") continue;

      if (line.startsWith("want ")) {
        // Format: want SHA [capabilities]
        const parts = line.split(" ");
        wantShas.push(parts[1]);
      } else if (line.startsWith("have ")) {
        haveShas.push(line.slice(5).trim());
      } else if (line.startsWith("deepen ")) {
        depth = parseInt(line.slice(7).trim(), 10);
      }
    }

    // Build response
    const responseChunks: Buffer[] = [];

    // For shallow clones without "done", respond with just shallow lines + flush
    // Client will make second request with "done" to get the actual pack
    if (depth !== null && depth > 0 && !hasDone && wantShas.length > 0) {
      for (const sha of wantShas) {
        responseChunks.push(pktLine(`shallow ${sha}`));
      }
      responseChunks.push(flushPkt());

      const responseBody = Buffer.concat(responseChunks);
      return new NextResponse(responseBody, {
        status: 200,
        headers: {
          "Content-Type": "application/x-git-upload-pack-result",
          "Cache-Control": "no-cache",
        },
      });
    }

    if (wantShas.length === 0 && !hasDone) {
      return new NextResponse("No objects requested", { status: 400 });
    }

    // For "done" requests or regular clones, send shallow info + NAK + packfile
    // Note: HTTP is stateless, so for "done" requests we need to regenerate state
    let packedShas = wantShas;
    if (wantShas.length === 0 && hasDone) {
      // This is a follow-up "done" request after shallow negotiation
      // We need to use the refs from info/refs endpoint
      const { generateVirtualCommitSha } = await import("@/lib/git/pack-generator");
      const virtualSha = await generateVirtualCommitSha(ds, collection.id);
      packedShas = [virtualSha];
    }

    const packfile = await generatePackfile(ds, collection.id, packedShas, haveShas);

    // For done requests after shallow negotiation, need to output shallow list again
    if (hasDone && packedShas.length > 0) {
      for (const sha of packedShas) {
        responseChunks.push(pktLine(`shallow ${sha}`));
      }
      responseChunks.push(flushPkt());
    }

    // NAK (no common objects - we're doing a full clone)
    responseChunks.push(pktLine("NAK"));

    // Send packfile data on side-band channel 1
    // Split into chunks for side-band protocol
    const CHUNK_SIZE = 65515; // Max side-band-64k chunk size
    let offset = 0;

    while (offset < packfile.length) {
      const chunk = packfile.slice(offset, offset + CHUNK_SIZE);
      responseChunks.push(sideBandPkt(1, chunk)); // Channel 1 = pack data
      offset += CHUNK_SIZE;
    }

    // Final flush
    responseChunks.push(flushPkt());

    const responseBody = Buffer.concat(responseChunks);

    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/x-git-upload-pack-result",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Error in git-upload-pack:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
