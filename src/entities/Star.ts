import { Entity, Column, Index, Unique } from "typeorm";
import { SystemEntity } from "./base/BaseEntity";

/**
 * Stars (favorites) for collections.
 * System entity - not account-scoped.
 */
@Entity("stars")
@Unique(["userId", "collectionId"])
export class Star extends SystemEntity {
  @Column("uuid")
  @Index()
  userId!: string;

  @Column("uuid")
  @Index()
  collectionId!: string;
}
