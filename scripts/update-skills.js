const { Client } = require('pg');
const https = require('https');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'skills-dojo' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetch(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject);
  });
}

async function tryFetchContent(owner, repo, skillPath) {
  // Try multiple path patterns
  const patterns = [
    `skills/${skillPath}/SKILL.md`,
    `skills/${skillPath}/AGENTS.md`,
    `${skillPath}/SKILL.md`,
    `${skillPath}/AGENTS.md`,
    // Try without prefix (e.g., vercel-react-best-practices -> react-best-practices)
    `skills/${skillPath.replace(/^[^-]+-/, '')}/SKILL.md`,
    `skills/${skillPath.replace(/^[^-]+-/, '')}/AGENTS.md`,
    // Root level
    `SKILL.md`,
    `AGENTS.md`,
  ];

  for (const pattern of patterns) {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/main/${pattern}`;
    try {
      const res = await fetch(url);
      if (res.status === 200 && res.data.length > 100) {
        return { content: res.data, pattern };
      }
    } catch (e) {}
  }
  return null;
}

async function updateSkills() {
  const client = new Client({
    connectionString: 'postgresql://postgres.lvkszwmgfsvcfgqwyaej:aqh-WBR_gzf1rcp%40kju@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  const skills = await client.query("SELECT id, path, metadata->>'source' as source FROM skills WHERE metadata->>'source' IS NOT NULL");

  console.log('Updating ' + skills.rows.length + ' skills...');

  let updated = 0;
  let fetched = 0;

  for (const skill of skills.rows) {
    if (!skill.source) continue;

    const [owner, repo] = skill.source.split('/');
    const githubUrl = 'https://github.com/' + skill.source;

    const result = await tryFetchContent(owner, repo, skill.path);
    const content = result ? result.content : null;
    if (result) {
      fetched++;
      console.log('  Fetched: ' + skill.path + ' from ' + result.pattern);
    }

    await client.query(
      'UPDATE skills SET "sourceUrl" = $1, content = $2 WHERE id = $3',
      [githubUrl, content, skill.id]
    );
    updated++;
  }

  console.log('Done! Updated ' + updated + ' skills, fetched ' + fetched + ' contents');

  await client.end();
}

updateSkills().catch(console.error);
