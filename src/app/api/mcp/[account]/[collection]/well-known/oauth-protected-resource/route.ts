/**
 * Protected Resource Metadata (RFC 9728)
 * GET /api/mcp/[account]/[collection]/.well-known/oauth-protected-resource
 *
 * Returns metadata about the protected MCP resource and its authorization server.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { buildProtectedResourceMetadata, getBaseUrl } from "@/lib/mcp";

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

  const metadata = buildProtectedResourceMetadata(baseUrl, account, collection);

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
