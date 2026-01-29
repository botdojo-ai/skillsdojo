import { Entity, Column, Index, Unique } from "typeorm";
import { BaseEntity } from "./base/BaseEntity";

export type SkillLinkStatus = "synced" | "behind" | "ahead" | "diverged";

/**
 * Tracks skills imported from other collections.
 * Similar to git subtree - allows importing individual skills
 * while maintaining link to source for updates.
 */
@Entity("skill_links")
@Unique(["localSkillId"])
export class SkillLink extends BaseEntity {
  // The local skill (in this account's collection)
  @Column("uuid")
  @Index()
  localSkillId!: string;

  // Source collection (may be in different account)
  @Column("uuid")
  @Index()
  sourceCollectionId!: string;

  // Source skill ID
  @Column("uuid")
  sourceSkillId!: string;

  // Commit SHA when skill was imported/last synced
  @Column()
  sourceCommitSha!: string;

  // Current sync status
  @Column({ type: "varchar", default: "synced" })
  status!: SkillLinkStatus;

  // Local commit SHA (for divergence detection)
  @Column({ type: "varchar", nullable: true })
  localCommitSha!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  lastSyncedAt!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  lastCheckedAt!: Date | null;
}
