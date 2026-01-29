// Force dynamic rendering - this page needs database access
export const dynamic = 'force-dynamic';

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NavBar } from "@/components/nav-bar";
import { Search, Code, ChevronLeft, ChevronRight, ExternalLink, Star, Github, Package, Container } from "lucide-react";
import { getDataSource } from "@/lib/db/data-source";
import { Skill } from "@/entities/Skill";
import { SkillCollection } from "@/entities/SkillCollection";
import { Account } from "@/entities/Account";

interface SkillResult {
  id: string;
  name: string;
  path: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  dependencies: string[];
  createdAt: string;
  modifiedAt: string;
  collection: {
    id: string;
    slug: string;
    name: string;
  };
  account: {
    id: string;
    slug: string;
    name: string;
  };
  fullPath: string;
}

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

async function getPublicSkills(query: string, page: number) {
  const limit = 20;
  const offset = (page - 1) * limit;

  const ds = await getDataSource();

  const qb = ds
    .getRepository(Skill)
    .createQueryBuilder("skill")
    .innerJoin(SkillCollection, "collection", "collection.id = skill.collectionId")
    .innerJoin(Account, "account", "account.id = collection.accountId")
    .where("collection.visibility = :visibility", { visibility: "public" })
    .andWhere("skill.archivedAt IS NULL")
    .andWhere("collection.archivedAt IS NULL");

  if (query) {
    qb.andWhere(
      "(skill.name ILIKE :query OR skill.description ILIKE :query OR skill.path ILIKE :query)",
      { query: `%${query}%` }
    );
  }

  const total = await qb.getCount();

  const skills = await qb
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
    .addSelect(["collection.id", "collection.slug", "collection.name"])
    .addSelect(["account.id", "account.slug", "account.name"])
    .orderBy("(skill.metadata->>'stars')::int", "DESC", "NULLS LAST")
    .skip(offset)
    .take(limit)
    .getRawMany();

  const formattedSkills: SkillResult[] = skills.map((s) => ({
    id: s.skill_id,
    name: s.skill_name,
    path: s.skill_path,
    description: s.skill_description,
    metadata: s.skill_metadata,
    dependencies: s.skill_dependencies,
    createdAt: s.skill_createdAt,
    modifiedAt: s.skill_modifiedAt,
    collection: {
      id: s.collection_id,
      slug: s.collection_slug,
      name: s.collection_name,
    },
    account: {
      id: s.account_id,
      slug: s.account_slug,
      name: s.account_name,
    },
    fullPath: `${s.account_slug}/${s.collection_slug}/${s.skill_path}`,
  }));

  return {
    skills: formattedSkills,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export default async function SkillsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = params.q || "";
  const page = parseInt(params.page || "1", 10);

  const { skills, pagination } = await getPublicSkills(query, page);

  return (
    <div className="min-h-screen">
      <NavBar />

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Explore Public Skills</h1>
            <p className="text-muted-foreground">
              Discover skills created by the community. Import any skill into your collections.
            </p>
          </div>

          {/* Search */}
          <form className="mb-8" action="/skills" method="GET">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  name="q"
                  defaultValue={query}
                  placeholder="Search skills by name or description..."
                  className="pl-10 h-12"
                />
              </div>
              <Button type="submit" size="lg" className="h-12 px-6">
                Search
              </Button>
            </div>
          </form>

          {/* Results Count */}
          <div className="mb-4 text-sm text-muted-foreground">
            {pagination.total} skill{pagination.total !== 1 ? "s" : ""} found
            {query && ` for "${query}"`}
          </div>

          {/* Skills Grid */}
          {skills.length > 0 ? (
            <div className="space-y-4">
              {skills.map((skill: SkillResult) => {
                const metadata = skill.metadata || {};
                const stars = metadata.stars as number | undefined;
                const gitUrl = metadata.gitUrl as string | undefined;
                const npmUrl = metadata.npmUrl as string | undefined;
                const dockerImage = metadata.dockerImage as string | undefined;
                const sourceType = metadata.sourceType as string | undefined;
                const source = metadata.source as string | undefined;

                // Determine the primary external URL
                const externalUrl = gitUrl || npmUrl || (dockerImage ? `https://hub.docker.com/r/${dockerImage}` : null);

                // Get source icon
                const SourceIcon = source === "npm" ? Package : source === "docker" ? Container : Github;

                return (
                  <Card key={skill.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-lg truncate">
                              <Link
                                href={`/${skill.account.slug}/${skill.collection.slug}/${skill.path}`}
                                className="hover:underline"
                              >
                                {skill.name}
                              </Link>
                            </CardTitle>
                            {stars && stars > 0 && (
                              <span className="flex items-center gap-1 text-sm text-yellow-600 dark:text-yellow-500 shrink-0">
                                <Star className="h-4 w-4 fill-current" />
                                {stars >= 1000 ? `${(stars / 1000).toFixed(1)}k` : stars}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted">
                              <SourceIcon className="h-3 w-3" />
                              {sourceType || source || "skill"}
                            </span>
                          </div>
                        </div>
                        {externalUrl && (
                          <a
                            href={externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground shrink-0 ml-2"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {skill.description && (
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                          {skill.description}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          {skill.collection.name}
                        </span>
                        {gitUrl && (
                          <a
                            href={gitUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 hover:text-foreground"
                          >
                            <Github className="h-3 w-3" />
                            GitHub
                          </a>
                        )}
                        {npmUrl && (
                          <a
                            href={npmUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 hover:text-foreground"
                          >
                            <Package className="h-3 w-3" />
                            npm
                          </a>
                        )}
                        {dockerImage && (
                          <a
                            href={`https://hub.docker.com/r/${dockerImage}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 hover:text-foreground"
                          >
                            <Container className="h-3 w-3" />
                            Docker
                          </a>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="p-12 text-center">
              <Code className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-semibold mb-2">No skills found</h3>
              <p className="text-muted-foreground mb-4">
                {query
                  ? `No skills match "${query}". Try a different search term.`
                  : "No public skills available yet. Be the first to create one!"}
              </p>
              <Link href="/register">
                <Button>Create Your First Skill</Button>
              </Link>
            </Card>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <Link
                href={`/skills?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(page - 1) })}`}
                className={page <= 1 ? "pointer-events-none opacity-50" : ""}
              >
                <Button variant="outline" size="sm" disabled={page <= 1}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
              </Link>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(pagination.totalPages, 7) }, (_, i) => {
                  let pageNum: number;
                  if (pagination.totalPages <= 7) {
                    pageNum = i + 1;
                  } else if (page <= 4) {
                    pageNum = i + 1;
                  } else if (page >= pagination.totalPages - 3) {
                    pageNum = pagination.totalPages - 6 + i;
                  } else {
                    pageNum = page - 3 + i;
                  }

                  return (
                    <Link
                      key={pageNum}
                      href={`/skills?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(pageNum) })}`}
                    >
                      <Button
                        variant={pageNum === page ? "default" : "outline"}
                        size="sm"
                        className="w-9 h-9 p-0"
                      >
                        {pageNum}
                      </Button>
                    </Link>
                  );
                })}
              </div>

              <Link
                href={`/skills?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(page + 1) })}`}
                className={page >= pagination.totalPages ? "pointer-events-none opacity-50" : ""}
              >
                <Button variant="outline" size="sm" disabled={page >= pagination.totalPages}>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          )}

          {/* Total info */}
          {pagination.totalPages > 1 && (
            <p className="text-center text-sm text-muted-foreground mt-4">
              Showing {(page - 1) * 20 + 1}-{Math.min(page * 20, pagination.total)} of {pagination.total} skills
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
