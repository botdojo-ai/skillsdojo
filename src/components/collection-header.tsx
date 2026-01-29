import Link from "next/link";
import { CollectionTabs } from "./collection-tabs";
import { ArrowLeft, Globe, Lock, EyeOff } from "lucide-react";

interface CollectionHeaderProps {
  collection: {
    name: string;
    slug: string;
    description: string | null;
    visibility: "public" | "private" | "unlisted";
  };
  account: {
    slug: string;
    name: string;
  };
  canEdit: boolean;
}

export function CollectionHeader({
  collection,
  account,
  canEdit,
}: CollectionHeaderProps) {
  const VisibilityIcon =
    collection.visibility === "public"
      ? Globe
      : collection.visibility === "private"
      ? Lock
      : EyeOff;

  return (
    <div className="mb-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Link href="/skills" className="hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" />
          Skills
        </Link>
        <span>/</span>
        <Link href={`/${account.slug}`} className="hover:text-foreground">
          {account.name}
        </Link>
        <span>/</span>
        <span className="text-foreground">{collection.name}</span>
      </div>

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
        accountSlug={account.slug}
        collectionSlug={collection.slug}
        canEdit={canEdit}
      />
    </div>
  );
}
