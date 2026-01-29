"use client";

import { useState, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { FileTree, buildFileTree } from "./file-tree";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SaveChangesDialog } from "@/components/save-changes-dialog";
import { Save, Plus, X } from "lucide-react";

interface SkillFile {
  path: string;
  content: string;
  modified?: boolean;
}

interface SkillEditorProps {
  skillId: string;
  skillPath: string;
  collectionId: string;
  initialFiles?: SkillFile[];
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

export function SkillEditor({
  skillId,
  skillPath,
  collectionId,
  initialFiles = [],
}: SkillEditorProps) {
  const [files, setFiles] = useState<SkillFile[]>(
    initialFiles.length > 0
      ? initialFiles
      : [{ path: "SKILL.md", content: getDefaultSkillMd() }]
  );
  const [selectedPath, setSelectedPath] = useState<string>(files[0]?.path || "");
  const [newFileName, setNewFileName] = useState("");
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [newFileParent, setNewFileParent] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  // Build file tree from paths
  const fileTree = buildFileTree(files.map((f) => f.path));

  // Get selected file
  const selectedFile = files.find((f) => f.path === selectedPath);

  // Handle file selection
  const handleSelect = (path: string, type: "file" | "directory") => {
    if (type === "file") {
      setSelectedPath(path);
    }
  };

  // Handle content change
  const handleContentChange = useCallback(
    (value: string | undefined) => {
      if (!value) return;
      setFiles((prev) =>
        prev.map((f) =>
          f.path === selectedPath ? { ...f, content: value, modified: true } : f
        )
      );
    },
    [selectedPath]
  );

  // Handle create file
  const handleCreateFile = (parentPath: string) => {
    setNewFileParent(parentPath);
    setNewFileName("");
    setShowNewFileInput(true);
  };

  // Confirm new file
  const confirmNewFile = () => {
    if (!newFileName.trim()) return;

    const path = newFileParent ? `${newFileParent}/${newFileName}` : newFileName;

    // Check if file already exists
    if (files.some((f) => f.path === path)) {
      alert("File already exists");
      return;
    }

    setFiles((prev) => [...prev, { path, content: "", modified: true }]);
    setSelectedPath(path);
    setShowNewFileInput(false);
    setNewFileName("");
  };

  // Handle delete file
  const handleDelete = (path: string) => {
    if (!confirm(`Delete ${path}?`)) return;

    setFiles((prev) => prev.filter((f) => f.path !== path && !f.path.startsWith(path + "/")));

    if (selectedPath === path || selectedPath.startsWith(path + "/")) {
      setSelectedPath(files.find((f) => f.path !== path)?.path || "");
    }
  };

  // Handle save success - clear modified flags
  const handleSaveSuccess = () => {
    setFiles((prev) => prev.map((f) => ({ ...f, modified: false })));
  };

  const hasChanges = files.some((f) => f.modified);

  return (
    <div className="flex h-full border rounded-lg overflow-hidden">
      {/* File Tree Sidebar */}
      <div className="w-64 border-r flex flex-col bg-muted/30">
        <div className="p-2 border-b flex items-center justify-between">
          <span className="text-sm font-medium">Files</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleCreateFile("")}
            className="h-7 w-7 p-0"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-auto py-2">
          <FileTree
            files={fileTree}
            selectedPath={selectedPath}
            onSelect={handleSelect}
            onCreateFile={handleCreateFile}
            onDelete={handleDelete}
          />
        </div>

        {/* New File Input */}
        {showNewFileInput && (
          <div className="p-2 border-t bg-background">
            <div className="flex gap-2">
              <Input
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="filename.ext"
                className="h-8 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmNewFile();
                  if (e.key === "Escape") setShowNewFileInput(false);
                }}
              />
              <Button size="sm" onClick={confirmNewFile} className="h-8">
                Add
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowNewFileInput(false)}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {newFileParent && (
              <p className="text-xs text-muted-foreground mt-1">
                In: {newFileParent}/
              </p>
            )}
          </div>
        )}
      </div>

      {/* Editor Area */}
      <div className="flex-1 flex flex-col">
        {/* Editor Header */}
        <div className="p-2 border-b flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono">
              {selectedPath || "No file selected"}
            </span>
            {selectedFile?.modified && (
              <span className="text-xs text-orange-500">Modified</span>
            )}
          </div>
          <Button
            onClick={() => setShowSaveDialog(true)}
            disabled={!hasChanges}
            size="sm"
          >
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </div>

        {/* Monaco Editor */}
        <div className="flex-1">
          {selectedFile ? (
            <Editor
              height="100%"
              language={getLanguage(selectedPath)}
              value={selectedFile.content}
              onChange={handleContentChange}
              theme="light"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: "on",
                wordWrap: "on",
                tabSize: 2,
                insertSpaces: true,
                automaticLayout: true,
                scrollBeyondLastLine: false,
              }}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              Select a file to edit
            </div>
          )}
        </div>
      </div>

      {/* Save Changes Dialog */}
      <SaveChangesDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        files={files}
        skillPath={skillPath}
        collectionId={collectionId}
        onSuccess={handleSaveSuccess}
      />
    </div>
  );
}

// Default SKILL.md template
function getDefaultSkillMd(): string {
  return `---
name: My Skill
description: A brief description of what this skill does
version: 1.0.0
author: Your Name
tags:
  - productivity
  - automation
---

# My Skill

## Overview

Describe what this skill does and how it helps AI agents.

## Usage

\`\`\`
Example usage instructions
\`\`\`

## Configuration

List any configuration options.

## Examples

Provide example scenarios.
`;
}
