"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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

interface Scope {
  id: string;
  collectionId: string;
  permission: "read" | "write" | "contribute";
  collection?: { id: string; name: string; slug: string } | null;
}

interface ScopeInput {
  collectionId: string;
  permission: "read" | "write" | "contribute";
}

interface EditApiKeyScopesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: { id: string; name: string } | null;
  collections: Collection[];
  onUpdated: () => void;
}

export function EditApiKeyScopesDialog({
  open,
  onOpenChange,
  apiKey,
  collections,
  onUpdated,
}: EditApiKeyScopesDialogProps) {
  const [scopes, setScopes] = useState<ScopeInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && apiKey) {
      loadScopes();
    }
  }, [open, apiKey]);

  const loadScopes = async () => {
    if (!apiKey) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/api-keys/${apiKey.id}/scopes`, {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to load scopes");
      }

      const data = await res.json();
      setScopes(
        data.scopes.map((s: Scope) => ({
          collectionId: s.collectionId,
          permission: s.permission,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scopes");
    } finally {
      setLoading(false);
    }
  };

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

  const handleSave = async () => {
    if (!apiKey) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/api-keys/${apiKey.id}/scopes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ scopes }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update scopes");
      }

      onUpdated();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update scopes");
    } finally {
      setSaving(false);
    }
  };

  const usedCollectionIds = new Set(scopes.map((s) => s.collectionId));
  const availableCollections = collections.filter(
    (c) => !usedCollectionIds.has(c.id)
  );

  if (!apiKey) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Permissions</DialogTitle>
          <DialogDescription>
            Manage collection permissions for &quot;{apiKey.name}&quot;
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="grid gap-4">
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
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No permissions configured. This key has no access to any
                  collections.
                </p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
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

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
