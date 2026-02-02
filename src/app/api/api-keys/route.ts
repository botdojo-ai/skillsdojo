export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/middleware";
import { getApiKeyService } from "@/services/api-key.service";

/**
 * GET /api/api-keys
 * List all API keys for the current account.
 */
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const collectionId = url.searchParams.get("collectionId") || undefined;

    const service = await getApiKeyService(request.context);
    const result = await service.listApiKeys({ page, limit, collectionId });

    // Remove sensitive fields from response
    const safeItems = result.items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      keyPrefix: item.keyPrefix,
      expiresAt: item.expiresAt,
      lastUsedAt: item.lastUsedAt,
      createdAt: item.createdAt,
      modifiedAt: item.modifiedAt,
    }));

    return NextResponse.json({
      ...result,
      items: safeItems,
    });
  } catch (error) {
    console.error("Error listing API keys:", error);
    return NextResponse.json(
      { error: "Failed to list API keys" },
      { status: 500 }
    );
  }
});

/**
 * POST /api/api-keys
 * Create a new API key.
 */
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    if (body.name.length < 1 || body.name.length > 100) {
      return NextResponse.json(
        { error: "Name must be between 1 and 100 characters" },
        { status: 400 }
      );
    }

    // Validate scopes if provided
    if (body.scopes) {
      if (!Array.isArray(body.scopes)) {
        return NextResponse.json(
          { error: "Scopes must be an array" },
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
    }

    // Parse expiration date if provided
    let expiresAt: Date | undefined;
    if (body.expiresAt) {
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

    const service = await getApiKeyService(request.context);
    const { apiKey, fullKey } = await service.createApiKey({
      name: body.name.trim(),
      description: body.description?.trim() || undefined,
      expiresAt,
      scopes: body.scopes,
    });

    // Return the full key (only shown once)
    return NextResponse.json(
      {
        id: apiKey.id,
        name: apiKey.name,
        description: apiKey.description,
        keyPrefix: apiKey.keyPrefix,
        key: fullKey, // Only returned on creation
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating API key:", error);
    const message = error instanceof Error ? error.message : "Failed to create API key";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
