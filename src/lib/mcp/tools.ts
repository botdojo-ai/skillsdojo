/**
 * MCP Tools Implementation for Skills-Dojo
 */

import { getDataSource } from "@/lib/db/data-source";
import { SkillCollection } from "@/entities/SkillCollection";
import { Skill } from "@/entities/Skill";
import { PullRequest } from "@/entities/PullRequest";
import { Account } from "@/entities/Account";
import { DatabaseGitBackend } from "@/lib/git/db-backend";
import {
  Tool,
  CallToolParams,
  CallToolResult,
  MCPServerContext,
  hasPermission,
} from "./types";
// Note: MCP App HTML is served via resources/read, not directly from tools
// Tools return JSON data and rely on _meta.ui/resourceUri to trigger app rendering

// ============================================================================
// Tool Definitions
// ============================================================================

export const TOOLS: Tool[] = [
  // Collection Tools
  {
    name: "get_collection",
    description: "Get details of the current skill collection including stats and metadata",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_skills",
    description: "List all skills in the collection",
    inputSchema: {
      type: "object",
      properties: {
        path_prefix: {
          type: "string",
          description: "Filter skills by path prefix (e.g., 'utils/' to list skills in utils folder)",
        },
        limit: {
          type: "number",
          description: "Maximum number of skills to return (default: 50)",
        },
      },
    },
  },
  {
    name: "read_skill",
    description: "Read the SKILL.md content and metadata for a skill",
    inputSchema: {
      type: "object",
      properties: {
        skill_path: {
          type: "string",
          description: "Path of the skill (e.g., 'code-review' or 'utils/formatter')",
        },
      },
      required: ["skill_path"],
    },
  },
  {
    name: "read_file",
    description: "Read a file from the collection repository",
    inputSchema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Path to the file in the repository",
        },
        branch: {
          type: "string",
          description: "Branch to read from (default: main)",
        },
      },
      required: ["file_path"],
    },
  },
  {
    name: "list_files",
    description: "List files in the collection repository",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Directory path to list (default: root)",
        },
        branch: {
          type: "string",
          description: "Branch to list from (default: main)",
        },
      },
    },
  },

  // Skill Management Tools (requires write permission)
  {
    name: "create_skill",
    description: "Create a new skill in the collection. Shows visual confirmation when complete.",
    inputSchema: {
      type: "object",
      properties: {
        skill_path: {
          type: "string",
          description: "Path for the new skill (e.g., 'my-skill' or 'category/my-skill')",
        },
        name: {
          type: "string",
          description: "Display name for the skill",
        },
        description: {
          type: "string",
          description: "Description of what the skill does",
        },
        content: {
          type: "string",
          description: "The SKILL.md content",
        },
      },
      required: ["skill_path", "name", "content"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://action-result",
      },
    },
  },
  {
    name: "update_skill",
    description: "Update an existing skill. Shows visual confirmation when complete.",
    inputSchema: {
      type: "object",
      properties: {
        skill_path: {
          type: "string",
          description: "Path of the skill to update",
        },
        name: {
          type: "string",
          description: "New display name (optional)",
        },
        description: {
          type: "string",
          description: "New description (optional)",
        },
        content: {
          type: "string",
          description: "New SKILL.md content (optional)",
        },
      },
      required: ["skill_path"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://action-result",
      },
    },
  },
  {
    name: "edit_skill_ui",
    description: "Open the visual skill editor UI. Use this when the user wants to interactively edit a skill with a visual editor. For programmatic updates without user interaction, use update_skill instead.",
    inputSchema: {
      type: "object",
      properties: {
        skill_path: {
          type: "string",
          description: "Path of the skill to edit (leave empty for new skill)",
        },
      },
    },
    _meta: {
      ui: {
        resourceUri: "ui://skill-editor",
      },
    },
  },

  // Pull Request Tools
  {
    name: "list_pull_requests",
    description: "List pull requests for the collection",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["open", "merged", "closed", "all"],
          description: "Filter by PR status (default: open)",
        },
        limit: {
          type: "number",
          description: "Maximum number of PRs to return (default: 20)",
        },
      },
    },
  },
  {
    name: "get_pull_request",
    description: "Get pull request details as data. Use this for programmatic access to PR information. For visually reviewing a PR with diff viewer, use view_pull_request_ui instead.",
    inputSchema: {
      type: "object",
      properties: {
        pr_number: {
          type: "number",
          description: "Pull request number",
        },
      },
      required: ["pr_number"],
    },
  },
  {
    name: "view_pull_request_ui",
    description: "Open a visual diff viewer UI for a pull request. Use this when the user wants to visually review PR changes, see diffs, or merge interactively. For getting PR data programmatically, use get_pull_request instead.",
    inputSchema: {
      type: "object",
      properties: {
        pr_number: {
          type: "number",
          description: "Pull request number",
        },
      },
      required: ["pr_number"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://pr-viewer",
      },
    },
  },
  {
    name: "create_pull_request",
    description: "Create a new pull request. Shows visual confirmation when complete.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "PR title",
        },
        description: {
          type: "string",
          description: "PR description",
        },
        source_branch: {
          type: "string",
          description: "Source branch containing changes",
        },
        target_branch: {
          type: "string",
          description: "Target branch to merge into (default: main)",
        },
      },
      required: ["title", "source_branch"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://action-result",
      },
    },
  },
  {
    name: "merge_pull_request",
    description: "Merge an approved pull request. Shows visual confirmation when complete.",
    inputSchema: {
      type: "object",
      properties: {
        pr_number: {
          type: "number",
          description: "Pull request number to merge",
        },
      },
      required: ["pr_number"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://action-result",
      },
    },
  },

  // Search Tools
  {
    name: "search_skills",
    description: "Search for skills in this collection",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (matches name, description, or path)",
        },
        limit: {
          type: "number",
          description: "Maximum results (default: 20)",
        },
      },
      required: ["query"],
    },
  },

  // Collection Browser Tool
  {
    name: "browse_collection_ui",
    description: "Open an interactive visual browser to explore the skill collection. Use this when the user wants to visually browse, search, or navigate skills with a graphical interface. For listing skills programmatically, use list_skills instead.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    _meta: {
      ui: {
        resourceUri: "ui://collection-browser",
      },
    },
  },

  // UI variant tools - these open a UI for user verification before action
  {
    name: "create_pull_request_ui",
    description: "Open a visual form to create a pull request with branch selection and preview. Use this when the user wants to interactively create a PR with verification before submitting. For creating PRs programmatically without user interaction, use create_pull_request instead.",
    inputSchema: {
      type: "object",
      properties: {
        source_branch: {
          type: "string",
          description: "Source branch containing changes (optional, can be selected in UI)",
        },
        target_branch: {
          type: "string",
          description: "Target branch to merge into (optional, defaults to main)",
        },
      },
    },
    _meta: {
      ui: {
        resourceUri: "ui://pr-creator",
      },
    },
  },
  {
    name: "view_skill_ui",
    description: "Open a visual skill viewer with nicely formatted markdown display. Use this when the user wants to see a skill rendered visually. For getting skill content as raw data, use read_skill instead.",
    inputSchema: {
      type: "object",
      properties: {
        skill_path: {
          type: "string",
          description: "Path of the skill to view",
        },
      },
      required: ["skill_path"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://skill-viewer",
      },
    },
  },
];

