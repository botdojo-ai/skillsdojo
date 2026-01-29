"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Server } from "lucide-react";

interface McpServerUriProps {
  accountSlug: string;
  collectionSlug: string;
}

export function McpServerUri({ accountSlug, collectionSlug }: McpServerUriProps) {
  const [copied, setCopied] = useState(false);

  // Use window.location.origin for the base URL, fallback to skillsdojo.ai
  const baseUrl = typeof window !== "undefined"
    ? window.location.origin
    : "https://skillsdojo.ai";

  const mcpUri = `${baseUrl}/api/mcp/${accountSlug}/${collectionSlug}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(mcpUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <Card className="mb-6 bg-muted/50">
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
            onClick={handleCopy}
            className="shrink-0"
          >
            {copied ? (
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
  );
}
