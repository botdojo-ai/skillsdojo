/**
 * MCP Server Types for Skills-Dojo
 * Based on MCP Specification 2025-11-25
 */

import { JWTPayload } from "jose";

// ============================================================================
// MCP Protocol Types
// ============================================================================

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// Standard JSON-RPC error codes
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

// ============================================================================
// MCP Server Metadata
// ============================================================================

export interface ServerInfo {
  name: string;
  version: string;
}

export interface ServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: Record<string, never>;
}

export interface InitializeParams {
  protocolVersion: string;
  capabilities: ClientCapabilities;
  clientInfo: ClientInfo;
}

export interface ClientInfo {
  name: string;
  version: string;
}

export interface ClientCapabilities {
  roots?: { listChanged?: boolean };
  sampling?: Record<string, never>;
}

export interface InitializeResult {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: ServerInfo;
}

// ============================================================================
// MCP Tools
// ============================================================================

export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  _meta?: {
    ui?: {
      resourceUri?: string; // Link to MCP App UI resource
      visibility?: Array<"model" | "app">; // Who can see/use this tool
    };
  };
}

export interface ListToolsResult {
  tools: Tool[];
}

export interface CallToolParams {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface CallToolResult {
  content: ToolResultContent[];
  isError?: boolean;
}

export type ToolResultContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; resource: ResourceContent };

// ============================================================================
// MCP Resources
// ============================================================================

export interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceTemplate {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface ListResourcesResult {
  resources: Resource[];
  resourceTemplates?: ResourceTemplate[];
}

export interface ReadResourceParams {
  uri: string;
}

export interface ReadResourceResult {
  contents: ResourceContent[];
}

export interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string; // base64 encoded
  _meta?: {
    ui?: McpAppUiMeta;
  };
}

// ============================================================================
// MCP Prompts
// ============================================================================

export interface Prompt {
  name: string;
  description?: string;
  arguments?: PromptArgument[];
}

export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface ListPromptsResult {
  prompts: Prompt[];
}

export interface GetPromptParams {
  name: string;
  arguments?: Record<string, string>;
}

export interface GetPromptResult {
  description?: string;
  messages: PromptMessage[];
}

export interface PromptMessage {
  role: "user" | "assistant";
  content: PromptContent;
}

export type PromptContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; resource: ResourceContent };

// ============================================================================
// MCP Apps (SEP-1865 / 2026-01-26)
// ============================================================================

export interface McpAppUiMeta {
  prefersBorder?: boolean;
  csp?: {
    connectDomains?: string[];
    resourceDomains?: string[];
    frameDomains?: string[];
  };
}

export interface UiResource extends Resource {
  mimeType: "text/html;profile=mcp-app";
  _meta?: {
    ui?: McpAppUiMeta;
  };
}

// ============================================================================
// OAuth Types (RFC 9728, RFC 7591)
// ============================================================================

export interface MCPTokenPayload extends JWTPayload {
  sub: string;              // User ID who authorized
  account_id: string;       // Skills-Dojo account slug
  account_slug: string;     // Account slug
  collection_id: string;    // Collection ID
  collection_slug: string;  // Full slug: "{account}/{collection}"
  scope: string;            // Permissions (read, write, contribute)
  type: "mcp_access";
  version?: number;         // Token version - used to invalidate old tokens
  iat: number;
  exp: number;
}

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  bearer_methods_supported: string[];
  resource_documentation?: string;
}

export interface OAuthServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  jwks_uri?: string;
  response_types_supported: string[];
  grant_types_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  code_challenge_methods_supported: string[];
  scopes_supported: string[];
}

export interface DynamicClientRegistrationRequest {
  client_name?: string;
  redirect_uris?: string[];
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
  scope?: string;
}

export interface DynamicClientRegistrationResponse {
  client_id: string;
  client_id_issued_at: number;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  scope: string;
  client_secret?: string;
  client_secret_expires_at?: number;
}

export interface TokenRequest {
  grant_type: string;
  code?: string;
  redirect_uri?: string;
  client_id?: string;
  code_verifier?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope?: string;
}

export interface AuthCodeData {
  account_id: string;
  account_slug: string;
  collection_id: string;
  collection_slug: string;
  owner_uid: string;
  scope: string;
  code_challenge?: string;
  code_challenge_method?: string;
  redirect_uri?: string;
  client_id?: string;
  created_at: number;
}

// ============================================================================
// MCP Server Context
// ============================================================================

export interface MCPServerContext {
  accountId: string;
  accountSlug: string;
  collectionId: string;
  collectionSlug: string;
  userId: string;
  scope: string;
}

// ============================================================================
// Scope definitions
// ============================================================================

export type MCPScope = "read" | "contribute" | "write" | "admin";

export const SCOPE_PERMISSIONS: Record<MCPScope, string[]> = {
  read: [
    "list_collections", "get_collection", "list_skills", "read_skill",
    "read_file", "list_files", "list_pull_requests", "get_pull_request",
    "search_skills",
    // UI tools for viewing
    "browse_collection_ui", "view_pull_request_ui", "view_skill_ui"
  ],
  contribute: ["create_pull_request", "create_pull_request_ui", "add_pr_comment"],
  write: ["create_skill", "update_skill", "delete_skill", "edit_skill_ui", "commit_changes", "merge_pull_request"],
  admin: ["*"],
};

export function hasPermission(scope: string, tool: string): boolean {
  const scopes = scope.split(" ") as MCPScope[];

  for (const s of scopes) {
    const perms = SCOPE_PERMISSIONS[s];
    if (perms?.includes("*") || perms?.includes(tool)) {
      return true;
    }
  }

  // Check inherited permissions
  if (scopes.includes("write")) {
    return hasPermission("read contribute", tool);
  }
  if (scopes.includes("contribute")) {
    return hasPermission("read", tool);
  }

  return false;
}
