/**
 * MCP Resources Implementation for Skills-Dojo
 */

import { getDataSource } from "@/lib/db/data-source";
import { Skill } from "@/entities/Skill";
import { SkillCollection } from "@/entities/SkillCollection";
import { DatabaseGitBackend } from "@/lib/git/db-backend";
import {
  Resource,
  ResourceTemplate,
  ReadResourceParams,
  ReadResourceResult,
  MCPServerContext,
  UiResource,
} from "./types";
import { getSkillEditorHtml } from "./apps/skill-editor";
import { getPrViewerHtml } from "./apps/pr-viewer";
import { getCollectionBrowserHtml } from "./apps/collection-browser";
import { getPrCreatorHtml } from "./apps/pr-creator";
import { getSkillViewerHtml } from "./apps/skill-viewer";
import { getActionResultHtml } from "./apps/action-result";

// ============================================================================
// Resource Definitions
// ============================================================================

export function getResources(ctx: MCPServerContext): Resource[] {
  return [
    // Collection metadata resource
    {
      uri: `skills://${ctx.collectionSlug}`,
      name: "Collection Metadata",
      description: "Skill collection information and file list",
      mimeType: "application/json",
    },
  ];
}

export function getResourceTemplates(): ResourceTemplate[] {
  return [
    // Individual skill resource
    {
      uriTemplate: "skills://{collection}/{skill_path}",
      name: "Skill",
      description: "Individual skill SKILL.md content",
      mimeType: "text/markdown",
    },
    // Skill file resource
    {
      uriTemplate: "skills://{collection}/{skill_path}/{filename}",
      name: "Skill File",
      description: "Supporting file within a skill",
      mimeType: "application/octet-stream",
    },
    // Git file resource
    {
      uriTemplate: "git://{collection}/{branch}/{path}",
      name: "Repository File",
      description: "File from the git repository",
      mimeType: "application/octet-stream",
    },
  ];
}

export function getUiResources(): UiResource[] {
  return [
    {
      uri: "ui://skill-editor",
      name: "Skill Editor",
      description: "Visual skill editor for creating and editing skills",
      mimeType: "text/html;profile=mcp-app",
      _meta: {
        ui: {
          prefersBorder: true,
        },
      },
    },
    {
      uri: "ui://pr-viewer",
      name: "Pull Request Viewer",
      description: "Visual diff viewer for pull requests",
      mimeType: "text/html;profile=mcp-app",
      _meta: {
        ui: {
          prefersBorder: true,
        },
      },
    },
    {
      uri: "ui://collection-browser",
      name: "Collection Browser",
      description: "Visual browser for exploring the skill collection",
      mimeType: "text/html;profile=mcp-app",
      _meta: {
        ui: {
          prefersBorder: true,
        },
      },
    },
    {
      uri: "ui://pr-creator",
      name: "Pull Request Creator",
      description: "Visual form to create a pull request with preview",
      mimeType: "text/html;profile=mcp-app",
      _meta: {
        ui: {
          prefersBorder: true,
        },
      },
    },
    {
      uri: "ui://skill-viewer",
      name: "Skill Viewer",
      description: "Visual skill viewer with formatted display",
      mimeType: "text/html;profile=mcp-app",
      _meta: {
        ui: {
          prefersBorder: true,
        },
      },
    },
    {
      uri: "ui://action-result",
      name: "Action Result",
      description: "Visual feedback display for tool action results",
      mimeType: "text/html;profile=mcp-app",
      _meta: {
        ui: {
          prefersBorder: true,
        },
      },
    },
  ];
}

// ============================================================================
// Resource Reader
// ============================================================================

