/**
 * MCP Server Library for Skills-Dojo
 *
 * This module provides a complete MCP (Model Context Protocol) server implementation
 * for exposing skill collections to AI agents and tools.
 */

// Core types
export * from "./types";

// Server
export { MCPServer, MCPError, parseJsonRpcRequest, formatSseMessage, formatSseEvent } from "./server";

// OAuth
export {
  getBaseUrl,
  buildProtectedResourceMetadata,
  buildOAuthServerMetadata,
  handleDynamicClientRegistration,
  generateAuthCode,
  consumeAuthCode,
  verifyCodeChallenge,
  generateMCPAccessToken,
  verifyMCPAccessToken,
  handleTokenExchange,
  buildAuthorizationUrl,
} from "./oauth";

// Tools
export { TOOLS, executeTool } from "./tools";

// Resources
export { getResources, getResourceTemplates, getUiResources, readResource } from "./resources";

// Prompts
export { PROMPTS, getPrompt } from "./prompts";
