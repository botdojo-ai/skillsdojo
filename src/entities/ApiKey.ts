import { Entity, Column, Index } from "typeorm";
import { BaseEntity } from "./base/BaseEntity";

@Entity("api_keys")
export class ApiKey extends BaseEntity {
  @Column()
  name!: string;

  // Hashed API key (never store plaintext)
  @Column()
  keyHash!: string;

  // Key prefix for identification (first 8 chars)
  @Column()
  @Index()
  keyPrefix!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  expiresAt!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  lastUsedAt!: Date | null;

  // Permissions
  @Column({ default: true })
  canRead!: boolean;

  @Column({ default: false })
  canWrite!: boolean;

  @Column({ default: false })
  canDelete!: boolean;
}
