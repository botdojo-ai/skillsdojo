import { Entity, Column, Index } from "typeorm";
import { SystemEntity } from "./base/BaseEntity";

/**
 * Personal access tokens for CLI authentication.
 * System entity - associated with user, not account.
 */
@Entity("access_tokens")
export class AccessToken extends SystemEntity {
  @Column("uuid")
  @Index()
  userId!: string;

  @Column()
  name!: string;

  // Hashed token (never store plaintext)
  @Column()
  tokenHash!: string;

  // Token prefix for identification
  @Column()
  @Index()
  tokenPrefix!: string;

  @Column({ type: "timestamptz", nullable: true })
  expiresAt!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  lastUsedAt!: Date | null;

  // Which scopes this token has
  @Column({ type: "jsonb", default: ["read"] })
  scopes!: string[]; // ['read', 'write', 'delete', 'admin']
}
