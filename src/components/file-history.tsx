"use client";

import { useState, useEffect } from "react";
import { DiffEditor } from "@monaco-editor/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  History,
  GitCommit,
  Clock,
  User,
  ChevronRight,
  Loader2,
  FileText,
  ArrowLeft,
} from "lucide-react";

interface CommitInfo {
  commitSha: string;
  message: string;
  author: { name: string; email: string; timestamp: number };
  blobSha: string;
}

interface FileHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string;
  filePath: string;
  skillPath: string;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} days ago`;
  return formatDate(timestamp);
}

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

export function FileHistory({
  open,
  onOpenChange,
  collectionId,
  filePath,
  skillPath,
}: FileHistoryProps) {
  const [history, setHistory] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCommit, setSelectedCommit] = useState<CommitInfo | null>(null);
  const [previousCommit, setPreviousCommit] = useState<CommitInfo | null>(null);
  const [currentContent, setCurrentContent] = useState<string>("");
  const [previousContent, setPreviousContent] = useState<string>("");
  const [loadingDiff, setLoadingDiff] = useState(false);

  // Full file path including skill path
  const fullPath = `${skillPath}/${filePath}`;

  // Fetch history when dialog opens
  useEffect(() => {
    if (!open) return;

    const fetchHistory = async () => {
      setLoading(true);
      setError("");
      try {
        // Encode each path segment separately for catch-all route
        const encodedPath = fullPath
          .split("/")
          .map((segment) => encodeURIComponent(segment))
          .join("/");

        const res = await fetch(
          `/api/collections/${collectionId}/files/history/${encodedPath}`,
          { credentials: "include" }
        );

        if (!res.ok) {
          throw new Error("Failed to load file history");
        }

        const data = await res.json();
        setHistory(data.history || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load history");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [open, collectionId, fullPath]);

  // Fetch diff when a commit is selected
  useEffect(() => {
    if (!selectedCommit) return;

    const fetchDiff = async () => {
      setLoadingDiff(true);
      try {
        // Encode each path segment separately for catch-all route
        const encodedPath = fullPath
          .split("/")
          .map((segment) => encodeURIComponent(segment))
          .join("/");

        // Get current version content
        const currentRes = await fetch(
          `/api/collections/${collectionId}/files/at/${selectedCommit.commitSha}/${encodedPath}`,
          { credentials: "include" }
        );

        if (currentRes.ok) {
          const currentData = await currentRes.json();
          setCurrentContent(currentData.content || "");
        }

        // Get previous version content (if exists)
        if (previousCommit) {
          const prevRes = await fetch(
            `/api/collections/${collectionId}/files/at/${previousCommit.commitSha}/${encodedPath}`,
            { credentials: "include" }
          );

          if (prevRes.ok) {
            const prevData = await prevRes.json();
            setPreviousContent(prevData.content || "");
          } else {
            setPreviousContent("");
          }
        } else {
          setPreviousContent("");
        }
      } catch (err) {
        console.error("Failed to load diff:", err);
      } finally {
        setLoadingDiff(false);
      }
    };

    fetchDiff();
  }, [selectedCommit, previousCommit, collectionId, fullPath]);

  const handleCommitClick = (commit: CommitInfo, index: number) => {
    setSelectedCommit(commit);
    // Previous commit is the one after in the array (older)
    setPreviousCommit(history[index + 1] || null);
  };

  const handleBack = () => {
    setSelectedCommit(null);
    setPreviousCommit(null);
    setCurrentContent("");
    setPreviousContent("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            {selectedCommit ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                  className="h-8 px-2"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
                <span className="text-muted-foreground">/</span>
                <span className="font-mono text-sm">
                  {selectedCommit.commitSha.slice(0, 7)}
                </span>
              </>
            ) : (
              <>
                File History
                <span className="text-muted-foreground font-normal">
                  - {filePath}
                </span>
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="h-full flex items-center justify-center text-red-500">
              {error}
            </div>
          ) : selectedCommit ? (
            // Diff view
            <div className="h-full flex flex-col">
              <div className="p-3 bg-muted/30 border-b">
                <div className="flex items-center gap-2 mb-2">
                  <GitCommit className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{selectedCommit.message}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {selectedCommit.author.name}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDate(selectedCommit.author.timestamp)}
                  </span>
                  <Badge variant="outline" className="font-mono text-xs">
                    {selectedCommit.commitSha.slice(0, 7)}
                  </Badge>
                </div>
              </div>

              <div className="flex-1">
                {loadingDiff ? (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <DiffEditor
                    height="100%"
                    language={getLanguage(filePath)}
                    original={previousContent}
                    modified={currentContent}
                    theme="light"
                    options={{
                      readOnly: true,
                      renderSideBySide: true,
                      minimap: { enabled: false },
                      fontSize: 13,
                      scrollBeyondLastLine: false,
                      originalEditable: false,
                    }}
                  />
                )}
              </div>

              <div className="p-2 bg-muted/30 border-t text-xs text-muted-foreground">
                {previousCommit ? (
                  <>
                    Comparing with previous version from{" "}
                    {formatRelativeTime(previousCommit.author.timestamp)}
                  </>
                ) : (
                  <>This is the first version of this file</>
                )}
              </div>
            </div>
          ) : history.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <FileText className="h-12 w-12 mb-4 opacity-50" />
              <p>No history found for this file</p>
            </div>
          ) : (
            // History list
            <ScrollArea className="h-full">
              <div className="space-y-1 p-2">
                {history.map((commit, index) => (
                  <button
                    key={commit.commitSha}
                    onClick={() => handleCommitClick(commit, index)}
                    className="w-full text-left p-3 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <GitCommit className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-medium truncate">
                            {commit.message}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {commit.author.name}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatRelativeTime(commit.author.timestamp)}
                          </span>
                          <Badge variant="outline" className="font-mono text-xs">
                            {commit.commitSha.slice(0, 7)}
                          </Badge>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
