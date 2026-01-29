import { Entity, Column, OneToMany, Index } from "typeorm";
import { SystemEntity } from "./base/BaseEntity";

@Entity("users")
export class User extends SystemEntity {
  @Column({ unique: true })
  @Index()
  email!: string;

  @Column({ unique: true })
  @Index()
  username!: string;

  @Column()
  passwordHash!: string;

  @Column()
  displayName!: string;

  @Column({ type: "varchar", nullable: true })
  avatarUrl!: string | null;

  @Column({ default: false })
  emailVerified!: boolean;

  @Column({ type: "varchar", nullable: true })
  emailVerificationToken!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  emailVerificationExpires!: Date | null;

  @Column({ type: "varchar", nullable: true })
  passwordResetToken!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  passwordResetExpires!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  lastLoginAt!: Date | null;
}
