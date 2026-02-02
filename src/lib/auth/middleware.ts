import { NextRequest, NextResponse } from "next/server";
import { verifyToken, generateAccessToken, TokenPayload, shouldRefreshToken } from "./jwt";
import { withContext, RequestContext } from "@/lib/db/context";
import { authService } from "@/services/auth.service";
import { getDataSource } from "@/lib/db/data-source";
import { ApiKey } from "@/entities/ApiKey";
import { createHash } from "crypto";

const API_KEY_PREFIX = "sk_";

export interface AuthenticatedRequest extends NextRequest {
  user: TokenPayload;
  context: RequestContext;
}

/**
 * Extract token from Authorization header or cookie
 */
function extractToken(request: NextRequest): string | null {
  // Try Authorization header first
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Try cookie
  const token = request.cookies.get("access_token")?.value;
  return token || null;
}

/**
 * Extract API key from request headers
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
 * Hash an API key for validation
 */
function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Validate API key and return token payload
 */
async function validateApiKeyAuth(fullKey: string): Promise<TokenPayload | null> {
  if (!fullKey.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  const keyHash = hashKey(fullKey);
  const keyPrefix = fullKey.substring(0, 12);

  const ds = await getDataSource();
  const apiKeyRepo = ds.getRepository(ApiKey);

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

  // Get the user who created the API key
  const user = await authService.getUserById(apiKey.createdById);
  if (!user) {
    return null;
  }

  // Update last used timestamp (fire and forget)
  apiKeyRepo
    .createQueryBuilder()
    .update()
    .set({ lastUsedAt: new Date() })
    .where("id = :id", { id: apiKey.id })
    .execute()
    .catch(() => {}); // Ignore errors

  // Return a token payload for compatibility
  return {
    userId: apiKey.createdById,
    email: user.email,
    accountId: apiKey.accountId,
    type: "access",
  };
}

/**
 * Extract refresh token from cookie
 */
function extractRefreshToken(request: NextRequest): string | null {
  return request.cookies.get("refresh_token")?.value || null;
}

/**
 * Try to refresh the access token using the refresh token
 */
async function tryRefreshToken(
  request: NextRequest
): Promise<{ payload: TokenPayload; newAccessToken: string } | null> {
  const refreshToken = extractRefreshToken(request);
  if (!refreshToken) return null;

  const refreshPayload = await verifyToken(refreshToken);
  if (!refreshPayload || refreshPayload.type !== "refresh") return null;

  // Get user to ensure they still exist
  const user = await authService.getUserById(refreshPayload.userId);
  if (!user) return null;

  // Get user's accounts
  const accounts = await authService.getUserAccounts(refreshPayload.userId);
  const account = accounts[0];

  // Generate new access token
  const newAccessToken = await generateAccessToken({
    userId: user.id,
    email: user.email,
    accountId: account?.id,
  });

  // Return the payload for the new token
  const newPayload: TokenPayload = {
    userId: user.id,
    email: user.email,
    accountId: account?.id,
    type: "access",
  };

  return { payload: newPayload, newAccessToken };
}

/**
 * Middleware to require authentication
 * Supports both JWT tokens and API keys (sk_...)
 * Automatically refreshes access token if expired but refresh token is valid
 */
export function withAuth<T>(
  handler: (
    request: AuthenticatedRequest,
    context: { params: Promise<T> }
  ) => Promise<NextResponse>
) {
  return async (
    request: NextRequest,
    context: { params: Promise<T> }
  ): Promise<NextResponse> => {
    let payload: TokenPayload | null = null;
    let newAccessToken: string | null = null;

    // First, check for API key authentication
    const apiKey = extractApiKey(request);
    if (apiKey) {
      payload = await validateApiKeyAuth(apiKey);
    }

    // If no API key or invalid, try JWT token
    if (!payload) {
      const token = extractToken(request);

      // Try to verify existing access token
      if (token && !token.startsWith(API_KEY_PREFIX)) {
        payload = await verifyToken(token);
        if (payload && payload.type !== "access") {
          payload = null;
        }

        // Proactively refresh token if it's older than 2 hours (but still valid)
        if (payload && shouldRefreshToken(payload)) {
          const refreshResult = await tryRefreshToken(request);
          if (refreshResult) {
            payload = refreshResult.payload;
            newAccessToken = refreshResult.newAccessToken;
          }
        }
      }

      // If access token is invalid/expired, try to refresh
      if (!payload) {
        const refreshResult = await tryRefreshToken(request);
        if (refreshResult) {
          payload = refreshResult.payload;
          newAccessToken = refreshResult.newAccessToken;
        }
      }
    }

    // If still no valid token, return 401
    if (!payload) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Create authenticated request
    const authRequest = request as AuthenticatedRequest;
    authRequest.user = payload;

    // Create request context
    const reqContext: RequestContext = {
      userId: payload.userId,
      accountId: payload.accountId || payload.userId,
      email: payload.email,
    };
    authRequest.context = reqContext;

    // Run handler with context
    const response = await withContext(reqContext, () =>
      handler(authRequest, context)
    );

    // If we refreshed the token, set the new cookie
    if (newAccessToken) {
      response.cookies.set("access_token", newAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60, // 24 hours
        path: "/",
      });
    }

    return response;
  };
}

/**
 * Middleware for optional authentication
 * Supports both JWT tokens and API keys (sk_...)
 * Automatically refreshes access token if expired but refresh token is valid
 */
export function withOptionalAuth<T>(
  handler: (
    request: NextRequest & { user?: TokenPayload; context?: RequestContext },
    context: { params: Promise<T> }
  ) => Promise<NextResponse>
) {
  return async (
    request: NextRequest,
    context: { params: Promise<T> }
  ): Promise<NextResponse> => {
    let payload: TokenPayload | null = null;
    let newAccessToken: string | null = null;

    // First, check for API key authentication
    const apiKey = extractApiKey(request);
    if (apiKey) {
      payload = await validateApiKeyAuth(apiKey);
    }

    // If no API key or invalid, try JWT token
    if (!payload) {
      const token = extractToken(request);

      // Try to verify existing access token
      if (token && !token.startsWith(API_KEY_PREFIX)) {
        payload = await verifyToken(token);
        if (payload && payload.type !== "access") {
          payload = null;
        }

        // Proactively refresh token if it's older than 2 hours (but still valid)
        if (payload && shouldRefreshToken(payload)) {
          const refreshResult = await tryRefreshToken(request);
          if (refreshResult) {
            payload = refreshResult.payload;
            newAccessToken = refreshResult.newAccessToken;
          }
        }
      }

      // If access token is invalid/expired, try to refresh
      if (!payload) {
        const refreshResult = await tryRefreshToken(request);
        if (refreshResult) {
          payload = refreshResult.payload;
          newAccessToken = refreshResult.newAccessToken;
        }
      }
    }

    const authRequest = request as NextRequest & {
      user?: TokenPayload;
      context?: RequestContext;
    };

    if (payload) {
      authRequest.user = payload;
      authRequest.context = {
        userId: payload.userId,
        accountId: payload.accountId || payload.userId,
        email: payload.email,
      };

      const response = await withContext(authRequest.context, () =>
        handler(authRequest, context)
      );

      // If we refreshed the token, set the new cookie
      if (newAccessToken) {
        response.cookies.set("access_token", newAccessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 24 * 60 * 60, // 24 hours
          path: "/",
        });
      }

      return response;
    }

    return handler(authRequest, context);
  };
}
