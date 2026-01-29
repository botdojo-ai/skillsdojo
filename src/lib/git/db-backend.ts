import { DataSource } from "typeorm";
import { GitObject, GitObjectType } from "@/entities/GitObject";
import { GitRef } from "@/entities/GitRef";
import { GitFileIndex } from "@/entities/GitFileIndex";
import pako from "pako";
import { createHash } from "crypto";

/**
 * Git backend that stores objects in the database.
 * Implements a subset of git operations for skill management.
 */
export class DatabaseGitBackend {
  constructor(
    private ds: DataSource,
    private repoId: string
  ) {}

  // === OBJECT OPERATIONS ===

  /**
   * Store a blob (file content)
   */
  async writeBlob(content: Buffer | string): Promise<string> {
    const data = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
    return this.writeObject("blob", data);
  }

  /**
   * Read a blob
   */
  async readBlob(sha: string): Promise<Buffer | null> {
    const obj = await this.readObject(sha);
    if (!obj || obj.type !== "blob") return null;
    return obj.content;
  }

  /**
   * Write a git object
   */
  async writeObject(type: GitObjectType, content: Buffer): Promise<string> {
    // Calculate SHA-1 hash (git format: type + space + size + null byte + content)
    const header = `${type} ${content.length}\0`;
    const store = Buffer.concat([Buffer.from(header), content]);
    const sha = createHash("sha1").update(store).digest("hex");

    // Check if object already exists (content-addressed)
    const repo = this.ds.getRepository(GitObject);
    const existing = await repo.findOne({
      where: { sha, repoId: this.repoId },
    });

    if (!existing) {
      // Compress content for storage
      const compressed = Buffer.from(pako.deflate(content));

      await repo.save({
        sha,
        repoId: this.repoId,
        type,
        content: compressed,
        size: content.length,
      });
    }

    return sha;
  }

  /**
   * Read a git object
   */
  async readObject(sha: string): Promise<{ type: GitObjectType; content: Buffer } | null> {
    const repo = this.ds.getRepository(GitObject);
    const obj = await repo.findOne({
      where: { sha, repoId: this.repoId },
    });

    if (!obj) return null;

    // Decompress content
    const content = Buffer.from(pako.inflate(obj.content));

    return {
      type: obj.type,
      content,
    };
  }

  /**
   * Check if object exists
   */
  async hasObject(sha: string): Promise<boolean> {
    const repo = this.ds.getRepository(GitObject);
    const count = await repo.count({
      where: { sha, repoId: this.repoId },
    });
    return count > 0;
  }

  // === TREE OPERATIONS ===

