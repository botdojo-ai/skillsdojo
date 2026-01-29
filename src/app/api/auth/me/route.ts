export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/middleware";
import { authService } from "@/services/auth.service";

export const GET = withAuth(async (request: AuthenticatedRequest) => {
  const user = await authService.getUserById(request.user.userId);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const accounts = await authService.getUserAccounts(request.user.userId);

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
    },
    accounts: accounts.map((a) => ({
      id: a.id,
      slug: a.slug,
      name: a.name,
      type: a.type,
      avatarUrl: a.avatarUrl,
    })),
    currentAccountId: request.user.accountId,
  });
});
