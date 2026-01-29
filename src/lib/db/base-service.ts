import { Repository, SelectQueryBuilder, FindOptionsWhere, ObjectLiteral } from "typeorm";
import { BaseEntity } from "@/entities/base/BaseEntity";
import { RequestContext } from "./context";

export interface PaginationOptions {
  page?: number;
  limit?: number;
  orderBy?: string;
  orderDir?: "ASC" | "DESC";
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Base service with automatic account scoping, soft delete, and audit fields.
 * All queries automatically filter by accountId and exclude archived records.
 */
export abstract class BaseService<T extends BaseEntity> {
  constructor(
    protected repo: Repository<T>,
    protected ctx: RequestContext
  ) {}

  // === QUERIES (auto-filter by account + exclude archived) ===

  /**
   * Create a query builder with account scoping and archived filter
   */
  protected query(alias: string): SelectQueryBuilder<T> {
    return this.repo
      .createQueryBuilder(alias)
      .where(`${alias}.accountId = :accountId`, { accountId: this.ctx.accountId })
      .andWhere(`${alias}.archivedAt IS NULL`);
  }

  /**
   * Find all records (optionally including archived)
   */
  async findAll(options?: { includeArchived?: boolean }): Promise<T[]> {
    const qb = this.repo
      .createQueryBuilder("entity")
      .where("entity.accountId = :accountId", { accountId: this.ctx.accountId });

    if (!options?.includeArchived) {
      qb.andWhere("entity.archivedAt IS NULL");
    }

    return qb.getMany();
  }

  /**
   * Find by ID
   */
  async findById(id: string): Promise<T | null> {
    return this.query("entity").andWhere("entity.id = :id", { id }).getOne();
  }

  /**
   * Find multiple by IDs
   */
  async findByIds(ids: string[]): Promise<T[]> {
    if (ids.length === 0) return [];
    return this.query("entity").andWhere("entity.id IN (:...ids)", { ids }).getMany();
  }

  /**
   * Find one record matching conditions
   */
  async findOne(where: Partial<T>): Promise<T | null> {
    const qb = this.query("entity");

    Object.entries(where).forEach(([key, value]) => {
      if (value !== undefined) {
        qb.andWhere(`entity.${key} = :${key}`, { [key]: value });
      }
    });

    return qb.getOne();
  }

  /**
   * Check if record exists
   */
  async exists(id: string): Promise<boolean> {
    const count = await this.query("entity")
      .andWhere("entity.id = :id", { id })
      .getCount();
    return count > 0;
  }

  /**
   * Count records matching conditions
   */
  async count(where?: Partial<T>): Promise<number> {
    const qb = this.query("entity");

    if (where) {
      Object.entries(where).forEach(([key, value]) => {
        if (value !== undefined) {
          qb.andWhere(`entity.${key} = :${key}`, { [key]: value });
        }
      });
    }

    return qb.getCount();
  }

  // === MUTATIONS ===

  /**
   * Create a new record
   */
  async create(data: Partial<T>): Promise<T> {
    const entity = this.repo.create({
      ...data,
      accountId: this.ctx.accountId,
      createdById: this.ctx.userId,
      modifiedById: this.ctx.userId,
    } as unknown as T);
    return this.repo.save(entity);
  }

  /**
   * Create multiple records
   */
  async createMany(items: Partial<T>[]): Promise<T[]> {
    const entities = items.map((data) =>
      this.repo.create({
        ...data,
        accountId: this.ctx.accountId,
        createdById: this.ctx.userId,
        modifiedById: this.ctx.userId,
      } as unknown as T)
    );
    return this.repo.save(entities);
  }

  /**
   * Update a record by ID
   */
  async update(id: string, data: Partial<T>): Promise<T | null> {
    // Verify record exists and belongs to account
    const existing = await this.findById(id);
    if (!existing) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.repo.update(id, {
      ...data,
      modifiedById: this.ctx.userId,
      modifiedAt: new Date(),
    } as any);

    return this.findById(id);
  }

  /**
   * Update multiple records by IDs
   */
  async updateMany(ids: string[], data: Partial<T>): Promise<number> {
    if (ids.length === 0) return 0;

    const result = await this.repo
      .createQueryBuilder()
      .update()
      .set({
        ...data,
        modifiedById: this.ctx.userId,
        modifiedAt: new Date(),
      } as any)
      .where("id IN (:...ids)", { ids })
      .andWhere("accountId = :accountId", { accountId: this.ctx.accountId })
      .andWhere("archivedAt IS NULL")
      .execute();

    return result.affected || 0;
  }

  // === SOFT DELETE (Archive) ===

  /**
   * Archive a record (soft delete)
   */
  async archive(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) return false;

    await this.repo.update(id, {
      archivedAt: new Date(),
      archivedById: this.ctx.userId,
      modifiedById: this.ctx.userId,
      modifiedAt: new Date(),
    } as any);

    return true;
  }

  /**
   * Archive multiple records
   */
  async archiveMany(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;

    const result = await this.repo
      .createQueryBuilder()
      .update()
      .set({
        archivedAt: new Date(),
        archivedById: this.ctx.userId,
        modifiedById: this.ctx.userId,
        modifiedAt: new Date(),
      } as any)
      .where("id IN (:...ids)", { ids })
      .andWhere("accountId = :accountId", { accountId: this.ctx.accountId })
      .andWhere("archivedAt IS NULL")
      .execute();

    return result.affected || 0;
  }

  /**
   * Restore an archived record
   */
  async restore(id: string): Promise<boolean> {
    // Find including archived
    const existing = await this.repo.findOne({
      where: {
        id,
        accountId: this.ctx.accountId,
      } as unknown as FindOptionsWhere<T>,
    });

    if (!existing || !(existing as BaseEntity).archivedAt) return false;

    await this.repo.update(id, {
      archivedAt: null,
      archivedById: null,
      modifiedById: this.ctx.userId,
      modifiedAt: new Date(),
    } as any);

    return true;
  }

  // === PAGINATION ===

  /**
   * Get paginated results
   */
  async paginate(options: PaginationOptions = {}): Promise<PaginatedResult<T>> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const offset = (page - 1) * limit;

    const qb = this.query("entity");

    if (options.orderBy) {
      qb.orderBy(`entity.${options.orderBy}`, options.orderDir || "DESC");
    } else {
      qb.orderBy("entity.createdAt", "DESC");
    }

    const [items, total] = await qb.skip(offset).take(limit).getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