export async function readResource(
  params: ReadResourceParams,
  ctx: MCPServerContext
): Promise<ReadResourceResult> {
  const { uri } = params;

  // UI resources (MCP Apps)
  if (uri.startsWith("ui://")) {
    return readUiResource(uri, ctx);
  }

  // Skill resources
  if (uri.startsWith("skills://")) {
    return readSkillResource(uri, ctx);
  }

  // Git resources
  if (uri.startsWith("git://")) {
    return readGitResource(uri, ctx);
  }

  throw new Error(`Unknown resource URI scheme: ${uri}`);
}

// ============================================================================
// UI Resource Reader (MCP Apps)
// ============================================================================

async function readUiResource(
  uri: string,
  ctx: MCPServerContext
): Promise<ReadResourceResult> {
  const appName = uri.replace("ui://", "");

  let html: string;

  switch (appName) {
    case "skill-editor":
      html = getSkillEditorHtml(ctx);
      break;
    case "pr-viewer":
      html = getPrViewerHtml(ctx);
      break;
    case "collection-browser":
      html = getCollectionBrowserHtml(ctx);
      break;
    case "pr-creator":
      html = getPrCreatorHtml(ctx);
      break;
    case "skill-viewer":
      html = getSkillViewerHtml(ctx);
      break;
    case "action-result":
      html = getActionResultHtml(ctx);
      break;
    default:
      throw new Error(`Unknown UI resource: ${uri}`);
  }

  return {
    contents: [{
      uri,
      mimeType: "text/html;profile=mcp-app",
      text: html,
      _meta: {
        ui: {
          prefersBorder: true,
        },
      },
    }],
  };
}

// ============================================================================
// Skill Resource Reader
// ============================================================================

async function readSkillResource(
  uri: string,
  ctx: MCPServerContext
): Promise<ReadResourceResult> {
  // Parse URI: skills://{collection}/{skill_path}[/{filename}]
  const path = uri.replace("skills://", "");
  const parts = path.split("/");

  if (parts.length < 2) {
    throw new Error(`Invalid skill URI: ${uri}`);
  }

  const collectionSlug = parts[0] + "/" + parts[1];

  // Verify collection matches context
  if (collectionSlug !== ctx.collectionSlug) {
    throw new Error(`Resource collection mismatch: ${collectionSlug} vs ${ctx.collectionSlug}`);
  }

  // If just collection, return collection metadata
  if (parts.length === 2) {
    return readCollectionMetadata(ctx);
  }

  // Otherwise, read skill content
  const skillPath = parts.slice(2).join("/");

  // Check if it's a specific file within the skill
  const isSkillMd = skillPath.endsWith("/SKILL.md") || !skillPath.includes("/");

  if (isSkillMd) {
    const actualSkillPath = skillPath.replace(/\/SKILL\.md$/, "");
    return readSkillContent(actualSkillPath, ctx);
  }

  // Read supporting file
  return readSkillFile(skillPath, ctx);
}

async function readCollectionMetadata(ctx: MCPServerContext): Promise<ReadResourceResult> {
  const ds = await getDataSource();
  const collectionRepo = ds.getRepository(SkillCollection);
  const skillRepo = ds.getRepository(Skill);

  const collection = await collectionRepo.findOne({
    where: { id: ctx.collectionId },
  });

  if (!collection) {
    throw new Error("Collection not found");
  }

  const skills = await skillRepo
    .createQueryBuilder("skill")
    .where("skill.collectionId = :collectionId", { collectionId: ctx.collectionId })
    .andWhere("skill.archivedAt IS NULL")
    .orderBy("skill.path", "ASC")
    .getMany();

  const metadata = {
    id: collection.id,
    slug: collection.slug,
    name: collection.name,
    description: collection.description,
    visibility: collection.visibility,
    defaultBranch: collection.defaultBranch,
    skillCount: collection.skillCount,
    skills: skills.map(s => ({
      path: s.path,
      name: s.name,
      description: s.description,
    })),
  };

  return {
    contents: [{
      uri: `skills://${ctx.collectionSlug}`,
      mimeType: "application/json",
      text: JSON.stringify(metadata, null, 2),
    }],
  };
}

