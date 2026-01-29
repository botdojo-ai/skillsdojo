#!/usr/bin/env node
/**
 * Import Public Skills Script for SkillsDojo
 *
 * Reads discovered skills from public_skills/catalog.json and imports them
 * into the database under a main public account with public collections.
 *
 * Usage:
 *   node scripts/import-public-skills.js [--dry-run] [--account-slug=skillsdojo]
 */

require("dotenv").config();
const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
const pako = require("pako");

const PUBLIC_SKILLS_DIR = path.join(__dirname, "..", "public_skills");
const CATALOG_FILE = path.join(PUBLIC_SKILLS_DIR, "catalog.json");

// Parse CLI arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ACCOUNT_SLUG =
  args.find((a) => a.startsWith("--account-slug="))?.split("=")[1] || "skillsdojo";

console.log("🔧 Configuration:");
console.log(`   Account slug: ${ACCOUNT_SLUG}`);
console.log(`   Dry run: ${DRY_RUN}`);
console.log("");

// UUID helper
function uuidv4() {
  return crypto.randomUUID();
}

// Database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Git object helpers
function createGitObjectSha(type, content) {
  const header = `${type} ${content.length}\0`;
  const store = Buffer.concat([Buffer.from(header), content]);
  return crypto.createHash("sha1").update(store).digest("hex");
}

function compressContent(content) {
  return Buffer.from(pako.deflate(content));
}

// Collection categories based on source type
const COLLECTION_MAPPING = {
  "mcp-server": { slug: "mcp-servers", name: "MCP Servers", description: "Model Context Protocol servers and integrations" },
  "mcp-package": { slug: "npm-mcp-packages", name: "NPM MCP Packages", description: "MCP server implementations available via npm" },
  "mcp-image": { slug: "docker-mcp-images", name: "Docker MCP Images", description: "MCP server Docker images" },
  "official": { slug: "official", name: "Official Skills", description: "Official Anthropic skills and tools" },
  "mcp-official": { slug: "official-mcp", name: "Official MCP Servers", description: "Official Model Context Protocol servers" },
  "awesome-list": { slug: "curated-lists", name: "Curated Lists", description: "Curated collections and awesome lists" },
  "educational": { slug: "educational", name: "Educational", description: "Learning resources and courses" },
  "discovered": { slug: "community", name: "Community Skills", description: "Community-contributed skills and tools" },
};

function getCollectionForSkill(skill) {
  const mapping = COLLECTION_MAPPING[skill.sourceType];
  if (mapping) return mapping;

  if (skill.source === "npm") {
    return COLLECTION_MAPPING["mcp-package"];
  }
  if (skill.source === "docker") {
    return COLLECTION_MAPPING["mcp-image"];
  }
  return COLLECTION_MAPPING["discovered"];
}

async function ensureAccount(client) {
  const result = await client.query(
    "SELECT id, slug, name FROM accounts WHERE slug = $1",
    [ACCOUNT_SLUG]
  );

  if (result.rows.length > 0) {
    console.log(`✓ Found existing account: ${result.rows[0].slug} (${result.rows[0].id})`);
    return result.rows[0];
  }

  console.log(`📦 Creating public account: ${ACCOUNT_SLUG}`);

  if (DRY_RUN) {
    return { id: uuidv4(), slug: ACCOUNT_SLUG, name: "SkillsDojo Public (dry-run)" };
  }

  const id = uuidv4();
  await client.query(
    `INSERT INTO accounts (id, slug, name, type, description, "isPublic", "createdAt", "modifiedAt")
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
    [id, ACCOUNT_SLUG, "SkillsDojo Public", "organization", "Public skills repository for the SkillsDojo community", true]
  );

  return { id, slug: ACCOUNT_SLUG, name: "SkillsDojo Public" };
}

async function ensureSystemUser(client) {
  const result = await client.query(
    "SELECT id FROM users WHERE email = $1",
    ["system@skillsdojo.ai"]
  );

  if (result.rows.length > 0) {
    return result.rows[0].id;
  }

  if (DRY_RUN) {
    return uuidv4();
  }

  const id = uuidv4();
  await client.query(
    `INSERT INTO users (id, email, "displayName", "passwordHash", "emailVerified", "createdAt", "modifiedAt")
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
    [id, "system@skillsdojo.ai", "SkillsDojo System", "", true]
  );

  return id;
}

async function ensureCollection(client, account, collectionInfo, systemUserId) {
  const result = await client.query(
    `SELECT id, slug, name FROM skill_collections WHERE "accountId" = $1 AND slug = $2`,
    [account.id, collectionInfo.slug]
  );

  if (result.rows.length > 0) {
    return result.rows[0];
  }

  console.log(`  📁 Creating collection: ${collectionInfo.slug}`);

  if (DRY_RUN) {
    return { id: uuidv4(), slug: collectionInfo.slug, name: collectionInfo.name };
  }

  const id = uuidv4();
  await client.query(
    `INSERT INTO skill_collections (id, "accountId", slug, name, description, visibility, "defaultBranch", "skillCount", "starCount", "forkCount", "createdById", "modifiedById", "createdAt", "modifiedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())`,
    [id, account.id, collectionInfo.slug, collectionInfo.name, collectionInfo.description, "public", "main", 0, 0, 0, systemUserId, systemUserId]
  );

  return { id, slug: collectionInfo.slug, name: collectionInfo.name };
}

