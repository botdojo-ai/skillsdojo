/**
 * MCP OAuth 2.1 Implementation
 * Based on RFC 9728 (Protected Resource Discovery) and RFC 7591 (Dynamic Client Registration)
 */

import { SignJWT, jwtVerify } from "jose";
import { v4 as uuidv4 } from "uuid";
import {
  MCPTokenPayload,
  ProtectedResourceMetadata,
  OAuthServerMetadata,
  DynamicClientRegistrationRequest,
  DynamicClientRegistrationResponse,
  TokenRequest,
  TokenResponse,
  AuthCodeData,
} from "./types";

// ============================================================================
// Configuration
// ============================================================================

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "development-secret-change-in-production"
);
const JWT_ISSUER = process.env.MCP_OAUTH_ISSUER || "https://skillsdojo.ai";
const JWT_AUDIENCE = "skillsdojo.ai";

// Token expiration times
const MCP_ACCESS_TOKEN_EXPIRY = 24 * 60 * 60; // 24 hours in seconds
const AUTH_CODE_EXPIRY = 5 * 60; // 5 minutes in seconds

// Token version - increment this to invalidate all existing tokens and force re-auth
const TOKEN_VERSION = 2;

// ============================================================================
// Helper Functions
// ============================================================================

export function getBaseUrl(request: Request): string {
  const url = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const protocol = forwardedProto || url.protocol.replace(":", "");
  const host = request.headers.get("host") || url.host;
  return `${protocol}://${host}`;
}

function buildMcpServerUrl(baseUrl: string, accountSlug: string, collectionSlug: string): string {
  return `${baseUrl}/api/mcp/${accountSlug}/${collectionSlug}`;
}

// ============================================================================
// Protected Resource Metadata (RFC 9728)
// ============================================================================

export function buildProtectedResourceMetadata(
  baseUrl: string,
  accountSlug: string,
  collectionSlug: string
): ProtectedResourceMetadata {
  const resource = buildMcpServerUrl(baseUrl, accountSlug, collectionSlug);

  return {
    resource,
    // Point to the MCP endpoint URL so OAuth metadata can be discovered at
    // {authorization_server}/.well-known/oauth-authorization-server
    authorization_servers: [resource],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://skillsdojo.ai/docs/mcp",
  };
}

// ============================================================================
// OAuth Server Metadata Discovery
// ============================================================================

export function buildOAuthServerMetadata(
  baseUrl: string,
  accountSlug?: string,
  collectionSlug?: string
): OAuthServerMetadata {
  // If account/collection provided, use collection-specific endpoints
  const endpointBase = accountSlug && collectionSlug
    ? `${baseUrl}/api/mcp/${accountSlug}/${collectionSlug}`
    : `${baseUrl}/api/mcp`;

  return {
    issuer: JWT_ISSUER,
    authorization_endpoint: `${endpointBase}/oauth/authorize`,
    token_endpoint: `${endpointBase}/oauth/token`,
    registration_endpoint: `${endpointBase}/oauth/register`,
    jwks_uri: `${baseUrl}/.well-known/jwks.json`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    code_challenge_methods_supported: ["S256", "plain"],
    scopes_supported: ["read", "contribute", "write", "admin"],
  };
}

// ============================================================================
// Dynamic Client Registration (RFC 7591)
// ============================================================================

export function handleDynamicClientRegistration(
  request: DynamicClientRegistrationRequest
): DynamicClientRegistrationResponse {
  const clientId = `mcp_client_${uuidv4()}`;

  // Generate client secret if requested
  let clientSecret: string | undefined;
  let clientSecretExpiresAt: number | undefined;

  if (
    request.token_endpoint_auth_method === "client_secret_post" ||
    request.token_endpoint_auth_method === "client_secret_basic"
  ) {
    clientSecret = uuidv4();
    clientSecretExpiresAt = 0; // Never expires
  }

  const response: DynamicClientRegistrationResponse = {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: request.client_name || "MCP Client",
    redirect_uris: request.redirect_uris || [],
    grant_types: request.grant_types || ["authorization_code"],
    response_types: request.response_types || ["code"],
    token_endpoint_auth_method: request.token_endpoint_auth_method || "none",
    scope: request.scope || "read",
  };

  if (clientSecret) {
    response.client_secret = clientSecret;
    response.client_secret_expires_at = clientSecretExpiresAt;
  }

  return response;
}

// ============================================================================
// Authorization Code Management (JWT-based, no storage needed)
// ============================================================================

/**
 * Generate a JWT-based authorization code.
 * The code is self-contained and doesn't require storage.
 */
export async function generateAuthCode(data: Omit<AuthCodeData, "created_at">): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    type: "oauth_auth_code",
    ...data,
    created_at: now,
    iat: now,
    exp: now + AUTH_CODE_EXPIRY,
  };

  const code = await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(now + AUTH_CODE_EXPIRY)
    .sign(JWT_SECRET);

  return code;
}

/**
 * Verify and decode a JWT-based authorization code.
 * Returns the auth code data if valid, null otherwise.
 */
