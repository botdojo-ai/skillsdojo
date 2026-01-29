"use client";

import { useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  const params = useParams();
  const accountSlug = (params?.account as string) || "";

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">General Settings</h1>
        <p className="text-muted-foreground">
          Manage settings for @{accountSlug}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account Settings</CardTitle>
          <CardDescription>
            General account settings will be available here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Coming soon: Profile settings, notification preferences, and more.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
