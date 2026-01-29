import { Entity, Column, Index, Unique } from "typeorm";
import { BaseEntity } from "./base/BaseEntity";

export type CollectionVisibility = "public" | "private" | "unlisted";

@Entity("skill_collections")
@Unique(["accountId", "slug"])
export class SkillCollection extends BaseEntity {
  @Column()
  @Index()
  slug!: string; // URL-safe name

  @Column()
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "varchar", default: "private" })
  visibility!: CollectionVisibility;

  @Column({ default: "main" })
  defaultBranch!: string;

  // Forked from
  @Column("uuid", { nullable: true })
  @Index()
  forkedFromId!: string | null;

  // Stats (denormalized for performance)
  @Column({ default: 0 })
  skillCount!: number;

  @Column({ default: 0 })
  starCount!: number;

  @Column({ default: 0 })
  forkCount!: number;

  // Full-text search vector (PostgreSQL tsvector)
  @Column({ type: "tsvector", nullable: true, select: false })
  searchVector!: string | null;
}
