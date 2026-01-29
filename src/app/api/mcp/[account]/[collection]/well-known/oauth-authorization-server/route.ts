/**
 * OAuth Authorization Server Metadata (RFC 8414)
 * GET /api/mcp/[account]/[collection]/.well-known/oauth-authorization-server
 *
 * Returns metadata about the OAuth authorization server for this collection.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { buildOAuthServerMetadata, getBaseUrl } from "@/lib/mcp";

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

  const metadata = buildOAuthServerMetadata(baseUrl, account, collection);

  return NextResponse.json(metadata, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
