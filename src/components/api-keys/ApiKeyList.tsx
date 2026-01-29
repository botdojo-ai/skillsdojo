"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Key, MoreVertical, Settings, Trash2, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ApiKeyItem {
  id: string;
  name: string;
  description: string | null;
  keyPrefix: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

interface Collection {
  id: string;
  name: string;
  slug: string;
}

interface ApiKeyListProps {
  apiKeys: ApiKeyItem[];
  collections: Collection[];
  onRefresh: () => void;
  onEditScopes: (apiKey: { id: string; name: string }) => void;
}

export function ApiKeyList({
  apiKeys,
  collections,
  onRefresh,
  onEditScopes,
}: ApiKeyListProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<ApiKeyItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!keyToDelete) return;
    setDeleting(true);

    try {
      const res = await fetch(`/api/api-keys/${keyToDelete.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (res.ok) {
        onRefresh();
        setDeleteDialogOpen(false);
        setKeyToDelete(null);
      }
    } catch (err) {
      console.error("Failed to delete API key:", err);
    } finally {
      setDeleting(false);
    }
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  if (apiKeys.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Key className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No API keys</h3>
          <p className="text-muted-foreground text-center">
            Create an API key to access your collections programmatically.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {apiKeys.map((apiKey) => (
          <Card key={apiKey.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Key className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-base">{apiKey.name}</CardTitle>
                    <CardDescription className="font-mono text-xs">
                      {apiKey.keyPrefix}...
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isExpired(apiKey.expiresAt) && (
                    <Badge variant="destructive">Expired</Badge>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() =>
                          onEditScopes({ id: apiKey.id, name: apiKey.name })
                        }
                      >
                        <Settings className="h-4 w-4 mr-2" />
                        Edit Permissions
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => {
                          setKeyToDelete(apiKey);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {apiKey.description && (
                <p className="text-sm text-muted-foreground mb-3">
                  {apiKey.description}
                </p>
              )}
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>
                  Created{" "}
                  {formatDistanceToNow(new Date(apiKey.createdAt), {
                    addSuffix: true,
                  })}
                </span>
                {apiKey.lastUsedAt && (
                  <span>
                    Last used{" "}
                    {formatDistanceToNow(new Date(apiKey.lastUsedAt), {
                      addSuffix: true,
                    })}
                  </span>
                )}
                {apiKey.expiresAt && !isExpired(apiKey.expiresAt) && (
                  <span>
                    Expires{" "}
                    {formatDistanceToNow(new Date(apiKey.expiresAt), {
                      addSuffix: true,
                    })}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
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
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
