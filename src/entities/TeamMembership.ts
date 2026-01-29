import { Entity, Column, Index, Unique } from "typeorm";
import { BaseEntity } from "./base/BaseEntity";

export type TeamRole = "maintainer" | "member";

@Entity("team_memberships")
@Unique(["teamId", "userId"])
export class TeamMembership extends BaseEntity {
  @Column("uuid")
  @Index()
  teamId!: string;

  @Column("uuid")
  @Index()
  userId!: string;

  @Column({ type: "varchar", default: "member" })
  role!: TeamRole;
}
