import { Entity, Column, Index, PrimaryGeneratedColumn, Unique } from "typeorm";

/**
 * Git references (branches, tags, HEAD)
 */
@Entity("git_refs")
@Unique(["repoId", "refName"])
export class GitRef {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("uuid")
  @Index()
  repoId!: string; // SkillCollection.id

  @Column()
  refName!: string; // e.g., 'refs/heads/main', 'HEAD', 'refs/tags/v1.0'

  @Column({ type: "varchar", nullable: true })
  sha!: string | null; // Points to commit SHA (null if symbolic)

  @Column({ type: "varchar", nullable: true })
  symbolicRef!: string | null; // For symbolic refs like HEAD -> refs/heads/main
}
