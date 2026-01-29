"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ApiKeyList,
  CreateApiKeyDialog,
  ApiKeyCreatedDialog,
  EditApiKeyScopesDialog,
} from "@/components/api-keys";
import { Plus, Loader2 } from "lucide-react";

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

export default function ApiKeysSettingsPage() {
  const params = useParams();
  const accountSlug = params.account as string;

  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<{
    name: string;
    key: string;
  } | null>(null);
  const [createdDialogOpen, setCreatedDialogOpen] = useState(false);
  const [editScopesKey, setEditScopesKey] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [editScopesDialogOpen, setEditScopesDialogOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [keysRes, collectionsRes] = await Promise.all([
        fetch("/api/api-keys", { credentials: "include" }),
        fetch("/api/collections?limit=100", { credentials: "include" }),
      ]);

      if (keysRes.ok) {
        const data = await keysRes.json();
        setApiKeys(data.items || []);
      }

      if (collectionsRes.ok) {
        const data = await collectionsRes.json();
        setCollections(data.items || []);
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleApiKeyCreated = (data: {
    id: string;
    key: string;
    name: string;
  }) => {
    setCreatedKey({ name: data.name, key: data.key });
    setCreatedDialogOpen(true);
    fetchData();
  };

  const handleEditScopes = (apiKey: { id: string; name: string }) => {
    setEditScopesKey(apiKey);
    setEditScopesDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">API Keys</h1>
          <p className="text-muted-foreground">
            Manage API keys for programmatic access to @{accountSlug} collections.
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Key
        </Button>
      </div>

      <div className="mb-6">
        <div className="rounded-lg border bg-card p-4">
          <h3 className="font-medium mb-2">API Key Permissions</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>
              <strong>Read:</strong> Can view and download skills from the
              collection
            </li>
            <li>
              <strong>Contribute:</strong> Can create pull requests to
              suggest changes
            </li>
            <li>
              <strong>Write:</strong> Can commit changes directly to the
              main branch
            </li>
          </ul>
        </div>
      </div>

      <ApiKeyList
        apiKeys={apiKeys}
        collections={collections}
        onRefresh={fetchData}
        onEditScopes={handleEditScopes}
      />

      <CreateApiKeyDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        collections={collections}
        onCreated={handleApiKeyCreated}
      />

      <ApiKeyCreatedDialog
        open={createdDialogOpen}
        onOpenChange={setCreatedDialogOpen}
        apiKey={createdKey}
      />

      <EditApiKeyScopesDialog
        open={editScopesDialogOpen}
        onOpenChange={setEditScopesDialogOpen}
        apiKey={editScopesKey}
        collections={collections}
        onUpdated={fetchData}
      />
    </div>
  );
}
