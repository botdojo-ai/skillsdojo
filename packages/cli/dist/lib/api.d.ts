export interface ApiError {
    message: string;
    code?: string;
    status?: number;
}
export interface ApiResponse<T> {
    data?: T;
    error?: ApiError;
}
export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
declare class ApiClient {
    private baseUrl;
    constructor();
    private refreshTokenIfNeeded;
    private getAuthHeaders;
    request<T>(path: string, options?: {
        method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
        body?: unknown;
        auth?: boolean;
        query?: Record<string, string | number | boolean | undefined>;
    }): Promise<ApiResponse<T>>;
    login(email: string, password: string): Promise<ApiResponse<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
        };
        accounts: Array<{
            id: string;
            slug: string;
            name: string;
        }>;
    }>>;
    me(): Promise<ApiResponse<{
        user: {
            id: string;
            email: string;
        };
        accounts: Array<{
            id: string;
            slug: string;
            name: string;
            role: string;
        }>;
    }>>;
    initiateCliAuth(state: string): Promise<ApiResponse<{
        authUrl: string;
        pollUrl: string;
    }>>;
    pollCliAuth(state: string): Promise<ApiResponse<{
        status: 'pending' | 'complete' | 'expired';
        accessToken?: string;
        refreshToken?: string;
        user?: {
            id: string;
            email: string;
        };
        account?: {
            id: string;
            slug: string;
            name: string;
        };
    }>>;
    listCollections(options?: {
        page?: number;
        limit?: number;
        visibility?: 'public' | 'private' | 'unlisted';
    }): Promise<ApiResponse<PaginatedResponse<Collection>>>;
    getCollection(id: string): Promise<ApiResponse<Collection>>;
    getCollectionBySlug(accountSlug: string, collectionSlug: string): Promise<ApiResponse<Collection>>;
    createCollection(data: {
        name: string;
        slug?: string;
        description?: string;
        visibility?: 'public' | 'private' | 'unlisted';
    }): Promise<ApiResponse<Collection>>;
    forkCollection(collectionId: string): Promise<ApiResponse<Collection>>;
    deleteCollection(id: string): Promise<ApiResponse<void>>;
    getCollectionFiles(collectionId: string): Promise<ApiResponse<{
        collection: Collection;
        branch: string;
        commitSha: string;
        files: Array<{
            path: string;
            sha: string;
            content: string;
        }>;
    }>>;
    submitChanges(collectionId: string, data: {
        baseSha: string;
        title: string;
        description?: string;
        changes: Array<{
            path: string;
            action: 'create' | 'modify' | 'delete';
            content?: string;
        }>;
    }): Promise<ApiResponse<{
        pullRequest: PullRequest;
    }>>;
    listSkills(collectionId: string, options?: {
        page?: number;
        limit?: number;
        search?: string;
    }): Promise<ApiResponse<PaginatedResponse<Skill>>>;
    createSkill(collectionId: string, data: {
        name: string;
        path: string;
        description?: string;
        content: string;
    }): Promise<ApiResponse<Skill>>;
    deleteSkill(collectionId: string, skillId: string): Promise<ApiResponse<void>>;
    searchPublicSkills(query: string, options?: {
        page?: number;
        limit?: number;
    }): Promise<ApiResponse<{
        skills: Array<Skill & {
            collection: {
                id: string;
                slug: string;
                name: string;
            };
            account: {
                id: string;
                slug: string;
                name: string;
            };
            fullPath: string;
        }>;
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>>;
    listPullRequests(collectionId: string, options?: {
        page?: number;
        limit?: number;
        status?: 'open' | 'merged' | 'closed';
    }): Promise<ApiResponse<PaginatedResponse<PullRequest>>>;
    getPullRequest(collectionId: string, number: number): Promise<ApiResponse<PullRequest & {
        files: Array<{
            path: string;
            action: 'create' | 'modify' | 'delete';
            content?: string;
        }>;
    }>>;
    mergePullRequest(collectionId: string, number: number, options?: {
        allowDeletions?: boolean;
    }): Promise<ApiResponse<void>>;
    closePullRequest(collectionId: string, number: number): Promise<ApiResponse<void>>;
    requestDownloadToken(collectionId: string, options?: {
        branch?: string;
        expiresInMinutes?: number;
    }): Promise<ApiResponse<{
        downloadToken: string;
        downloadUrl: string;
        expiresAt: string;
        expiresInMinutes: number;
        estimatedSizeMB?: string;
        collection: {
            id: string;
            slug: string;
            name: string;
        };
    }>>;
    requestSkillsDownloadToken(collectionId: string, options: {
        skillPaths: string[];
        branch?: string;
        expiresInMinutes?: number;
    }): Promise<ApiResponse<{
        downloadToken: string;
        downloadUrl: string;
        expiresAt: string;
        expiresInMinutes: number;
        collection: {
            id: string;
            slug: string;
            name: string;
        };
        skills: {
            requested: number;
            found: number;
            foundPaths: string[];
            notFoundPaths?: string[];
        };
    }>>;
    downloadZip(collectionId: string, token: string, outputPath: string): Promise<void>;
}
export interface Collection {
    id: string;
    accountId: string;
    slug: string;
    name: string;
    description?: string;
    visibility: 'public' | 'private' | 'unlisted';
    skillCount: number;
    starCount: number;
    forkCount: number;
    forkedFromId?: string;
    createdAt: string;
    modifiedAt: string;
    account?: {
        id: string;
        slug: string;
        name: string;
    };
}
export interface Skill {
    id: string;
    collectionId: string;
    path: string;
    name: string;
    description?: string;
    metadata: Record<string, unknown>;
    dependencies: string[];
    createdAt: string;
    modifiedAt: string;
}
export interface PullRequest {
    id: string;
    collectionId: string;
    number: number;
    title: string;
    description?: string;
    status: 'open' | 'merged' | 'closed';
    sourceBranch: string;
    targetBranch: string;
    sourceCommitSha: string;
    targetCommitSha: string;
    createdById: string;
    createdAt: string;
    modifiedAt: string;
}
export declare const api: ApiClient;
export {};
//# sourceMappingURL=api.d.ts.map