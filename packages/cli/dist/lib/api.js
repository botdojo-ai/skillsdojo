import { getApiUrl, getCredentials, saveCredentials } from './config.js';
class ApiClient {
    baseUrl;
    constructor() {
        this.baseUrl = getApiUrl();
    }
    async refreshTokenIfNeeded() {
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
            const data = await response.json();
            const newCreds = {
                ...creds,
                accessToken: data.accessToken,
                refreshToken: data.refreshToken || creds.refreshToken,
                expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
            };
            saveCredentials(newCreds);
            return newCreds.accessToken;
        }
        catch {
            return null;
        }
    }
    async getAuthHeaders() {
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
    async request(path, options = {}) {
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
        const headers = {
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
            const data = await response.json().catch(() => null);
            if (!response.ok) {
                return {
                    error: {
                        message: data?.message || data?.error || 'Request failed',
                        code: data?.code,
                        status: response.status,
                    },
                };
            }
            return { data: data };
        }
        catch (error) {
            return {
                error: {
                    message: error instanceof Error ? error.message : 'Network error',
                    code: 'NETWORK_ERROR',
                },
            };
        }
    }
    // Auth endpoints
    async login(email, password) {
        return this.request('/api/auth/login', {
            method: 'POST',
            body: { email, password },
            auth: false,
        });
    }
    async me() {
        return this.request('/api/auth/me');
    }
    async initiateCliAuth(state) {
        return this.request('/api/auth/cli/initiate', {
            method: 'POST',
            body: { state },
            auth: false,
        });
    }
    async pollCliAuth(state) {
        return this.request(`/api/auth/cli/poll/${state}`, {
            auth: false,
        });
    }
    // Collection endpoints
    async listCollections(options) {
        return this.request('/api/collections', {
            query: options,
        });
    }
    async getCollection(id) {
        return this.request(`/api/collections/${id}`);
    }
    async getCollectionBySlug(accountSlug, collectionSlug) {
        return this.request(`/api/collections/by-slug/${accountSlug}/${collectionSlug}`);
    }
    async createCollection(data) {
        return this.request('/api/collections', {
            method: 'POST',
            body: data,
        });
    }
    async forkCollection(collectionId) {
        return this.request(`/api/collections/${collectionId}/fork`, {
            method: 'POST',
        });
    }
    async deleteCollection(id) {
        return this.request(`/api/collections/${id}`, {
            method: 'DELETE',
        });
    }
    async getCollectionFiles(collectionId) {
        return this.request(`/api/collections/${collectionId}/files`);
    }
    async submitChanges(collectionId, data) {
        return this.request(`/api/collections/${collectionId}/changes`, {
            method: 'POST',
            body: data,
        });
    }
    // Skill endpoints
    async listSkills(collectionId, options) {
        return this.request(`/api/collections/${collectionId}/skills`, {
            query: options,
        });
    }
    async createSkill(collectionId, data) {
        return this.request(`/api/collections/${collectionId}/skills`, {
            method: 'POST',
            body: data,
        });
    }
    async deleteSkill(collectionId, skillId) {
        return this.request(`/api/collections/${collectionId}/skills/${skillId}`, {
            method: 'DELETE',
        });
    }
    async searchPublicSkills(query, options) {
        return this.request('/api/skills/public', {
            query: { q: query, ...options },
            auth: false,
        });
    }
    // PR endpoints
    async listPullRequests(collectionId, options) {
        return this.request(`/api/collections/${collectionId}/pulls`, {
            query: options,
        });
    }
    async getPullRequest(collectionId, number) {
        return this.request(`/api/collections/${collectionId}/pulls/${number}`);
    }
    async mergePullRequest(collectionId, number, options) {
        return this.request(`/api/collections/${collectionId}/pulls/${number}/merge`, {
            method: 'POST',
            query: options?.allowDeletions ? { allowDeletions: 'true' } : undefined,
        });
    }
    async closePullRequest(collectionId, number) {
        return this.request(`/api/collections/${collectionId}/pulls/${number}/close`, {
            method: 'POST',
        });
    }
}
// Export singleton instance
export const api = new ApiClient();
//# sourceMappingURL=api.js.map