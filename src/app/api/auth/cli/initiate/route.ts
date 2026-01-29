export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { cliAuthSessions } from "@/lib/auth/cli-sessions";

/**
 * POST /api/auth/cli/initiate
 * Start CLI authentication flow
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { state } = body;

    if (!state || typeof state !== "string" || state.length < 16) {
      return NextResponse.json(
        { error: "Invalid state parameter" },
        { status: 400 }
      );
    }

    // Store session
    cliAuthSessions.set(state, {
      createdAt: new Date(),
      status: "pending",
    });

    // Build auth URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3354";
    const authUrl = `${baseUrl}/auth/cli?state=${encodeURIComponent(state)}`;
    const pollUrl = `/api/auth/cli/poll/${state}`;

    return NextResponse.json({
      authUrl,
      pollUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to initiate CLI auth";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