  /**
   * Create a tree from file entries
   */
  async writeTree(entries: Array<{ mode: string; name: string; sha: string }>): Promise<string> {
    // Sort entries by name (git requirement)
    const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));

    // Build tree content
    const parts: Buffer[] = [];
    for (const entry of sorted) {
      // Format: mode + space + name + null byte + sha (binary)
      const head = Buffer.from(`${entry.mode} ${entry.name}\0`);
      const shaBytes = Buffer.from(entry.sha, "hex");
      parts.push(head, shaBytes);
    }

    const content = Buffer.concat(parts);
    return this.writeObject("tree", content);
  }

  /**
   * Read a tree
   */
  async readTree(sha: string): Promise<Array<{ mode: string; name: string; sha: string }> | null> {
    const obj = await this.readObject(sha);
    if (!obj || obj.type !== "tree") return null;

    const entries: Array<{ mode: string; name: string; sha: string }> = [];
    let offset = 0;
    const content = obj.content;

    while (offset < content.length) {
      // Find space (end of mode)
      const spaceIdx = content.indexOf(0x20, offset);
      const mode = content.subarray(offset, spaceIdx).toString("ascii");

      // Find null byte (end of name)
      const nullIdx = content.indexOf(0x00, spaceIdx + 1);
      const name = content.subarray(spaceIdx + 1, nullIdx).toString("utf-8");

      // Read 20-byte SHA
      const shaBytes = content.subarray(nullIdx + 1, nullIdx + 21);
      const sha = shaBytes.toString("hex");

      entries.push({ mode, name, sha });
      offset = nullIdx + 21;
    }

    return entries;
  }

  // === COMMIT OPERATIONS ===

  /**
   * Create a commit
   */
  async writeCommit(params: {
    treeSha: string;
    parentSha?: string | null;
    message: string;
    author: { name: string; email: string };
    committer?: { name: string; email: string };
  }): Promise<string> {
    const timestamp = Math.floor(Date.now() / 1000);
    const timezone = "+0000"; // UTC

    const committer = params.committer || params.author;

    let content = `tree ${params.treeSha}\n`;
    if (params.parentSha) {
      content += `parent ${params.parentSha}\n`;
    }
    content += `author ${params.author.name} <${params.author.email}> ${timestamp} ${timezone}\n`;
    content += `committer ${committer.name} <${committer.email}> ${timestamp} ${timezone}\n`;
    content += `\n${params.message}\n`;

    return this.writeObject("commit", Buffer.from(content, "utf-8"));
  }

  /**
   * Read a commit
   */
  async readCommit(sha: string): Promise<{
    treeSha: string;
    parentSha: string | null;
    message: string;
    author: { name: string; email: string; timestamp: number };
    committer: { name: string; email: string; timestamp: number };
  } | null> {
    const obj = await this.readObject(sha);
    if (!obj || obj.type !== "commit") return null;

    const content = obj.content.toString("utf-8");
    const lines = content.split("\n");

    let treeSha = "";
    let parentSha: string | null = null;
    let author = { name: "", email: "", timestamp: 0 };
    let committer = { name: "", email: "", timestamp: 0 };
    let messageStart = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === "") {
        messageStart = i + 1;
        break;
      }

      if (line.startsWith("tree ")) {
        treeSha = line.slice(5);
      } else if (line.startsWith("parent ")) {
        parentSha = line.slice(7);
      } else if (line.startsWith("author ")) {
        author = this.parsePersonLine(line.slice(7));
      } else if (line.startsWith("committer ")) {
        committer = this.parsePersonLine(line.slice(10));
      }
    }

    const message = lines.slice(messageStart).join("\n").trim();

    return { treeSha, parentSha, message, author, committer };
  }

  private parsePersonLine(line: string): { name: string; email: string; timestamp: number } {
    // Format: Name <email> timestamp timezone
    const match = line.match(/^(.+?) <(.+?)> (\d+) [+-]\d{4}$/);
    if (!match) {
      return { name: "", email: "", timestamp: 0 };
    }
    return {
      name: match[1],
      email: match[2],
      timestamp: parseInt(match[3], 10),
    };
  }

  // === REF OPERATIONS ===

  /**
   * Get a ref
   */
  async getRef(refName: string): Promise<string | null> {
    const repo = this.ds.getRepository(GitRef);
    const ref = await repo.findOne({
      where: { repoId: this.repoId, refName },
    });

    if (!ref) return null;

    // Resolve symbolic refs
    if (ref.symbolicRef) {
      return this.getRef(ref.symbolicRef);
    }

    return ref.sha;
  }

  /**
   * Set a ref
   */
  async setRef(refName: string, sha: string): Promise<void> {
    const repo = this.ds.getRepository(GitRef);
    const existing = await repo.findOne({
      where: { repoId: this.repoId, refName },
    });

    if (existing) {
      existing.sha = sha;
      existing.symbolicRef = null;
      await repo.save(existing);
    } else {
      await repo.save({
        repoId: this.repoId,
        refName,
        sha,
        symbolicRef: null,
      });
    }
  }

  /**
   * Set symbolic ref
   */
  async setSymbolicRef(refName: string, target: string): Promise<void> {
    const repo = this.ds.getRepository(GitRef);
    const existing = await repo.findOne({
      where: { repoId: this.repoId, refName },
    });

    if (existing) {
      existing.sha = null;
      existing.symbolicRef = target;
      await repo.save(existing);
    } else {
      await repo.save({
        repoId: this.repoId,
        refName,
        sha: null,
        symbolicRef: target,
      });
    }
  }

  /**
   * List all refs
   */
  async listRefs(): Promise<Array<{ refName: string; sha: string | null; symbolicRef: string | null }>> {
    const repo = this.ds.getRepository(GitRef);
    const refs = await repo.find({
      where: { repoId: this.repoId },
    });
    return refs.map((r) => ({
      refName: r.refName,
      sha: r.sha,
      symbolicRef: r.symbolicRef,
    }));
  }

  // === FILE INDEX OPERATIONS ===

  /**
   * Update file index for a branch
   */
  async updateFileIndex(branch: string, treeSha: string, basePath: string = ""): Promise<void> {
    const repo = this.ds.getRepository(GitFileIndex);

    // Delete existing index for this branch
    await repo.delete({ repoId: this.repoId, branch });

    // Walk tree and create index entries
    await this.indexTree(repo, branch, treeSha, basePath);
  }

  private async indexTree(
    repo: ReturnType<typeof this.ds.getRepository<GitFileIndex>>,
    branch: string,
    treeSha: string,
    basePath: string
  ): Promise<void> {
    const entries = await this.readTree(treeSha);
    if (!entries) return;

    for (const entry of entries) {
      const path = basePath ? `${basePath}/${entry.name}` : entry.name;

      if (entry.mode === "40000") {
        // Directory - recurse
        await this.indexTree(repo, branch, entry.sha, path);
      } else {
        // File - add to index
        await repo.save({
          repoId: this.repoId,
          branch,
          path,
          blobSha: entry.sha,
          mode: entry.mode,
        });
      }
    }
  }

  /**
   * Get file from index
   */
  async getFile(branch: string, path: string): Promise<Buffer | null> {
    const repo = this.ds.getRepository(GitFileIndex);
    const entry = await repo.findOne({
      where: { repoId: this.repoId, branch, path },
    });

    if (!entry) return null;
    return this.readBlob(entry.blobSha);
  }

  /**
   * List files in a directory
   */
  async listFiles(branch: string, dirPath: string = ""): Promise<Array<{ path: string; mode: string; blobSha: string }>> {
    const repo = this.ds.getRepository(GitFileIndex);
    const qb = repo
      .createQueryBuilder("file")
      .where("file.repoId = :repoId", { repoId: this.repoId })
      .andWhere("file.branch = :branch", { branch });

    if (dirPath) {
      qb.andWhere("file.path LIKE :prefix", { prefix: `${dirPath}/%` });
    }

    const entries = await qb.getMany();
    return entries.map((e) => ({
      path: e.path,
      mode: e.mode,
      blobSha: e.blobSha,
    }));
  }

  /**
   * List all files from a tree SHA (walks tree recursively)
   */
  async listFilesFromTree(treeSha: string, basePath: string = ""): Promise<Array<{ path: string; mode: string; blobSha: string }>> {
    const entries = await this.readTree(treeSha);
    if (!entries) return [];

    const files: Array<{ path: string; mode: string; blobSha: string }> = [];

    for (const entry of entries) {
      const path = basePath ? `${basePath}/${entry.name}` : entry.name;

      if (entry.mode === "40000") {
        // Directory - recurse
        const subFiles = await this.listFilesFromTree(entry.sha, path);
        files.push(...subFiles);
      } else {
        // File
        files.push({
          path,
          mode: entry.mode,
          blobSha: entry.sha,
        });
      }
    }

    return files;
  }

  // === HIGH-LEVEL OPERATIONS ===

  /**
   * Initialize empty repository
   */
  async init(): Promise<void> {
    // Create empty tree
    const emptyTreeSha = await this.writeTree([]);

    // Create initial commit
    const commitSha = await this.writeCommit({
      treeSha: emptyTreeSha,
      message: "Initial commit",
      author: { name: "SkillsDojo", email: "system@skillsdojo.ai" },
    });

    // Set refs
    await this.setRef("refs/heads/main", commitSha);
    await this.setSymbolicRef("HEAD", "refs/heads/main");

    // Update file index
    await this.updateFileIndex("main", emptyTreeSha);
  }

  /**
   * Create a commit with file changes
   */
  async commit(params: {
    branch: string;
    files: Array<{ path: string; content: string | Buffer }>;
    deletedPaths?: string[];
    message: string;
    author: { name: string; email: string };
  }): Promise<string> {
    const { branch, files, deletedPaths = [], message, author } = params;

    // Get current commit
    const refName = `refs/heads/${branch}`;
    const parentSha = await this.getRef(refName);

    // Get current tree
    let currentEntries: Map<string, { mode: string; sha: string }> = new Map();
    if (parentSha) {
      const commit = await this.readCommit(parentSha);
      if (commit) {
        // Try to get files from the file index first
        let fileList = await this.listFiles(branch);

        // If branch index is empty (e.g., new branch), get files from tree directly
        if (fileList.length === 0 && commit.treeSha) {
          fileList = await this.listFilesFromTree(commit.treeSha);
        }

        for (const file of fileList) {
          currentEntries.set(file.path, { mode: file.mode, sha: file.blobSha });
        }
      }
    }

    // Apply changes
    for (const file of files) {
      const blobSha = await this.writeBlob(file.content);
      currentEntries.set(file.path, { mode: "100644", sha: blobSha });
    }

    for (const path of deletedPaths) {
      currentEntries.delete(path);
    }

    // Build tree structure
    const treeSha = await this.buildTreeFromPaths(currentEntries);

    // Create commit
    const commitSha = await this.writeCommit({
      treeSha,
      parentSha,
      message,
      author,
    });

    // Update ref
    await this.setRef(refName, commitSha);

    // Update file index
    await this.updateFileIndex(branch, treeSha);

    return commitSha;
  }

  /**
   * Get commit history for a file
   */
  async getFileHistory(
    branch: string,
    filePath: string,
    limit: number = 50
  ): Promise<Array<{
    commitSha: string;
    message: string;
    author: { name: string; email: string; timestamp: number };
    blobSha: string;
  }>> {
    const history: Array<{
      commitSha: string;
      message: string;
      author: { name: string; email: string; timestamp: number };
      blobSha: string;
    }> = [];

    // Get current commit
    const refName = `refs/heads/${branch}`;
    let currentSha = await this.getRef(refName);
    let lastBlobSha: string | null = null;

    while (currentSha && history.length < limit) {
      const commit = await this.readCommit(currentSha);
      if (!commit) break;

      // Get blob SHA for the file at this commit
      const blobSha = await this.getBlobShaFromTree(commit.treeSha, filePath);

      // Only add to history if the file exists and changed
      if (blobSha && blobSha !== lastBlobSha) {
        history.push({
          commitSha: currentSha,
          message: commit.message,
          author: commit.author,
          blobSha,
        });
        lastBlobSha = blobSha;
      }

      // Move to parent
      currentSha = commit.parentSha;
    }

    return history;
  }

  /**
   * Get blob SHA for a file path from a tree
   */
  private async getBlobShaFromTree(treeSha: string, filePath: string): Promise<string | null> {
    const parts = filePath.split("/");
    let currentTreeSha = treeSha;

    for (let i = 0; i < parts.length; i++) {
      const entries = await this.readTree(currentTreeSha);
      if (!entries) return null;

      const entry = entries.find((e) => e.name === parts[i]);
      if (!entry) return null;

      if (i === parts.length - 1) {
        // Last part - should be a file
        return entry.mode !== "40000" ? entry.sha : null;
      } else {
        // Not last part - should be a directory
        if (entry.mode !== "40000") return null;
        currentTreeSha = entry.sha;
      }
    }

    return null;
  }

  /**
   * Get file content at a specific commit
   */
  async getFileAtCommit(commitSha: string, filePath: string): Promise<string | null> {
    const commit = await this.readCommit(commitSha);
    if (!commit) return null;

    const blobSha = await this.getBlobShaFromTree(commit.treeSha, filePath);
    if (!blobSha) return null;

    const content = await this.readBlob(blobSha);
    return content ? content.toString("utf-8") : null;
  }

  private async buildTreeFromPaths(
    entries: Map<string, { mode: string; sha: string }>
  ): Promise<string> {
    // Group files by top-level directory
    const root: Map<string, { mode: string; name: string; sha: string } | Map<string, { mode: string; sha: string }>> = new Map();

    for (const [path, { mode, sha }] of entries) {
      const parts = path.split("/");
      const name = parts[0];

      if (parts.length === 1) {
        // File at root
        root.set(name, { mode, name, sha });
      } else {
        // File in subdirectory
        let subMap = root.get(name);
        if (!subMap || !(subMap instanceof Map)) {
          subMap = new Map<string, { mode: string; sha: string }>();
          root.set(name, subMap);
        }
        const subPath = parts.slice(1).join("/");
        (subMap as Map<string, { mode: string; sha: string }>).set(subPath, { mode, sha });
      }
    }

    // Build tree entries
    const treeEntries: Array<{ mode: string; name: string; sha: string }> = [];

    for (const [name, value] of root) {
      if (value instanceof Map) {
        // Subdirectory - recursively build tree
        const subTreeSha = await this.buildTreeFromPaths(value);
        treeEntries.push({ mode: "40000", name, sha: subTreeSha });
      } else {
        // File
        treeEntries.push(value);
      }
    }

    return this.writeTree(treeEntries);
  }
}
