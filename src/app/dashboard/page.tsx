"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { NavBar } from "@/components/nav-bar";
import { Loader2 } from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const { account, isAuthenticated, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      router.push("/login");
      return;
    }

    // Redirect to user's profile page
    if (account?.slug) {
      router.replace(`/${account.slug}`);
    }
  }, [authLoading, isAuthenticated, account, router]);

  return (
    <div className="min-h-screen flex flex-col">
      <NavBar />
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