async function createGitBlob(client, repoId, content) {
  const data = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
  const sha = createGitObjectSha("blob", data);

  if (DRY_RUN) {
    return sha;
  }

  // Check if exists
  const existing = await client.query(
    `SELECT sha FROM git_objects WHERE sha = $1 AND "repoId" = $2`,
    [sha, repoId]
  );

  if (existing.rows.length === 0) {
    const compressed = compressContent(data);
    await client.query(
      `INSERT INTO git_objects (sha, "repoId", type, content, size, "createdAt")
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [sha, repoId, "blob", compressed, data.length]
    );
  }

  return sha;
}

async function createGitTree(client, repoId, entries) {
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  const parts = [];
  for (const entry of sorted) {
    const head = Buffer.from(`${entry.mode} ${entry.name}\0`);
    const shaBytes = Buffer.from(entry.sha, "hex");
    parts.push(head, shaBytes);
  }
  const content = Buffer.concat(parts);
  const sha = createGitObjectSha("tree", content);

  if (DRY_RUN) {
    return sha;
  }

  const existing = await client.query(
    `SELECT sha FROM git_objects WHERE sha = $1 AND "repoId" = $2`,
    [sha, repoId]
  );

  if (existing.rows.length === 0) {
    const compressed = compressContent(content);
    await client.query(
      `INSERT INTO git_objects (sha, "repoId", type, content, size, "createdAt")
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [sha, repoId, "tree", compressed, content.length]
    );
  }

  return sha;
}

