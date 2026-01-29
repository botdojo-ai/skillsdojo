import { createHash } from "crypto";
import * as zlib from "zlib";
import { DataSource, IsNull } from "typeorm";
import { GitObject } from "@/entities/GitObject";
import { Skill } from "@/entities/Skill";
import pako from "pako";

/**
 * Git object types as numbers for pack format
 */
const OBJ_COMMIT = 1;
const OBJ_TREE = 2;
const OBJ_BLOB = 3;
// const OBJ_TAG = 4;

function getObjectTypeNumber(type: string): number {
  switch (type) {
    case "commit": return OBJ_COMMIT;
    case "tree": return OBJ_TREE;
    case "blob": return OBJ_BLOB;
    default: throw new Error(`Unknown object type: ${type}`);
  }
}

/**
 * Encode a variable-length integer for pack format
 */
function encodeVarint(value: number): Buffer {
  const bytes: number[] = [];
  let v = value;

  // First byte has 4 bits of type info taken
  bytes.push(v & 0x7f);
  v >>= 7;

  while (v > 0) {
    bytes[bytes.length - 1] |= 0x80; // Set MSB continuation bit
    bytes.push(v & 0x7f);
    v >>= 7;
  }

  return Buffer.from(bytes);
}

/**
 * Encode pack object header (type + size)
 */
function encodePackObjectHeader(type: number, size: number): Buffer {
  const bytes: number[] = [];

  // First byte: 1 bit MSB + 3 bits type + 4 bits size
  let byte = (type << 4) | (size & 0x0f);
  size >>= 4;

  while (size > 0) {
    byte |= 0x80; // Set continuation bit
    bytes.push(byte);
    byte = size & 0x7f;
    size >>= 7;
  }

  bytes.push(byte);
  return Buffer.from(bytes);
}

/**
 * Decompress git object content (stored with pako.deflate)
 */
function decompressContent(content: Buffer): Buffer {
  try {
    return Buffer.from(pako.inflate(content));
  } catch {
    // Already uncompressed
    return content;
  }
}

/**
 * Collect all objects reachable from a commit
 */
async function collectObjects(
  ds: DataSource,
  repoId: string,
  startShas: string[],
  haveShas: Set<string> = new Set()
): Promise<Map<string, { type: string; content: Buffer }>> {
  const objects = new Map<string, { type: string; content: Buffer }>();
  const visited = new Set<string>(haveShas);
  const queue = [...startShas];

  const gitObjectRepo = ds.getRepository(GitObject);

  while (queue.length > 0) {
    const sha = queue.shift()!;

    if (visited.has(sha)) continue;
    visited.add(sha);

    const obj = await gitObjectRepo.findOne({
      where: { sha, repoId },
    });

    if (!obj) continue;

    const content = decompressContent(obj.content);
    objects.set(sha, { type: obj.type, content });

    // Parse object and add referenced objects to queue
    if (obj.type === "commit") {
      // Parse commit to find tree and parent
      const commitText = content.toString("utf-8");
      const lines = commitText.split("\n");

      for (const line of lines) {
        if (line.startsWith("tree ")) {
          const treeSha = line.slice(5).trim();
          if (!visited.has(treeSha)) queue.push(treeSha);
        } else if (line.startsWith("parent ")) {
          const parentSha = line.slice(7).trim();
          if (!visited.has(parentSha)) queue.push(parentSha);
        } else if (line === "") {
          break; // End of headers
        }
      }
    } else if (obj.type === "tree") {
      // Parse tree to find blobs and subtrees
      let offset = 0;
      while (offset < content.length) {
        // Format: mode SP name NUL sha(20 bytes)
        const spaceIdx = content.indexOf(0x20, offset);
        const nullIdx = content.indexOf(0x00, spaceIdx);

        if (spaceIdx === -1 || nullIdx === -1) break;

        const entrySha = content.slice(nullIdx + 1, nullIdx + 21).toString("hex");
        if (!visited.has(entrySha)) queue.push(entrySha);

        offset = nullIdx + 21;
      }
    }
  }

  return objects;
}

/**
 * Compute git object SHA
 */
function computeObjectSha(type: string, content: Buffer): string {
  const header = `${type} ${content.length}\0`;
  const store = Buffer.concat([Buffer.from(header), content]);
  return createHash("sha1").update(store).digest("hex");
}

/**
 * Generate virtual git objects from skills (for collections without real git data)
 */
