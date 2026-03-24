"use client";

import { type ComponentType, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Copy, GitBranch, Server, Terminal } from "lucide-react";

interface McpServerUriProps {
  accountSlug: string;
  collectionSlug: string;
  baseUrl: string;
  visibility: "public" | "private" | "unlisted";
}

type CopyTarget = "cli" | "git-url" | "mcp";

interface ConnectionCardProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  value: string;
  description: string;
  copied: boolean;
  onCopy: () => void;
}

function ConnectionCard({
  icon: Icon,
  title,
  value,
  description,
  copied,
  onCopy,
}: ConnectionCardProps) {
  return (
    <Card className="bg-muted/50">
      <CardContent className="py-4">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium mb-1">{title}</p>
            <code className="text-xs text-muted-foreground break-all block">
              {value}
            </code>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onCopy}
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
        <p className="text-xs text-muted-foreground mt-2">{description}</p>
      </CardContent>
    </Card>
  );
}

export function McpServerUri({
  accountSlug,
  collectionSlug,
  baseUrl,
  visibility,
}: McpServerUriProps) {
  const [copiedTarget, setCopiedTarget] = useState<CopyTarget | null>(null);

  const gitUrl = new URL(`/${accountSlug}/${collectionSlug}.git`, baseUrl).toString();
  const mcpUri = new URL(`/api/mcp/${accountSlug}/${collectionSlug}`, baseUrl).toString();
  const cliCommand = `skillsd link ${accountSlug}/${collectionSlug}`;

  const handleCopy = async (target: CopyTarget, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedTarget(target);
      setTimeout(() => setCopiedTarget((current) => (current === target ? null : current)), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="grid gap-4 mb-6 md:grid-cols-2">
      <ConnectionCard
        icon={GitBranch}
        title="Git URL"
        value={gitUrl}
        description={
          visibility === "private"
            ? "Use this remote URL with standard Git tooling. Private collections require a read-scoped API key."
            : "Use this remote URL with standard Git tooling."
        }
        copied={copiedTarget === "git-url"}
        onCopy={() => handleCopy("git-url", gitUrl)}
      />

      <ConnectionCard
        icon={Terminal}
        title="Link via CLI"
        value={cliCommand}
        description="Run this in your project to sync skills from skills.sh to this collection."
        copied={copiedTarget === "cli"}
        onCopy={() => handleCopy("cli", cliCommand)}
      />

      <ConnectionCard
        icon={Server}
        title="MCP Server"
        value={mcpUri}
        description="Add this URL to Claude Desktop or any MCP-compatible client to connect to this collection."
        copied={copiedTarget === "mcp"}
        onCopy={() => handleCopy("mcp", mcpUri)}
      />
    </div>
  );
}
