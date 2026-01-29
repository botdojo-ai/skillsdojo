import { Entity, Column, Index, PrimaryColumn } from "typeorm";
import { ImmutableEntity } from "./base/BaseEntity";

export type GitObjectType = "blob" | "tree" | "commit" | "tag";

/**
 * Git objects (blobs, trees, commits, tags) stored in database.
 * Content-addressed by SHA - never modified, only created.
 */
@Entity("git_objects")
export class GitObject extends ImmutableEntity {
  @PrimaryColumn()
  sha!: string; // SHA-1 hash (40 hex chars)

  @Column("uuid")
  @Index()
  repoId!: string; // SkillCollection.id

  @Column({ type: "varchar" })
  type!: GitObjectType;

  @Column({ type: "bytea" })
  content!: Buffer; // Compressed object content

  @Column()
  size!: number; // Uncompressed size
}
