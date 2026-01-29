import { Entity, Column, Index } from "typeorm";
import { BaseEntity } from "./base/BaseEntity";

export type PullRequestStatus = "open" | "merged" | "closed";

@Entity("pull_requests")
export class PullRequest extends BaseEntity {
  @Column("uuid")
  @Index()
  collectionId!: string;

  @Column()
  number!: number; // PR number within collection (auto-increment per collection)

  @Column()
  title!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "varchar", default: "open" })
  status!: PullRequestStatus;

  // Source and target branches
  @Column()
  sourceBranch!: string;

  @Column()
  targetBranch!: string;

  // Commit SHAs
  @Column({ type: "varchar", nullable: true })
  sourceCommitSha!: string | null;

  @Column({ type: "varchar", nullable: true })
  targetCommitSha!: string | null;

  @Column({ type: "varchar", nullable: true })
  mergeCommitSha!: string | null;

  // Timestamps
  @Column({ type: "timestamptz", nullable: true })
  mergedAt!: Date | null;

  @Column("uuid", { nullable: true })
  mergedById!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  closedAt!: Date | null;

  @Column("uuid", { nullable: true })
  closedById!: string | null;
}