// ============================================================================
// Tool Executor
// ============================================================================

export async function executeTool(
  params: CallToolParams,
  ctx: MCPServerContext
): Promise<CallToolResult> {
  const { name, arguments: args = {} } = params;

  // Check permission
  if (!hasPermission(ctx.scope, name)) {
    return {
      content: [{ type: "text", text: `Error: Permission denied for tool '${name}'. Required scope not granted.` }],
      isError: true,
    };
  }

  try {
    switch (name) {
      case "get_collection":
        return await getCollection(ctx);

      case "list_skills":
        return await listSkills(ctx, args as { path_prefix?: string; limit?: number });

      case "read_skill":
        return await readSkill(ctx, args as { skill_path: string });

      case "read_file":
        return await readFile(ctx, args as { file_path: string; branch?: string });

      case "list_files":
        return await listFiles(ctx, args as { path?: string; branch?: string });

      case "create_skill":
        return await createSkill(ctx, args as { skill_path: string; name: string; description?: string; content: string });

      case "update_skill":
        return await updateSkill(ctx, args as { skill_path: string; name?: string; description?: string; content?: string });

      case "edit_skill_ui":
        return await editSkillUi(ctx, args as { skill_path?: string });

      case "list_pull_requests":
        return await listPullRequests(ctx, args as { status?: string; limit?: number });

      case "get_pull_request":
        return await getPullRequest(ctx, args as { pr_number: number });

      case "view_pull_request_ui":
        return await viewPullRequestUi(ctx, args as { pr_number: number });

      case "create_pull_request":
        return await createPullRequest(ctx, args as { title: string; description?: string; source_branch: string; target_branch?: string });

      case "merge_pull_request":
        return await mergePullRequest(ctx, args as { pr_number: number });

      case "search_skills":
        return await searchSkills(ctx, args as { query: string; limit?: number });

      case "browse_collection_ui":
        return await browseCollectionUi(ctx);

      case "create_pull_request_ui":
        return await createPullRequestUi(ctx, args as { source_branch?: string; target_branch?: string });

      case "view_skill_ui":
        return await viewSkillUi(ctx, args as { skill_path: string });

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
}

// ============================================================================
// Tool Implementations
// ============================================================================

async function getCollection(ctx: MCPServerContext): Promise<CallToolResult> {
  const ds = await getDataSource();
  const repo = ds.getRepository(SkillCollection);

  const collection = await repo.findOne({
    where: { id: ctx.collectionId },
  });

  if (!collection) {
    return {
      content: [{ type: "text", text: "Collection not found" }],
      isError: true,
    };
  }

  // Get account info
  const accountRepo = ds.getRepository(Account);
  const account = await accountRepo.findOne({ where: { id: collection.accountId } });

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        id: collection.id,
        slug: collection.slug,
        name: collection.name,
        description: collection.description,
        visibility: collection.visibility,
        defaultBranch: collection.defaultBranch,
        skillCount: collection.skillCount,
        starCount: collection.starCount,
        forkCount: collection.forkCount,
        account: account ? { slug: account.slug, name: account.name } : null,
        createdAt: collection.createdAt,
        modifiedAt: collection.modifiedAt,
      }, null, 2),
    }],
  };
}

