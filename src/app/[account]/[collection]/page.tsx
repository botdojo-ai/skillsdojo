import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NavBar } from "@/components/nav-bar";
import { CollectionHeader } from "@/components/collection-header";
import { getDataSource } from "@/lib/db/data-source";
import { Skill } from "@/entities/Skill";
import { SkillCollection } from "@/entities/SkillCollection";
import { Account } from "@/entities/Account";
import { AccountMembership } from "@/entities/AccountMembership";
import { verifyToken } from "@/lib/auth/jwt";
import {
  Code,
  Star,
  Github,
  Package,
  Container,
  ExternalLink,
  Plus,
} from "lucide-react";

interface PageProps {
  params: Promise<{ account: string; collection: string }>;
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

async function canEditCollection(
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

async function getCollection(accountSlug: string, collectionSlug: string) {
  const ds = await getDataSource();

  const result = await ds
    .getRepository(SkillCollection)
    .createQueryBuilder("collection")
    .innerJoin(Account, "account", "account.id = collection.accountId")
    .where("account.slug = :accountSlug", { accountSlug })
    .andWhere("collection.slug = :collectionSlug", { collectionSlug })
    .andWhere("collection.archivedAt IS NULL")
    .select([
      "collection.id",
      "collection.slug",
      "collection.name",
      "collection.description",
      "collection.visibility",
    ])
    .addSelect(["account.id", "account.slug", "account.name"])
    .getRawOne();

  if (!result) return null;

  return {
    id: result.collection_id,
    slug: result.collection_slug,
    name: result.collection_name,
    description: result.collection_description,
    visibility: result.collection_visibility,
    account: {
      id: result.account_id,
      slug: result.account_slug,
      name: result.account_name,
    },
  };
}

async function getSkills(collectionId: string) {
  const ds = await getDataSource();

  const skills = await ds
    .getRepository(Skill)
    .createQueryBuilder("skill")
    .where("skill.collectionId = :collectionId", { collectionId })
    .andWhere("skill.archivedAt IS NULL")
    .orderBy("(skill.metadata->>'stars')::int", "DESC", "NULLS LAST")
    .getMany();

  return skills;
}

export default async function CollectionPage({ params }: PageProps) {
  const { account: accountSlug, collection: collectionSlug } = await params;

  const collection = await getCollection(accountSlug, collectionSlug);

  if (!collection) {
    notFound();
  }

  const userId = await getCurrentUserId();
  const canView = await canViewCollection(
    collection.account.id,
    collection.visibility,
    userId
  );

  if (!canView) {
    notFound();
  }

  const canEdit = await canEditCollection(collection.account.id, userId);
  const skills = await getSkills(collection.id);

  const breadcrumbs = [
    { label: collection.account.name, href: `/${collection.account.slug}` },
    { label: collection.name },
  ];

  return (
    <div className="min-h-screen">
      <NavBar breadcrumbs={breadcrumbs} />

      <div className="container mx-auto px-4 py-6">
        <div className="max-w-6xl mx-auto">
          <CollectionHeader
            collection={collection}
            account={collection.account}
            canEdit={canEdit}
          />

          {/* Action buttons for owners */}
          {canEdit && (
            <div className="flex justify-end mb-6">
              <Link href={`/${accountSlug}/${collectionSlug}/skills/new`}>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Skill
                </Button>
              </Link>
            </div>
          )}

      {/* Skills List */}
      {skills.length > 0 ? (
        <div className="space-y-4">
          {skills.map((skill) => {
            const metadata = skill.metadata || {};
            const stars = metadata.stars as number | undefined;
            const gitUrl = metadata.gitUrl as string | undefined;
            const npmUrl = metadata.npmUrl as string | undefined;
            const dockerImage = metadata.dockerImage as string | undefined;
            const sourceType = metadata.sourceType as string | undefined;
            const source = metadata.source as string | undefined;

            const externalUrl = gitUrl || npmUrl || (dockerImage ? `https://hub.docker.com/r/${dockerImage}` : null);
            const SourceIcon = source === "npm" ? Package : source === "docker" ? Container : Github;

            return (
              <Card key={skill.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg truncate">
                          <Link
                            href={`/${accountSlug}/${collectionSlug}/${skill.path}`}
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
          <h3 className="font-semibold mb-2">No skills yet</h3>
          <p className="text-muted-foreground mb-4">
            {canEdit
              ? "Add your first skill to this collection."
              : "This collection doesn't have any skills yet."}
          </p>
          {canEdit && (
            <Link href={`/${accountSlug}/${collectionSlug}/skills/new`}>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Skill
              </Button>
            </Link>
          )}
        </Card>
      )}
        </div>
      </div>
    </div>
  );
}
