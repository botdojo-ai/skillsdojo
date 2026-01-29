import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
// Global config directory
const CONFIG_DIR = join(homedir(), '.skillsdojo');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const CREDENTIALS_FILE = join(CONFIG_DIR, 'credentials.json');
const DEFAULT_CONFIG = {
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
function ensureConfigDir() {
    if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
}
export function getConfig() {
    ensureConfigDir();
    if (!existsSync(CONFIG_FILE)) {
        saveConfig(DEFAULT_CONFIG);
        return DEFAULT_CONFIG;
    }
    try {
        const data = readFileSync(CONFIG_FILE, 'utf-8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    }
    catch {
        return DEFAULT_CONFIG;
    }
}
export function saveConfig(config) {
    ensureConfigDir();
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}
export function getConfigValue(section) {
    const config = getConfig();
    return config[section];
}
export function setConfigValue(section, value) {
    const config = getConfig();
    config[section] = value;
    saveConfig(config);
}
export function getCredentials() {
    ensureConfigDir();
    if (!existsSync(CREDENTIALS_FILE)) {
        return null;
    }
    try {
        const data = readFileSync(CREDENTIALS_FILE, 'utf-8');
        return JSON.parse(data);
    }
    catch {
        return null;
    }
}
export function saveCredentials(credentials) {
    ensureConfigDir();
    writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2));
    // Set restrictive permissions (owner read/write only)
    chmodSync(CREDENTIALS_FILE, 0o600);
}
export function clearCredentials() {
    ensureConfigDir();
    if (existsSync(CREDENTIALS_FILE)) {
        writeFileSync(CREDENTIALS_FILE, '{}');
        chmodSync(CREDENTIALS_FILE, 0o600);
    }
}
export function isAuthenticated() {
    const creds = getCredentials();
    if (!creds || !creds.accessToken) {
        return false;
    }
    // Check if token is expired (with 5 minute buffer)
    return creds.expiresAt > Date.now() + 5 * 60 * 1000;
}
export function getApiUrl() {
    // Environment variable takes precedence
    if (process.env.SKILLSDOJO_API_URL) {
        return process.env.SKILLSDOJO_API_URL;
    }
    return getConfig().api.url;
}
export function getWorkspaceConfig(workspaceDir) {
    const configPath = join(workspaceDir, '.skillsdojo', 'config.json');
    if (!existsSync(configPath)) {
        return null;
    }
    try {
        const data = readFileSync(configPath, 'utf-8');
        return JSON.parse(data);
    }
    catch {
        return null;
    }
}
export function saveWorkspaceConfig(workspaceDir, config) {
    const sdojoDir = join(workspaceDir, '.skillsdojo');
    const configPath = join(sdojoDir, 'config.json');
    if (!existsSync(sdojoDir)) {
        mkdirSync(sdojoDir, { recursive: true });
    }
    writeFileSync(configPath, JSON.stringify(config, null, 2));
}
export function getWorkspaceIndex(workspaceDir) {
    const indexPath = join(workspaceDir, '.skillsdojo', 'index.json');
    if (!existsSync(indexPath)) {
        return null;
    }
    try {
        const data = readFileSync(indexPath, 'utf-8');
        return JSON.parse(data);
    }
    catch {
        return null;
    }
}
export function saveWorkspaceIndex(workspaceDir, index) {
    const sdojoDir = join(workspaceDir, '.skillsdojo');
    const indexPath = join(sdojoDir, 'index.json');
    if (!existsSync(sdojoDir)) {
        mkdirSync(sdojoDir, { recursive: true });
    }
    writeFileSync(indexPath, JSON.stringify(index, null, 2));
}
export function findWorkspaceRoot(startDir = process.cwd()) {
    let currentDir = startDir;
    while (currentDir !== '/') {
        if (existsSync(join(currentDir, '.skillsdojo', 'config.json'))) {
            return currentDir;
        }
        currentDir = join(currentDir, '..');
    }
    return null;
}
//# sourceMappingURL=config.js.map