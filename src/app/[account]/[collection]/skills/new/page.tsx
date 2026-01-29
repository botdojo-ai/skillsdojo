"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2, Plus } from "lucide-react";

export default function NewSkillPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [collectionName, setCollectionName] = useState("");
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  const accountSlug = params.account as string;
  const collectionSlug = params.collection as string;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
      return;
    }

    if (authLoading) return;

    const fetchCollection = async () => {
      try {
        const res = await fetch(
          `/api/collections/by-slug/${accountSlug}/${collectionSlug}`,
          { credentials: "include" }
        );

        if (!res.ok) throw new Error("Collection not found");

        const data = await res.json();
        setCollectionId(data.id);
        setCollectionName(data.name);
      } catch {
        router.push(`/${accountSlug}`);
      } finally {
        setPageLoading(false);
      }
    };

    fetchCollection();
  }, [accountSlug, collectionSlug, router, authLoading, isAuthenticated]);

  const handleNameChange = (value: string) => {
    setName(value);
    // Auto-generate path from name
    const autoPath = value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    setPath(autoPath);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectionId) return;

    setError("");
    setLoading(true);

    try {
      const res = await fetch(`/api/collections/${collectionId}/skills`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ name, path, description }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error(data.error || "Failed to create skill");
      }

      // Navigate to the new skill using the slug-based URL
      router.push(`/${accountSlug}/${collectionSlug}/${path}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create skill");
    } finally {
      setLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href={`/${accountSlug}/${collectionSlug}`}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to {collectionName}
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add New Skill
          </CardTitle>
          <CardDescription>
            Create a new skill in the {collectionName} collection
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-950 rounded-md">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Skill Name
              </label>
              <Input
                id="name"
                type="text"
                placeholder="My Awesome Skill"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="path" className="text-sm font-medium">
                Path
              </label>
              <Input
                id="path"
                type="text"
                placeholder="my-awesome-skill"
                value={path}
                onChange={(e) => setPath(e.target.value.toLowerCase().replace(/[^a-z0-9-/]/g, ""))}
                required
              />
              <p className="text-xs text-muted-foreground">
                Path within the collection (e.g., &quot;code-review&quot; or &quot;utils/formatter&quot;)
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium">
                Description (optional)
              </label>
              <Input
                id="description"
                type="text"
                placeholder="A skill that helps with..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Skill
              </Button>
              <Link href={`/${accountSlug}/${collectionSlug}`}>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
