// Force dynamic rendering - this page needs database access
export const dynamic = 'force-dynamic';

import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getDataSource } from "@/lib/db/data-source";
import { Skill } from "@/entities/Skill";
import { SkillCollection } from "@/entities/SkillCollection";
import { Account } from "@/entities/Account";
import { AccountMembership } from "@/entities/AccountMembership";
import { GitFileIndex } from "@/entities/GitFileIndex";
import { GitObject } from "@/entities/GitObject";
import { verifyToken } from "@/lib/auth/jwt";
import pako from "pako";
import {
  Star,
  Github,
  Package,
  Container,
  ExternalLink,
  Calendar,
  Tag,
  Eye,
  GitFork,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavBar } from "@/components/nav-bar";
import { SkillViewer } from "@/components/skill-viewer";
import { UseSkillButton } from "./use-skill-button";
import { SkillOwnerActions } from "./skill-owner-actions";

interface PageProps {
  params: Promise<{ account: string; collection: string; skill: string }>;
}

async function getCurrentUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;

  try {
    const payload = await verifyToken(token);
    return payload?.userId || null;
  } catch {
    return null;
  }
}

async function canViewCollection(
  accountId: string,
  visibility: string,
  userId: string | null
): Promise<boolean> {
  if (visibility === "public" || visibility === "unlisted") {
    return true;
  }

  if (!userId) return false;

  const ds = await getDataSource();
  const membership = await ds.getRepository(AccountMembership).findOne({
    where: { userId, accountId, archivedAt: undefined },
  });

  return !!membership;
}

async function canEditSkill(
  accountId: string,
  userId: string | null
): Promise<boolean> {
  if (!userId) return false;

  const ds = await getDataSource();
  const membership = await ds.getRepository(AccountMembership).findOne({
    where: { userId, accountId, archivedAt: undefined },
  });

  if (!membership) return false;
  return ["owner", "admin", "member"].includes(membership.role);
}

async function getSkill(accountSlug: string, collectionSlug: string, skillPath: string) {
  const ds = await getDataSource();

  const result = await ds
    .getRepository(Skill)
    .createQueryBuilder("skill")
    .innerJoin(SkillCollection, "collection", "collection.id = skill.collectionId")
    .innerJoin(Account, "account", "account.id = collection.accountId")
    .where("account.slug = :accountSlug", { accountSlug })
    .andWhere("collection.slug = :collectionSlug", { collectionSlug })
    .andWhere("skill.path = :skillPath", { skillPath })
    .andWhere("skill.archivedAt IS NULL")
    .andWhere("collection.archivedAt IS NULL")
    .select([
      "skill.id",
      "skill.name",
      "skill.path",
      "skill.description",
      "skill.metadata",
      "skill.dependencies",
      "skill.createdAt",
      "skill.modifiedAt",
    ])
    .addSelect(["collection.id", "collection.slug", "collection.name", "collection.visibility", "collection.description"])
    .addSelect(["account.id", "account.slug", "account.name", "account.avatarUrl"])
    .getRawOne();

  if (!result) return null;

  return {
    id: result.skill_id,
    name: result.skill_name,
    path: result.skill_path,
    description: result.skill_description,
    metadata: result.skill_metadata || {},
    dependencies: result.skill_dependencies || [],
    createdAt: result.skill_createdAt,
    modifiedAt: result.skill_modifiedAt,
    collection: {
      id: result.collection_id,
      slug: result.collection_slug,
      name: result.collection_name,
      visibility: result.collection_visibility,
      description: result.collection_description,
    },
    account: {
      id: result.account_id,
      slug: result.account_slug,
      name: result.account_name,
      avatarUrl: result.account_avatarUrl,
    },
  };
}

interface SkillFile {
  path: string;
  content: string;
  size: number;
}

async function getSkillFiles(collectionId: string, skillPath: string): Promise<SkillFile[]> {
  const ds = await getDataSource();

  // Get all files from git index for this skill
  const fileEntries = await ds.getRepository(GitFileIndex).find({
    where: { repoId: collectionId, branch: "main" },
    order: { path: "ASC" },
  });

  // Filter files that belong to this skill (files in the skill's directory)
  const skillPrefix = skillPath + "/";
  const relevantFiles = fileEntries.filter(
    (f) => f.path.startsWith(skillPrefix) || f.path === skillPath
  );

  const files: SkillFile[] = [];

  for (const entry of relevantFiles) {
    // Get the blob content
    const blob = await ds.getRepository(GitObject).findOne({
      where: { sha: entry.blobSha, repoId: collectionId },
    });

    if (blob) {
      try {
        // Decompress content
        const decompressed = Buffer.from(pako.inflate(blob.content));
        const content = decompressed.toString("utf-8");

        // Remove the skill prefix from path for display
        const displayPath = entry.path.startsWith(skillPrefix)
          ? entry.path.slice(skillPrefix.length)
          : entry.path;

        files.push({
          path: displayPath,
          content,
          size: blob.size,
        });
      } catch (e) {
        // If decompression fails, skip this file
        console.error(`Failed to decompress file ${entry.path}:`, e);
      }
    }
  }

  return files;
}