async function createGitCommit(client, repoId, treeSha, message) {
  const timestamp = Math.floor(Date.now() / 1000);
  const timezone = "+0000";
  const author = { name: "SkillsDojo", email: "system@skillsdojo.ai" };

  let content = `tree ${treeSha}\n`;
  content += `author ${author.name} <${author.email}> ${timestamp} ${timezone}\n`;
  content += `committer ${author.name} <${author.email}> ${timestamp} ${timezone}\n`;
  content += `\n${message}\n`;

  const data = Buffer.from(content, "utf-8");
  const sha = createGitObjectSha("commit", data);

  if (DRY_RUN) {
    return sha;
  }

  const existing = await client.query(
    `SELECT sha FROM git_objects WHERE sha = $1 AND "repoId" = $2`,
    [sha, repoId]
  );

  if (existing.rows.length === 0) {
    const compressed = compressContent(data);
    await client.query(
      `INSERT INTO git_objects (sha, "repoId", type, content, size, "createdAt")
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [sha, repoId, "commit", compressed, data.length]
    );
  }

  return sha;
}

async function addFilesToGitRepo(client, repoId, skillPath, files) {
  // Create blobs for all files and add to file index
  // Files are stored with their full path: skillPath/filename

  for (const file of files) {
    const fullPath = `${skillPath}/${file.path}`;
    const blobSha = await createGitBlob(client, repoId, file.content);

    if (!DRY_RUN) {
      const indexId = uuidv4();
      await client.query(
        `INSERT INTO git_file_index (id, "repoId", branch, path, "blobSha", mode)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT ("repoId", branch, path) DO UPDATE SET "blobSha" = $5, mode = $6`,
        [indexId, repoId, "main", fullPath, blobSha, "100644"]
      );
    }
  }
}

async function createSkill(client, account, collection, skill, systemUserId) {
  // Check if skill already exists
  const existing = await client.query(
    `SELECT id FROM skills WHERE "collectionId" = $1 AND path = $2`,
    [collection.id, skill.id]
  );

  if (existing.rows.length > 0) {
    return { created: false };
  }

  console.log(`    ➕ Creating skill: ${skill.name || skill.id}`);

  if (DRY_RUN) {
    return { created: true };
  }

  const skillId = uuidv4();
  const metadata = JSON.stringify({
    source: skill.source,
    sourceType: skill.sourceType,
    gitUrl: skill.gitUrl,
    npmUrl: skill.npmUrl,
    dockerImage: skill.dockerImage,
    stars: skill.stars,
    owner: skill.owner,
    repo: skill.repo,
    keywords: skill.keywords,
    discoveredAt: skill.discoveredAt,
  });

  await client.query(
    `INSERT INTO skills (id, "accountId", "collectionId", path, name, description, metadata, dependencies, "createdById", "modifiedById", "createdAt", "modifiedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
    [skillId, account.id, collection.id, skill.id, skill.name || skill.id, skill.description || null, metadata, "[]", systemUserId, systemUserId]
  );

  // Initialize git storage with files
  try {
    const skillDir = path.join(PUBLIC_SKILLS_DIR, skill.id);
    const files = [];

    // Read metadata.json
    try {
      const metadataContent = await fs.readFile(path.join(skillDir, "metadata.json"), "utf-8");
      files.push({ path: "metadata.json", content: metadataContent });
    } catch (e) {
      files.push({ path: "metadata.json", content: JSON.stringify(skill, null, 2) });
    }

    // Read README.md
    try {
      const readmeContent = await fs.readFile(path.join(skillDir, "README.md"), "utf-8");
      files.push({ path: "README.md", content: readmeContent });
    } catch (e) {
      const readme = `# ${skill.name || skill.id}\n\n${skill.description || "No description available."}\n`;
      files.push({ path: "README.md", content: readme });
    }

    // Create SKILL.md
    const skillMd = `---
name: ${skill.name || skill.id}
description: ${(skill.description || "Imported skill").replace(/\n/g, " ").slice(0, 200)}
---

# ${skill.name || skill.id}

${skill.description || "No description available."}

## Source

${skill.gitUrl ? `- Repository: ${skill.gitUrl}` : ""}
${skill.npmUrl ? `- npm: ${skill.npmUrl}` : ""}
${skill.dockerImage ? `- Docker: ${skill.dockerImage}` : ""}
`;
    files.push({ path: "SKILL.md", content: skillMd });

    await addFilesToGitRepo(client, collection.id, skill.id, files);
  } catch (error) {
    console.log(`      ⚠️  Git storage error: ${error.message}`);
  }

  return { created: true };
}

async function updateCollectionSkillCount(client, collectionId) {
  if (DRY_RUN) return;

  const result = await client.query(
    `SELECT COUNT(*) as count FROM skills WHERE "collectionId" = $1 AND "archivedAt" IS NULL`,
    [collectionId]
  );

  await client.query(
    `UPDATE skill_collections SET "skillCount" = $1, "modifiedAt" = NOW() WHERE id = $2`,
    [parseInt(result.rows[0].count), collectionId]
  );
}

async function main() {
  console.log("🚀 SkillsDojo Public Skills Import");
  console.log("==================================\n");

  // Load catalog
  console.log("📖 Loading catalog...");
  let catalog;
  try {
    const catalogContent = await fs.readFile(CATALOG_FILE, "utf-8");
    catalog = JSON.parse(catalogContent);
  } catch (error) {
    console.error(`❌ Failed to read catalog: ${error.message}`);
    process.exit(1);
  }

  console.log(`   Found ${catalog.totalSkills} skills in catalog`);
  console.log(`   - GitHub: ${catalog.sources.github}`);
  console.log(`   - npm: ${catalog.sources.npm}`);
  console.log(`   - Docker: ${catalog.sources.docker}`);
  console.log("");

  // Connect to database
  console.log("🔌 Connecting to database...");
  let client;
  try {
    client = await pool.connect();
    console.log("   Connected!\n");
  } catch (error) {
    console.error(`❌ Database connection failed: ${error.message}`);
    process.exit(1);
  }

  try {
    // Get or create system user
    const systemUserId = await ensureSystemUser(client);

    // Ensure account exists
    const account = await ensureAccount(client);

    // Group skills by collection
    const skillsByCollection = new Map();
    for (const skill of catalog.skills) {
      const collectionInfo = getCollectionForSkill(skill);
      if (!skillsByCollection.has(collectionInfo.slug)) {
        skillsByCollection.set(collectionInfo.slug, { info: collectionInfo, skills: [] });
      }
      skillsByCollection.get(collectionInfo.slug).skills.push(skill);
    }

    console.log(`\n📊 Skills grouped into ${skillsByCollection.size} collections:\n`);

    // Process each collection
    const stats = { collections: 0, skillsCreated: 0, skillsSkipped: 0 };

    for (const [slug, { info, skills }] of skillsByCollection) {
      console.log(`\n📁 Collection: ${info.name} (${skills.length} skills)`);

      const collection = await ensureCollection(client, account, info, systemUserId);
      stats.collections++;

      // Process skills in this collection
      for (const skill of skills) {
        const result = await createSkill(client, account, collection, skill, systemUserId);
        if (result.created) {
          stats.skillsCreated++;
        } else {
          stats.skillsSkipped++;
        }
      }

      // Update skill count
      await updateCollectionSkillCount(client, collection.id);
    }

    // Summary
    console.log("\n\n✅ Import Complete!");
    console.log("==================");
    console.log(`   Collections: ${stats.collections}`);
    console.log(`   Skills created: ${stats.skillsCreated}`);
    console.log(`   Skills skipped (already exist): ${stats.skillsSkipped}`);

    if (DRY_RUN) {
      console.log("\n⚠️  This was a DRY RUN - no changes were made to the database");
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
