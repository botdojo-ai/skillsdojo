export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { getDataSource } from "@/lib/db/data-source";
import { SkillCollection } from "@/entities/SkillCollection";
import { Account } from "@/entities/Account";
import { GitRef } from "@/entities/GitRef";
import { ApiKey } from "@/entities/ApiKey";
import { ApiKeyScope } from "@/entities/ApiKeyScope";
import { IsNull } from "typeorm";
import { createHash } from "crypto";
import { generateVirtualCommitSha } from "@/lib/git/pack-generator";

const API_KEY_PREFIX = "sk_";

/**
 * Extract Basic Auth credentials from request
 * Format: Authorization: Basic base64(username:password)
 * We use the password field for the API key
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
    const password = passwordParts.join(":"); // Handle passwords with colons
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
  // The API key can be passed as the password in Basic Auth
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
 * Format a pkt-line (git protocol packet)
 * Format: 4 hex digits for length + data + newline
 */
function pktLine(data: string): string {
  const length = data.length + 5; // 4 hex digits + newline
  return length.toString(16).padStart(4, "0") + data + "\n";
}

/**
 * GET /[account]/[collection].git/info/refs?service=git-upload-pack
 * Git Smart HTTP protocol - ref discovery
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ account: string; collection: string }> }
) {
  try {
    const { account: accountSlug, collection: collectionSlugWithGit } = await params;

    // Remove .git suffix if present
    const collectionSlug = collectionSlugWithGit.replace(/\.git$/, "");

    // Check service parameter
    const { searchParams } = new URL(request.url);
    const service = searchParams.get("service");

    if (service !== "git-upload-pack") {
      return new NextResponse("Service not supported", { status: 403 });
    }

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

    // Check visibility - private requires auth
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

    // Get all refs for this collection
    const refRepo = ds.getRepository(GitRef);
    let refs = await refRepo.find({
      where: { repoId: collection.id },
    });

    // If no refs exist, generate virtual refs from skills
    let virtualCommitSha: string | null = null;
    if (refs.length === 0 || !refs.some(r => r.sha)) {
      // Generate a deterministic SHA based on collection content
      // This allows git clone to work even for collections without real git data
      virtualCommitSha = await generateVirtualCommitSha(ds, collection.id);
    }

    // Build response in git smart protocol format
    // First section: service announcement (pkt-line format)
    let response = pktLine("# service=git-upload-pack");
    response += "0000"; // Flush packet separates service announcement from refs

    // Build refs list
    const capabilities = "multi_ack thin-pack side-band side-band-64k ofs-delta shallow deepen-since deepen-not deepen-relative no-progress include-tag multi_ack_detailed symref=HEAD:refs/heads/main object-format=sha1 agent=skillsdojo/1.0";

    let firstLine = true;
    let headSha: string | null = null;

    // Find HEAD ref
    const headRef = refs.find(r => r.refName === "HEAD");
    if (headRef) {
      if (headRef.symbolicRef) {
        // Resolve symbolic ref
        const targetRef = refs.find(r => r.refName === headRef.symbolicRef);
        headSha = targetRef?.sha || null;
      } else {
        headSha = headRef.sha;
      }
    }

    // Use virtual commit if no real refs
    if (!headSha && virtualCommitSha) {
      headSha = virtualCommitSha;
    }

    // Output HEAD first with capabilities (git expects HEAD to come first)
    if (headSha) {
      response += pktLine(`${headSha} HEAD\0${capabilities}`);
      firstLine = false;
    }

    // Output branch refs (excluding HEAD)
    const branchRefs = refs.filter(r => r.refName !== "HEAD" && r.sha);

    for (const ref of branchRefs) {
      if (firstLine) {
        // First line includes capabilities (only if no HEAD was output)
        response += pktLine(`${ref.sha} ${ref.refName}\0${capabilities}`);
        firstLine = false;
      } else {
        response += pktLine(`${ref.sha} ${ref.refName}`);
      }
    }

    // If using virtual commit and no branch refs from DB, output refs/heads/main
    if (virtualCommitSha && branchRefs.length === 0) {
      response += pktLine(`${virtualCommitSha} refs/heads/main`);
    }

    // If no refs at all, output empty capabilities
    if (firstLine) {
      // Empty repo - output capabilities with zero sha
      response += pktLine(`0000000000000000000000000000000000000000 capabilities^{}\0${capabilities}`);
    }

    response += "0000"; // Final flush packet

    return new NextResponse(response, {
      status: 200,
      headers: {
        "Content-Type": "application/x-git-upload-pack-advertisement",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Error in git info/refs:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
