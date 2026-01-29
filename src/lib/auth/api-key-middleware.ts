import { NextRequest, NextResponse } from "next/server";
import { withContext, RequestContext } from "@/lib/db/context";
import { getDataSource } from "@/lib/db/data-source";
import { ApiKey } from "@/entities/ApiKey";
import { ApiKeyScope, ApiKeyScopePermission } from "@/entities/ApiKeyScope";
import { createHash } from "crypto";

const API_KEY_PREFIX = "sk_";

export interface ApiKeyContext {
  apiKeyId: string;
  accountId: string;
  permissions: Map<string, ApiKeyScopePermission>; // collectionId -> permission
}

export interface ApiKeyAuthenticatedRequest extends NextRequest {
  apiKey: ApiKeyContext;
  context: RequestContext;
}

/**
 * Extract API key from request headers.
 * Supports X-API-Key header or Authorization: Bearer sk_...
 */
function extractApiKey(request: NextRequest): string | null {
  // Try X-API-Key header first
  const apiKeyHeader = request.headers.get("x-api-key");
  if (apiKeyHeader?.startsWith(API_KEY_PREFIX)) {
    return apiKeyHeader;
  }

  // Try Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token.startsWith(API_KEY_PREFIX)) {
      return token;
    }
  }

  return null;
}

/**
 * Hash an API key for validation.
 */
function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Validate API key and load permissions.
 */
async function validateApiKey(fullKey: string): Promise<{
  apiKey: ApiKey;
  scopes: ApiKeyScope[];
} | null> {
  if (!fullKey.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  const keyHash = hashKey(fullKey);
  const keyPrefix = fullKey.substring(0, 12);

  const ds = await getDataSource();
  const apiKeyRepo = ds.getRepository(ApiKey);
  const scopeRepo = ds.getRepository(ApiKeyScope);

  // Find API key by prefix and hash
  const apiKey = await apiKeyRepo
    .createQueryBuilder("key")
    .where("key.keyPrefix = :keyPrefix", { keyPrefix })
    .andWhere("key.keyHash = :keyHash", { keyHash })
    .andWhere("key.archivedAt IS NULL")
    .getOne();

  if (!apiKey) {
    return null;
  }

  // Check expiration
  if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
    return null;
  }

  // Load scopes
  const scopes = await scopeRepo.find({
    where: {
      apiKeyId: apiKey.id,
      accountId: apiKey.accountId,
    },
  });

  // Update last used timestamp (fire and forget)
  apiKeyRepo
    .createQueryBuilder()
    .update()
    .set({ lastUsedAt: new Date() })
    .where("id = :id", { id: apiKey.id })
    .execute()
    .catch(() => {}); // Ignore errors

  return { apiKey, scopes };
}

/**
 * Middleware to require API key authentication.
 * Use for API endpoints that should be accessible via API key.
 */
export function withApiKey<T>(
  handler: (
    request: ApiKeyAuthenticatedRequest,
    context: { params: Promise<T> }
  ) => Promise<NextResponse>
) {
  return async (
    request: NextRequest,
    context: { params: Promise<T> }
  ): Promise<NextResponse> => {
    const fullKey = extractApiKey(request);

    if (!fullKey) {
      return NextResponse.json(
        { error: "API key required" },
        { status: 401 }
      );
    }

    const result = await validateApiKey(fullKey);

    if (!result) {
      return NextResponse.json(
        { error: "Invalid or expired API key" },
        { status: 401 }
      );
    }

    const { apiKey, scopes } = result;

    // Build permissions map
    const permissions = new Map<string, ApiKeyScopePermission>();
    for (const scope of scopes) {
      permissions.set(scope.collectionId, scope.permission);
    }

    // Create authenticated request
    const authRequest = request as ApiKeyAuthenticatedRequest;
    authRequest.apiKey = {
      apiKeyId: apiKey.id,
      accountId: apiKey.accountId,
      permissions,
    };

    // Create request context (for use with services)
    const reqContext: RequestContext = {
      userId: apiKey.createdById, // API key creator is the "user"
      accountId: apiKey.accountId,
      email: "", // No email for API key auth
    };
    authRequest.context = reqContext;

    // Run handler with context
    return withContext(reqContext, () => handler(authRequest, context));
  };
}

/**
 * Check if API key has permission for a collection.
 */
export function hasPermission(
  apiKeyContext: ApiKeyContext,
  collectionId: string,
  requiredPermission: ApiKeyScopePermission
): boolean {
  const permission = apiKeyContext.permissions.get(collectionId);

  if (!permission) {
    return false;
  }

  // Permission hierarchy: write > contribute > read
  switch (requiredPermission) {
    case "read":
      return true; // All permissions include read
    case "contribute":
      return permission === "contribute" || permission === "write";
    case "write":
      return permission === "write";
    default:
      return false;
  }
}

/**
 * Middleware to check collection permission.
 * Use after withApiKey to verify access to a specific collection.
 */
export function requireCollectionPermission(
  collectionIdExtractor: (request: NextRequest, params: unknown) => string | Promise<string>,
  requiredPermission: ApiKeyScopePermission
) {
  return <T>(
    handler: (
      request: ApiKeyAuthenticatedRequest,
      context: { params: Promise<T> }
    ) => Promise<NextResponse>
  ) => {
    return async (
      request: ApiKeyAuthenticatedRequest,
      context: { params: Promise<T> }
    ): Promise<NextResponse> => {
      const params = await context.params;
      const collectionId = await collectionIdExtractor(request, params);

      if (!hasPermission(request.apiKey, collectionId, requiredPermission)) {
        return NextResponse.json(
          {
            error: `Insufficient permissions. Requires '${requiredPermission}' access to collection.`,
          },
          { status: 403 }
        );
      }

      return handler(request, context);
    };
  };
}

/**
 * Combined middleware: API key auth + collection permission check.
 */
export function withApiKeyAndPermission<T>(
  collectionIdExtractor: (request: NextRequest, params: T) => string | Promise<string>,
  requiredPermission: ApiKeyScopePermission,
  handler: (
    request: ApiKeyAuthenticatedRequest,
    context: { params: Promise<T> }
  ) => Promise<NextResponse>
) {
  return withApiKey<T>(async (request, context) => {
    const params = await context.params;
    const collectionId = await collectionIdExtractor(request, params);

    if (!hasPermission(request.apiKey, collectionId, requiredPermission)) {
      return NextResponse.json(
        {
          error: `Insufficient permissions. Requires '${requiredPermission}' access to collection.`,
        },
        { status: 403 }
      );
    }

    return handler(request, context);
  });
}
