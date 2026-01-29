/**
 * GitHub Service - Fetches repository contents from GitHub
 */

interface GitHubTreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
  url: string;
}

interface GitHubTree {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

interface GitHubFile {
  path: string;
  content: string;
  mode: string;
}

/**
 * Parse GitHub URL to extract owner and repo
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  // Handle various GitHub URL formats
  const patterns = [
    /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/|$)/,
    /github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
    }
  }

  return null;
}

/**
 * Fetch repository tree from GitHub API
 */
async function fetchRepoTree(owner: string, repo: string, branch = "main"): Promise<GitHubTree | null> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "SkillsDojo",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Try main first, then master
  for (const branchName of [branch, "master"]) {
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branchName}?recursive=1`;
      const response = await fetch(url, { headers });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error(`Error fetching tree for ${branchName}:`, error);
    }
  }

  return null;
}

/**
 * Fetch file content from GitHub
 */
async function fetchFileContent(owner: string, repo: string, path: string, branch = "main"): Promise<string | null> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3.raw",
    "User-Agent": "SkillsDojo",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Try main first, then master
  for (const branchName of [branch, "master"]) {
    try {
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branchName}/${path}`;
      const response = await fetch(url, { headers });

      if (response.ok) {
        return await response.text();
      }
    } catch (error) {
      console.error(`Error fetching file ${path}:`, error);
    }
  }

  return null;
}

/**
 * Fetch all files from a GitHub repository
 * Returns array of files with path and content
 */
export async function fetchGitHubRepoFiles(
  gitUrl: string,
  options: {
    maxFiles?: number;
    maxFileSize?: number;
    includePatterns?: RegExp[];
    excludePatterns?: RegExp[];
  } = {}
): Promise<GitHubFile[]> {
  const {
    maxFiles = 100,
    maxFileSize = 500 * 1024, // 500KB
    excludePatterns = [
      /node_modules\//,
      /\.git\//,
      /dist\//,
      /build\//,
      /coverage\//,
      /\.next\//,
      /\.cache\//,
      /vendor\//,
      /\.env/,
      /\.DS_Store/,
      /package-lock\.json/,
      /yarn\.lock/,
      /pnpm-lock\.yaml/,
    ],
  } = options;

  const parsed = parseGitHubUrl(gitUrl);
  if (!parsed) {
    console.error("Could not parse GitHub URL:", gitUrl);
    return [];
  }

  const { owner, repo } = parsed;
  console.log(`Fetching files from GitHub: ${owner}/${repo}`);

  const tree = await fetchRepoTree(owner, repo);
  if (!tree) {
    console.error("Could not fetch repository tree");
    return [];
  }

  // Filter to only blob files, skip excluded patterns
  const blobs = tree.tree.filter((item) => {
    if (item.type !== "blob") return false;
    if (item.size && item.size > maxFileSize) return false;

    for (const pattern of excludePatterns) {
      if (pattern.test(item.path)) return false;
    }

    return true;
  });

  // Limit number of files
  const filesToFetch = blobs.slice(0, maxFiles);
  console.log(`Found ${blobs.length} files, fetching ${filesToFetch.length}`);

  const files: GitHubFile[] = [];

  // Fetch files in batches to avoid rate limiting
  const batchSize = 10;
  for (let i = 0; i < filesToFetch.length; i += batchSize) {
    const batch = filesToFetch.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (item) => {
        const content = await fetchFileContent(owner, repo, item.path);
        if (content !== null) {
          return {
            path: item.path,
            content,
            mode: item.mode,
          };
        }
        return null;
      })
    );

    for (const result of results) {
      if (result) {
        files.push(result);
      }
    }
  }

  console.log(`Successfully fetched ${files.length} files`);
  return files;
}
