import { Entity, Column, Index, Unique } from "typeorm";
import { SystemEntity } from "./base/BaseEntity";

export type AccountRole = "owner" | "admin" | "member" | "viewer";

@Entity("account_memberships")
@Unique(["userId", "accountId"])
export class AccountMembership extends SystemEntity {
  @Column("uuid")
  @Index()
  userId!: string;

  @Column("uuid")
  @Index()
  accountId!: string;

  @Column({ type: "varchar", default: "member" })
  role!: AccountRole;

  @Column({ type: "timestamptz", nullable: true })
  invitedAt!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  acceptedAt!: Date | null;
}