export async function consumeAuthCode(code: string): Promise<AuthCodeData | null> {
  try {
    const { payload } = await jwtVerify(code, JWT_SECRET);

    // Validate it's an auth code
    if ((payload as Record<string, unknown>).type !== "oauth_auth_code") {
      return null;
    }

    // Note: JWT-based codes can technically be used multiple times within
    // their short expiry window. For most use cases this is acceptable
    // because PKCE provides additional protection. For stricter single-use
    // enforcement, a database or cache would be needed.

    return {
      owner_uid: payload.owner_uid as string,
      account_id: payload.account_id as string,
      account_slug: payload.account_slug as string,
      collection_id: payload.collection_id as string,
      collection_slug: payload.collection_slug as string,
      scope: payload.scope as string,
      client_id: payload.client_id as string | undefined,
      redirect_uri: payload.redirect_uri as string | undefined,
      code_challenge: payload.code_challenge as string | undefined,
      code_challenge_method: payload.code_challenge_method as string | undefined,
      created_at: payload.created_at as number,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// PKCE Verification
// ============================================================================

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function verifyCodeChallenge(
  codeVerifier: string,
  codeChallenge: string,
  method: string = "S256"
): Promise<boolean> {
  if (method === "plain") {
    return codeVerifier === codeChallenge;
  }

  if (method === "S256") {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const computed = base64UrlEncode(hash);
    return computed === codeChallenge;
  }

  return false;
}

// ============================================================================
// Token Generation
// ============================================================================

export async function generateMCPAccessToken(payload: {
  userId: string;
  accountId: string;
  accountSlug: string;
  collectionId: string;
  collectionSlug: string;
  scope: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const tokenPayload: MCPTokenPayload = {
    sub: payload.userId,
    account_id: payload.accountId,
    account_slug: payload.accountSlug,
    collection_id: payload.collectionId,
    collection_slug: payload.collectionSlug,
    scope: payload.scope,
    type: "mcp_access",
    version: TOKEN_VERSION,
    iat: now,
    exp: now + MCP_ACCESS_TOKEN_EXPIRY,
  };

  const token = await new SignJWT(tokenPayload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(now + MCP_ACCESS_TOKEN_EXPIRY)
    .sign(JWT_SECRET);

  return `mcp_${token}`;
}

export async function verifyMCPAccessToken(token: string): Promise<MCPTokenPayload | null> {
  try {
    // Remove mcp_ prefix if present
    const jwtToken = token.startsWith("mcp_") ? token.slice(4) : token;

    const { payload } = await jwtVerify(jwtToken, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    const mcpPayload = payload as unknown as MCPTokenPayload;

    // Validate it's an MCP access token
    if (mcpPayload.type !== "mcp_access") {
      return null;
    }

    // Check token version - reject tokens from older versions to force re-auth
    if (!mcpPayload.version || mcpPayload.version < TOKEN_VERSION) {
      return null;
    }

    return mcpPayload;
  } catch {
    return null;
  }
}

// ============================================================================
// Token Exchange (Authorization Code -> Access Token)
// ============================================================================

export async function handleTokenExchange(
  request: TokenRequest,
  authCodeData: AuthCodeData
): Promise<TokenResponse> {
  // Verify PKCE if code_challenge was provided
  if (authCodeData.code_challenge && request.code_verifier) {
    const valid = await verifyCodeChallenge(
      request.code_verifier,
      authCodeData.code_challenge,
      authCodeData.code_challenge_method
    );
    if (!valid) {
      throw new Error("Invalid code_verifier");
    }
  }

  // Verify redirect_uri matches
  if (authCodeData.redirect_uri && request.redirect_uri !== authCodeData.redirect_uri) {
    throw new Error("redirect_uri mismatch");
  }

  // Generate access token
  const accessToken = await generateMCPAccessToken({
    userId: authCodeData.owner_uid,
    accountId: authCodeData.account_id,
    accountSlug: authCodeData.account_slug,
    collectionId: authCodeData.collection_id,
    collectionSlug: authCodeData.collection_slug,
    scope: authCodeData.scope,
  });

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: MCP_ACCESS_TOKEN_EXPIRY,
    scope: authCodeData.scope,
  };
}

// ============================================================================
// Authorization URL Builder
// ============================================================================

export function buildAuthorizationUrl(
  baseUrl: string,
  accountSlug: string,
  collectionSlug: string,
  params: {
    redirect_uri?: string;
    client_id?: string;
    state?: string;
    code_challenge?: string;
    code_challenge_method?: string;
    scope?: string;
  }
): string {
  const consentUrl = new URL(`${baseUrl}/mcp/oauth/${accountSlug}/${collectionSlug}/consent`);

  if (params.redirect_uri) consentUrl.searchParams.set("redirect_uri", params.redirect_uri);
  if (params.client_id) consentUrl.searchParams.set("client_id", params.client_id);
  if (params.state) consentUrl.searchParams.set("state", params.state);
  if (params.code_challenge) consentUrl.searchParams.set("code_challenge", params.code_challenge);
  if (params.code_challenge_method) consentUrl.searchParams.set("code_challenge_method", params.code_challenge_method);
  if (params.scope) consentUrl.searchParams.set("scope", params.scope);

  // API base for code completion
  consentUrl.searchParams.set("api_base", baseUrl);

  return consentUrl.toString();
}
