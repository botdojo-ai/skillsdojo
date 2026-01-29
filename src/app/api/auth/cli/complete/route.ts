import { NextRequest, NextResponse } from "next/server";
import { cliAuthSessions } from "@/lib/auth/cli-sessions";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/middleware";
import { generateAccessToken, generateRefreshToken } from "@/lib/auth/jwt";
import { authService } from "@/services/auth.service";

/**
 * POST /api/auth/cli/complete
 * Complete CLI authentication (called from web app after user approves)
 */
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const body = await request.json();
    const { state } = body;

    if (!state || typeof state !== "string") {
      return NextResponse.json(
        { error: "Invalid state parameter" },
        { status: 400 }
      );
    }

    const session = cliAuthSessions.get(state);

    if (!session) {
      return NextResponse.json(
        { error: "Session not found or expired" },
        { status: 404 }
      );
    }

    if (session.status !== "pending") {
      return NextResponse.json(
        { error: "Session already completed" },
        { status: 400 }
      );
    }

    // Get user and account info
    const user = await authService.getUserById(request.user.userId);
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const accounts = await authService.getUserAccounts(request.user.userId);
    const account = accounts[0];

    if (!account) {
      return NextResponse.json(
        { error: "No account found" },
        { status: 404 }
      );
    }

    // Generate tokens for CLI
    const accessToken = await generateAccessToken({
      userId: user.id,
      email: user.email,
      accountId: account.id,
    });

    const refreshToken = await generateRefreshToken({
      userId: user.id,
      email: user.email,
    });

    // Update session
    session.status = "complete";
    session.accessToken = accessToken;
    session.refreshToken = refreshToken;
    session.user = { id: user.id, email: user.email };
    session.account = { id: account.id, slug: account.slug, name: account.name };

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to complete CLI auth";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
