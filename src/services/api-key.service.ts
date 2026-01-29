import { Repository, In } from "typeorm";
import { randomBytes, createHash } from "crypto";
import { getDataSource } from "@/lib/db/data-source";
import { ApiKey } from "@/entities/ApiKey";
import { ApiKeyScope, ApiKeyScopePermission } from "@/entities/ApiKeyScope";
import { SkillCollection } from "@/entities/SkillCollection";
import { BaseService, PaginatedResult } from "@/lib/db/base-service";
import { RequestContext } from "@/lib/db/context";

const API_KEY_PREFIX = "sk_";
const KEY_LENGTH = 32; // 32 bytes = 64 hex chars

export interface ApiKeyScopeInput {
  collectionId: string;
  permission: ApiKeyScopePermission;
}

export interface CreateApiKeyInput {
  name: string;
  description?: string;
  expiresAt?: Date;
  scopes?: ApiKeyScopeInput[];
}

export interface UpdateApiKeyInput {
  name?: string;
  description?: string;
  expiresAt?: Date | null;
}

export interface ApiKeyWithScopes extends ApiKey {
  scopes: (ApiKeyScope & { collection?: SkillCollection })[];
}

export interface ApiKeyPermissions {
  apiKeyId: string;
  accountId: string;
  canRead: boolean;
  canWrite: boolean;
  canContribute: boolean;
}

/**
 * Service for managing API keys and their scopes.
 */
export class ApiKeyService extends BaseService<ApiKey> {
  private scopeRepo!: Repository<ApiKeyScope>;
  private collectionRepo!: Repository<SkillCollection>;

  constructor(repo: Repository<ApiKey>, ctx: RequestContext) {
    super(repo, ctx);
  }

  async init(): Promise<void> {
    const ds = await getDataSource();
    this.scopeRepo = ds.getRepository(ApiKeyScope);
    this.collectionRepo = ds.getRepository(SkillCollection);
  }

  /**
   * Generate a new API key.
   * Returns the full key (only shown once) along with the saved entity.
   */
  async createApiKey(input: CreateApiKeyInput): Promise<{ apiKey: ApiKey; fullKey: string }> {
    // Generate random key
    const keyBytes = randomBytes(KEY_LENGTH);
    const keyHex = keyBytes.toString("hex");
    const fullKey = `${API_KEY_PREFIX}${keyHex}`;

    // Hash the key for storage
    const keyHash = this.hashKey(fullKey);
    const keyPrefix = fullKey.substring(0, 12); // sk_ + first 8 chars

    // Create API key
    const apiKey = await this.create({
      name: input.name,
      description: input.description || null,
      keyHash,
      keyPrefix,
      expiresAt: input.expiresAt || null,
      lastUsedAt: null,
      canRead: true,
      canWrite: false,
      canDelete: false,
    });

    // Create scopes if provided
    if (input.scopes && input.scopes.length > 0) {
      await this.setScopes(apiKey.id, input.scopes);
    }

    return { apiKey, fullKey };
  }

  /**
   * Hash an API key for storage.
   */
  private hashKey(key: string): string {
    return createHash("sha256").update(key).digest("hex");
  }

  /**
   * Validate an API key and return the key entity if valid.
   */
  async validateKey(fullKey: string): Promise<ApiKey | null> {
    if (!fullKey.startsWith(API_KEY_PREFIX)) {
      return null;
    }

    const keyHash = this.hashKey(fullKey);
    const keyPrefix = fullKey.substring(0, 12);

    // Find by prefix first (indexed), then verify hash
    const ds = await getDataSource();
    const repo = ds.getRepository(ApiKey);

    const apiKey = await repo
      .createQueryBuilder("key")
      .where("key.keyPrefix = :keyPrefix", { keyPrefix })
      .andWhere("key.keyHash = :keyHash", { keyHash })
      .andWhere("key.archivedAt IS NULL")
      .getOne();

    if (!apiKey) {
      return null;
    }

    // Check expiration
    if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
      return null;
    }

