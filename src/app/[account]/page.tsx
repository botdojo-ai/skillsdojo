import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NavBar } from "@/components/nav-bar";
import { getDataSource } from "@/lib/db/data-source";
import { SkillCollection } from "@/entities/SkillCollection";
import { Account } from "@/entities/Account";
import { verifyToken } from "@/lib/auth/jwt";
import {
  Code,
  Star,
  GitFork,
  Globe,
  Lock,
  EyeOff,
  FolderGit2,
  Settings,
} from "lucide-react";

interface PageProps {
  params: Promise<{ account: string }>;
}

async function getAccount(accountSlug: string) {
  const ds = await getDataSource();

  const account = await ds.getRepository(Account).findOne({
    where: { slug: accountSlug, archivedAt: undefined },
  });

  return account;
}

async function getCollections(accountId: string, isOwner: boolean) {
  const ds = await getDataSource();
  const repo = ds.getRepository(SkillCollection);

  const qb = repo.createQueryBuilder("c")
    .where("c.accountId = :accountId", { accountId })
    .andWhere("c.archivedAt IS NULL");

  if (!isOwner) {
    qb.andWhere("c.visibility = :visibility", { visibility: "public" });
  }

  qb.orderBy("c.modifiedAt", "DESC");

  return qb.getMany();
}

async function getCurrentUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload || payload.type !== "access") return null;

  return payload.accountId || payload.userId;
}

export default async function AccountPage({ params }: PageProps) {
  const { account: accountSlug } = await params;

  const account = await getAccount(accountSlug);

  if (!account) {
    notFound();
  }

  // Check if viewer is the account owner
  const currentAccountId = await getCurrentUserId();
  const isOwner = currentAccountId === account.id;

  const collections = await getCollections(account.id, isOwner);

  // Calculate totals
  const totalSkills = collections.reduce((sum, c) => sum + c.skillCount, 0);
  const totalStars = collections.reduce((sum, c) => sum + c.starCount, 0);

  const breadcrumbs = [{ label: account.name }];

  return (
    <div className="min-h-screen">
      <NavBar breadcrumbs={breadcrumbs} />

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-4 mb-4">
              {account.avatarUrl ? (
                <img
                  src={account.avatarUrl}
                  alt={account.name}
                  className="w-16 h-16 rounded-full"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <Code className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div>
                <h1 className="text-3xl font-bold">{account.name}</h1>
                <p className="text-muted-foreground font-mono">@{account.slug}</p>
              </div>
            </div>

            {account.description && (
              <p className="text-lg text-muted-foreground mb-4">{account.description}</p>
            )}

            {/* Stats */}
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <FolderGit2 className="h-4 w-4" />
                {collections.length} collection{collections.length !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1">
                <Code className="h-4 w-4" />
                {totalSkills} skill{totalSkills !== 1 ? "s" : ""}
              </span>
              {totalStars > 0 && (
                <span className="flex items-center gap-1">
                  <Star className="h-4 w-4" />
                  {totalStars} star{totalStars !== 1 ? "s" : ""}
                </span>
              )}
              {isOwner && (
                <Link
                  href={`/${accountSlug}/settings`}
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
              )}
            </div>
          </div>

          {/* Collections List */}
          {collections.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">
                  {isOwner ? "Collections" : "Public Collections"}
                </h2>
                {isOwner && (
                  <Link
                    href="/dashboard/collections/new"
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2"
                  >
                    New Collection
                  </Link>
                )}
              </div>
              {collections.map((collection) => (
                <Card key={collection.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">
                          <Link
                            href={`/${accountSlug}/${collection.slug}`}
                            className="hover:underline"
                          >
                            {collection.name}
                          </Link>
                        </CardTitle>
                        <p className="text-sm text-muted-foreground font-mono">
                          {accountSlug}/{collection.slug}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted">
                        {collection.visibility === "public" && <Globe className="h-3 w-3" />}
                        {collection.visibility === "private" && <Lock className="h-3 w-3" />}
                        {collection.visibility === "unlisted" && <EyeOff className="h-3 w-3" />}
                        {collection.visibility}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {collection.description && (
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                        {collection.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Code className="h-3 w-3" />
                        {collection.skillCount} skill{collection.skillCount !== 1 ? "s" : ""}
                      </span>
                      {collection.starCount > 0 && (
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3" />
                          {collection.starCount}
                        </span>
                      )}
                      {collection.forkCount > 0 && (
                        <span className="flex items-center gap-1">
                          <GitFork className="h-3 w-3" />
                          {collection.forkCount}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-12 text-center">
              <FolderGit2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-semibold mb-2">
                {isOwner ? "No collections yet" : "No public collections"}
              </h3>
              <p className="text-muted-foreground mb-4">
                {isOwner
                  ? "Create your first collection to get started."
                  : "This account doesn't have any public collections yet."}
              </p>
              {isOwner && (
                <Link
                  href="/dashboard/collections/new"
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2"
                >
                  Create Collection
                </Link>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
