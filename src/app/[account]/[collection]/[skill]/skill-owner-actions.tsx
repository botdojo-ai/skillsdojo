"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Edit } from "lucide-react";

interface SkillOwnerActionsProps {
  accountSlug: string;
  collectionSlug: string;
  skillPath: string;
}

export function SkillOwnerActions({
  accountSlug,
  collectionSlug,
  skillPath,
}: SkillOwnerActionsProps) {
  return (
    <Link href={`/${accountSlug}/${collectionSlug}/${skillPath}/edit`}>
      <Button variant="outline" size="sm" className="gap-2">
        <Edit className="h-4 w-4" />
        Edit
      </Button>
    </Link>
  );
}
