"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileDiffList } from "@/components/file-diff";
import {
  ArrowLeft,
  Loader2,
  GitPullRequest,
  GitMerge,
  XCircle,
  Clock,
  FileCode,
  Check,
  X,
} from "lucide-react";

interface PullRequest {
  id: string;
  number: number;
  title: string;
  description: string | null;
  status: "open" | "merged" | "closed";
  sourceBranch: string;
  targetBranch: string;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  files: Array<{
    path: string;
    action: "create" | "modify" | "delete";
    content?: string;
  }>;
}

export default function PullRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [pullRequest, setPullRequest] = useState<PullRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<"merge" | "close" | null>(null);

  const accountSlug = (params?.account as string) || "";
  const collectionSlug = (params?.collection as string) || "";
  const prNumber = (params?.number as string) || "";

  // First, fetch collection ID from slugs
  useEffect(() => {
    const fetchCollectionId = async () => {
      try {
        const res = await fetch(
          `/api/collections/by-slug/${accountSlug}/${collectionSlug}`,
          { credentials: "include" }
        );
        if (res.ok) {
          const data = await res.json();
          setCollectionId(data.id);
        } else {
          setError("Collection not found");
          setLoading(false);
        }
      } catch {
        setError("Failed to load collection");
        setLoading(false);
      }
    };

    fetchCollectionId();
  }, [accountSlug, collectionSlug]);

  // Then fetch PR
  useEffect(() => {
    if (!collectionId) return;

    const fetchPR = async () => {
      try {
        const res = await fetch(
          `/api/collections/${collectionId}/pulls/${prNumber}`,
          { credentials: "include" }
        );

        if (!res.ok) {
          throw new Error("Pull request not found");
        }

        const data = await res.json();
        setPullRequest(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load pull request");
      } finally {
        setLoading(false);
      }
    };

    fetchPR();
  }, [collectionId, prNumber]);

  const handleMerge = async () => {
    if (!pullRequest || !collectionId) return;

    setActionLoading("merge");
    try {
      const res = await fetch(
        `/api/collections/${collectionId}/pulls/${prNumber}/merge`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to merge pull request");
      }

      // Refresh the PR data
      const prRes = await fetch(
        `/api/collections/${collectionId}/pulls/${prNumber}`,
        { credentials: "include" }
      );
      if (prRes.ok) {
        const prData = await prRes.json();
        setPullRequest(prData);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to merge");
    } finally {
      setActionLoading(null);
    }
  };

  const handleClose = async () => {
    if (!pullRequest || !collectionId) return;

    if (!confirm("Are you sure you want to close this pull request without merging?")) {
      return;
    }

    setActionLoading("close");
    try {
      const res = await fetch(
        `/api/collections/${collectionId}/pulls/${prNumber}/close`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to close pull request");
      }

      // Refresh the PR data
      const prRes = await fetch(
        `/api/collections/${collectionId}/pulls/${prNumber}`,
        { credentials: "include" }
      );
      if (prRes.ok) {
        const prData = await prRes.json();
        setPullRequest(prData);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to close");
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "open":
        return <GitPullRequest className="h-5 w-5 text-amber-500" />;
      case "merged":
        return <GitMerge className="h-5 w-5 text-green-500" />;
      case "closed":
        return <XCircle className="h-5 w-5 text-red-500" />;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !pullRequest) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">{error || "Pull request not found"}</p>
        <Link href={`/${accountSlug}/${collectionSlug}/pulls`}>
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Pull Requests
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        href={`/${accountSlug}/${collectionSlug}/pulls`}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Pull Requests
      </Link>

      {/* PR Header */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              {getStatusIcon(pullRequest.status)}
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  {pullRequest.title}
                  <span className="text-muted-foreground font-normal">
                    #{pullRequest.number}
                  </span>
                </CardTitle>
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {pullRequest.status === "merged" && pullRequest.mergedAt
                      ? `Merged on ${formatDate(pullRequest.mergedAt)}`
                      : pullRequest.status === "closed" && pullRequest.closedAt
                      ? `Closed on ${formatDate(pullRequest.closedAt)}`
                      : `Opened on ${formatDate(pullRequest.createdAt)}`}
                  </span>
                  <span className="font-mono text-xs">
                    {pullRequest.sourceBranch} → {pullRequest.targetBranch}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge(pullRequest.status)}
            </div>
          </div>
          {pullRequest.description && (
            <CardDescription className="mt-4 whitespace-pre-wrap">
              {pullRequest.description}
            </CardDescription>
          )}
        </CardHeader>

        {/* Actions for open PRs */}
        {pullRequest.status === "open" && (
          <CardContent className="border-t pt-4">
            <div className="flex items-center gap-3">
              <Button
                onClick={handleMerge}
                disabled={actionLoading !== null}
                className="bg-green-600 hover:bg-green-700"
              >
                {actionLoading === "merge" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Merge Pull Request
              </Button>
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={actionLoading !== null}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                {actionLoading === "close" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <X className="h-4 w-4 mr-2" />
                )}
                Close
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* File Changes */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <FileCode className="h-5 w-5" />
          Files Changed
          <span className="text-muted-foreground font-normal">
            ({pullRequest.files.length})
          </span>
        </h2>
        <FileDiffList files={pullRequest.files} />
      </div>
    </div>
  );
}
