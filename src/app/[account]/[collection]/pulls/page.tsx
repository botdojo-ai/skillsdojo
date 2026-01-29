"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { NavBar } from "@/components/nav-bar";
import { CollectionTabs } from "@/components/collection-tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  GitPullRequest,
  GitMerge,
  XCircle,
  Clock,
  Globe,
  Lock,
  EyeOff,
} from "lucide-react";

interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: "public" | "private" | "unlisted";
  account: {
    slug: string;
    name: string;
  };
  canEdit: boolean;
}

interface PullRequest {
  id: string;
  number: number;
  title: string;
  description: string | null;
  status: "open" | "merged" | "closed";
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
}

export default function PullRequestsPage() {
  const params = useParams();
  const router = useRouter();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"open" | "merged" | "closed">("open");

  const accountSlug = (params?.account as string) || "";
  const collectionSlug = (params?.collection as string) || "";

  // First, fetch collection from slugs
  useEffect(() => {
    const fetchCollection = async () => {
      try {
        const res = await fetch(
          `/api/collections/by-slug/${accountSlug}/${collectionSlug}`,
          { credentials: "include" }
        );
        if (res.ok) {
          const data = await res.json();
          setCollection(data);
        } else {
          setError("Collection not found");
        }
      } catch {
        setError("Failed to load collection");
      }
    };

    fetchCollection();
  }, [accountSlug, collectionSlug]);

  // Then fetch PRs
  useEffect(() => {
    if (!collection) return;

    const fetchPRs = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/collections/${collection.id}/pulls?status=${activeTab}`,
          { credentials: "include" }
        );

        if (res.ok) {
          const data = await res.json();
          setPullRequests(data.items || []);
        }
      } catch (err) {
        setError("Failed to load pull requests");
      } finally {
        setLoading(false);
      }
    };

    fetchPRs();
  }, [collection, activeTab]);

  const handleTabChange = (value: string) => {
    setActiveTab(value as "open" | "merged" | "closed");
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "open":
        return <GitPullRequest className="h-4 w-4 text-amber-500" />;
      case "merged":
        return <GitMerge className="h-4 w-4 text-green-500" />;
      case "closed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <Badge variant="warning">Open</Badge>;
      case "merged":
        return <Badge variant="success">Merged</Badge>;
      case "closed":
        return <Badge variant="destructive">Closed</Badge>;
      default:
        return null;
    }
  };

  const VisibilityIcon =
    collection?.visibility === "public"
      ? Globe
      : collection?.visibility === "private"
      ? Lock
      : EyeOff;

  if (loading && !collection) {
    return (
      <div className="min-h-screen">
        <NavBar />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || !collection) {
    return (
      <div className="min-h-screen">
        <NavBar />
        <div className="text-center py-12">
          <p className="text-red-500">{error || "Collection not found"}</p>
        </div>
      </div>
    );
  }

  const breadcrumbs = [
    { label: collection.account.name, href: `/${collection.account.slug}` },
    { label: collection.name, href: `/${collection.account.slug}/${collection.slug}` },
    { label: "Pull Requests" },
  ];

  return (
    <div className="min-h-screen">
      <NavBar breadcrumbs={breadcrumbs} />

      <div className="container mx-auto px-4 py-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold">{collection.name}</h1>
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted">
                <VisibilityIcon className="h-3 w-3" />
                {collection.visibility}
              </span>
            </div>
            {collection.description && (
              <p className="text-muted-foreground">{collection.description}</p>
            )}
          </div>

          {/* Tabs */}
          <CollectionTabs
            accountSlug={accountSlug}
            collectionSlug={collectionSlug}
            canEdit={collection.canEdit}
          />

          <div className="mt-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <GitPullRequest className="h-5 w-5" />
                Pull Requests
              </h2>
            </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="open" className="gap-2">
            <GitPullRequest className="h-4 w-4" />
            Open
          </TabsTrigger>
          <TabsTrigger value="merged" className="gap-2">
            <GitMerge className="h-4 w-4" />
            Merged
          </TabsTrigger>
          <TabsTrigger value="closed" className="gap-2">
            <XCircle className="h-4 w-4" />
            Closed
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : pullRequests.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <GitPullRequest className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">
                  No {activeTab} pull requests
                </h3>
                <p className="text-muted-foreground text-center">
                  {activeTab === "open"
                    ? "When you make changes and create a PR, it will appear here."
                    : `No ${activeTab} pull requests found.`}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {pullRequests.map((pr) => (
                <Link
                  key={pr.id}
                  href={`/${accountSlug}/${collectionSlug}/pulls/${pr.number}`}
                >
                  <Card className="hover:border-primary transition-colors cursor-pointer">
                    <CardHeader className="py-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          {getStatusIcon(pr.status)}
                          <div>
                            <CardTitle className="text-base flex items-center gap-2">
                              {pr.title}
                              <span className="text-muted-foreground font-normal">
                                #{pr.number}
                              </span>
                            </CardTitle>
                            {pr.description && (
                              <CardDescription className="mt-1 line-clamp-2">
                                {pr.description}
                              </CardDescription>
                            )}
                            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {pr.status === "merged" && pr.mergedAt
                                ? `Merged on ${formatDate(pr.mergedAt)}`
                                : pr.status === "closed" && pr.closedAt
                                ? `Closed on ${formatDate(pr.closedAt)}`
                                : `Opened on ${formatDate(pr.createdAt)}`}
                            </div>
                          </div>
                        </div>
                        {getStatusBadge(pr.status)}
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
