import "reflect-metadata";
import { DataSource, DataSourceOptions } from "typeorm";

// Import all entities
import { User } from "@/entities/User";
import { Account } from "@/entities/Account";
import { AccountMembership } from "@/entities/AccountMembership";
import { SkillCollection } from "@/entities/SkillCollection";
import { Skill } from "@/entities/Skill";
import { SkillLink } from "@/entities/SkillLink";
import { GitObject } from "@/entities/GitObject";
import { GitRef } from "@/entities/GitRef";
import { GitFileIndex } from "@/entities/GitFileIndex";
import { PullRequest } from "@/entities/PullRequest";
import { Review } from "@/entities/Review";
import { Comment } from "@/entities/Comment";
import { Team } from "@/entities/Team";
import { TeamMembership } from "@/entities/TeamMembership";
import { TeamPermission } from "@/entities/TeamPermission";
import { ApiKey } from "@/entities/ApiKey";
import { ApiKeyScope } from "@/entities/ApiKeyScope";
import { DownloadToken } from "@/entities/DownloadToken";
import { Star } from "@/entities/Star";
import { AccessToken } from "@/entities/AccessToken";

const entities = [
  User,
  Account,
  AccountMembership,
  SkillCollection,
  Skill,
  SkillLink,
  GitObject,
  GitRef,
  GitFileIndex,
  PullRequest,
  Review,
  Comment,
  Team,
  TeamMembership,
  TeamPermission,
  ApiKey,
  ApiKeyScope,
  DownloadToken,
  Star,
  AccessToken,
];

// Supabase requires SSL even in development
const isSupabase = process.env.DATABASE_URL?.includes("supabase.co");
const requiresSsl = process.env.NODE_ENV === "production" || isSupabase;

const config: DataSourceOptions = {
  type: "postgres",
  url: process.env.DATABASE_URL,
  entities,
  synchronize: process.env.NODE_ENV === "development", // Auto-sync in dev only
  logging: process.env.NODE_ENV === "development",
  ssl: requiresSsl ? { rejectUnauthorized: false } : false,
};

// Global singleton for the data source
let dataSource: DataSource | null = null;

export async function getDataSource(): Promise<DataSource> {
  // Fail fast if DATABASE_URL is not configured
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  if (dataSource && dataSource.isInitialized) {
    return dataSource;
  }

  dataSource = new DataSource(config);
  await dataSource.initialize();
  return dataSource;
}

export async function closeDataSource(): Promise<void> {
  if (dataSource && dataSource.isInitialized) {
    await dataSource.destroy();
    dataSource = null;
  }
}
