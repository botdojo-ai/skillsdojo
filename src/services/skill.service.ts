import { Repository } from "typeorm";
import { getDataSource } from "@/lib/db/data-source";
import { Skill } from "@/entities/Skill";
import { SkillCollection } from "@/entities/SkillCollection";
import { BaseService, PaginatedResult } from "@/lib/db/base-service";
import { RequestContext } from "@/lib/db/context";

export interface CreateSkillInput {
  collectionId: string;
  path: string;
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
  dependencies?: string[];
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  dependencies?: string[];
}

export class SkillService extends BaseService<Skill> {
  constructor(repo: Repository<Skill>, ctx: RequestContext) {
    super(repo, ctx);
  }

  /**
   * Create a new skill
   */
  async createSkill(input: CreateSkillInput): Promise<Skill> {
    // Validate path
    const pathRegex = /^[a-z0-9][a-z0-9-/]*[a-z0-9]$/;
    if (!pathRegex.test(input.path) && input.path.length > 1) {
      throw new Error("Path must be lowercase alphanumeric with hyphens and slashes");
    }

    // Check collection exists and belongs to account
    const ds = await getDataSource();
    const collectionRepo = ds.getRepository(SkillCollection);
    const collection = await collectionRepo.findOne({
      where: {
        id: input.collectionId,
        accountId: this.ctx.accountId,
        archivedAt: undefined,
      },
    });

    if (!collection) {
      throw new Error("Collection not found");
    }

    // Check if skill path already exists
    const existing = await this.query("skill")
      .andWhere("skill.collectionId = :collectionId", { collectionId: input.collectionId })
      .andWhere("skill.path = :path", { path: input.path })
      .getOne();

    if (existing) {
      throw new Error("A skill with this path already exists in the collection");
    }

    // Create skill
    const skill = await this.create({
      collectionId: input.collectionId,
      path: input.path.toLowerCase(),
      name: input.name,
      description: input.description || null,
      metadata: input.metadata || null,
      dependencies: input.dependencies || [],
    });

    // Update collection skill count
    await collectionRepo.increment({ id: input.collectionId }, "skillCount", 1);

    return skill;
  }

  /**
   * Update a skill
   */
  async updateSkill(id: string, input: UpdateSkillInput): Promise<Skill | null> {
    return this.update(id, {
      ...(input.name && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.metadata !== undefined && { metadata: input.metadata }),
      ...(input.dependencies !== undefined && { dependencies: input.dependencies }),
    });
  }

  /**
   * Get skill by collection and path (unscoped - allows viewing public collections)
   */
  async findByPath(collectionId: string, path: string): Promise<Skill | null> {
    // Use unscopedQuery since collection visibility is checked at API level
    return this.unscopedQuery("skill")
      .andWhere("skill.collectionId = :collectionId", { collectionId })
      .andWhere("skill.path = :path", { path: path.toLowerCase() })
      .getOne();
  }

  /**
   * List skills in a collection (unscoped - allows viewing public collections)
   */
  async listByCollection(
    collectionId: string,
    options?: { page?: number; limit?: number }
  ): Promise<PaginatedResult<Skill>> {
    // Use unscopedQuery since collection visibility is checked at API level
    const qb = this.unscopedQuery("skill")
      .andWhere("skill.collectionId = :collectionId", { collectionId })
      .orderBy("skill.path", "ASC");

    const page = options?.page || 1;
    const limit = Math.min(100, options?.limit || 50);
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
   * Search skills within a specific collection (unscoped - allows viewing public collections)
   */
  async searchSkills(
    query: string,
    options?: { collectionId?: string; page?: number; limit?: number }
  ): Promise<PaginatedResult<Skill>> {
    // Use unscopedQuery when searching within a specific collection
    // Collection visibility is checked at API level
    const qb = options?.collectionId
      ? this.unscopedQuery("skill")
      : this.query("skill");

    if (options?.collectionId) {
      qb.andWhere("skill.collectionId = :collectionId", { collectionId: options.collectionId });
    }

    if (query) {
      qb.andWhere(
        "(skill.name ILIKE :query OR skill.description ILIKE :query OR skill.path ILIKE :query)",
        { query: `%${query}%` }
      );
    }

    qb.orderBy("skill.modifiedAt", "DESC");

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
   * Delete (archive) a skill
   */
  async deleteSkill(id: string): Promise<boolean> {
    const skill = await this.findById(id);
    if (!skill) return false;

    // Archive the skill
    const archived = await this.archive(id);

    if (archived) {
      // Update collection skill count
      const ds = await getDataSource();
      const collectionRepo = ds.getRepository(SkillCollection);
      await collectionRepo.decrement({ id: skill.collectionId }, "skillCount", 1);
    }

    return archived;
  }

  /**
   * Move skill to different path
   */
  async moveSkill(id: string, newPath: string): Promise<Skill | null> {
    const skill = await this.findById(id);
    if (!skill) return null;

    // Check if new path already exists
    const existing = await this.findByPath(skill.collectionId, newPath);
    if (existing && existing.id !== id) {
      throw new Error("A skill with this path already exists");
    }

    return this.update(id, { path: newPath.toLowerCase() } as Partial<Skill>);
  }
}

/**
 * Get skill service instance
 */
export async function getSkillService(ctx: RequestContext): Promise<SkillService> {
  const ds = await getDataSource();
  const repo = ds.getRepository(Skill);
  return new SkillService(repo, ctx);
}
