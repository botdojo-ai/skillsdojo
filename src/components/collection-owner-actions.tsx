"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, Settings, GitPullRequest } from "lucide-react";

interface CollectionOwnerActionsProps {
  accountSlug: string;
  collectionSlug: string;
}

export function CollectionOwnerActions({
  accountSlug,
  collectionSlug,
}: CollectionOwnerActionsProps) {
  return (
    <div className="flex gap-2">
      <Link href={`/${accountSlug}/${collectionSlug}/skills/new`}>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Skill
        </Button>
      </Link>
      <Link href={`/${accountSlug}/${collectionSlug}/pulls`}>
        <Button variant="outline">
          <GitPullRequest className="h-4 w-4 mr-2" />
          Pull Requests
        </Button>
      </Link>
      <Link href={`/${accountSlug}/${collectionSlug}/settings`}>
        <Button variant="outline" size="icon">
          <Settings className="h-4 w-4" />
        </Button>
      </Link>
    </div>
  );
}

interface AddSkillButtonProps {
  accountSlug: string;
  collectionSlug: string;
}

export function AddSkillButton({ accountSlug, collectionSlug }: AddSkillButtonProps) {
  return (
    <Link href={`/${accountSlug}/${collectionSlug}/skills/new`}>
      <Button>
        <Plus className="h-4 w-4 mr-2" />
        Add Skill
      </Button>
    </Link>
  );
}
