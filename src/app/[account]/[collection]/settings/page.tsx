"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { NavBar } from "@/components/nav-bar";
import { CollectionTabs } from "@/components/collection-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Settings, Trash2, Globe, Lock, EyeOff } from "lucide-react";

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

export default function CollectionSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private" | "unlisted">("private");

  const accountSlug = (params?.account as string) || "";
  const collectionSlug = (params?.collection as string) || "";

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    const fetchCollection = async () => {
      try {
        const res = await fetch(
          `/api/collections/by-slug/${accountSlug}/${collectionSlug}`,
          { credentials: "include" }
        );

        if (!res.ok) {
          throw new Error("Collection not found");
        }

        const data = await res.json();
        setCollection(data);
        setName(data.name);
        setDescription(data.description || "");
        setVisibility(data.visibility);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load collection");
      } finally {
        setLoading(false);
      }
    };

    if (isAuthenticated) {
      fetchCollection();
    }
  }, [accountSlug, collectionSlug, isAuthenticated]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collection) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/collections/${collection.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, description, visibility }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update collection");
      }

      setSuccess("Settings saved successfully");

      // If name changed, the slug might have changed - refresh
      const updated = await res.json();
      if (updated.slug !== collectionSlug) {
        router.push(`/${accountSlug}/${updated.slug}/settings`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!collection) return;

    if (!confirm(`Are you sure you want to delete "${collection.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/collections/${collection.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete collection");
      }

      router.push(`/${accountSlug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete collection");
    }
  };

  const VisibilityIcon =
    collection?.visibility === "public"
      ? Globe
      : collection?.visibility === "private"
      ? Lock
      : EyeOff;

  if (authLoading || loading) {
    return (
      <div className="min-h-screen">
        <NavBar />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if ((error && !collection) || !collection) {
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
    { label: "Settings" },
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

          <div className="mt-6 max-w-2xl">
            <div className="flex items-center gap-2 mb-6">
              <Settings className="h-5 w-5" />
              <h2 className="text-xl font-semibold">Collection Settings</h2>
            </div>

      <form onSubmit={handleSave}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>General</CardTitle>
            <CardDescription>
              Update your collection&apos;s basic information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-950 rounded-md">
                {error}
              </div>
            )}
            {success && (
              <div className="p-3 text-sm text-green-500 bg-green-50 dark:bg-green-950 rounded-md">
                {success}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Collection Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="A brief description of this collection"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="visibility">Visibility</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as typeof visibility)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public - Anyone can view</SelectItem>
                  <SelectItem value="unlisted">Unlisted - Only those with the link can view</SelectItem>
                  <SelectItem value="private">Private - Only members can view</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="pt-4">
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* Danger Zone */}
      <Card className="border-red-200 dark:border-red-900">
        <CardHeader>
          <CardTitle className="text-red-600">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible and destructive actions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Delete this collection</p>
              <p className="text-sm text-muted-foreground">
                Once deleted, this collection and all its skills will be permanently removed.
              </p>
            </div>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
