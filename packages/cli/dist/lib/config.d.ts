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
export declare function getConfig(): GlobalConfig;
export declare function saveConfig(config: GlobalConfig): void;
export declare function getConfigValue<K extends keyof GlobalConfig>(section: K): GlobalConfig[K];
export declare function setConfigValue<K extends keyof GlobalConfig>(section: K, value: GlobalConfig[K]): void;
export declare function getCredentials(): Credentials | null;
export declare function saveCredentials(credentials: Credentials): void;
export declare function clearCredentials(): void;
export declare function isAuthenticated(): boolean;
export declare function getApiUrl(): string;
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
export declare function getWorkspaceConfig(workspaceDir: string): WorkspaceConfig | null;
export declare function saveWorkspaceConfig(workspaceDir: string, config: WorkspaceConfig): void;
export declare function getWorkspaceIndex(workspaceDir: string): WorkspaceIndex | null;
export declare function saveWorkspaceIndex(workspaceDir: string, index: WorkspaceIndex): void;
export declare function findWorkspaceRoot(startDir?: string): string | null;
//# sourceMappingURL=config.d.ts.map