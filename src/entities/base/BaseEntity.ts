import {
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
  JoinColumn,
} from "typeorm";

/**
 * BaseEntity - For account-scoped entities with full audit trail
 *
 * Standard fields:
 * - accountId: Multi-tenant isolation (always filtered)
 * - createdById, modifiedById, archivedById: Who made changes
 * - createdAt, modifiedAt, archivedAt: When (UTC)
 *
 * All queries MUST filter on accountId and archivedAt IS NULL
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // Multi-tenant: ALL records scoped to account
  @Column("uuid")
  @Index()
  accountId!: string;

  // Audit: created
  @Column("uuid")
  createdById!: string;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  // Audit: modified
  @Column("uuid", { nullable: true })
  modifiedById!: string | null;

  @UpdateDateColumn({ type: "timestamptz" })
  modifiedAt!: Date;

  // Soft delete: archive instead of delete
  @Column({ type: "timestamptz", nullable: true })
  @Index()
  archivedAt!: Date | null;

  @Column("uuid", { nullable: true })
  archivedById!: string | null;
}

/**
 * SystemEntity - For global entities (User, Account) without account scoping
 */
export abstract class SystemEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("uuid", { nullable: true })
  createdById!: string | null;

  @Column("uuid", { nullable: true })
  modifiedById!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  modifiedAt!: Date;

  @Column({ type: "timestamptz", nullable: true })
  @Index()
  archivedAt!: Date | null;

  @Column("uuid", { nullable: true })
  archivedById!: string | null;
}

/**
 * ImmutableEntity - For content-addressed entities (GitObject)
 * Never modified or deleted, only created
 */
export abstract class ImmutableEntity {
  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
