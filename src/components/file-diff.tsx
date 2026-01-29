"use client";

import { useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, FileIcon, FilePlus, FileX, FileEdit } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDiffProps {
  path: string;
  action: "create" | "modify" | "delete";
  content?: string;
  originalContent?: string;
}

// Get language from file extension
function getLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    md: "markdown",
    js: "javascript",
    ts: "typescript",
    jsx: "javascriptreact",
    tsx: "typescriptreact",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    sh: "shell",
    bash: "shell",
    css: "css",
    html: "html",
    xml: "xml",
    sql: "sql",
  };
  return langMap[ext || ""] || "plaintext";
}

export function FileDiff({ path, action, content, originalContent }: FileDiffProps) {
  const [expanded, setExpanded] = useState(true);

  const getActionIcon = () => {
    switch (action) {
      case "create":
        return <FilePlus className="h-4 w-4 text-green-500" />;
      case "modify":
        return <FileEdit className="h-4 w-4 text-amber-500" />;
      case "delete":
        return <FileX className="h-4 w-4 text-red-500" />;
      default:
        return <FileIcon className="h-4 w-4" />;
    }
  };

  const getActionBadge = () => {
    switch (action) {
      case "create":
        return <Badge variant="success">Added</Badge>;
      case "modify":
        return <Badge variant="warning">Modified</Badge>;
      case "delete":
        return <Badge variant="destructive">Deleted</Badge>;
      default:
        return null;
    }
  };

  const hasContent = content !== undefined || originalContent !== undefined;

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <Button
        variant="ghost"
        className="w-full flex items-center justify-between p-3 h-auto hover:bg-muted/50 rounded-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          {getActionIcon()}
          <span className="font-mono text-sm">{path}</span>
        </div>
        {getActionBadge()}
      </Button>

      {/* Content */}
      {expanded && hasContent && (
        <div
          className={cn(
            "border-t",
            action === "delete" && "bg-red-50/50"
          )}
        >
          {action === "delete" ? (
            <div className="p-4 text-center text-muted-foreground">
              <FileX className="h-8 w-8 mx-auto mb-2 text-red-400" />
              <p>This file has been deleted</p>
            </div>
          ) : action === "modify" && originalContent !== undefined ? (
            <div className="h-[300px]">
              <DiffEditor
                original={originalContent}
                modified={content || ""}
                language={getLanguage(path)}
                theme="light"
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  renderSideBySide: true,
                  automaticLayout: true,
                }}
              />
            </div>
          ) : (
            <div className="h-[300px]">
              <DiffEditor
                original=""
                modified={content || ""}
                language={getLanguage(path)}
                theme="light"
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  renderSideBySide: true,
                  automaticLayout: true,
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface FileDiffListProps {
  files: Array<{
    path: string;
    action: "create" | "modify" | "delete";
    content?: string;
    originalContent?: string;
  }>;
}

export function FileDiffList({ files }: FileDiffListProps) {
  if (files.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No file changes
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {files.map((file) => (
        <FileDiff
          key={file.path}
          path={file.path}
          action={file.action}
          content={file.content}
          originalContent={file.originalContent}
        />
      ))}
    </div>
  );
}
