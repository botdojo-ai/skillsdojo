import { Entity, Column, Index, Unique } from "typeorm";
import { BaseEntity } from "./base/BaseEntity";

@Entity("teams")
@Unique(["accountId", "slug"])
export class Team extends BaseEntity {
  @Column()
  @Index()
  slug!: string;

  @Column()
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;
}
