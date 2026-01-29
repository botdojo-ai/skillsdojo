import { Entity, Column, Index, PrimaryGeneratedColumn, Unique } from "typeorm";

/**
 * Denormalized index for fast file lookups.
 * Rebuilt when branches change.
 */
@Entity("git_file_index")
@Unique(["repoId", "branch", "path"])
export class GitFileIndex {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("uuid")
  @Index()
  repoId!: string; // SkillCollection.id

  @Column()
  @Index()
  branch!: string; // e.g., 'main', 'feature/new-skill'

  @Column()
  @Index()
  path!: string; // e.g., 'SKILL.md', 'examples/sample.md'

  @Column()
  blobSha!: string; // Points to GitObject.sha

  @Column({ default: "100644" })
  mode!: string; // File mode (100644 = regular file, 100755 = executable)
}
