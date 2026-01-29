"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Code, GitPullRequest, Settings } from "lucide-react";

interface CollectionTabsProps {
  accountSlug: string;
  collectionSlug: string;
  canEdit?: boolean;
}

export function CollectionTabs({
  accountSlug,
  collectionSlug,
  canEdit = false,
}: CollectionTabsProps) {
  const pathname = usePathname();
  const basePath = `/${accountSlug}/${collectionSlug}`;

  const tabs = [
    {
      name: "Code",
      href: basePath,
      icon: Code,
      isActive: pathname === basePath,
    },
    {
      name: "Pull Requests",
      href: `${basePath}/pulls`,
      icon: GitPullRequest,
      isActive: pathname.startsWith(`${basePath}/pulls`),
    },
    ...(canEdit
      ? [
          {
            name: "Settings",
            href: `${basePath}/settings`,
            icon: Settings,
            isActive: pathname.startsWith(`${basePath}/settings`),
          },
        ]
      : []),
  ];

  return (
    <div className="border-b">
      <nav className="flex gap-4" aria-label="Tabs">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.name}
              href={tab.href}
              className={cn(
                "flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab.isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
