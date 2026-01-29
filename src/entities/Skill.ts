import { Entity, Column, Index, Unique } from "typeorm";
import { BaseEntity } from "./base/BaseEntity";

@Entity("skills")
@Unique(["collectionId", "path"])
export class Skill extends BaseEntity {
  @Column("uuid")
  @Index()
  collectionId!: string;

  @Column()
  @Index()
  path!: string; // e.g., "code-review" or "utils/formatter"

  @Column()
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  // Parsed from SKILL.md frontmatter
  @Column({ type: "jsonb", nullable: true })
  metadata!: Record<string, unknown> | null;

  // Dependencies (parsed from SKILL.md)
  // Format: ["accountslug/collection/skill", ...]
  @Column({ type: "jsonb", default: [] })
  dependencies!: string[];

  // Source GitHub URL (e.g., "https://github.com/vercel-labs/agent-skills")
  @Column({ type: "varchar", nullable: true })
  sourceUrl!: string | null;

  // SKILL.md or AGENTS.md content
  @Column({ type: "text", nullable: true })
  content!: string | null;

  // Full-text search vector
  @Column({ type: "tsvector", nullable: true, select: false })
  searchVector!: string | null;
}
