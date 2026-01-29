"use client";

import { useState } from "react";
import Editor from "@monaco-editor/react";
import { FileTree, buildFileTree } from "./file-tree";
import { FileHistory } from "./file-history";
import { Code, FileText, Copy, Check, History } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SkillFile {
  path: string;
  content: string;
  size?: number;
}

interface SkillViewerProps {
  files: SkillFile[];
  skillName: string;
  collectionId?: string;
  skillPath?: string;
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SkillViewer({ files, skillName, collectionId, skillPath }: SkillViewerProps) {
  // Sort files: SKILL.md first, then README.md, then others alphabetically
  const sortedFiles = [...files].sort((a, b) => {
    const aLower = a.path.toLowerCase();
    const bLower = b.path.toLowerCase();
    if (aLower === "skill.md") return -1;
    if (bLower === "skill.md") return 1;
    if (aLower === "readme.md") return -1;
    if (bLower === "readme.md") return 1;
    return a.path.localeCompare(b.path);
  });

  const [selectedPath, setSelectedPath] = useState<string>(
    sortedFiles[0]?.path || ""
  );
  const [copied, setCopied] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Build file tree from paths
  const fileTree = buildFileTree(sortedFiles.map((f) => f.path));

  // Get selected file
  const selectedFile = sortedFiles.find((f) => f.path === selectedPath);

  // Handle file selection
  const handleSelect = (path: string, type: "file" | "directory") => {
    if (type === "file") {
      setSelectedPath(path);
    }
  };

  // Handle copy
  const handleCopy = async () => {
    if (!selectedFile) return;
    await navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (files.length === 0) {
    return (
      <div className="flex h-[500px] border rounded-lg items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Code className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No files available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[600px] border rounded-lg overflow-hidden">
      {/* File Tree Sidebar */}
      <div className="w-64 border-r flex flex-col bg-muted/30">
        <div className="p-3 border-b">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium truncate">{skillName}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {files.length} file{files.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex-1 overflow-auto py-2">
          <FileTree
            files={fileTree}
            selectedPath={selectedPath}
            onSelect={handleSelect}
          />
        </div>
      </div>

      {/* Viewer Area */}
      <div className="flex-1 flex flex-col">
        {/* Viewer Header */}
        <div className="p-2 border-b flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono">
              {selectedPath || "No file selected"}
            </span>
            {selectedFile?.size && (
              <span className="text-xs text-muted-foreground">
                {formatFileSize(selectedFile.size)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {collectionId && skillPath && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setHistoryOpen(true)}
                disabled={!selectedFile}
                className="h-8"
              >
                <History className="h-4 w-4 mr-2" />
                History
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              disabled={!selectedFile}
              className="h-8"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2 text-green-500" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Monaco Editor (Read-only) */}
        <div className="flex-1">
          {selectedFile ? (
            <Editor
              height="100%"
              language={getLanguage(selectedPath)}
              value={selectedFile.content}
              theme="light"
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: "on",
                wordWrap: "on",
                tabSize: 2,
                automaticLayout: true,
                scrollBeyondLastLine: false,
                domReadOnly: true,
                cursorStyle: "line",
                renderLineHighlight: "none",
              }}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              Select a file to view
            </div>
          )}
        </div>
      </div>

      {/* File History Modal */}
      {collectionId && skillPath && (
        <FileHistory
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          collectionId={collectionId}
          filePath={selectedPath}
          skillPath={skillPath}
        />
      )}
    </div>
  );
}
