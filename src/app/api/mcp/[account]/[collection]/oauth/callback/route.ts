/**
 * OAuth Callback Handler
 * POST /api/mcp/[account]/[collection]/oauth/callback
 *
 * Called by the consent UI to complete the authorization flow.
 * Generates an authorization code and redirects back to the client.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { generateAuthCode, storeAuthCode } from "@/lib/mcp";
import { getDataSource } from "@/lib/db/data-source";
import { Account } from "@/entities/Account";
import { AccountMembership } from "@/entities/AccountMembership";
import { SkillCollection } from "@/entities/SkillCollection";
import { verifyToken, TokenPayload } from "@/lib/auth/jwt";

interface RouteParams {
  account: string;
  collection: string;
}

/**
 * Extract and verify user from request cookies
 */
async function getUserFromRequest(request: NextRequest): Promise<TokenPayload | null> {
  // Try cookie first
  const token = request.cookies.get("access_token")?.value;
  if (!token) {
    // Try Authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return null;
    }
    const bearerToken = authHeader.slice(7);
    const payload = await verifyToken(bearerToken);
    if (payload?.type === "access") {
      return payload;
    }
    return null;
  }

  const payload = await verifyToken(token);
  if (payload?.type !== "access") {
    return null;
  }

  return payload;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { account: accountSlug, collection: collectionSlug } = await params;

  try {
    // Verify user is authenticated
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "unauthorized", error_description: "User must be authenticated" },
        { status: 401 }
      );
    }

    // Parse the request body
    const body = await request.json();
    const {
      redirect_uri,
      client_id,
      state,
      code_challenge,
      code_challenge_method,
      scope = "read",
      action, // "approve" or "deny"
    } = body;

    // If user denied, redirect with error
    if (action === "deny") {
      if (redirect_uri) {
        const errorUrl = new URL(redirect_uri);
        errorUrl.searchParams.set("error", "access_denied");
        errorUrl.searchParams.set("error_description", "User denied the authorization request");
        if (state) errorUrl.searchParams.set("state", state);
        return NextResponse.json({ redirect_url: errorUrl.toString() });
      }
      return NextResponse.json(
        { error: "access_denied", error_description: "User denied the authorization request" },
        { status: 403 }
      );
    }

    // Get database connection
    const ds = await getDataSource();
    const accountRepo = ds.getRepository(Account);
    const membershipRepo = ds.getRepository(AccountMembership);
    const collectionRepo = ds.getRepository(SkillCollection);

    // Look up the account
    const accountRecord = await accountRepo.findOne({
      where: { slug: accountSlug },
    });

    if (!accountRecord) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "Account not found" },
        { status: 404 }
      );
    }

    // Verify user has access to this account
    const membership = await membershipRepo.findOne({
      where: {
        accountId: accountRecord.id,
        userId: user.userId,
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "access_denied", error_description: "User does not have access to this account" },
        { status: 403 }
      );
    }

    // Look up the collection
    const collectionRecord = await collectionRepo.findOne({
      where: {
        accountId: accountRecord.id,
        slug: collectionSlug,
        archivedAt: undefined,
      },
    });

    if (!collectionRecord) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "Collection not found" },
        { status: 404 }
      );
    }

    // Generate authorization code
    const code = generateAuthCode();

    // Store the authorization code with all necessary data
    storeAuthCode(code, {
      client_id,
      redirect_uri,
      scope,
      code_challenge,
      code_challenge_method: code_challenge_method || "S256",
      owner_uid: user.userId,
      account_id: accountRecord.id,
      account_slug: accountSlug,
      collection_id: collectionRecord.id,
      collection_slug: collectionSlug,
      created_at: Math.floor(Date.now() / 1000),
    });

    // Build redirect URL with authorization code
    if (redirect_uri) {
      const successUrl = new URL(redirect_uri);
      successUrl.searchParams.set("code", code);
      if (state) successUrl.searchParams.set("state", state);
      return NextResponse.json({ redirect_url: successUrl.toString() });
    }

    // If no redirect_uri, return the code directly
    return NextResponse.json({ code });
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "Failed to process authorization" },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