async function generateVirtualObjects(
  ds: DataSource,
  repoId: string,
  virtualCommitSha: string
): Promise<Map<string, { type: string; content: Buffer }>> {
  const objects = new Map<string, { type: string; content: Buffer }>();

  const skillRepo = ds.getRepository(Skill);
  const skills = await skillRepo.find({
    where: { collectionId: repoId, archivedAt: IsNull() },
    order: { path: "ASC" },
  });

  // Build nested tree structure
  // Structure: { "skill-name": { "SKILL.md": blobSha } }
  const treeStructure: Map<string, Map<string, string>> = new Map();

  for (const skill of skills) {
    // Create SKILL.md content
    const content = skill.content || generateDefaultSkillMd(skill);
    const blobContent = Buffer.from(content, "utf-8");
    const blobSha = computeObjectSha("blob", blobContent);

    objects.set(blobSha, { type: "blob", content: blobContent });

    // Add to tree structure
    if (!treeStructure.has(skill.path)) {
      treeStructure.set(skill.path, new Map());
    }
    treeStructure.get(skill.path)!.set("SKILL.md", blobSha);
  }

  // Create subtree for each skill directory inside a "skills/" folder
  const skillsEntries: { mode: string; name: string; sha: string }[] = [];

  for (const [skillPath, files] of treeStructure) {
    // Create subtree for this skill
    const subtreeEntries: { mode: string; name: string; sha: string }[] = [];
    for (const [filename, blobSha] of files) {
      subtreeEntries.push({ mode: "100644", name: filename, sha: blobSha });
    }

    const subtreeContent = buildTreeContent(subtreeEntries);
    const subtreeSha = computeObjectSha("tree", subtreeContent);
    objects.set(subtreeSha, { type: "tree", content: subtreeContent });

    // Add subtree to skills directory
    skillsEntries.push({ mode: "40000", name: skillPath, sha: subtreeSha });
  }

  // Create "skills" directory tree
  const skillsDirContent = buildTreeContent(skillsEntries);
  const skillsDirSha = computeObjectSha("tree", skillsDirContent);
  objects.set(skillsDirSha, { type: "tree", content: skillsDirContent });

  // Create root tree with "skills" directory
  const rootEntries: { mode: string; name: string; sha: string }[] = [
    { mode: "40000", name: "skills", sha: skillsDirSha },
  ];
  const rootTreeContent = buildTreeContent(rootEntries);
  const rootTreeSha = computeObjectSha("tree", rootTreeContent);
  objects.set(rootTreeSha, { type: "tree", content: rootTreeContent });

  // Generate commit with deterministic timestamp (based on tree SHA for reproducibility)
  const commitContent = buildCommitContentDeterministic(rootTreeSha, "Virtual commit from skills database");
  const actualCommitSha = computeObjectSha("commit", commitContent);
  objects.set(actualCommitSha, { type: "commit", content: commitContent });

  // Note: virtualCommitSha passed in may not match actualCommitSha
  // We return objects keyed by actual SHA - caller must use correct SHA

  return objects;
}

/**
 * Build git tree content from entries
 */
function buildTreeContent(entries: { mode: string; name: string; sha: string }[]): Buffer {
  const chunks: Buffer[] = [];

  // Sort entries by name (git requirement)
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    // Format: mode SP name NUL sha(20 bytes binary)
    chunks.push(Buffer.from(`${entry.mode} ${entry.name}\0`));
    chunks.push(Buffer.from(entry.sha, "hex"));
  }

  return Buffer.concat(chunks);
}

/**
 * Build git commit content with deterministic timestamp
 */
function buildCommitContentDeterministic(treeSha: string, message: string): Buffer {
  // Use a fixed timestamp for reproducibility
  const timestamp = 1704067200; // 2024-01-01 00:00:00 UTC
  const timezone = "+0000";
  const author = `SkillsDojo <noreply@skillsdojo.ai> ${timestamp} ${timezone}`;

  const lines = [
    `tree ${treeSha}`,
    `author ${author}`,
    `committer ${author}`,
    "",
    message,
  ];

  return Buffer.from(lines.join("\n") + "\n");
}

/**
 * Generate default SKILL.md content
 */
function generateDefaultSkillMd(skill: Skill): string {
  return `---
name: ${skill.name}
description: ${skill.description || "A skill for AI agents"}
---

# ${skill.name}

${skill.description || "A skill for AI agents."}
`;
}

/**
 * Check if this is a virtual commit SHA (needs virtual object generation)
 */
async function isVirtualCommit(ds: DataSource, repoId: string, sha: string): Promise<boolean> {
  const gitObjectRepo = ds.getRepository(GitObject);
  const obj = await gitObjectRepo.findOne({
    where: { sha, repoId },
  });
  return !obj;
}

/**
 * Generate virtual commit SHA for a collection (exported for use in info/refs)
 * This must match what generateVirtualObjects produces
 */
