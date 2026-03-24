/**
 * OAuth Token Endpoint
 * POST /api/mcp/[account]/[collection]/oauth/token
 *
 * Exchanges authorization codes for access tokens.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { consumeAuthCode, handleTokenExchange, handleRefreshTokenGrant } from "@/lib/mcp";

interface RouteParams {
  account: string;
  collection: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { account, collection } = await params;

  try {
    // Parse form data or JSON body
    const contentType = request.headers.get("content-type") || "";
    let body: Record<string, string>;

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries()) as Record<string, string>;
    } else if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      return NextResponse.json(
        { error: "invalid_request", error_description: "Content-Type must be application/x-www-form-urlencoded or application/json" },
        { status: 400 }
      );
    }

    const { grant_type, code, redirect_uri, client_id, code_verifier, refresh_token } = body;

    let tokenResponse;

    if (grant_type === "refresh_token") {
      // Handle refresh token grant
      if (!refresh_token) {
        return NextResponse.json(
          { error: "invalid_request", error_description: "refresh_token is required" },
          { status: 400 }
        );
      }

      tokenResponse = await handleRefreshTokenGrant(refresh_token);
    } else if (grant_type === "authorization_code") {
      // Handle authorization code grant
      if (!code) {
        return NextResponse.json(
          { error: "invalid_request", error_description: "code is required" },
          { status: 400 }
        );
      }

      // Consume the authorization code (JWT-based, single-use via expiry)
      const authCodeData = await consumeAuthCode(code);
      if (!authCodeData) {
        return NextResponse.json(
          { error: "invalid_grant", error_description: "Invalid or expired authorization code" },
          { status: 400 }
        );
      }

      // Verify the code was issued for this collection
      if (authCodeData.account_slug !== account || authCodeData.collection_slug !== collection) {
        return NextResponse.json(
          { error: "invalid_grant", error_description: "Authorization code was issued for a different collection" },
          { status: 400 }
        );
      }

      // Verify client_id matches
      if (authCodeData.client_id && client_id !== authCodeData.client_id) {
        return NextResponse.json(
          { error: "invalid_grant", error_description: "client_id mismatch" },
          { status: 400 }
        );
      }

      // Exchange code for token
      tokenResponse = await handleTokenExchange(
        { grant_type, code, redirect_uri, client_id, code_verifier },
        authCodeData
      );
    } else {
      return NextResponse.json(
        { error: "unsupported_grant_type", error_description: "Supported grant types: authorization_code, refresh_token" },
        { status: 400 }
      );
    }

    return NextResponse.json(tokenResponse, {
      headers: {
        "Cache-Control": "no-store",
        "Pragma": "no-cache",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Token exchange error:", error);
    return NextResponse.json(
      { error: "invalid_grant", error_description: error instanceof Error ? error.message : "Token exchange failed" },
      { status: 400 }
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