async function listSkills(
  ctx: MCPServerContext,
  args: { path_prefix?: string; limit?: number }
): Promise<CallToolResult> {
  const ds = await getDataSource();
  const repo = ds.getRepository(Skill);

  const qb = repo
    .createQueryBuilder("skill")
    .where("skill.collectionId = :collectionId", { collectionId: ctx.collectionId })
    .andWhere("skill.archivedAt IS NULL")
    .orderBy("skill.path", "ASC");

  if (args.path_prefix) {
    qb.andWhere("skill.path LIKE :prefix", { prefix: `${args.path_prefix}%` });
  }

  const limit = Math.min(100, args.limit || 50);
  const skills = await qb.take(limit).getMany();

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        skills: skills.map(s => ({
          path: s.path,
          name: s.name,
          description: s.description,
        })),
        total: skills.length,
      }, null, 2),
    }],
  };
}

async function readSkill(
  ctx: MCPServerContext,
  args: { skill_path: string }
): Promise<CallToolResult> {
  const ds = await getDataSource();
  const repo = ds.getRepository(Skill);

  const skill = await repo.findOne({
    where: {
      collectionId: ctx.collectionId,
      path: args.skill_path.toLowerCase(),
      archivedAt: undefined,
    },
  });

  if (!skill) {
    return {
      content: [{ type: "text", text: `Skill not found: ${args.skill_path}` }],
      isError: true,
    };
  }

  // Try to read SKILL.md from git
  const gitBackend = new DatabaseGitBackend(ds, ctx.collectionId);
  let content = "";
  try {
    const skillMdPath = `${args.skill_path}/SKILL.md`;
    const blob = await gitBackend.getFile("main", skillMdPath);
    if (blob) {
      content = blob.toString("utf-8");
    }
  } catch {
    // Fall back to stored content if any
    content = skill.content || "";
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        path: skill.path,
        name: skill.name,
        description: skill.description,
        metadata: skill.metadata,
        dependencies: skill.dependencies,
        content,
      }, null, 2),
    }],
  };
}

