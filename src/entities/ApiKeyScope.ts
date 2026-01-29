import { Entity, Column, Index, Unique } from "typeorm";
import { BaseEntity } from "./base/BaseEntity";

export type ApiKeyScopePermission = "read" | "write" | "contribute";

/**
 * Scopes an API key to specific collections with permissions.
 * - read: Can read skills in the collection
 * - write: Can commit directly to main branch
 * - contribute: Can create pull requests
 */
@Entity("api_key_scopes")
@Unique(["apiKeyId", "collectionId"])
export class ApiKeyScope extends BaseEntity {
  @Column("uuid")
  @Index()
  apiKeyId!: string;

  @Column("uuid")
  @Index()
  collectionId!: string;

  @Column({ type: "varchar", default: "read" })
  permission!: ApiKeyScopePermission;
}
