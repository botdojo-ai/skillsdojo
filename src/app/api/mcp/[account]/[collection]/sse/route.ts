/**
 * MCP Server Endpoint (SSE Transport)
 * GET /api/mcp/[account]/[collection]/sse
 *
 * Server-Sent Events transport for MCP protocol
 */

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getDataSource } from "@/lib/db/data-source";
import { SkillCollection } from "@/entities/SkillCollection";
import { Account } from "@/entities/Account";
import {
  MCPServer,
  parseJsonRpcRequest,
  verifyMCPAccessToken,
  formatSseMessage,
  MCPServerContext,
  getBaseUrl,
} from "@/lib/mcp";

interface RouteParams {
  account: string;
  collection: string;
}

/**
 * GET - Establish SSE connection for MCP
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { account: accountSlug, collection: collectionSlug } = await params;

  // Verify authorization token
  const authHeader = request.headers.get("authorization");
  const tokenParam = request.nextUrl.searchParams.get("token");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : tokenParam;

  const baseUrl = getBaseUrl(request);
  const resourceUrl = `${baseUrl}/api/mcp/${accountSlug}/${collectionSlug}`;
  const wwwAuthHeader = `Bearer resource="${resourceUrl}"`;

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Authorization required" }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "WWW-Authenticate": wwwAuthHeader,
        },
      }
    );
  }

  const tokenPayload = await verifyMCPAccessToken(token);

  if (!tokenPayload) {
    return new Response(
      JSON.stringify({ error: "Invalid or expired token" }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "WWW-Authenticate": wwwAuthHeader,
        },
      }
    );
  }

  // Verify token is for this collection
  if (tokenPayload.collection_slug !== `${accountSlug}/${collectionSlug}`) {
    return new Response(
      JSON.stringify({ error: "Token not valid for this collection" }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Get collection from database
  const ds = await getDataSource();
  const accountRepo = ds.getRepository(Account);
  const collectionRepo = ds.getRepository(SkillCollection);

  const account = await accountRepo.findOne({ where: { slug: accountSlug } });
  if (!account) {
    return new Response(
      JSON.stringify({ error: "Account not found" }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }
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
    return new Response(
      JSON.stringify({ error: "Collection not found" }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Create MCP context
  const ctx: MCPServerContext = {
    accountId: account.id,
    accountSlug: account.slug,
    collectionId: collection.id,
    collectionSlug: `${accountSlug}/${collectionSlug}`,
    userId: tokenPayload.sub,
    scope: tokenPayload.scope,
  };

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send initial endpoint message
      const endpointMessage = {
        jsonrpc: "2.0",
        method: "notifications/message",
        params: {
          endpoint: request.url.replace("/sse", ""),
        },
      };
      controller.enqueue(encoder.encode(formatSseMessage(endpointMessage)));

      // Keep connection alive with periodic pings
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(pingInterval);
        }
      }, 30000);

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        clearInterval(pingInterval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * POST - Handle MCP requests over SSE connection
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { account: accountSlug, collection: collectionSlug } = await params;

  const baseUrl = getBaseUrl(request);
  const resourceUrl = `${baseUrl}/api/mcp/${accountSlug}/${collectionSlug}`;
  const wwwAuthHeader = `Bearer resource="${resourceUrl}"`;

  try {
    // Verify authorization token
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            "WWW-Authenticate": wwwAuthHeader,
          },
        }
      );
    }

    const token = authHeader.slice(7);
    const tokenPayload = await verifyMCPAccessToken(token);

    if (!tokenPayload) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            "WWW-Authenticate": wwwAuthHeader,
          },
        }
      );
    }

    // Verify token is for this collection
    if (tokenPayload.collection_slug !== `${accountSlug}/${collectionSlug}`) {
      return new Response(
        JSON.stringify({ error: "Token not valid for this collection" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Get collection from database
    const ds = await getDataSource();
    const accountRepo = ds.getRepository(Account);
    const collectionRepo = ds.getRepository(SkillCollection);

    const account = await accountRepo.findOne({ where: { slug: accountSlug } });
    if (!account) {
      return new Response(
        JSON.stringify({ error: "Account not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
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
      return new Response(
        JSON.stringify({ error: "Collection not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
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

    return new Response(JSON.stringify(response), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";

    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message },
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * OPTIONS - CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