async function readFile(
  ctx: MCPServerContext,
  args: { file_path: string; branch?: string }
): Promise<CallToolResult> {
  const ds = await getDataSource();
  const gitBackend = new DatabaseGitBackend(ds, ctx.collectionId);
  const branch = args.branch || "main";

  try {
    const content = await gitBackend.getFile(branch, args.file_path);
    if (!content) {
      return {
        content: [{ type: "text", text: `File not found: ${args.file_path}` }],
        isError: true,
      };
    }

    // Detect if binary
    const isBinary = content.includes(0);
    if (isBinary) {
      return {
        content: [{
          type: "text",
          text: `Binary file: ${args.file_path} (${content.length} bytes)`,
        }],
      };
    }

    return {
      content: [{
        type: "text",
        text: content.toString("utf-8"),
      }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read file";
    return {
      content: [{ type: "text", text: `Error reading file: ${message}` }],
      isError: true,
    };
  }
}

async function listFiles(
  ctx: MCPServerContext,
  args: { path?: string; branch?: string }
): Promise<CallToolResult> {
  const ds = await getDataSource();
  const gitBackend = new DatabaseGitBackend(ds, ctx.collectionId);
  const branch = args.branch || "main";
  const path = args.path || "";

  try {
    const files = await gitBackend.listFiles(branch, path);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ files, path, branch }, null, 2),
      }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list files";
    return {
      content: [{ type: "text", text: `Error listing files: ${message}` }],
      isError: true,
    };
  }
}

async function createSkill(
  ctx: MCPServerContext,
  args: { skill_path: string; name: string; description?: string; content: string }
): Promise<CallToolResult> {
  const ds = await getDataSource();
  const skillRepo = ds.getRepository(Skill);
  const collectionRepo = ds.getRepository(SkillCollection);

  // Check if skill already exists
  const existing = await skillRepo.findOne({
    where: {
      collectionId: ctx.collectionId,
      path: args.skill_path.toLowerCase(),
      archivedAt: undefined,
    },
  });

  if (existing) {
    return {
      content: [{ type: "text", text: `Skill already exists: ${args.skill_path}` }],
      isError: true,
    };
  }

  // Create skill record
  const skill = skillRepo.create({
    accountId: ctx.accountId,
    collectionId: ctx.collectionId,
    path: args.skill_path.toLowerCase(),
    name: args.name,
    description: args.description || null,
    content: args.content,
    createdById: ctx.userId,
    modifiedById: ctx.userId,
  });

  await skillRepo.save(skill);

  // Update collection skill count
  await collectionRepo.increment({ id: ctx.collectionId }, "skillCount", 1);

  // Write SKILL.md to git
  const gitBackend = new DatabaseGitBackend(ds, ctx.collectionId);
  try {
    await gitBackend.commit({
      branch: "main",
      files: [{ path: `${args.skill_path}/SKILL.md`, content: args.content }],
      message: `Create skill: ${args.name}`,
      author: { name: "Skills-Dojo", email: "system@skillsdojo.ai" },
    });
  } catch {
    // Git write is optional, skill record is primary
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: true,
        action: "skill_created",
        message: `Skill "${skill.name}" created successfully`,
        skill: {
          id: skill.id,
          path: skill.path,
          name: skill.name,
        },
      }, null, 2),
    }],
  };
}

