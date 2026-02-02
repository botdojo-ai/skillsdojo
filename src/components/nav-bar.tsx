"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthSafe } from "./auth-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Code, User, LogOut, Settings, FolderGit2, ChevronDown, Key } from "lucide-react";

export interface Breadcrumb {
  label: string;
  href?: string;
}

interface NavBarProps {
  breadcrumbs?: Breadcrumb[];
}

export function NavBar({ breadcrumbs }: NavBarProps) {
  const router = useRouter();
  const auth = useAuthSafe();

  const handleLogout = async () => {
    if (auth) {
      await auth.logout();
      router.push("/");
    }
  };

  // Get the account slug for navigation links
  const accountSlug = auth?.account?.slug || auth?.user?.username;

  return (
    <header className="border-b">
      <nav className="container mx-auto flex items-center justify-between h-16 px-4">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl shrink-0">
            <Code className="h-6 w-6" />
            <span className="hidden sm:inline">SkillsDojo.ai</span>
          </Link>
          {breadcrumbs && breadcrumbs.length > 0 ? (
            <div className="flex items-center gap-1 text-sm ml-2">
              {breadcrumbs.map((crumb, index) => (
                <span key={index} className="flex items-center gap-1">
                  <span className="text-muted-foreground">/</span>
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="text-foreground hover:underline font-medium truncate max-w-[120px] sm:max-w-none"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-foreground font-medium truncate max-w-[120px] sm:max-w-none">
                      {crumb.label}
                    </span>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <Link
              href="/docs"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors ml-4"
            >
              Docs
            </Link>
          )}
        </div>

        <div className="flex items-center gap-4">
          {auth?.loading ? (
            <div className="h-8 w-20 bg-muted animate-pulse rounded" />
          ) : auth?.isAuthenticated && auth.user ? (
            <div className="flex items-center gap-3">
              <Link href={accountSlug ? `/${accountSlug}` : "/dashboard"}>
                <Button variant="ghost" size="sm" className="gap-2">
                  <FolderGit2 className="h-4 w-4" />
                  My Skills
                </Button>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    {auth.user.avatarUrl ? (
                      <img
                        src={auth.user.avatarUrl}
                        alt={auth.user.displayName}
                        className="h-6 w-6 rounded-full"
                      />
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                    <span className="hidden sm:inline">{auth.user.displayName}</span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5 text-sm">
                    <p className="font-medium">{auth.user.displayName}</p>
                    <p className="text-muted-foreground text-xs">@{auth.user.username}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={`/${auth.user.username}`} className="cursor-pointer">
                      <User className="h-4 w-4 mr-2" />
                      Your Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard" className="cursor-pointer">
                      <FolderGit2 className="h-4 w-4 mr-2" />
                      Dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={`/${accountSlug}/settings`} className="cursor-pointer">
                      <Settings className="h-4 w-4 mr-2" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/${accountSlug}/settings/api-keys`} className="cursor-pointer">
                      <Key className="h-4 w-4 mr-2" />
                      API Keys
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-600">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Sign In
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm">Get Started</Button>
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
