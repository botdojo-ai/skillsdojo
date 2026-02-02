"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Server, Terminal } from "lucide-react";

interface McpServerUriProps {
  accountSlug: string;
  collectionSlug: string;
}

export function McpServerUri({ accountSlug, collectionSlug }: McpServerUriProps) {
  const [copiedMcp, setCopiedMcp] = useState(false);
  const [copiedCli, setCopiedCli] = useState(false);

  // Use window.location.origin for the base URL, fallback to skillsdojo.ai
  const baseUrl = typeof window !== "undefined"
    ? window.location.origin
    : "https://skillsdojo.ai";

  const mcpUri = `${baseUrl}/api/mcp/${accountSlug}/${collectionSlug}`;
  const cliCommand = `skillsd link ${accountSlug}/${collectionSlug}`;

  const handleCopyMcp = async () => {
    try {
      await navigator.clipboard.writeText(mcpUri);
      setCopiedMcp(true);
      setTimeout(() => setCopiedMcp(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleCopyCli = async () => {
    try {
      await navigator.clipboard.writeText(cliCommand);
      setCopiedCli(true);
      setTimeout(() => setCopiedCli(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="space-y-4 mb-6">
      {/* CLI Link Command */}
      <Card className="bg-muted/50">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <Terminal className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium mb-1">Link via CLI</p>
              <code className="text-xs text-muted-foreground break-all block">
                {cliCommand}
              </code>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyCli}
              className="shrink-0"
            >
              {copiedCli ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Run this in your project to sync skills from <code className="bg-muted px-1 rounded">skills.sh</code> to this collection.
          </p>
        </CardContent>
      </Card>

      {/* MCP Server */}
      <Card className="bg-muted/50">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <Server className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium mb-1">MCP Server</p>
              <code className="text-xs text-muted-foreground break-all block">
                {mcpUri}
              </code>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyMcp}
              className="shrink-0"
            >
              {copiedMcp ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Add this URL to Claude Desktop or any MCP-compatible client to connect to this collection.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
