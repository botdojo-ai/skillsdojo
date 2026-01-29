"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { NavBar } from "@/components/nav-bar";
import { Loader2, Key, User, Settings, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingsLayoutProps {
  children: React.ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user, account, isAuthenticated, loading: authLoading } = useAuth();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  const accountSlug = params.account as string;

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated) {
        router.push("/login");
        return;
      }

      // Check if user has access to this account
      // For now, check if it's their personal account
      if (account?.slug === accountSlug || user?.username === accountSlug) {
        setHasAccess(true);
      } else {
        // TODO: Check if user is a member of this account/organization
        setHasAccess(false);
      }
    }
  }, [authLoading, isAuthenticated, account, user, accountSlug, router]);

  if (authLoading || hasAccess === null) {
    return (
      <div className="min-h-screen flex flex-col">
        <NavBar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex flex-col">
        <NavBar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
            <p className="text-muted-foreground mb-4">
              You don&apos;t have permission to access settings for this account.
            </p>
            <Link
              href={`/${accountSlug}`}
              className="text-primary hover:underline"
            >
              View public profile
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    {
      href: `/${accountSlug}/settings`,
      label: "General",
      icon: Settings,
    },
    {
      href: `/${accountSlug}/settings/api-keys`,
      label: "API Keys",
      icon: Key,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <NavBar />

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6">
            <Link
              href={`/${accountSlug}`}
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to @{accountSlug}
            </Link>
          </div>

          <div className="flex gap-8">
            {/* Sidebar */}
            <aside className="w-48 flex-shrink-0">
              <h2 className="text-lg font-semibold mb-4">Settings</h2>
              <nav className="space-y-1">
                {navItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </aside>

            {/* Content */}
            <div className="flex-1 min-w-0">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
