import { getApiUrl, getCredentials, saveCredentials, Credentials } from './config.js';

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

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = getApiUrl();
  }

  private async refreshTokenIfNeeded(): Promise<string | null> {
    const creds = getCredentials();
    if (!creds) {
      return null;
    }

    // Check if token expires within 5 minutes
    if (creds.expiresAt > Date.now() + 5 * 60 * 1000) {
      return creds.accessToken;
    }

    // Try to refresh
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshToken: creds.refreshToken,
        }),
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as { accessToken: string; refreshToken?: string };
      const newCreds: Credentials = {
        ...creds,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken || creds.refreshToken,
        expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
      };
      saveCredentials(newCreds);
      return newCreds.accessToken;
    } catch {
      return null;
    }
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    // Check for environment token first
    const envToken = process.env.SKILLSDOJO_TOKEN;
    if (envToken) {
      return {
        Authorization: `Bearer ${envToken}`,
      };
    }

    const token = await this.refreshTokenIfNeeded();
    if (token) {
      return {
        Authorization: `Bearer ${token}`,
      };
    }

    return {};
  }

  async request<T>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: unknown;
      auth?: boolean;
      query?: Record<string, string | number | boolean | undefined>;
    } = {}
  ): Promise<ApiResponse<T>> {
    const { method = 'GET', body, auth = true, query } = options;

    let url = `${this.baseUrl}${path}`;

    // Add query parameters
    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      }
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (auth) {
      const authHeaders = await this.getAuthHeaders();
      Object.assign(headers, authHeaders);
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json().catch(() => null) as Record<string, unknown> | null;

      if (!response.ok) {
        return {
          error: {
            message: (data?.message as string) || (data?.error as string) || 'Request failed',
            code: data?.code as string | undefined,
            status: response.status,
          },
        };
      }

      return { data: data as T };
    } catch (error) {
      return {
        error: {
          message: error instanceof Error ? error.message : 'Network error',
          code: 'NETWORK_ERROR',
        },
      };
    }
  }

  // Auth endpoints
  async login(email: string, password: string): Promise<ApiResponse<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string };
    accounts: Array<{ id: string; slug: string; name: string }>;
  }>> {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });
  }

  async me(): Promise<ApiResponse<{
    user: { id: string; email: string };
    accounts: Array<{ id: string; slug: string; name: string; role: string }>;
  }>> {
    return this.request('/api/auth/me');
  }

  async initiateCliAuth(state: string): Promise<ApiResponse<{
    authUrl: string;
    pollUrl: string;
  }>> {
    return this.request('/api/auth/cli/initiate', {
      method: 'POST',
      body: { state },
      auth: false,
    });
  }

  async pollCliAuth(state: string): Promise<ApiResponse<{
    status: 'pending' | 'complete' | 'expired';
    accessToken?: string;
    refreshToken?: string;
    user?: { id: string; email: string };
    account?: { id: string; slug: string; name: string };
  }>> {
    return this.request(`/api/auth/cli/poll/${state}`, {
      auth: false,
    });
  }

  // Collection endpoints
  async listCollections(options?: {
    page?: number;
    limit?: number;
    visibility?: 'public' | 'private' | 'unlisted';
  }): Promise<ApiResponse<PaginatedResponse<Collection>>> {
    return this.request('/api/collections', {
      query: options,
    });
  }

  async getCollection(id: string): Promise<ApiResponse<Collection>> {
    return this.request(`/api/collections/${id}`);
  }

  async getCollectionBySlug(accountSlug: string, collectionSlug: string): Promise<ApiResponse<Collection>> {
    return this.request(`/api/collections/by-slug/${accountSlug}/${collectionSlug}`);
  }

  async createCollection(data: {
    name: string;
    slug?: string;
    description?: string;
    visibility?: 'public' | 'private' | 'unlisted';
  }): Promise<ApiResponse<Collection>> {
    return this.request('/api/collections', {
      method: 'POST',
      body: data,
    });
  }

  async forkCollection(collectionId: string): Promise<ApiResponse<Collection>> {
    return this.request(`/api/collections/${collectionId}/fork`, {
      method: 'POST',
    });
  }

  async deleteCollection(id: string): Promise<ApiResponse<void>> {
    return this.request(`/api/collections/${id}`, {
      method: 'DELETE',
    });
  }

  async getCollectionFiles(collectionId: string): Promise<ApiResponse<{
    collection: Collection;
    branch: string;
    commitSha: string;
    files: Array<{
      path: string;
      sha: string;
      content: string;
    }>;
  }>> {
    return this.request(`/api/collections/${collectionId}/files`);
  }

  async submitChanges(collectionId: string, data: {
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
  }>> {
    return this.request(`/api/collections/${collectionId}/changes`, {
      method: 'POST',
      body: data,
    });
  }

  // Skill endpoints
  async listSkills(collectionId: string, options?: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<ApiResponse<PaginatedResponse<Skill>>> {
    return this.request(`/api/collections/${collectionId}/skills`, {
      query: options,
    });
  }

  async createSkill(collectionId: string, data: {
    name: string;
    path: string;
    description?: string;
    content: string;
  }): Promise<ApiResponse<Skill>> {
    return this.request(`/api/collections/${collectionId}/skills`, {
      method: 'POST',
      body: data,
    });
  }

  async deleteSkill(collectionId: string, skillId: string): Promise<ApiResponse<void>> {
    return this.request(`/api/collections/${collectionId}/skills/${skillId}`, {
      method: 'DELETE',
    });
  }

  async searchPublicSkills(query: string, options?: {
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<{
    skills: Array<Skill & {
      collection: { id: string; slug: string; name: string };
      account: { id: string; slug: string; name: string };
      fullPath: string;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }>> {
    return this.request('/api/skills/public', {
      query: { q: query, ...options },
      auth: false,
    });
  }

  // PR endpoints
  async listPullRequests(collectionId: string, options?: {
    page?: number;
    limit?: number;
    status?: 'open' | 'merged' | 'closed';
  }): Promise<ApiResponse<PaginatedResponse<PullRequest>>> {
    return this.request(`/api/collections/${collectionId}/pulls`, {
      query: options,
    });
  }

  async getPullRequest(collectionId: string, number: number): Promise<ApiResponse<PullRequest & {
    files: Array<{
      path: string;
      action: 'create' | 'modify' | 'delete';
      content?: string;
    }>;
  }>> {
    return this.request(`/api/collections/${collectionId}/pulls/${number}`);
  }

  async mergePullRequest(collectionId: string, number: number, options?: { allowDeletions?: boolean }): Promise<ApiResponse<void>> {
    return this.request(`/api/collections/${collectionId}/pulls/${number}/merge`, {
      method: 'POST',
      query: options?.allowDeletions ? { allowDeletions: 'true' } : undefined,
    });
  }

  async closePullRequest(collectionId: string, number: number): Promise<ApiResponse<void>> {
    return this.request(`/api/collections/${collectionId}/pulls/${number}/close`, {
      method: 'POST',
    });
  }
}

// Types
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

// Export singleton instance
export const api = new ApiClient();
