#!/usr/bin/env node
/**
 * Fix Skill File Paths Migration
 *
 * Updates git_file_index entries to include the skill path prefix.
 * Re-creates files for each skill in the correct location.
 */

require("dotenv").config();
const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
const pako = require("pako");

const PUBLIC_SKILLS_DIR = path.join(__dirname, "..", "public_skills");
const CATALOG_FILE = path.join(PUBLIC_SKILLS_DIR, "catalog.json");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function uuidv4() {
  return crypto.randomUUID();
}

function createGitObjectSha(type, content) {
  const header = `${type} ${content.length}\0`;
  const store = Buffer.concat([Buffer.from(header), content]);
  return crypto.createHash("sha1").update(store).digest("hex");
}

function compressContent(content) {
  return Buffer.from(pako.deflate(content));
}

async function createGitBlob(client, repoId, content) {
  const data = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
  const sha = createGitObjectSha("blob", data);

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
      [sha, repoId, "blob", compressed, data.length]
    );
  }

  return sha;
}

async function main() {
  console.log("🔧 Fix Skill File Paths Migration");
  console.log("==================================\n");

  if (DRY_RUN) {
    console.log("⚠️  DRY RUN - no changes will be made\n");
  }

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

  console.log(`   Found ${catalog.totalSkills} skills in catalog\n`);

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
    // Get all skills from public collections
    const skillsResult = await client.query(`
      SELECT s.id, s.path, s.name, s.description, s.metadata, s."collectionId", sc.slug as collection_slug
      FROM skills s
      JOIN skill_collections sc ON s."collectionId" = sc.id
      JOIN accounts a ON sc."accountId" = a.id
      WHERE a.slug = 'skillsdojo' AND s."archivedAt" IS NULL
    `);

    console.log(`📊 Found ${skillsResult.rows.length} skills to process\n`);

    // Delete old file index entries without skill path prefix
    if (!DRY_RUN) {
      console.log("🗑️  Clearing old file index entries...");

      // Get collection IDs
      const collectionIds = [...new Set(skillsResult.rows.map(s => s.collectionId))];

      for (const collectionId of collectionIds) {
        await client.query(`
          DELETE FROM git_file_index
          WHERE "repoId" = $1
          AND path NOT LIKE '%/%'
        `, [collectionId]);
      }
      console.log("   Done!\n");
    }

    let processed = 0;
    let errors = 0;

    for (const skill of skillsResult.rows) {
      const skillPath = skill.path;
      const collectionId = skill.collectionId;

      try {
        // Parse metadata for source info
        let metadata = {};
        try {
          metadata = typeof skill.metadata === 'string' ? JSON.parse(skill.metadata) : skill.metadata || {};
        } catch (e) {}

        // Prepare files
        const files = [];

        // metadata.json
        files.push({
          path: "metadata.json",
          content: JSON.stringify({
            id: skillPath,
            name: skill.name,
            description: skill.description,
            ...metadata
          }, null, 2)
        });

        // README.md
        const readme = `# ${skill.name || skillPath}\n\n${skill.description || "No description available."}\n`;
        files.push({ path: "README.md", content: readme });

        // SKILL.md
        const skillMd = `---
name: ${skill.name || skillPath}
description: ${(skill.description || "Imported skill").replace(/\n/g, " ").slice(0, 200)}
---

# ${skill.name || skillPath}

${skill.description || "No description available."}

## Source

${metadata.gitUrl ? `- Repository: ${metadata.gitUrl}` : ""}
${metadata.npmUrl ? `- npm: ${metadata.npmUrl}` : ""}
${metadata.dockerImage ? `- Docker: ${metadata.dockerImage}` : ""}
`;
        files.push({ path: "SKILL.md", content: skillMd });

        // Create file entries with skill path prefix
        for (const file of files) {
          const fullPath = `${skillPath}/${file.path}`;
          const blobSha = await createGitBlob(client, collectionId, file.content);

          if (!DRY_RUN) {
            const indexId = uuidv4();
            await client.query(
              `INSERT INTO git_file_index (id, "repoId", branch, path, "blobSha", mode)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT ("repoId", branch, path) DO UPDATE SET "blobSha" = $5, mode = $6`,
              [indexId, collectionId, "main", fullPath, blobSha, "100644"]
            );
          }
        }

        processed++;
        if (processed % 50 === 0) {
          console.log(`   Processed ${processed}/${skillsResult.rows.length} skills...`);
        }
      } catch (error) {
        console.log(`   ⚠️  Error processing ${skillPath}: ${error.message}`);
        errors++;
      }
    }

    console.log("\n✅ Migration Complete!");
    console.log("======================");
    console.log(`   Skills processed: ${processed}`);
    console.log(`   Errors: ${errors}`);

    if (DRY_RUN) {
      console.log("\n⚠️  This was a DRY RUN - no changes were made");
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
