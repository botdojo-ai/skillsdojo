import { Entity, Column, Index } from "typeorm";
import { SystemEntity } from "./base/BaseEntity";

export type AccountType = "personal" | "organization";

@Entity("accounts")
export class Account extends SystemEntity {
  @Column({ unique: true })
  @Index()
  slug!: string; // URL-safe identifier (e.g., "anthropic", "my-org")

  @Column()
  name!: string;

  @Column({ type: "varchar", default: "personal" })
  type!: AccountType;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "varchar", nullable: true })
  avatarUrl!: string | null;

  @Column({ type: "varchar", nullable: true })
  websiteUrl!: string | null;

  // For personal accounts, this links to the user
  @Column("uuid", { nullable: true })
  @Index()
  ownerId!: string | null;

  // Is this the system account for public skills?
  @Column({ default: false })
  isPublic!: boolean;
}
