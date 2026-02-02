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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Settings, Trash2, Globe, Lock, EyeOff, Key, Plus, Copy, Check, AlertTriangle, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

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

interface ApiKeyItem {
  id: string;
  name: string;
  description: string | null;
  keyPrefix: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  scopes?: Array<{
    collectionId: string;
    permission: string;
  }>;
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

  // API Key state
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [createKeyDialogOpen, setCreateKeyDialogOpen] = useState(false);
  const [keyCreatedDialogOpen, setKeyCreatedDialogOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<{ name: string; key: string } | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyDescription, setNewKeyDescription] = useState("");
  const [newKeyExpires, setNewKeyExpires] = useState<string>("never");
  const [newKeyPermission, setNewKeyPermission] = useState<"read" | "contribute" | "write">("read");
  const [creatingKey, setCreatingKey] = useState(false);
  const [deleteKeyDialogOpen, setDeleteKeyDialogOpen] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<ApiKeyItem | null>(null);
  const [deletingKey, setDeletingKey] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

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

  // Fetch API keys for this collection
  const fetchApiKeys = async () => {
    if (!collection) return;
    setApiKeysLoading(true);
    try {
      const res = await fetch(`/api/api-keys?collectionId=${collection.id}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setApiKeys(data.items || []);
      }
    } catch (err) {
      console.error("Failed to fetch API keys:", err);
    } finally {
      setApiKeysLoading(false);
    }
  };

  useEffect(() => {
    if (collection) {
      fetchApiKeys();
    }
  }, [collection?.id]);

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collection) return;
    setCreatingKey(true);

    try {
      let expiresAt: string | undefined;
      if (newKeyExpires !== "never") {
        const date = new Date();
        switch (newKeyExpires) {
          case "7d":
            date.setDate(date.getDate() + 7);
            break;
          case "30d":
            date.setDate(date.getDate() + 30);
            break;
          case "90d":
            date.setDate(date.getDate() + 90);
            break;
          case "1y":
            date.setFullYear(date.getFullYear() + 1);
            break;
        }
        expiresAt = date.toISOString();
      }

      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: newKeyName,
          description: newKeyDescription || undefined,
          expiresAt,
          scopes: [{ collectionId: collection.id, permission: newKeyPermission }],
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create API key");
      }

      const data = await res.json();
      setCreatedKey({ name: data.name, key: data.key });
      setCreateKeyDialogOpen(false);
      setKeyCreatedDialogOpen(true);
      setNewKeyName("");
      setNewKeyDescription("");
      setNewKeyExpires("never");
      setNewKeyPermission("read");
      fetchApiKeys();
    } catch (err) {
      console.error("Failed to create API key:", err);
    } finally {
      setCreatingKey(false);
    }
  };

  const handleDeleteApiKey = async () => {
    if (!keyToDelete) return;
    setDeletingKey(true);

    try {
      const res = await fetch(`/api/api-keys/${keyToDelete.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (res.ok) {
        fetchApiKeys();
        setDeleteKeyDialogOpen(false);
        setKeyToDelete(null);
      }
    } catch (err) {
      console.error("Failed to delete API key:", err);
    } finally {
      setDeletingKey(false);
    }
  };

  const handleCopyKey = async () => {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey.key);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const isKeyExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

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

      {/* API Keys Section */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                API Keys
              </CardTitle>
              <CardDescription>
                Manage API keys with access to this collection
              </CardDescription>
            </div>
            <Button onClick={() => setCreateKeyDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Key
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {apiKeysLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Key className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                No API keys yet. Create one to access this collection programmatically.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {apiKeys.map((apiKey) => (
                <div
                  key={apiKey.id}
                  className="flex items-center justify-between p-3 border rounded-md"
                >
                  <div className="flex items-center gap-3">
                    <Key className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{apiKey.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {apiKey.keyPrefix}...
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isKeyExpired(apiKey.expiresAt) && (
                      <Badge variant="destructive">Expired</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      Created {formatDistanceToNow(new Date(apiKey.createdAt), { addSuffix: true })}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => {
                            setKeyToDelete(apiKey);
                            setDeleteKeyDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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

      {/* Create API Key Dialog */}
      <Dialog open={createKeyDialogOpen} onOpenChange={setCreateKeyDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <form onSubmit={handleCreateApiKey}>
            <DialogHeader>
              <DialogTitle>Create API Key</DialogTitle>
              <DialogDescription>
                Create a new API key with access to {collection.name}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="keyName">Name</Label>
                <Input
                  id="keyName"
                  placeholder="My API Key"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="keyDescription">Description (optional)</Label>
                <Textarea
                  id="keyDescription"
                  placeholder="What this key is used for..."
                  value={newKeyDescription}
                  onChange={(e) => setNewKeyDescription(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="keyExpires">Expiration</Label>
                <Select value={newKeyExpires} onValueChange={setNewKeyExpires}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="never">Never expires</SelectItem>
                    <SelectItem value="7d">7 days</SelectItem>
                    <SelectItem value="30d">30 days</SelectItem>
                    <SelectItem value="90d">90 days</SelectItem>
                    <SelectItem value="1y">1 year</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="keyPermission">Permission</Label>
                <Select value={newKeyPermission} onValueChange={(v) => setNewKeyPermission(v as typeof newKeyPermission)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read">Read - View skills only</SelectItem>
                    <SelectItem value="contribute">Contribute - Create pull requests</SelectItem>
                    <SelectItem value="write">Write - Commit directly to main</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateKeyDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creatingKey || !newKeyName}>
                {creatingKey && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Key
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* API Key Created Dialog */}
      <Dialog open={keyCreatedDialogOpen} onOpenChange={setKeyCreatedDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>API Key Created</DialogTitle>
            <DialogDescription>
              Your new API key has been created. Copy it now - you won&apos;t be able
              to see it again!
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
              <p className="text-sm">
                Make sure to copy your API key now. For security reasons, it
                won&apos;t be displayed again.
              </p>
            </div>

            {createdKey && (
              <div className="mt-4">
                <p className="text-sm font-medium mb-2">{createdKey.name}</p>
                <div className="flex gap-2">
                  <Input
                    value={createdKey.key}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCopyKey}
                  >
                    {keyCopied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => setKeyCreatedDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete API Key Dialog */}
      <Dialog open={deleteKeyDialogOpen} onOpenChange={setDeleteKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete API Key</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{keyToDelete?.name}&quot;? This
              action cannot be undone and any applications using this key will
              stop working.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteKeyDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteApiKey}
              disabled={deletingKey}
            >
              {deletingKey && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