    return apiKey;
  }

  /**
   * Get permissions for a specific collection using an API key.
   */
  async getPermissionsForCollection(
    apiKeyId: string,
    collectionId: string
  ): Promise<ApiKeyPermissions | null> {
    const apiKey = await this.findById(apiKeyId);
    if (!apiKey) {
      return null;
    }

    // Get scope for this collection
    const scope = await this.scopeRepo.findOne({
      where: {
        apiKeyId,
        collectionId,
        accountId: this.ctx.accountId,
        archivedAt: undefined,
      },
    });

    // No scope means no access
    if (!scope) {
      return {
        apiKeyId,
        accountId: apiKey.accountId,
        canRead: false,
        canWrite: false,
        canContribute: false,
      };
    }

    return {
      apiKeyId,
      accountId: apiKey.accountId,
      canRead: true, // All permissions include read
      canWrite: scope.permission === "write",
      canContribute: scope.permission === "contribute" || scope.permission === "write",
    };
  }

  /**
   * Record API key usage.
   */
  async recordUsage(apiKeyId: string): Promise<void> {
    const ds = await getDataSource();
    await ds
      .getRepository(ApiKey)
      .createQueryBuilder()
      .update()
      .set({ lastUsedAt: new Date() })
      .where("id = :id", { id: apiKeyId })
      .execute();
  }

  /**
   * Set scopes for an API key (replaces existing scopes).
   */
  async setScopes(apiKeyId: string, scopes: ApiKeyScopeInput[]): Promise<ApiKeyScope[]> {
    // Verify API key exists and belongs to account
    const apiKey = await this.findById(apiKeyId);
    if (!apiKey) {
      throw new Error("API key not found");
    }

    // Validate all collections exist and belong to account
    const collectionIds = scopes.map((s) => s.collectionId);
    if (collectionIds.length > 0) {
      const collections = await this.collectionRepo.find({
        where: {
          id: In(collectionIds),
          accountId: this.ctx.accountId,
        },
      });

      if (collections.length !== collectionIds.length) {
        throw new Error("One or more collections not found");
      }
    }

    // Delete existing scopes
    await this.scopeRepo
      .createQueryBuilder()
      .delete()
      .where("apiKeyId = :apiKeyId", { apiKeyId })
      .andWhere("accountId = :accountId", { accountId: this.ctx.accountId })
      .execute();

    // Create new scopes
    if (scopes.length === 0) {
      return [];
    }

    const newScopes = scopes.map((s) =>
      this.scopeRepo.create({
        apiKeyId,
        collectionId: s.collectionId,
        permission: s.permission,
        accountId: this.ctx.accountId,
        createdById: this.ctx.userId,
        modifiedById: this.ctx.userId,
      })
    );

    return this.scopeRepo.save(newScopes);
  }

  /**
   * Add a scope to an API key.
   */
  async addScope(apiKeyId: string, scope: ApiKeyScopeInput): Promise<ApiKeyScope> {
    // Verify API key exists
    const apiKey = await this.findById(apiKeyId);
    if (!apiKey) {
      throw new Error("API key not found");
    }

    // Verify collection exists
    const collection = await this.collectionRepo.findOne({
      where: {
        id: scope.collectionId,
        accountId: this.ctx.accountId,
      },
    });

    if (!collection) {
      throw new Error("Collection not found");
    }

    // Check if scope already exists
    const existing = await this.scopeRepo.findOne({
      where: {
        apiKeyId,
        collectionId: scope.collectionId,
        accountId: this.ctx.accountId,
      },
    });

    if (existing) {
      // Update existing scope
      existing.permission = scope.permission;
      existing.modifiedById = this.ctx.userId;
      existing.modifiedAt = new Date();
      return this.scopeRepo.save(existing);
    }

    // Create new scope
    const newScope = this.scopeRepo.create({
      apiKeyId,
      collectionId: scope.collectionId,
      permission: scope.permission,
      accountId: this.ctx.accountId,
      createdById: this.ctx.userId,
      modifiedById: this.ctx.userId,
    });

    return this.scopeRepo.save(newScope);
  }

  /**
   * Remove a scope from an API key.
   */
  async removeScope(apiKeyId: string, collectionId: string): Promise<boolean> {
    const result = await this.scopeRepo
      .createQueryBuilder()
      .delete()
      .where("apiKeyId = :apiKeyId", { apiKeyId })
      .andWhere("collectionId = :collectionId", { collectionId })
      .andWhere("accountId = :accountId", { accountId: this.ctx.accountId })
      .execute();

    return (result.affected || 0) > 0;
  }

  /**
   * Get all scopes for an API key.
   */
  async getScopes(apiKeyId: string): Promise<(ApiKeyScope & { collection?: SkillCollection })[]> {
    const scopes = await this.scopeRepo.find({
      where: {
        apiKeyId,
        accountId: this.ctx.accountId,
      },
    });

    // Load collection details
    const collectionIds = scopes.map((s) => s.collectionId);
    if (collectionIds.length === 0) {
      return scopes;
    }

    const collections = await this.collectionRepo.find({
      where: {
        id: In(collectionIds),
        accountId: this.ctx.accountId,
      },
    });

    const collectionMap = new Map(collections.map((c) => [c.id, c]));

    return scopes.map((scope) => ({
      ...scope,
      collection: collectionMap.get(scope.collectionId),
    }));
  }

  /**
   * Get API key with scopes.
   */
  async findByIdWithScopes(id: string): Promise<ApiKeyWithScopes | null> {
    const apiKey = await this.findById(id);
    if (!apiKey) {
      return null;
    }

    const scopes = await this.getScopes(id);

    return {
      ...apiKey,
      scopes,
    };
  }

  /**
   * List API keys with pagination.
   */
  async listApiKeys(options?: {
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<ApiKey>> {
    const qb = this.query("apiKey");
    qb.orderBy("apiKey.createdAt", "DESC");

    const page = options?.page || 1;
    const limit = Math.min(100, options?.limit || 20);
    const offset = (page - 1) * limit;

    const [items, total] = await qb.skip(offset).take(limit).getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Update an API key.
   */
  async updateApiKey(id: string, input: UpdateApiKeyInput): Promise<ApiKey | null> {
    return this.update(id, {
      ...(input.name && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.expiresAt !== undefined && { expiresAt: input.expiresAt }),
    });
  }

  /**
   * Delete (archive) an API key.
   */
  async deleteApiKey(id: string): Promise<boolean> {
    // Archive all scopes first
    await this.scopeRepo
      .createQueryBuilder()
      .update()
      .set({
        archivedAt: new Date(),
        archivedById: this.ctx.userId,
        modifiedById: this.ctx.userId,
        modifiedAt: new Date(),
      })
      .where("apiKeyId = :apiKeyId", { apiKeyId: id })
      .andWhere("accountId = :accountId", { accountId: this.ctx.accountId })
      .execute();

    // Archive the API key
    return this.archive(id);
  }
}

/**
 * Get API key service instance.
 */
export async function getApiKeyService(ctx: RequestContext): Promise<ApiKeyService> {
  const ds = await getDataSource();
  const repo = ds.getRepository(ApiKey);
  const service = new ApiKeyService(repo, ctx);
  await service.init();
  return service;
}
