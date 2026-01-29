/**
 * MCP Server Endpoint (Streamable HTTP Transport)
 * POST /api/mcp/[account]/[collection]
 *
 * This is the main MCP endpoint for a collection using Streamable HTTP transport.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getDataSource } from "@/lib/db/data-source";
import { SkillCollection } from "@/entities/SkillCollection";
import { Account } from "@/entities/Account";
import {
  MCPServer,
  parseJsonRpcRequest,
  verifyMCPAccessToken,
  MCPServerContext,
  JSON_RPC_ERRORS,
  getBaseUrl,
} from "@/lib/mcp";

interface RouteParams {
  account: string;
  collection: string;
}

/**
 * POST - Handle MCP JSON-RPC requests
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { account: accountSlug, collection: collectionSlug } = await params;

  try {
    // Verify authorization token
    const authHeader = request.headers.get("authorization");
    const baseUrl = getBaseUrl(request);
    const resourceUrl = `${baseUrl}/api/mcp/${accountSlug}/${collectionSlug}`;

    // WWW-Authenticate header for 401 responses (RFC 9728)
    const wwwAuthHeader = `Bearer resource="${resourceUrl}"`;

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32001, message: "Authorization required" },
        },
        {
          status: 401,
          headers: { "WWW-Authenticate": wwwAuthHeader }
        }
      );
    }

    const token = authHeader.slice(7);
    const tokenPayload = await verifyMCPAccessToken(token);

    if (!tokenPayload) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32001, message: "Invalid or expired token" },
        },
        {
          status: 401,
          headers: { "WWW-Authenticate": wwwAuthHeader }
        }
      );
    }

    // Verify token is for this collection
    if (tokenPayload.account_slug !== accountSlug || tokenPayload.collection_slug !== collectionSlug) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32001, message: "Token not valid for this collection" },
        },
        { status: 403 }
      );
    }

    // Get collection from database
    const ds = await getDataSource();
    const accountRepo = ds.getRepository(Account);
    const collectionRepo = ds.getRepository(SkillCollection);

    const account = await accountRepo.findOne({ where: { slug: accountSlug } });
    if (!account) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32002, message: "Account not found" },
        },
        { status: 404 }
      );
    }

    const collection = await collectionRepo.findOne({
      where: {
        accountId: account.id,
        slug: collectionSlug,
        archivedAt: undefined,
      },
    });

    if (!collection) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32002, message: "Collection not found" },
        },
        { status: 404 }
      );
    }

    // Parse request body
    const body = await request.json();
    const rpcRequest = parseJsonRpcRequest(body);

    // Create MCP context
    const ctx: MCPServerContext = {
      accountId: account.id,
      accountSlug: account.slug,
      collectionId: collection.id,
      collectionSlug: `${accountSlug}/${collectionSlug}`,
      userId: tokenPayload.sub,
      scope: tokenPayload.scope,
    };

    // Handle request
    const server = new MCPServer(ctx);
    const response = await server.handleRequest(rpcRequest);

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";

    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: JSON_RPC_ERRORS.INTERNAL_ERROR,
          message,
        },
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS - CORS preflight
 */
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
