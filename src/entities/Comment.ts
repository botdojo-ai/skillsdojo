import { Entity, Column, Index } from "typeorm";
import { BaseEntity } from "./base/BaseEntity";

export type CommentType = "pr" | "review" | "inline";

@Entity("comments")
export class Comment extends BaseEntity {
  @Column("uuid")
  @Index()
  pullRequestId!: string;

  @Column("uuid", { nullable: true })
  reviewId!: string | null;

  @Column({ type: "varchar" })
  type!: CommentType;

  @Column({ type: "text" })
  body!: string;

  // For inline comments
  @Column({ type: "varchar", nullable: true })
  path!: string | null; // File path

  @Column({ type: "int", nullable: true })
  line!: number | null; // Line number

  @Column({ type: "varchar", nullable: true })
  commitSha!: string | null;

  // Reply thread
  @Column("uuid", { nullable: true })
  @Index()
  parentId!: string | null;

  @Column({ default: false })
  resolved!: boolean;

  @Column("uuid", { nullable: true })
  resolvedById!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  resolvedAt!: Date | null;
}
