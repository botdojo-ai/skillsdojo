"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

interface FileTreeProps {
  files: FileNode[];
  selectedPath?: string;
  onSelect: (path: string, type: "file" | "directory") => void;
  onCreateFile?: (parentPath: string) => void;
  onCreateFolder?: (parentPath: string) => void;
  onDelete?: (path: string) => void;
}

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  selectedPath?: string;
  onSelect: (path: string, type: "file" | "directory") => void;
  onCreateFile?: (parentPath: string) => void;
  onCreateFolder?: (parentPath: string) => void;
  onDelete?: (path: string) => void;
}

function TreeNode({
  node,
  depth,
  selectedPath,
  onSelect,
  onCreateFile,
  onCreateFolder,
  onDelete,
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [showActions, setShowActions] = useState(false);

  const isSelected = selectedPath === node.path;
  const isDirectory = node.type === "directory";

  const handleClick = () => {
    if (isDirectory) {
      setExpanded(!expanded);
    }
    onSelect(node.path, node.type);
  };

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 py-1 px-2 cursor-pointer hover:bg-muted/50 rounded-sm group",
          isSelected && "bg-muted"
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={handleClick}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        {/* Expand/Collapse Icon */}
        {isDirectory ? (
          expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )
        ) : (
          <span className="w-4" />
        )}

        {/* File/Folder Icon */}
        {isDirectory ? (
          expanded ? (
            <FolderOpen className="h-4 w-4 text-blue-500 shrink-0" />
          ) : (
            <Folder className="h-4 w-4 text-blue-500 shrink-0" />
          )
        ) : (
          <File className="h-4 w-4 text-muted-foreground shrink-0" />
        )}

        {/* Name */}
        <span className="text-sm truncate flex-1">{node.name}</span>

        {/* Actions */}
        {showActions && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {isDirectory && onCreateFile && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateFile(node.path);
                }}
                className="p-1 hover:bg-muted rounded"
                title="New File"
              >
                <Plus className="h-3 w-3" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(node.path);
                }}
                className="p-1 hover:bg-muted rounded text-red-500"
                title="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Children */}
      {isDirectory && expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onCreateFile={onCreateFile}
              onCreateFolder={onCreateFolder}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({
  files,
  selectedPath,
  onSelect,
  onCreateFile,
  onCreateFolder,
  onDelete,
}: FileTreeProps) {
  return (
    <div className="text-sm">
      {files.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onCreateFile={onCreateFile}
          onCreateFolder={onCreateFolder}
          onDelete={onDelete}
        />
      ))}

      {/* Root Actions */}
      {files.length === 0 && (
        <div className="p-4 text-center text-muted-foreground">
          <p className="text-sm">No files yet</p>
          {onCreateFile && (
            <button
              onClick={() => onCreateFile("")}
              className="mt-2 text-xs text-primary hover:underline"
            >
              Create your first file
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Helper to build file tree from flat paths
export function buildFileTree(paths: string[]): FileNode[] {
  const root: FileNode[] = [];

  for (const path of paths.sort()) {
    const parts = path.split("/").filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const currentPath = parts.slice(0, i + 1).join("/");
      const isLast = i === parts.length - 1;

      let node = current.find((n) => n.name === name);

      if (!node) {
        node = {
          name,
          path: currentPath,
          type: isLast ? "file" : "directory",
          children: isLast ? undefined : [],
        };
        current.push(node);
      }

      if (!isLast && node.children) {
        current = node.children;
      }
    }
  }

  return root;
}
