/**
 * MCP Server Handler for Skills-Dojo
 * Handles JSON-RPC requests for the MCP protocol
 */

import {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcError,
  JSON_RPC_ERRORS,
  InitializeParams,
  InitializeResult,
  ServerCapabilities,
  ServerInfo,
  ListToolsResult,
  CallToolParams,
  ListResourcesResult,
  ReadResourceParams,
  ListPromptsResult,
  GetPromptParams,
  MCPServerContext,
} from "./types";
import { TOOLS, executeTool } from "./tools";
import { getResources, getResourceTemplates, getUiResources, readResource } from "./resources";
import { PROMPTS, getPrompt } from "./prompts";

// ============================================================================
// Protocol Version
// ============================================================================

const PROTOCOL_VERSION = "2025-11-25";

const SERVER_INFO: ServerInfo = {
  name: "skills-dojo-mcp",
  version: "1.0.0",
};

const SERVER_CAPABILITIES: ServerCapabilities = {
  tools: { listChanged: false },
  resources: { subscribe: false, listChanged: false },
  prompts: { listChanged: false },
  logging: {},
};

// ============================================================================
// MCP Server Class
// ============================================================================

export class MCPServer {
  private ctx: MCPServerContext;
  private initialized: boolean = false;

  constructor(ctx: MCPServerContext) {
    this.ctx = ctx;
  }

  /**
   * Handle a JSON-RPC request
   */
  async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {
      const result = await this.processMethod(request.method, request.params);
      return {
        jsonrpc: "2.0",
        id: request.id,
        result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const code = error instanceof MCPError ? error.code : JSON_RPC_ERRORS.INTERNAL_ERROR;

      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code,
          message,
        },
      };
    }
  }

  /**
   * Process a specific method
   */
  private async processMethod(method: string, params?: Record<string, unknown>): Promise<unknown> {
    console.log(`[MCP] Method: ${method}`, params ? JSON.stringify(params).slice(0, 200) : "");

    switch (method) {
      // Lifecycle
      case "initialize":
        return this.handleInitialize(params as unknown as InitializeParams);

      case "ping":
        return {};

      case "notifications/initialized":
        this.initialized = true;
        return null;

      // Tools
      case "tools/list":
        return this.handleListTools();

      case "tools/call":
        return this.handleCallTool(params as unknown as CallToolParams);

      // Resources
      case "resources/list":
        return this.handleListResources();

      case "resources/read":
        return this.handleReadResource(params as unknown as ReadResourceParams);

      // Prompts
      case "prompts/list":
        return this.handleListPrompts();

      case "prompts/get":
        return this.handleGetPrompt(params as unknown as GetPromptParams);

      default:
        throw new MCPError(JSON_RPC_ERRORS.METHOD_NOT_FOUND, `Unknown method: ${method}`);
    }
  }

  // ============================================================================
  // Lifecycle Handlers
  // ============================================================================

  private handleInitialize(params: InitializeParams): InitializeResult {
    // Validate protocol version
    const clientVersion = params.protocolVersion;

    // Check if we support the client's version
    if (!this.isVersionSupported(clientVersion)) {
      throw new MCPError(
        JSON_RPC_ERRORS.INVALID_PARAMS,
        `Unsupported protocol version: ${clientVersion}. Server supports ${PROTOCOL_VERSION}`
      );
    }

    // Respond with the client's version for compatibility
    // (we've already verified we support it)
    return {
      protocolVersion: clientVersion,
      capabilities: SERVER_CAPABILITIES,
      serverInfo: SERVER_INFO,
    };
  }

  private isVersionSupported(version: string): boolean {
    // Accept multiple protocol versions for compatibility
    const supportedVersions = ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"];
    return supportedVersions.includes(version);
  }

  // ============================================================================
  // Tool Handlers
  // ============================================================================

  private handleListTools(): ListToolsResult {
    return {
      tools: TOOLS,
    };
  }

  private async handleCallTool(params: CallToolParams) {
    if (!params.name) {
      throw new MCPError(JSON_RPC_ERRORS.INVALID_PARAMS, "Tool name is required");
    }

    const tool = TOOLS.find(t => t.name === params.name);
    if (!tool) {
      throw new MCPError(JSON_RPC_ERRORS.INVALID_PARAMS, `Unknown tool: ${params.name}`);
    }

    return executeTool(params, this.ctx);
  }

  // ============================================================================
  // Resource Handlers
  // ============================================================================

  private handleListResources(): ListResourcesResult {
    const resources = getResources(this.ctx);
    const templates = getResourceTemplates();
    const uiResources = getUiResources();

    return {
      resources: [...resources, ...uiResources],
      resourceTemplates: templates,
    };
  }

  private async handleReadResource(params: ReadResourceParams) {
    if (!params.uri) {
      throw new MCPError(JSON_RPC_ERRORS.INVALID_PARAMS, "Resource URI is required");
    }

    return readResource(params, this.ctx);
  }

  // ============================================================================
  // Prompt Handlers
  // ============================================================================

  private handleListPrompts(): ListPromptsResult {
    return {
      prompts: PROMPTS,
    };
  }

  private async handleGetPrompt(params: GetPromptParams) {
    if (!params.name) {
      throw new MCPError(JSON_RPC_ERRORS.INVALID_PARAMS, "Prompt name is required");
    }

    const prompt = PROMPTS.find(p => p.name === params.name);
    if (!prompt) {
      throw new MCPError(JSON_RPC_ERRORS.INVALID_PARAMS, `Unknown prompt: ${params.name}`);
    }

    return getPrompt(params, this.ctx);
  }
}

// ============================================================================
// Error Classes
// ============================================================================

export class MCPError extends Error {
  code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
    this.name = "MCPError";
  }
}

// ============================================================================
// Request Parser
// ============================================================================

export function parseJsonRpcRequest(body: unknown): JsonRpcRequest {
  if (typeof body !== "object" || body === null) {
    throw new MCPError(JSON_RPC_ERRORS.PARSE_ERROR, "Invalid JSON-RPC request");
  }

  const request = body as Record<string, unknown>;

  if (request.jsonrpc !== "2.0") {
    throw new MCPError(JSON_RPC_ERRORS.INVALID_REQUEST, "Invalid JSON-RPC version");
  }

  if (typeof request.method !== "string") {
    throw new MCPError(JSON_RPC_ERRORS.INVALID_REQUEST, "Method must be a string");
  }

  // ID can be string, number, or null (for notifications)
  const id = request.id;
  if (id !== undefined && id !== null && typeof id !== "string" && typeof id !== "number") {
    throw new MCPError(JSON_RPC_ERRORS.INVALID_REQUEST, "Invalid request ID");
  }

  return {
    jsonrpc: "2.0",
    id: id as string | number,
    method: request.method,
    params: request.params as Record<string, unknown> | undefined,
  };
}

// ============================================================================
// SSE Helpers
// ============================================================================

export function formatSseMessage(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export function formatSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
