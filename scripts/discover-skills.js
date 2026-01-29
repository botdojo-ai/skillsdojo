#!/usr/bin/env node
/**
 * Skill Discovery Script for SkillsDojo
 *
 * Searches multiple sources for AI agent skills and MCP servers:
 * - GitHub repositories (SKILL.md files, MCP servers)
 * - npm packages (MCP server implementations)
 * - Docker Hub (MCP server images)
 * - Known skill collection registries
 *
 * Creates a structured output in public_skills/ with metadata for each discovered skill.
 */

const fs = require('fs').promises;
const path = require('path');

const PUBLIC_SKILLS_DIR = path.join(__dirname, '..', 'public_skills');
const CATALOG_FILE = path.join(PUBLIC_SKILLS_DIR, 'catalog.json');

// Rate limiting helpers
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let lastGitHubRequest = 0;
const GITHUB_RATE_LIMIT_MS = 2000; // 2 seconds between GitHub API calls

async function rateLimitedFetch(url, options = {}) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastGitHubRequest;
  if (url.includes('api.github.com') && timeSinceLastRequest < GITHUB_RATE_LIMIT_MS) {
    await delay(GITHUB_RATE_LIMIT_MS - timeSinceLastRequest);
  }
  lastGitHubRequest = Date.now();

  const response = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': 'SkillsDojo-Discovery/1.0',
      'Accept': 'application/vnd.github.v3+json',
      ...options.headers
    }
  });
  return response;
}

// ============================================
// GITHUB SEARCH
// ============================================

async function searchGitHub(query, perPage = 30) {
  console.log(`  Searching GitHub: "${query}"`);
  try {
    const response = await rateLimitedFetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=${perPage}&sort=stars&order=desc`
    );

    if (!response.ok) {
      if (response.status === 403) {
        console.log('    Rate limited, waiting...');
        await delay(60000);
        return searchGitHub(query, perPage);
      }
      console.log(`    GitHub search failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    console.log(`    Found ${data.total_count} results (returning top ${Math.min(perPage, data.items?.length || 0)})`);
    return data.items || [];
  } catch (error) {
    console.log(`    Error: ${error.message}`);
    return [];
  }
}