async function readSkillContent(
  skillPath: string,
  ctx: MCPServerContext
): Promise<ReadResourceResult> {
  const ds = await getDataSource();
  const repo = ds.getRepository(Skill);

  const skill = await repo.findOne({
    where: {
      collectionId: ctx.collectionId,
      path: skillPath.toLowerCase(),
      archivedAt: undefined,
    },
  });

  if (!skill) {
    throw new Error(`Skill not found: ${skillPath}`);
  }

  // Try to read from git first
  const gitBackend = new DatabaseGitBackend(ds, ctx.collectionId);
  let content = "";

  try {
    const blob = await gitBackend.getFile("main", `${skillPath}/SKILL.md`);
    if (blob) {
      content = blob.toString("utf-8");
    }
  } catch {
    // Fall back to stored content
    content = skill.content || "";
  }

  return {
    contents: [{
      uri: `skills://${ctx.collectionSlug}/${skillPath}`,
      mimeType: "text/markdown",
      text: content,
    }],
  };
}

async function readSkillFile(
  filePath: string,
  ctx: MCPServerContext
): Promise<ReadResourceResult> {
  const ds = await getDataSource();
  const gitBackend = new DatabaseGitBackend(ds, ctx.collectionId);

  try {
    const content = await gitBackend.getFile("main", filePath);
    if (!content) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Determine MIME type
    const mimeType = getMimeType(filePath);

    // For text files, return as text
    if (mimeType.startsWith("text/") || mimeType === "application/json") {
      return {
        contents: [{
          uri: `skills://${ctx.collectionSlug}/${filePath}`,
          mimeType,
          text: content.toString("utf-8"),
        }],
      };
    }

    // For binary files, return as base64
    return {
      contents: [{
        uri: `skills://${ctx.collectionSlug}/${filePath}`,
        mimeType,
        blob: content.toString("base64"),
      }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read file";
    throw new Error(`Error reading skill file: ${message}`);
  }
}

// ============================================================================
// Git Resource Reader
// ============================================================================

async function readGitResource(
  uri: string,
  ctx: MCPServerContext
): Promise<ReadResourceResult> {
  // Parse URI: git://{collection}/{branch}/{path}
  const path = uri.replace("git://", "");
  const parts = path.split("/");

  if (parts.length < 4) {
    throw new Error(`Invalid git URI: ${uri}`);
  }

  const collectionSlug = parts[0] + "/" + parts[1];
  const branch = parts[2];
  const filePath = parts.slice(3).join("/");

  // Verify collection matches context
  if (collectionSlug !== ctx.collectionSlug) {
    throw new Error(`Resource collection mismatch`);
  }

  const ds = await getDataSource();
  const gitBackend = new DatabaseGitBackend(ds, ctx.collectionId);

  try {
    const content = await gitBackend.getFile(branch, filePath);
    if (!content) {
      throw new Error(`File not found: ${filePath} (branch: ${branch})`);
    }

    const mimeType = getMimeType(filePath);

    if (mimeType.startsWith("text/") || mimeType === "application/json") {
      return {
        contents: [{
          uri,
          mimeType,
          text: content.toString("utf-8"),
        }],
      };
    }

    return {
      contents: [{
        uri,
        mimeType,
        blob: content.toString("base64"),
      }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read file";
    throw new Error(`Error reading git file: ${message}`);
  }
}

// ============================================================================
// Helpers
// ============================================================================

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();

  const mimeTypes: Record<string, string> = {
    md: "text/markdown",
    txt: "text/plain",
    json: "application/json",
    yaml: "text/yaml",
    yml: "text/yaml",
    js: "text/javascript",
    ts: "text/typescript",
    py: "text/x-python",
    sh: "text/x-shellscript",
    html: "text/html",
    css: "text/css",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    pdf: "application/pdf",
  };

  return mimeTypes[ext || ""] || "application/octet-stream";
}
