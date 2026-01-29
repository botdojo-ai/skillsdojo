/**
 * API Route: /api/mcp-app/[name]
 *
 * Serves MCP App HTML for use in Claude Desktop and other MCP clients.
 *
 * Usage:
 *   GET /api/mcp-app/skill-editor?account=paul&collection=personal
 *   GET /api/mcp-app/pr-viewer?account=paul&collection=personal
 *   GET /api/mcp-app/collection-browser?account=paul&collection=personal
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSkillEditorHtml } from "@/lib/mcp/apps/skill-editor";
import { getPrViewerHtml } from "@/lib/mcp/apps/pr-viewer";
import { getCollectionBrowserHtml } from "@/lib/mcp/apps/collection-browser";
import { MCPServerContext } from "@/lib/mcp/types";

const VALID_APPS = ["skill-editor", "pr-viewer", "collection-browser"] as const;
type ValidAppName = (typeof VALID_APPS)[number];

interface RouteParams {
  name: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { name } = await params;
  const searchParams = request.nextUrl.searchParams;

  // Validate app name
  if (!VALID_APPS.includes(name as ValidAppName)) {
    return NextResponse.json(
      {
        error: "MCP App not found",
        validApps: VALID_APPS,
      },
      { status: 404 }
    );
  }

  // Get context from query params
  const accountSlug = searchParams.get("account") || "";
  const collectionSlug = searchParams.get("collection") || "";
  const accountId = searchParams.get("account_id") || "";
  const collectionId = searchParams.get("collection_id") || "";
  const userId = searchParams.get("user_id") || "";
  const scope = searchParams.get("scope") || "read";

  const ctx: MCPServerContext = {
    accountId,
    accountSlug,
    collectionId,
    collectionSlug,
    userId,
    scope,
  };

  let html: string;

  switch (name as ValidAppName) {
    case "skill-editor":
      html = getSkillEditorHtml(ctx);
      break;
    case "pr-viewer":
      html = getPrViewerHtml(ctx);
      break;
    case "collection-browser":
      html = getCollectionBrowserHtml(ctx);
      break;
    default:
      return NextResponse.json({ error: "Unknown app" }, { status: 404 });
  }

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
