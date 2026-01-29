"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2 } from "lucide-react";

interface Collection {
  id: string;
  name: string;
  slug: string;
}

interface ScopeInput {
  collectionId: string;
  permission: "read" | "write" | "contribute";
}

interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collections: Collection[];
  onCreated: (data: { id: string; key: string; name: string }) => void;
}

export function CreateApiKeyDialog({
  open,
  onOpenChange,
  collections,
  onCreated,
}: CreateApiKeyDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [expiresIn, setExpiresIn] = useState<string>("never");
  const [scopes, setScopes] = useState<ScopeInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddScope = () => {
    if (collections.length === 0) return;
    const usedCollectionIds = new Set(scopes.map((s) => s.collectionId));
    const availableCollection = collections.find(
      (c) => !usedCollectionIds.has(c.id)
    );
    if (availableCollection) {
      setScopes([
        ...scopes,
        { collectionId: availableCollection.id, permission: "read" },
      ]);
    }
  };

  const handleRemoveScope = (index: number) => {
    setScopes(scopes.filter((_, i) => i !== index));
  };

  const handleScopeChange = (
    index: number,
    field: "collectionId" | "permission",
    value: string
  ) => {
    const newScopes = [...scopes];
    if (field === "permission") {
      newScopes[index].permission = value as "read" | "write" | "contribute";
    } else {
      newScopes[index].collectionId = value;
    }
    setScopes(newScopes);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Calculate expiration date
      let expiresAt: string | undefined;
      if (expiresIn !== "never") {
        const date = new Date();
        switch (expiresIn) {
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
          name,
          description: description || undefined,
          expiresAt,
          scopes: scopes.length > 0 ? scopes : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create API key");
      }

      const data = await res.json();
      onCreated({ id: data.id, key: data.key, name: data.name });

      // Reset form
      setName("");
      setDescription("");
      setExpiresIn("never");
      setScopes([]);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
    } finally {
      setLoading(false);
    }
  };

  const usedCollectionIds = new Set(scopes.map((s) => s.collectionId));
  const availableCollections = collections.filter(
    (c) => !usedCollectionIds.has(c.id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Create a new API key for programmatic access to your collections.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="My API Key"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="What this key is used for..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="expires">Expiration</Label>
              <Select value={expiresIn} onValueChange={setExpiresIn}>
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
              <div className="flex items-center justify-between">
                <Label>Collection Permissions</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddScope}
                  disabled={availableCollections.length === 0}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>

              {scopes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No permissions configured. Add collections to grant access.
                </p>
              ) : (
                <div className="space-y-2">
                  {scopes.map((scope, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-2 border rounded-md"
                    >
                      <Select
                        value={scope.collectionId}
                        onValueChange={(v) =>
                          handleScopeChange(index, "collectionId", v)
                        }
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {collections
                            .filter(
                              (c) =>
                                c.id === scope.collectionId ||
                                !usedCollectionIds.has(c.id)
                            )
                            .map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={scope.permission}
                        onValueChange={(v) =>
                          handleScopeChange(index, "permission", v)
                        }
                      >
                        <SelectTrigger className="w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="read">Read</SelectItem>
                          <SelectItem value="contribute">Contribute</SelectItem>
                          <SelectItem value="write">Write</SelectItem>
                        </SelectContent>
                      </Select>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveScope(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                <strong>Read:</strong> View skills |{" "}
                <strong>Contribute:</strong> Create pull requests |{" "}
                <strong>Write:</strong> Commit directly to main
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Key
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
