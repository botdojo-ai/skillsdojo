"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2, Check, FolderPlus } from "lucide-react";

interface UseSkillButtonProps {
  skillPath: string;
  skillName: string;
  collectionId: string;
}

interface Collection {
  id: string;
  slug: string;
  name: string;
  account?: {
    slug: string;
  };
}

export function UseSkillButton({ skillPath, skillName, collectionId }: UseSkillButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [success, setSuccess] = useState(false);

  const fetchCollections = async () => {
    setLoadingCollections(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/collections", {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401) {
          setError("Please sign in to add skills to your collection");
          return;
        }
        throw new Error("Failed to fetch collections");
      }
      const data = await res.json();
      // API returns { items: [...], total, page, ... }
      const items = data.items || [];
      setCollections(items);
      if (items.length > 0) {
        setSelectedCollection(items[0].id);
      }
    } catch (err) {
      setError("Failed to load your collections");
    } finally {
      setLoadingCollections(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      fetchCollections();
    } else {
      setSuccess(false);
    }
  };

  const handleAddSkill = async () => {
    if (!selectedCollection) {
      setError("Please select a collection");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/skills/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sourceCollectionId: collectionId,
          sourcePath: skillPath,
          targetCollectionId: selectedCollection,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add skill");
      }

      setSuccess(true);
      setTimeout(() => {
        setOpen(false);
        // Find the selected collection to get its account slug
        const col = collections.find(c => c.id === selectedCollection);
        if (col?.account?.slug) {
          router.push(`/${col.account.slug}/${col.slug}`);
        } else {
          router.push("/dashboard");
        }
      }, 1000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to add skill";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-green-600 hover:bg-green-700 text-white">
          <Plus className="h-4 w-4" />
          Use This Skill
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5" />
            Add to Your Collection
          </DialogTitle>
          <DialogDescription>
            Add &quot;{skillName}&quot; to one of your skill collections.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {success ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-3 mb-4">
                <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-center font-medium">Skill added successfully!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Redirecting to your collection...
              </p>
            </div>
          ) : error ? (
            <div className="mb-4 p-4 bg-destructive/10 rounded-lg">
              <p className="text-destructive text-sm">{error}</p>
              {error.includes("sign in") && (
                <div className="mt-3 flex gap-2">
                  <a href="/login">
                    <Button variant="outline" size="sm">Sign In</Button>
                  </a>
                  <a href="/register">
                    <Button size="sm">Create Account</Button>
                  </a>
                </div>
              )}
            </div>
          ) : loadingCollections ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : collections.length > 0 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Collection</label>
                <Select value={selectedCollection} onValueChange={setSelectedCollection}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a collection" />
                  </SelectTrigger>
                  <SelectContent>
                    {collections.map((col) => (
                      <SelectItem key={col.id} value={col.id}>
                        {col.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                The skill will be copied to your collection. You can then customize it as needed.
              </p>
            </div>
          ) : (
            <div className="text-center py-6">
              <FolderPlus className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-2">No collections yet</p>
              <p className="text-sm text-muted-foreground mb-4">
                Create a collection first to add skills to it.
              </p>
              <a href="/dashboard/collections/new">
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Collection
                </Button>
              </a>
            </div>
          )}
        </div>

        {!success && !error?.includes("sign in") && collections.length > 0 && (
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddSkill}
              disabled={loading || !selectedCollection}
              className="bg-green-600 hover:bg-green-700"
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add to Collection
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