async function updateSkill(
  ctx: MCPServerContext,
  args: { skill_path: string; name?: string; description?: string; content?: string }
): Promise<CallToolResult> {
  const ds = await getDataSource();
  const skillRepo = ds.getRepository(Skill);

  const skill = await skillRepo.findOne({
    where: {
      collectionId: ctx.collectionId,
      path: args.skill_path.toLowerCase(),
      archivedAt: undefined,
    },
  });

  if (!skill) {
    return {
      content: [{ type: "text", text: `Skill not found: ${args.skill_path}` }],
      isError: true,
    };
  }

  // Update fields
  if (args.name) skill.name = args.name;
  if (args.description !== undefined) skill.description = args.description;
  if (args.content) skill.content = args.content;
  skill.modifiedById = ctx.userId;
  skill.modifiedAt = new Date();

  await skillRepo.save(skill);

  // Update git if content changed
  if (args.content) {
    const gitBackend = new DatabaseGitBackend(ds, ctx.collectionId);
    try {
      await gitBackend.commit({
        branch: "main",
        files: [{ path: `${args.skill_path}/SKILL.md`, content: args.content }],
        message: `Update skill: ${skill.name}`,
        author: { name: "Skills-Dojo", email: "system@skillsdojo.ai" },
      });
    } catch {
      // Git write is optional
    }
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: true,
        action: "skill_updated",
        message: `Skill "${skill.name}" updated successfully`,
        skill: {
          id: skill.id,
          path: skill.path,
          name: skill.name,
        },
      }, null, 2),
    }],
  };
}

async function editSkillUi(
  ctx: MCPServerContext,
  args: { skill_path?: string }
): Promise<CallToolResult> {
  // Return simple JSON - Claude Desktop will use _meta.ui/resourceUri to fetch the MCP app
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        action: "open_editor",
        skill_path: args.skill_path || null,
        message: args.skill_path
          ? `Opening skill editor for: ${args.skill_path}`
          : "Opening skill editor for new skill",
      }, null, 2),
    }],
  };
}

async function listPullRequests(
  ctx: MCPServerContext,
  args: { status?: string; limit?: number }
): Promise<CallToolResult> {
  const ds = await getDataSource();
  const repo = ds.getRepository(PullRequest);

  const qb = repo
    .createQueryBuilder("pr")
    .where("pr.collectionId = :collectionId", { collectionId: ctx.collectionId })
    .andWhere("pr.archivedAt IS NULL")
    .orderBy("pr.createdAt", "DESC");

  if (args.status && args.status !== "all") {
    qb.andWhere("pr.status = :status", { status: args.status });
  }

  const limit = Math.min(100, args.limit || 20);
  const prs = await qb.take(limit).getMany();

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        pullRequests: prs.map(pr => ({
          number: pr.number,
          title: pr.title,
          status: pr.status,
          sourceBranch: pr.sourceBranch,
          targetBranch: pr.targetBranch,
          createdAt: pr.createdAt,
        })),
        total: prs.length,
      }, null, 2),
    }],
  };
}

async function getPullRequest(
  ctx: MCPServerContext,
  args: { pr_number: number }
): Promise<CallToolResult> {
  const ds = await getDataSource();
  const repo = ds.getRepository(PullRequest);

  const pr = await repo.findOne({
    where: {
      collectionId: ctx.collectionId,
      number: args.pr_number,
      archivedAt: undefined,
    },
  });

  if (!pr) {
    return {
      content: [{ type: "text", text: `Pull request #${args.pr_number} not found` }],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          number: pr.number,
          title: pr.title,
          description: pr.description,
          status: pr.status,
          sourceBranch: pr.sourceBranch,
          targetBranch: pr.targetBranch,
          sourceCommitSha: pr.sourceCommitSha,
          targetCommitSha: pr.targetCommitSha,
          createdAt: pr.createdAt,
          mergedAt: pr.mergedAt,
        }, null, 2),
      },
    ],
  };
}

async function viewPullRequestUi(
  ctx: MCPServerContext,
  args: { pr_number: number }
): Promise<CallToolResult> {
  // Return PR data for the UI - Claude Desktop will use _meta.ui/resourceUri to fetch the MCP app
  return getPullRequest(ctx, args);
}

