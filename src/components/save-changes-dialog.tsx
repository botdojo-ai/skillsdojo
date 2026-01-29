"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, GitCommit, GitPullRequest } from "lucide-react";

interface SkillFile {
  path: string;
  content: string;
  modified?: boolean;
}

interface SaveChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: SkillFile[];
  skillPath: string;
  collectionId: string;
  accountSlug?: string;
  collectionSlug?: string;
  onSuccess: () => void;
}

export function SaveChangesDialog({
  open,
  onOpenChange,
  files,
  skillPath,
  collectionId,
  accountSlug,
  collectionSlug,
  onSuccess,
}: SaveChangesDialogProps) {
  const router = useRouter();
  const [saveType, setSaveType] = useState<"commit" | "pr">("commit");
  const [commitMessage, setCommitMessage] = useState("");
  const [prDescription, setPrDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!commitMessage.trim()) {
      setError("Please enter a commit message");
      return;
    }

    setSaving(true);
    setError("");

    try {
      // Prepare file changes - prefix with skill path for git storage
      const changes = files
        .filter((f) => f.modified)
        .map((f) => ({
          path: `${skillPath}/${f.path}`,
          content: f.content,
          action: "modify" as const,
        }));

      if (changes.length === 0) {
        throw new Error("No changes to save");
      }

      if (saveType === "commit") {
        // Direct commit to main branch
        const res = await fetch(`/api/collections/${collectionId}/commit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            files: changes.map((c) => ({ path: c.path, content: c.content })),
            message: commitMessage.trim(),
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to commit changes");
        }

        onSuccess();
        onOpenChange(false);
        resetForm();
      } else {
        // Create pull request
        const res = await fetch(`/api/collections/${collectionId}/changes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            title: commitMessage.trim(),
            description: prDescription.trim() || undefined,
            changes,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to create pull request");
        }

        const data = await res.json();
        onSuccess();
        onOpenChange(false);
        resetForm();

        // Navigate to the PR
        if (data.pullRequest?.number && accountSlug && collectionSlug) {
          router.push(`/${accountSlug}/${collectionSlug}/pulls/${data.pullRequest.number}`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setCommitMessage("");
    setPrDescription("");
    setSaveType("commit");
    setError("");
  };

  const modifiedCount = files.filter((f) => f.modified).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Save Changes</DialogTitle>
          <DialogDescription>
            {modifiedCount} file{modifiedCount !== 1 ? "s" : ""} modified
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Commit message */}
          <div className="space-y-2">
            <Label htmlFor="commit-message">
              {saveType === "commit" ? "Commit message" : "Pull request title"}
            </Label>
            <Input
              id="commit-message"
              placeholder={
                saveType === "commit"
                  ? "Describe your changes..."
                  : "Give your PR a title..."
              }
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              disabled={saving}
            />
          </div>

          {/* Save type selection */}
          <div className="space-y-3">
            <Label>How would you like to save?</Label>
            <RadioGroup
              value={saveType}
              onValueChange={(value) => setSaveType(value as "commit" | "pr")}
              disabled={saving}
            >
              <div className="flex items-center space-x-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="commit" id="commit" />
                <Label
                  htmlFor="commit"
                  className="flex-1 cursor-pointer flex items-center gap-2"
                >
                  <GitCommit className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium">Commit directly</div>
                    <div className="text-sm text-muted-foreground">
                      Save changes directly to the main branch
                    </div>
                  </div>
                </Label>
              </div>
              <div className="flex items-center space-x-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="pr" id="pr" />
                <Label
                  htmlFor="pr"
                  className="flex-1 cursor-pointer flex items-center gap-2"
                >
                  <GitPullRequest className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium">Create pull request</div>
                    <div className="text-sm text-muted-foreground">
                      Open a PR for review before merging
                    </div>
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* PR description (only shown when PR is selected) */}
          {saveType === "pr" && (
            <div className="space-y-2">
              <Label htmlFor="pr-description">Description (optional)</Label>
              <Textarea
                id="pr-description"
                placeholder="Add more details about your changes..."
                value={prDescription}
                onChange={(e) => setPrDescription(e.target.value)}
                disabled={saving}
                rows={3}
              />
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="text-sm text-red-500 bg-red-50 p-3 rounded-md">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !commitMessage.trim()}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : saveType === "commit" ? (
              <>
                <GitCommit className="h-4 w-4 mr-2" />
                Commit
              </>
            ) : (
              <>
                <GitPullRequest className="h-4 w-4 mr-2" />
                Create PR
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
