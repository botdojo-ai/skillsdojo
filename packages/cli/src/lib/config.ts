import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Global config directory
const CONFIG_DIR = join(homedir(), '.skillsdojo');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const CREDENTIALS_FILE = join(CONFIG_DIR, 'credentials.json');

export interface GlobalConfig {
  api: {
    url: string;
  };
  defaults: {
    visibility: 'public' | 'private' | 'unlisted';
    editor?: string;
  };
  output: {
    format: 'table' | 'json';
  };
}

export interface Credentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: {
    id: string;
    email: string;
  };
  account: {
    id: string;
    slug: string;
    name: string;
  };
}

const DEFAULT_CONFIG: GlobalConfig = {
  api: {
    url: process.env.SKILLSDOJO_API_URL || 'https://skillsdojo.ai',
  },
  defaults: {
    visibility: 'private',
  },
  output: {
    format: 'table',
  },
};

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

export function getConfig(): GlobalConfig {
  ensureConfigDir();

  if (!existsSync(CONFIG_FILE)) {
    saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  try {
    const data = readFileSync(CONFIG_FILE, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: GlobalConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function getConfigValue<K extends keyof GlobalConfig>(
  section: K
): GlobalConfig[K] {
  const config = getConfig();
  return config[section];
}

export function setConfigValue<K extends keyof GlobalConfig>(
  section: K,
  value: GlobalConfig[K]
): void {
  const config = getConfig();
  config[section] = value;
  saveConfig(config);
}

export function getCredentials(): Credentials | null {
  ensureConfigDir();

  if (!existsSync(CREDENTIALS_FILE)) {
    return null;
  }

  try {
    const data = readFileSync(CREDENTIALS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function saveCredentials(credentials: Credentials): void {
  ensureConfigDir();
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2));
  // Set restrictive permissions (owner read/write only)
  chmodSync(CREDENTIALS_FILE, 0o600);
}

export function clearCredentials(): void {
  ensureConfigDir();

  if (existsSync(CREDENTIALS_FILE)) {
    writeFileSync(CREDENTIALS_FILE, '{}');
    chmodSync(CREDENTIALS_FILE, 0o600);
  }
}

export function isAuthenticated(): boolean {
  const creds = getCredentials();
  if (!creds || !creds.accessToken) {
    return false;
  }
  // Check if token is expired (with 5 minute buffer)
  return creds.expiresAt > Date.now() + 5 * 60 * 1000;
}

export function getApiUrl(): string {
  // Environment variable takes precedence
  if (process.env.SKILLSDOJO_API_URL) {
    return process.env.SKILLSDOJO_API_URL;
  }
  return getConfig().api.url;
}

// Workspace config (stored in .skillsdojo/ within a cloned collection)
export interface WorkspaceConfig {
  remote: {
    url: string;
    account: string;
    collection: string;
    collectionId: string;
  };
  branch: string;
  lastSync: string;
}

export interface WorkspaceIndex {
  commitSha: string;
  files: Record<string, {
    sha: string;
    mtime: string;
  }>;
}

export function getWorkspaceConfig(workspaceDir: string): WorkspaceConfig | null {
  const configPath = join(workspaceDir, '.skillsdojo', 'config.json');

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const data = readFileSync(configPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function saveWorkspaceConfig(workspaceDir: string, config: WorkspaceConfig): void {
  const sdojoDir = join(workspaceDir, '.skillsdojo');
  const configPath = join(sdojoDir, 'config.json');

  if (!existsSync(sdojoDir)) {
    mkdirSync(sdojoDir, { recursive: true });
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function getWorkspaceIndex(workspaceDir: string): WorkspaceIndex | null {
  const indexPath = join(workspaceDir, '.skillsdojo', 'index.json');

  if (!existsSync(indexPath)) {
    return null;
  }

  try {
    const data = readFileSync(indexPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function saveWorkspaceIndex(workspaceDir: string, index: WorkspaceIndex): void {
  const sdojoDir = join(workspaceDir, '.skillsdojo');
  const indexPath = join(sdojoDir, 'index.json');

  if (!existsSync(sdojoDir)) {
    mkdirSync(sdojoDir, { recursive: true });
  }

  writeFileSync(indexPath, JSON.stringify(index, null, 2));
}

export function findWorkspaceRoot(startDir: string = process.cwd()): string | null {
  let currentDir = startDir;

  while (currentDir !== '/') {
    if (existsSync(join(currentDir, '.skillsdojo', 'config.json'))) {
      return currentDir;
    }
    currentDir = join(currentDir, '..');
  }

  return null;
}