async function createPullRequest(
  ctx: MCPServerContext,
  args: { title: string; description?: string; source_branch: string; target_branch?: string }
): Promise<CallToolResult> {
  const ds = await getDataSource();
  const repo = ds.getRepository(PullRequest);

  // Get next PR number for this collection
  const lastPr = await repo
    .createQueryBuilder("pr")
    .where("pr.collectionId = :collectionId", { collectionId: ctx.collectionId })
    .orderBy("pr.number", "DESC")
    .getOne();

  const nextNumber = (lastPr?.number || 0) + 1;

  const pr = repo.create({
    accountId: ctx.accountId,
    collectionId: ctx.collectionId,
    number: nextNumber,
    title: args.title,
    description: args.description || null,
    status: "open",
    sourceBranch: args.source_branch,
    targetBranch: args.target_branch || "main",
    createdById: ctx.userId,
    modifiedById: ctx.userId,
  });

  await repo.save(pr);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: true,
        action: "pr_created",
        message: `Pull request #${pr.number} created successfully`,
        pullRequest: {
          number: pr.number,
          title: pr.title,
          status: pr.status,
          sourceBranch: pr.sourceBranch,
          targetBranch: pr.targetBranch,
        },
      }, null, 2),
    }],
  };
}

async function mergePullRequest(
  ctx: MCPServerContext,
  args: { pr_number: number }
): Promise<CallToolResult> {
  const ds = await getDataSource();
  const repo = ds.getRepository(PullRequest);

  const pr = await repo.findOne({
    where: {
      collectionId: ctx.collectionId,
      number: args.pr_number,
      archivedAt: undefined,
    },
  });

  if (!pr) {
    return {
      content: [{ type: "text", text: `Pull request #${args.pr_number} not found` }],
      isError: true,
    };
  }

  if (pr.status !== "open") {
    return {
      content: [{ type: "text", text: `Pull request #${args.pr_number} is not open (status: ${pr.status})` }],
      isError: true,
    };
  }

  // TODO: Actually merge the branches using git backend

  pr.status = "merged";
  pr.mergedAt = new Date();
  pr.mergedById = ctx.userId;
  pr.modifiedById = ctx.userId;
  pr.modifiedAt = new Date();

  await repo.save(pr);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: true,
        action: "pr_merged",
        message: `Pull request #${pr.number} merged successfully`,
        pullRequest: {
          number: pr.number,
          title: pr.title,
          status: pr.status,
          mergedAt: pr.mergedAt,
        },
      }, null, 2),
    }],
  };
}

async function searchSkills(
  ctx: MCPServerContext,
  args: { query: string; limit?: number }
): Promise<CallToolResult> {
  const ds = await getDataSource();
  const repo = ds.getRepository(Skill);

  const limit = Math.min(100, args.limit || 20);

  const skills = await repo
    .createQueryBuilder("skill")
    .where("skill.collectionId = :collectionId", { collectionId: ctx.collectionId })
    .andWhere("skill.archivedAt IS NULL")
    .andWhere(
      "(skill.name ILIKE :query OR skill.description ILIKE :query OR skill.path ILIKE :query)",
      { query: `%${args.query}%` }
    )
    .orderBy("skill.modifiedAt", "DESC")
    .take(limit)
    .getMany();

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        query: args.query,
        results: skills.map(s => ({
          path: s.path,
          name: s.name,
          description: s.description,
        })),
        total: skills.length,
      }, null, 2),
    }],
  };
}

async function browseCollectionUi(ctx: MCPServerContext): Promise<CallToolResult> {
  // Return simple JSON - Claude Desktop will use _meta.ui/resourceUri to fetch the MCP app
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        action: "open_browser",
        message: "Opening collection browser",
      }, null, 2),
    }],
  };
}

async function createPullRequestUi(
  ctx: MCPServerContext,
  args: { source_branch?: string; target_branch?: string }
): Promise<CallToolResult> {
  // Return data for the PR creator UI
  const ds = await getDataSource();
  const gitBackend = new DatabaseGitBackend(ds, ctx.collectionId);

  // Get list of branches for the UI
  let branches: string[] = [];
  try {
    branches = await gitBackend.listBranches();
  } catch {
    branches = ["main"];
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        action: "open_pr_creator",
        branches,
        source_branch: args.source_branch || null,
        target_branch: args.target_branch || "main",
        message: "Opening pull request creator",
      }, null, 2),
    }],
  };
}

async function viewSkillUi(
  ctx: MCPServerContext,
  args: { skill_path: string }
): Promise<CallToolResult> {
  // Return data for the skill viewer UI
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        action: "open_skill_viewer",
        skill_path: args.skill_path,
        message: `Opening skill viewer for: ${args.skill_path}`,
      }, null, 2),
    }],
  };
}