async function searchGitHubCode(query, perPage = 30) {
  console.log(`  Searching GitHub code: "${query}"`);
  try {
    const response = await rateLimitedFetch(
      `https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=${perPage}`
    );

    if (!response.ok) {
      if (response.status === 403) {
        console.log('    Rate limited, waiting...');
        await delay(60000);
        return searchGitHubCode(query, perPage);
      }
      console.log(`    GitHub code search failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    console.log(`    Found ${data.total_count} results`);
    return data.items || [];
  } catch (error) {
    console.log(`    Error: ${error.message}`);
    return [];
  }
}

async function getGitHubFileContent(owner, repo, path) {
  try {
    const response = await rateLimitedFetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (data.content) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return null;
  } catch (error) {
    return null;
  }
}

async function getRepoContents(owner, repo, dir = '') {
  try {
    const response = await rateLimitedFetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${dir}`
    );

    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    return [];
  }
}

// ============================================
// NPM SEARCH
// ============================================

async function searchNpm(query, size = 50) {
  console.log(`  Searching npm: "${query}"`);
  try {
    const response = await fetch(
      `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=${size}`
    );

    if (!response.ok) {
      console.log(`    npm search failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    console.log(`    Found ${data.total} results`);
    return data.objects || [];
  } catch (error) {
    console.log(`    Error: ${error.message}`);
    return [];
  }
}

// ============================================
// DOCKER HUB SEARCH
// ============================================

async function searchDockerHub(query, pageSize = 25) {
  console.log(`  Searching Docker Hub: "${query}"`);
  try {
    const response = await fetch(
      `https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(query)}&page_size=${pageSize}`
    );

    if (!response.ok) {
      console.log(`    Docker Hub search failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    console.log(`    Found ${data.count} results`);
    return data.results || [];
  } catch (error) {
    console.log(`    Error: ${error.message}`);
    return [];
  }
}

// ============================================
// SKILL.MD PARSER
// ============================================

function parseSkillMd(content) {
  const skill = {
    name: null,
    description: null,
    argumentHint: null,
    disableModelInvocation: false,
    userInvocable: true,
    allowedTools: [],
    model: null,
    context: null,
    agent: null,
    instructions: ''
  };

  // Parse YAML frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const yaml = frontmatterMatch[1];
    const lines = yaml.split('\n');

    for (const line of lines) {
      const [key, ...valueParts] = line.split(':');
      if (!key || !valueParts.length) continue;

      const value = valueParts.join(':').trim();

      switch (key.trim()) {
        case 'name':
          skill.name = value;
          break;
        case 'description':
          skill.description = value;
          break;
        case 'argument-hint':
          skill.argumentHint = value;
          break;
        case 'disable-model-invocation':
          skill.disableModelInvocation = value === 'true';
          break;
        case 'user-invocable':
          skill.userInvocable = value !== 'false';
          break;
        case 'allowed-tools':
          skill.allowedTools = value.split(',').map(t => t.trim());
          break;
        case 'model':
          skill.model = value;
          break;
        case 'context':
          skill.context = value;
          break;
        case 'agent':
          skill.agent = value;
          break;
      }
    }

    skill.instructions = content.slice(frontmatterMatch[0].length).trim();
  } else {
    skill.instructions = content;
  }

  return skill;
}

// ============================================
// KNOWN SOURCES
// ============================================

const KNOWN_SKILL_REPOS = [
  // Anthropic official
  { owner: 'anthropics', repo: 'claude-code', type: 'official' },

  // MCP Servers - Official
  { owner: 'modelcontextprotocol', repo: 'servers', type: 'mcp-official' },

  // Popular MCP implementations
  { owner: 'punkpeye', repo: 'awesome-mcp-servers', type: 'awesome-list' },

  // Agent Skills related
  { owner: 'anthropics', repo: 'courses', type: 'educational' },
];

const GITHUB_SEARCH_QUERIES = [
  // Skill file searches
  'filename:SKILL.md',
  'filename:SKILL.md anthropic',
  'filename:SKILL.md claude',

  // MCP related
  'mcp server claude',
  'modelcontextprotocol server',
  '@modelcontextprotocol/sdk',
  'mcp-server',

  // Agent skills
  'agent skills claude',
  'claude code skills',
  'anthropic skills',

  // Tool implementations
  'claude tools implementation',
];

const NPM_SEARCH_QUERIES = [
  'mcp-server',
  'modelcontextprotocol',
  '@modelcontextprotocol',
  'claude-mcp',
  'anthropic-mcp',
];

const DOCKER_SEARCH_QUERIES = [
  'mcp-server',
  'modelcontextprotocol',
  'claude-mcp',
];

// ============================================
// MAIN DISCOVERY LOGIC
// ============================================

async function discoverFromKnownRepos() {
  console.log('\n📦 Checking known skill repositories...');
  const skills = [];

  for (const { owner, repo, type } of KNOWN_SKILL_REPOS) {
    console.log(`  Checking ${owner}/${repo}...`);

    // Check for SKILL.md files in the repo
    const contents = await getRepoContents(owner, repo);
    if (!Array.isArray(contents)) continue;

    // Look for skills directory or SKILL.md files
    for (const item of contents) {
      if (item.name === 'SKILL.md' || item.name === 'skills' || item.name === 'commands') {
        if (item.type === 'file' && item.name === 'SKILL.md') {
          const content = await getGitHubFileContent(owner, repo, item.path);
          if (content) {
            const parsed = parseSkillMd(content);
            skills.push({
              source: 'github',
              sourceType: type,
              owner,
              repo,
              path: item.path,
              gitUrl: `https://github.com/${owner}/${repo}`,
              ...parsed
            });
          }
        } else if (item.type === 'dir') {
          // Scan directory for skills
          const subContents = await getRepoContents(owner, repo, item.path);
          if (Array.isArray(subContents)) {
            for (const subItem of subContents) {
              if (subItem.type === 'dir') {
                // Check if this dir contains a SKILL.md
                const skillFile = await getGitHubFileContent(owner, repo, `${subItem.path}/SKILL.md`);
                if (skillFile) {
                  const parsed = parseSkillMd(skillFile);
                  skills.push({
                    source: 'github',
                    sourceType: type,
                    owner,
                    repo,
                    path: subItem.path,
                    gitUrl: `https://github.com/${owner}/${repo}`,
                    skillDir: subItem.name,
                    ...parsed
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  return skills;
}

async function discoverFromGitHubSearch() {
  console.log('\n🔍 Searching GitHub for skills...');
  const skills = [];
  const seenRepos = new Set();

  for (const query of GITHUB_SEARCH_QUERIES) {
    await delay(3000); // Extra delay between different searches

    if (query.startsWith('filename:')) {
      // Code search
      const results = await searchGitHubCode(query, 20);
      for (const item of results) {
        const repoKey = `${item.repository.owner.login}/${item.repository.name}`;
        if (seenRepos.has(repoKey)) continue;
        seenRepos.add(repoKey);

        // Get the file content
        const content = await getGitHubFileContent(
          item.repository.owner.login,
          item.repository.name,
          item.path
        );

        if (content) {
          const parsed = parseSkillMd(content);
          skills.push({
            source: 'github',
            sourceType: 'discovered',
            owner: item.repository.owner.login,
            repo: item.repository.name,
            path: item.path,
            gitUrl: item.repository.html_url,
            stars: item.repository.stargazers_count,
            ...parsed
          });
        }
      }
    } else {
      // Repo search
      const results = await searchGitHub(query, 20);
      for (const repo of results) {
        const repoKey = `${repo.owner.login}/${repo.name}`;
        if (seenRepos.has(repoKey)) continue;
        seenRepos.add(repoKey);

        // Check if repo has SKILL.md at root
        const skillMd = await getGitHubFileContent(repo.owner.login, repo.name, 'SKILL.md');
        if (skillMd) {
          const parsed = parseSkillMd(skillMd);
          skills.push({
            source: 'github',
            sourceType: 'discovered',
            owner: repo.owner.login,
            repo: repo.name,
            path: 'SKILL.md',
            gitUrl: repo.html_url,
            stars: repo.stargazers_count,
            description: parsed.description || repo.description,
            ...parsed
          });
        } else {
          // Still record as potential MCP server
          if (repo.description?.toLowerCase().includes('mcp') ||
              repo.name.toLowerCase().includes('mcp') ||
              repo.topics?.some(t => t.includes('mcp'))) {
            skills.push({
              source: 'github',
              sourceType: 'mcp-server',
              owner: repo.owner.login,
              repo: repo.name,
              gitUrl: repo.html_url,
              stars: repo.stargazers_count,
              description: repo.description,
              name: repo.name,
              topics: repo.topics
            });
          }
        }
      }
    }
  }

  return skills;
}

async function discoverFromNpm() {
  console.log('\n📦 Searching npm for MCP packages...');
  const packages = [];
  const seenPackages = new Set();

  for (const query of NPM_SEARCH_QUERIES) {
    await delay(1000);
    const results = await searchNpm(query, 30);

    for (const { package: pkg } of results) {
      if (seenPackages.has(pkg.name)) continue;
      seenPackages.add(pkg.name);

      // Check if it's MCP related
      const isMcp = pkg.name.includes('mcp') ||
                    pkg.description?.toLowerCase().includes('mcp') ||
                    pkg.description?.toLowerCase().includes('model context protocol') ||
                    pkg.keywords?.some(k => k.includes('mcp'));

      if (isMcp) {
        packages.push({
          source: 'npm',
          sourceType: 'mcp-package',
          name: pkg.name,
          version: pkg.version,
          description: pkg.description,
          npmUrl: `https://www.npmjs.com/package/${pkg.name}`,
          gitUrl: pkg.links?.repository,
          keywords: pkg.keywords
        });
      }
    }
  }

  return packages;
}

async function discoverFromDockerHub() {
  console.log('\n🐳 Searching Docker Hub for MCP images...');
  const images = [];
  const seenImages = new Set();

  for (const query of DOCKER_SEARCH_QUERIES) {
    await delay(1000);
    const results = await searchDockerHub(query, 20);

    for (const image of results) {
      if (seenImages.has(image.repo_name)) continue;
      seenImages.add(image.repo_name);

      images.push({
        source: 'docker',
        sourceType: 'mcp-image',
        name: image.repo_name,
        description: image.short_description,
        dockerImage: `docker.io/${image.repo_name}`,
        stars: image.star_count,
        pulls: image.pull_count,
        isOfficial: image.is_official,
        isAutomated: image.is_automated
      });
    }
  }

  return images;
}

// ============================================
// OUTPUT GENERATION
// ============================================

function sanitizeFilename(name) {
  return (name || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function writeSkillFolder(skill, index) {
  const folderName = sanitizeFilename(skill.name || skill.repo || `skill-${index}`);
  const skillDir = path.join(PUBLIC_SKILLS_DIR, folderName);

  try {
    await fs.mkdir(skillDir, { recursive: true });

    // Write metadata.json
    const metadata = {
      id: folderName,
      name: skill.name || skill.repo,
      description: skill.description,
      source: skill.source,
      sourceType: skill.sourceType,
      gitUrl: skill.gitUrl,
      npmUrl: skill.npmUrl,
      dockerImage: skill.dockerImage,
      stars: skill.stars,
      owner: skill.owner,
      repo: skill.repo,
      path: skill.path,
      discoveredAt: new Date().toISOString(),

      // Skill-specific metadata
      argumentHint: skill.argumentHint,
      allowedTools: skill.allowedTools,
      model: skill.model,
      context: skill.context,
      agent: skill.agent,
      userInvocable: skill.userInvocable,

      // MCP-specific metadata
      version: skill.version,
      keywords: skill.keywords || skill.topics,
      pulls: skill.pulls
    };

    // Remove undefined values
    Object.keys(metadata).forEach(key => {
      if (metadata[key] === undefined) delete metadata[key];
    });

    await fs.writeFile(
      path.join(skillDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

    // Write SKILL.md if we have instructions
    if (skill.instructions) {
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        skill.instructions
      );
    }

    // Write README.md with summary
    const readme = `# ${metadata.name}

${metadata.description || 'No description available.'}

## Source

- **Type**: ${metadata.sourceType}
- **Source**: ${metadata.source}
${metadata.gitUrl ? `- **Repository**: ${metadata.gitUrl}` : ''}
${metadata.npmUrl ? `- **npm**: ${metadata.npmUrl}` : ''}
${metadata.dockerImage ? `- **Docker**: \`${metadata.dockerImage}\`` : ''}
${metadata.stars ? `- **Stars**: ${metadata.stars}` : ''}

## Installation

${metadata.gitUrl ? `\`\`\`bash
# Clone the repository
git clone ${metadata.gitUrl}
\`\`\`` : ''}

${metadata.npmUrl ? `\`\`\`bash
# Install from npm
npm install ${metadata.name}
\`\`\`` : ''}

${metadata.dockerImage ? `\`\`\`bash
# Pull Docker image
docker pull ${metadata.dockerImage}
\`\`\`` : ''}

---
*Discovered by SkillsDojo on ${new Date().toISOString().split('T')[0]}*
`;

    await fs.writeFile(path.join(skillDir, 'README.md'), readme);

    return metadata;
  } catch (error) {
    console.log(`    Error writing skill folder: ${error.message}`);
    return null;
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('🚀 SkillsDojo Skill Discovery');
  console.log('=============================\n');
  console.log(`Output directory: ${PUBLIC_SKILLS_DIR}\n`);

  // Ensure output directory exists
  await fs.mkdir(PUBLIC_SKILLS_DIR, { recursive: true });

  const allDiscovered = [];

  // 1. Check known repos
  const knownSkills = await discoverFromKnownRepos();
  console.log(`  Found ${knownSkills.length} skills from known repos`);
  allDiscovered.push(...knownSkills);

  // 2. Search GitHub
  const githubSkills = await discoverFromGitHubSearch();
  console.log(`  Found ${githubSkills.length} skills from GitHub search`);
  allDiscovered.push(...githubSkills);

  // 3. Search npm
  const npmPackages = await discoverFromNpm();
  console.log(`  Found ${npmPackages.length} MCP packages from npm`);
  allDiscovered.push(...npmPackages);

  // 4. Search Docker Hub
  const dockerImages = await discoverFromDockerHub();
  console.log(`  Found ${dockerImages.length} MCP images from Docker Hub`);
  allDiscovered.push(...dockerImages);

  // Deduplicate by name/repo
  const seen = new Set();
  const unique = allDiscovered.filter(item => {
    const key = item.name || item.repo || item.dockerImage;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`\n📊 Total unique discoveries: ${unique.length}`);

  // Sort by stars (if available) and type
  unique.sort((a, b) => {
    // Official first
    if (a.sourceType === 'official' && b.sourceType !== 'official') return -1;
    if (b.sourceType === 'official' && a.sourceType !== 'official') return 1;
    // Then by stars
    return (b.stars || 0) - (a.stars || 0);
  });

  // Write individual skill folders
  console.log('\n📁 Writing skill folders...');
  const catalog = [];

  for (let i = 0; i < unique.length; i++) {
    const skill = unique[i];
    process.stdout.write(`  [${i + 1}/${unique.length}] ${skill.name || skill.repo || skill.dockerImage}...`);

    const metadata = await writeSkillFolder(skill, i);
    if (metadata) {
      catalog.push(metadata);
      console.log(' ✓');
    } else {
      console.log(' ✗');
    }
  }

  // Write catalog
  console.log('\n📋 Writing catalog...');
  const catalogData = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    totalSkills: catalog.length,
    sources: {
      github: catalog.filter(s => s.source === 'github').length,
      npm: catalog.filter(s => s.source === 'npm').length,
      docker: catalog.filter(s => s.source === 'docker').length
    },
    skills: catalog
  };

  await fs.writeFile(CATALOG_FILE, JSON.stringify(catalogData, null, 2));

  // Summary
  console.log('\n✅ Discovery Complete!');
  console.log('=====================');
  console.log(`Total skills cataloged: ${catalog.length}`);
  console.log(`  - GitHub: ${catalogData.sources.github}`);
  console.log(`  - npm: ${catalogData.sources.npm}`);
  console.log(`  - Docker: ${catalogData.sources.docker}`);
  console.log(`\nCatalog written to: ${CATALOG_FILE}`);
  console.log(`Skills written to: ${PUBLIC_SKILLS_DIR}/`);

  // Print top discoveries
  if (catalog.length > 0) {
    console.log('\n🌟 Top Discoveries:');
    const top = catalog.slice(0, 10);
    for (const skill of top) {
      console.log(`  - ${skill.name} (${skill.source}${skill.stars ? `, ${skill.stars}⭐` : ''})`);
    }
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
