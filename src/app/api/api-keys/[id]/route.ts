import { NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/middleware";
import { getApiKeyService } from "@/services/api-key.service";

interface RouteParams {
  id: string;
}

/**
 * GET /api/api-keys/[id]
 * Get a single API key with its scopes.
 */
export const GET = withAuth(
  async (
    request: AuthenticatedRequest,
    { params }: { params: Promise<RouteParams> }
  ) => {
    try {
      const { id } = await params;
      const service = await getApiKeyService(request.context);
      const apiKey = await service.findByIdWithScopes(id);

      if (!apiKey) {
        return NextResponse.json(
          { error: "API key not found" },
          { status: 404 }
        );
      }

      // Return safe response
      return NextResponse.json({
        id: apiKey.id,
        name: apiKey.name,
        description: apiKey.description,
        keyPrefix: apiKey.keyPrefix,
        expiresAt: apiKey.expiresAt,
        lastUsedAt: apiKey.lastUsedAt,
        createdAt: apiKey.createdAt,
        modifiedAt: apiKey.modifiedAt,
        scopes: apiKey.scopes.map((scope) => ({
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
      console.error("Error getting API key:", error);
      return NextResponse.json(
        { error: "Failed to get API key" },
        { status: 500 }
      );
    }
  }
);

/**
 * PATCH /api/api-keys/[id]
 * Update an API key.
 */
export const PATCH = withAuth(
  async (
    request: AuthenticatedRequest,
    { params }: { params: Promise<RouteParams> }
  ) => {
    try {
      const { id } = await params;
      const body = await request.json();

      // Validate name if provided
      if (body.name !== undefined) {
        if (typeof body.name !== "string" || body.name.length < 1 || body.name.length > 100) {
          return NextResponse.json(
            { error: "Name must be between 1 and 100 characters" },
            { status: 400 }
          );
        }
      }

      // Parse expiration date if provided
      let expiresAt: Date | null | undefined;
      if (body.expiresAt !== undefined) {
        if (body.expiresAt === null) {
          expiresAt = null;
        } else {
          expiresAt = new Date(body.expiresAt);
          if (isNaN(expiresAt.getTime())) {
            return NextResponse.json(
              { error: "Invalid expiration date" },
              { status: 400 }
            );
          }
          if (expiresAt <= new Date()) {
            return NextResponse.json(
              { error: "Expiration date must be in the future" },
              { status: 400 }
            );
          }
        }
      }

      const service = await getApiKeyService(request.context);
      const apiKey = await service.updateApiKey(id, {
        name: body.name?.trim(),
        description: body.description !== undefined ? body.description?.trim() || null : undefined,
        expiresAt,
      });

      if (!apiKey) {
        return NextResponse.json(
          { error: "API key not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        id: apiKey.id,
        name: apiKey.name,
        description: apiKey.description,
        keyPrefix: apiKey.keyPrefix,
        expiresAt: apiKey.expiresAt,
        lastUsedAt: apiKey.lastUsedAt,
        createdAt: apiKey.createdAt,
        modifiedAt: apiKey.modifiedAt,
      });
    } catch (error) {
      console.error("Error updating API key:", error);
      return NextResponse.json(
        { error: "Failed to update API key" },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/api-keys/[id]
 * Delete (archive) an API key.
 */
export const DELETE = withAuth(
  async (
    request: AuthenticatedRequest,
    { params }: { params: Promise<RouteParams> }
  ) => {
    try {
      const { id } = await params;
      const service = await getApiKeyService(request.context);
      const deleted = await service.deleteApiKey(id);

      if (!deleted) {
        return NextResponse.json(
          { error: "API key not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error("Error deleting API key:", error);
      return NextResponse.json(
        { error: "Failed to delete API key" },
        { status: 500 }
      );
    }
  }
);
