import { Entity, Column, Index, Unique } from "typeorm";
import { BaseEntity } from "./base/BaseEntity";

export type PermissionLevel = "read" | "write" | "admin";

@Entity("team_permissions")
@Unique(["teamId", "collectionId"])
export class TeamPermission extends BaseEntity {
  @Column("uuid")
  @Index()
  teamId!: string;

  @Column("uuid")
  @Index()
  collectionId!: string;

  @Column({ type: "varchar", default: "read" })
  permission!: PermissionLevel;
}
