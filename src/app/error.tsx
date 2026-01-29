"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <AlertTriangle className="h-16 w-16 text-destructive mb-6" />
      <h1 className="text-4xl font-bold mb-2">Something went wrong</h1>
      <p className="text-muted-foreground mb-6">An unexpected error occurred</p>
      <div className="flex gap-4">
        <Button onClick={reset}>Try Again</Button>
        <Link href="/">
          <Button variant="outline">Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
