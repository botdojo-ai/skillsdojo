/**
 * OAuth Dynamic Client Registration Endpoint (RFC 7591)
 * POST /api/mcp/[account]/[collection]/oauth/register
 *
 * Allows MCP clients to dynamically register themselves.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { handleDynamicClientRegistration } from "@/lib/mcp";
import { DynamicClientRegistrationRequest } from "@/lib/mcp/types";

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
    const body: DynamicClientRegistrationRequest = await request.json();

    // Validate redirect_uris if provided
    if (body.redirect_uris) {
      for (const uri of body.redirect_uris) {
        try {
          new URL(uri);
        } catch {
          return NextResponse.json(
            { error: "invalid_redirect_uri", error_description: `Invalid redirect URI: ${uri}` },
            { status: 400 }
          );
        }
      }
    }

    // Register the client
    const response = handleDynamicClientRegistration(body);

    // Add collection-specific metadata
    const responseWithMeta = {
      ...response,
      // Include collection info in the response for reference
      _meta: {
        account_slug: account,
        collection_slug: collection,
      },
    };

    return NextResponse.json(responseWithMeta, {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Client registration error:", error);
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Failed to register client" },
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
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
