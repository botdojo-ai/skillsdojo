import { Entity, Column, Index } from "typeorm";
import { BaseEntity } from "./base/BaseEntity";

export type ReviewDecision = "approve" | "request_changes" | "comment";

@Entity("reviews")
export class Review extends BaseEntity {
  @Column("uuid")
  @Index()
  pullRequestId!: string;

  @Column({ type: "varchar" })
  decision!: ReviewDecision;

  @Column({ type: "text", nullable: true })
  body!: string | null;

  @Column({ type: "varchar", nullable: true })
  commitSha!: string | null; // Commit SHA at time of review
}
