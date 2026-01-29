export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/middleware";
import { getApiKeyService } from "@/services/api-key.service";

interface RouteParams {
  id: string;
}

/**
 * GET /api/api-keys/[id]/scopes
 * Get all scopes for an API key.
 */
export const GET = withAuth(
  async (
    request: AuthenticatedRequest,
    { params }: { params: Promise<RouteParams> }
  ) => {
    try {
      const { id } = await params;
      const service = await getApiKeyService(request.context);

      // Verify API key exists
      const apiKey = await service.findById(id);
      if (!apiKey) {
        return NextResponse.json(
          { error: "API key not found" },
          { status: 404 }
        );
      }

      const scopes = await service.getScopes(id);

      return NextResponse.json({
        scopes: scopes.map((scope) => ({
          id: scope.id,
          collectionId: scope.collectionId,
          permission: scope.permission,
          collection: scope.collection
            ? {
                id: scope.collection.id,
                slug: scope.collection.slug,
                name: scope.collection.name,
              }
            : null,
        })),
      });
    } catch (error) {
      console.error("Error getting API key scopes:", error);
      return NextResponse.json(
        { error: "Failed to get API key scopes" },
        { status: 500 }
      );
    }
  }
);

/**
 * PUT /api/api-keys/[id]/scopes
 * Replace all scopes for an API key.
 */
export const PUT = withAuth(
  async (
    request: AuthenticatedRequest,
    { params }: { params: Promise<RouteParams> }
  ) => {
    try {
      const { id } = await params;
      const body = await request.json();

      // Validate scopes
      if (!body.scopes || !Array.isArray(body.scopes)) {
        return NextResponse.json(
          { error: "Scopes array is required" },
          { status: 400 }
        );
      }

      for (const scope of body.scopes) {
        if (!scope.collectionId || typeof scope.collectionId !== "string") {
          return NextResponse.json(
            { error: "Each scope must have a collectionId" },
            { status: 400 }
          );
        }

        if (!["read", "write", "contribute"].includes(scope.permission)) {
          return NextResponse.json(
            { error: "Permission must be 'read', 'write', or 'contribute'" },
            { status: 400 }
          );
        }
      }

      const service = await getApiKeyService(request.context);

      // Verify API key exists
      const apiKey = await service.findById(id);
      if (!apiKey) {
        return NextResponse.json(
          { error: "API key not found" },
          { status: 404 }
        );
      }

      await service.setScopes(id, body.scopes);
      const scopes = await service.getScopes(id);

      return NextResponse.json({
        scopes: scopes.map((scope) => ({
          id: scope.id,
          collectionId: scope.collectionId,
          permission: scope.permission,
          collection: scope.collection
            ? {
                id: scope.collection.id,
                slug: scope.collection.slug,
                name: scope.collection.name,
              }
            : null,
        })),
      });
    } catch (error) {
      console.error("Error updating API key scopes:", error);
      const message = error instanceof Error ? error.message : "Failed to update scopes";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
);

/**
 * POST /api/api-keys/[id]/scopes
 * Add a scope to an API key.
 */
export const POST = withAuth(
  async (
    request: AuthenticatedRequest,
    { params }: { params: Promise<RouteParams> }
  ) => {
    try {
      const { id } = await params;
      const body = await request.json();

      // Validate scope
      if (!body.collectionId || typeof body.collectionId !== "string") {
        return NextResponse.json(
          { error: "collectionId is required" },
          { status: 400 }
        );
      }

      if (!["read", "write", "contribute"].includes(body.permission)) {
        return NextResponse.json(
          { error: "Permission must be 'read', 'write', or 'contribute'" },
          { status: 400 }
        );
      }

      const service = await getApiKeyService(request.context);
      const scope = await service.addScope(id, {
        collectionId: body.collectionId,
        permission: body.permission,
      });

      return NextResponse.json({
        id: scope.id,
        collectionId: scope.collectionId,
        permission: scope.permission,
      }, { status: 201 });
    } catch (error) {
      console.error("Error adding API key scope:", error);
      const message = error instanceof Error ? error.message : "Failed to add scope";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
);

/**
 * DELETE /api/api-keys/[id]/scopes
 * Remove a scope from an API key.
 */
export const DELETE = withAuth(
  async (
    request: AuthenticatedRequest,
    { params }: { params: Promise<RouteParams> }
  ) => {
    try {
      const { id } = await params;
      const url = new URL(request.url);
      const collectionId = url.searchParams.get("collectionId");

      if (!collectionId) {
        return NextResponse.json(
          { error: "collectionId query parameter is required" },
          { status: 400 }
        );
      }

      const service = await getApiKeyService(request.context);
      const deleted = await service.removeScope(id, collectionId);

      if (!deleted) {
        return NextResponse.json(
          { error: "Scope not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error("Error removing API key scope:", error);
      return NextResponse.json(
        { error: "Failed to remove scope" },
        { status: 500 }
      );
    }
  }
);
