import { Repository } from "typeorm";
import { getDataSource } from "@/lib/db/data-source";
import { SkillCollection, CollectionVisibility } from "@/entities/SkillCollection";
import { Skill } from "@/entities/Skill";
import { BaseService, PaginatedResult } from "@/lib/db/base-service";
import { RequestContext } from "@/lib/db/context";

export interface CreateCollectionInput {
  slug: string;
  name: string;
  description?: string;
  visibility?: CollectionVisibility;
}

export interface UpdateCollectionInput {
  name?: string;
  description?: string;
  visibility?: CollectionVisibility;
  defaultBranch?: string;
}

export class CollectionService extends BaseService<SkillCollection> {
  constructor(repo: Repository<SkillCollection>, ctx: RequestContext) {
    super(repo, ctx);
  }

  /**
   * Create a new collection
   */
  async createCollection(input: CreateCollectionInput): Promise<SkillCollection> {
    // Validate slug - must be at least 1 char, lowercase alphanumeric, can have hyphens in middle
    const slugRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
    if (!slugRegex.test(input.slug)) {
      throw new Error("Slug must be lowercase alphanumeric with hyphens, not starting/ending with hyphen");
    }

    // Check if slug already exists in this account
    const existing = await this.findOne({ slug: input.slug } as Partial<SkillCollection>);
    if (existing) {
      throw new Error("A collection with this slug already exists");
    }

    return this.create({
      slug: input.slug.toLowerCase(),
      name: input.name,
      description: input.description || null,
      visibility: input.visibility || "private",
      defaultBranch: "main",
      skillCount: 0,
      starCount: 0,
      forkCount: 0,
    });
  }

  /**
   * Update a collection
   */
  async updateCollection(id: string, input: UpdateCollectionInput): Promise<SkillCollection | null> {
    return this.update(id, {
      ...(input.name && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.visibility && { visibility: input.visibility }),
      ...(input.defaultBranch && { defaultBranch: input.defaultBranch }),
    });
  }

  /**
   * Get collection by slug (account-scoped - only returns user's own collections)
   */
  async findBySlug(slug: string): Promise<SkillCollection | null> {
    return this.query("collection")
      .andWhere("collection.slug = :slug", { slug: slug.toLowerCase() })
      .getOne();
  }

  /**
   * Get any collection by ID (unscoped - for viewing public collections)
   * Returns null if collection is private and belongs to another account.
   */
  async findByIdPublic(id: string): Promise<SkillCollection | null> {
    const collection = await this.unscopedQuery("collection")
      .andWhere("collection.id = :id", { id })
      .getOne();

    if (!collection) return null;

    // Allow if user owns it or if it's public
    if (collection.accountId === this.ctx.accountId || collection.visibility === "public") {
      return collection;
    }

    return null;
  }

  /**
   * Get collection with skills count
   */
  async findByIdWithStats(id: string): Promise<SkillCollection | null> {
    const collection = await this.findById(id);
    if (!collection) return null;

    // Update skill count
    const ds = await getDataSource();
    const skillRepo = ds.getRepository(Skill);
    const skillCount = await skillRepo.count({
      where: {
        collectionId: id,
        accountId: this.ctx.accountId,
        archivedAt: undefined,
      },
    });

    collection.skillCount = skillCount;
    return collection;
  }

  /**
   * List collections with pagination
   */
  async listCollections(options?: {
    page?: number;
    limit?: number;
    visibility?: CollectionVisibility;
  }): Promise<PaginatedResult<SkillCollection>> {
    const qb = this.query("collection");

    if (options?.visibility) {
      qb.andWhere("collection.visibility = :visibility", { visibility: options.visibility });
    }

    qb.orderBy("collection.modifiedAt", "DESC");

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
   * Fork a collection
   */
  async forkCollection(sourceId: string): Promise<SkillCollection> {
    const ds = await getDataSource();

    // Get source collection (can be from any account if public)
    const sourceRepo = ds.getRepository(SkillCollection);
    const source = await sourceRepo.findOne({
      where: { id: sourceId },
    });

    if (!source) {
      throw new Error("Source collection not found");
    }

    if (source.visibility === "private" && source.accountId !== this.ctx.accountId) {
      throw new Error("Cannot fork private collection from another account");
    }

    // Generate unique slug
    let slug = source.slug;
    let attempt = 0;
    while (await this.findBySlug(slug)) {
      attempt++;
      slug = `${source.slug}-${attempt}`;
    }

    // Create forked collection
    const forked = await this.create({
      slug,
      name: source.name,
      description: source.description,
      visibility: "private", // Forks start as private
      defaultBranch: source.defaultBranch,
      forkedFromId: source.id,
      skillCount: 0,
      starCount: 0,
      forkCount: 0,
    });

    // Update source fork count
    await sourceRepo.increment({ id: sourceId }, "forkCount", 1);

    return forked;
  }

  /**
   * Delete (archive) a collection
   */
  async deleteCollection(id: string): Promise<boolean> {
    // Archive all skills in collection first
    const ds = await getDataSource();
    const skillRepo = ds.getRepository(Skill);

    await skillRepo
      .createQueryBuilder()
      .update()
      .set({
        archivedAt: new Date(),
        archivedById: this.ctx.userId,
        modifiedById: this.ctx.userId,
        modifiedAt: new Date(),
      })
      .where("collectionId = :collectionId", { collectionId: id })
      .andWhere("accountId = :accountId", { accountId: this.ctx.accountId })
      .andWhere("archivedAt IS NULL")
      .execute();

    // Archive the collection
    return this.archive(id);
  }
}

/**
 * Get collection service instance
 */
export async function getCollectionService(ctx: RequestContext): Promise<CollectionService> {
  const ds = await getDataSource();
  const repo = ds.getRepository(SkillCollection);
  return new CollectionService(repo, ctx);
}