export async function generateVirtualCommitSha(
  ds: DataSource,
  repoId: string
): Promise<string> {
  const skillRepo = ds.getRepository(Skill);
  const skills = await skillRepo.find({
    where: { collectionId: repoId, archivedAt: IsNull() },
    order: { path: "ASC" },
  });

  // Build the same tree structure as generateVirtualObjects
  const treeStructure: Map<string, Map<string, string>> = new Map();

  for (const skill of skills) {
    const content = skill.content || generateDefaultSkillMd(skill);
    const blobContent = Buffer.from(content, "utf-8");
    const blobSha = computeObjectSha("blob", blobContent);

    if (!treeStructure.has(skill.path)) {
      treeStructure.set(skill.path, new Map());
    }
    treeStructure.get(skill.path)!.set("SKILL.md", blobSha);
  }

  // Create subtrees for each skill inside a "skills/" directory
  const skillsEntries: { mode: string; name: string; sha: string }[] = [];

  for (const [skillPath, files] of treeStructure) {
    const subtreeEntries: { mode: string; name: string; sha: string }[] = [];
    for (const [filename, blobSha] of files) {
      subtreeEntries.push({ mode: "100644", name: filename, sha: blobSha });
    }

    const subtreeContent = buildTreeContent(subtreeEntries);
    const subtreeSha = computeObjectSha("tree", subtreeContent);

    skillsEntries.push({ mode: "40000", name: skillPath, sha: subtreeSha });
  }

  // Create "skills" directory tree
  const skillsDirContent = buildTreeContent(skillsEntries);
  const skillsDirSha = computeObjectSha("tree", skillsDirContent);

  // Create root tree with "skills" directory
  const rootEntries: { mode: string; name: string; sha: string }[] = [
    { mode: "40000", name: "skills", sha: skillsDirSha },
  ];
  const rootTreeContent = buildTreeContent(rootEntries);
  const rootTreeSha = computeObjectSha("tree", rootTreeContent);

  // Create commit
  const commitContent = buildCommitContentDeterministic(rootTreeSha, "Virtual commit from skills database");
  return computeObjectSha("commit", commitContent);
}

/**
 * Generate a git packfile from objects
 */
export async function generatePackfile(
  ds: DataSource,
  repoId: string,
  wantShas: string[],
  haveShas: string[] = []
): Promise<Buffer> {
  // Check if we need virtual objects
  let objects: Map<string, { type: string; content: Buffer }>;

  if (wantShas.length > 0 && await isVirtualCommit(ds, repoId, wantShas[0])) {
    // Generate virtual objects from skills
    objects = await generateVirtualObjects(ds, repoId, wantShas[0]);
  } else {
    // Collect real objects
    const haveSet = new Set(haveShas);
    objects = await collectObjects(ds, repoId, wantShas, haveSet);
  }

  // Pack header: PACK + version (2) + object count
  const header = Buffer.alloc(12);
  header.write("PACK", 0);
  header.writeUInt32BE(2, 4); // Version 2
  header.writeUInt32BE(objects.size, 8);

  const chunks: Buffer[] = [header];

  // Add each object
  for (const [, obj] of objects) {
    const typeNum = getObjectTypeNumber(obj.type);

    // Compress the content
    const compressed = zlib.deflateSync(obj.content);

    // Pack object header
    const objHeader = encodePackObjectHeader(typeNum, obj.content.length);

    chunks.push(objHeader);
    chunks.push(compressed);
  }

  // Combine all chunks
  const packData = Buffer.concat(chunks);

  // Calculate SHA-1 checksum of pack data and append
  const checksum = createHash("sha1").update(packData).digest();

  return Buffer.concat([packData, checksum]);
}

/**
 * Parse git protocol pkt-line format
 */
export function parsePktLines(data: Buffer): string[] {
  const lines: string[] = [];
  let offset = 0;

  while (offset < data.length) {
    // Read 4 hex digits for length
    const lengthHex = data.slice(offset, offset + 4).toString("ascii");
    const length = parseInt(lengthHex, 16);

    if (length === 0) {
      // Flush packet
      lines.push("flush");
      offset += 4;
      continue;
    }

    if (length < 4) {
      break; // Invalid
    }

    // Read the line content (length includes the 4 length bytes)
    const content = data.slice(offset + 4, offset + length).toString("utf-8").trim();
    lines.push(content);
    offset += length;
  }

  return lines;
}

/**
 * Format a pkt-line for response
 */
export function pktLine(data: string): Buffer {
  const content = Buffer.from(data + "\n");
  const length = content.length + 4;
  const header = length.toString(16).padStart(4, "0");
  return Buffer.concat([Buffer.from(header), content]);
}

/**
 * Flush packet
 */
export function flushPkt(): Buffer {
  return Buffer.from("0000");
}

/**
 * Side-band packet (for progress/data)
 */
export function sideBandPkt(channel: number, data: Buffer): Buffer {
  const content = Buffer.concat([Buffer.from([channel]), data]);
  const length = content.length + 4;
  const header = length.toString(16).padStart(4, "0");
  return Buffer.concat([Buffer.from(header), content]);
}
