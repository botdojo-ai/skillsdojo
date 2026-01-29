export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { cliAuthSessions } from "@/lib/auth/cli-sessions";

/**
 * GET /api/auth/cli/poll/[state]
 * Poll for CLI authentication completion
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ state: string }> }
) {
  const { state } = await params;

  const session = cliAuthSessions.get(state);

  if (!session) {
    return NextResponse.json({
      status: "expired",
      message: "Session not found or expired",
    });
  }

  // Check if expired (10 minutes)
  const now = Date.now();
  if (now - session.createdAt.getTime() > 10 * 60 * 1000) {
    cliAuthSessions.delete(state);
    return NextResponse.json({
      status: "expired",
      message: "Session expired",
    });
  }

  if (session.status === "complete") {
    // Return auth data and clean up session
    const result = {
      status: "complete" as const,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: session.user,
      account: session.account,
    };

    cliAuthSessions.delete(state);
    return NextResponse.json(result);
  }

  return NextResponse.json({
    status: "pending",
  });
}