export default async function SkillPage({ params }: PageProps) {
  const { account: accountSlug, collection: collectionSlug, skill: skillPath } = await params;

  const skill = await getSkill(accountSlug, collectionSlug, skillPath);

  if (!skill) {
    notFound();
  }

  // Check if user can view this collection
  const userId = await getCurrentUserId();
  const canView = await canViewCollection(
    skill.account.id,
    skill.collection.visibility,
    userId
  );

  if (!canView) {
    notFound();
  }

  // Check if user can edit this skill
  const canEdit = await canEditSkill(skill.account.id, userId);

  // Get files from git storage
  const files = await getSkillFiles(skill.collection.id, skillPath);

  const metadata = skill.metadata;
  const stars = metadata.stars as number | undefined;
  const gitUrl = metadata.gitUrl as string | undefined;
  const npmUrl = metadata.npmUrl as string | undefined;
  const dockerImage = metadata.dockerImage as string | undefined;
  const sourceType = metadata.sourceType as string | undefined;
  const source = metadata.source as string | undefined;
  const keywords = metadata.keywords as string[] | undefined;
  const owner = metadata.owner as string | undefined;
  const repo = metadata.repo as string | undefined;
  const forks = metadata.forks as number | undefined;
  const watchers = metadata.watchers as number | undefined;

  const fullPath = `${skill.account.slug}/${skill.collection.slug}/${skill.path}`;

  const breadcrumbs = [
    { label: skill.account.name, href: `/${skill.account.slug}` },
    { label: skill.collection.name, href: `/${skill.account.slug}/${skill.collection.slug}` },
    { label: skill.name },
  ];

  return (
    <div className="min-h-screen">
      <NavBar breadcrumbs={breadcrumbs} />

      <div className="container mx-auto px-4 py-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold">{skill.name}</h1>
                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted">
                  {source === "npm" ? <Package className="h-3 w-3" /> :
                   source === "docker" ? <Container className="h-3 w-3" /> :
                   <Github className="h-3 w-3" />}
                  {sourceType || source || "skill"}
                </span>
              </div>
              {skill.description && (
                <p className="text-muted-foreground max-w-2xl">{skill.description}</p>
              )}

              {/* Stats Row */}
              <div className="flex items-center gap-4 mt-3 text-sm">
                {stars !== undefined && stars > 0 && (
                  <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-500">
                    <Star className="h-4 w-4 fill-current" />
                    {stars >= 1000 ? `${(stars / 1000).toFixed(1)}k` : stars.toLocaleString()}
                  </span>
                )}
                {forks !== undefined && forks > 0 && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <GitFork className="h-4 w-4" />
                    {forks.toLocaleString()}
                  </span>
                )}
                {watchers !== undefined && watchers > 0 && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Eye className="h-4 w-4" />
                    {watchers.toLocaleString()}
                  </span>
                )}
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  {new Date(skill.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {canEdit && (
                <SkillOwnerActions
                  accountSlug={skill.account.slug}
                  collectionSlug={skill.collection.slug}
                  skillPath={skill.path}
                />
              )}

              <UseSkillButton
                skillPath={skill.path}
                skillName={skill.name}
                collectionId={skill.collection.id}
              />

              {gitUrl && (
                <a href={gitUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Github className="h-4 w-4" />
                    GitHub
                  </Button>
                </a>
              )}

              {npmUrl && (
                <a href={npmUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Package className="h-4 w-4" />
                    npm
                  </Button>
                </a>
              )}

              {dockerImage && (
                <a href={`https://hub.docker.com/r/${dockerImage}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Container className="h-4 w-4" />
                    Docker
                  </Button>
                </a>
              )}
            </div>
          </div>

          {/* Tags */}
          {keywords && keywords.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {keywords.slice(0, 10).map((keyword: string) => (
                <Link
                  key={keyword}
                  href={`/skills?q=${encodeURIComponent(keyword)}`}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                >
                  <Tag className="h-3 w-3" />
                  {keyword}
                </Link>
              ))}
            </div>
          )}

          {/* Skill Viewer */}
          <SkillViewer
            files={files}
            skillName={skill.name}
            collectionId={skill.collection.id}
            skillPath={skill.path}
          />

          {/* Footer Info */}
          <div className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-4">
              <span>
                Collection:{" "}
                <Link
                  href={`/${skill.account.slug}/${skill.collection.slug}`}
                  className="hover:underline text-foreground"
                >
                  {skill.collection.name}
                </Link>
              </span>
              <span>
                by{" "}
                <Link
                  href={`/${skill.account.slug}`}
                  className="hover:underline text-foreground"
                >
                  {skill.account.name}
                </Link>
              </span>
            </div>
            {gitUrl && owner && repo && (
              <a
                href={gitUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-foreground"
              >
                <ExternalLink className="h-4 w-4" />
                {owner}/{repo}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
