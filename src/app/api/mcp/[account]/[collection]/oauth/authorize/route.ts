/**
 * OAuth Authorization Endpoint
 * GET /api/mcp/[account]/[collection]/oauth/authorize
 *
 * Redirects to the consent UI with all necessary OAuth parameters.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { buildAuthorizationUrl, getBaseUrl } from "@/lib/mcp";

interface RouteParams {
  account: string;
  collection: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { account, collection } = await params;
  const baseUrl = getBaseUrl(request);
  const searchParams = request.nextUrl.searchParams;

  // Extract OAuth parameters
  const responseType = searchParams.get("response_type");
  const clientId = searchParams.get("client_id");
  const redirectUri = searchParams.get("redirect_uri");
  const state = searchParams.get("state");
  const codeChallenge = searchParams.get("code_challenge");
  const codeChallengeMethod = searchParams.get("code_challenge_method") || "S256";
  const scope = searchParams.get("scope") || "read";

  // Validate required parameters
  if (responseType !== "code") {
    return NextResponse.json(
      { error: "unsupported_response_type", error_description: "Only 'code' response type is supported" },
      { status: 400 }
    );
  }

  if (!clientId) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "client_id is required" },
      { status: 400 }
    );
  }

  // Build consent URL and redirect
  const consentUrl = buildAuthorizationUrl(baseUrl, account, collection, {
    redirect_uri: redirectUri || undefined,
    client_id: clientId,
    state: state || undefined,
    code_challenge: codeChallenge || undefined,
    code_challenge_method: codeChallengeMethod,
    scope,
  });

  return NextResponse.redirect(consentUrl);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
