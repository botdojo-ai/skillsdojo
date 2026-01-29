import { Entity, Column, Index } from "typeorm";
import { BaseEntity } from "./base/BaseEntity";

/**
 * Temporary tokens for downloading skills as zip files.
 * Used by CLI for secure downloads.
 */
@Entity("download_tokens")
export class DownloadToken extends BaseEntity {
  @Column()
  @Index()
  token!: string;

  @Column("uuid")
  @Index()
  collectionId!: string;

  @Column("uuid", { nullable: true })
  skillId!: string | null; // null = entire collection

  @Column({ type: "varchar", nullable: true })
  branch!: string | null;

  @Column({ type: "timestamptz" })
  expiresAt!: Date;

  @Column({ default: false })
  used!: boolean;

  @Column({ type: "timestamptz", nullable: true })
  usedAt!: Date | null;
}
