export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { verifyToken, generateAccessToken } from "@/lib/auth/jwt";
import { authService } from "@/services/auth.service";

export async function POST(request: NextRequest) {
  try {
    // Get refresh token from cookie
    const refreshToken = request.cookies.get("refresh_token")?.value;

    if (!refreshToken) {
      return NextResponse.json(
        { error: "Refresh token required" },
        { status: 401 }
      );
    }

    // Verify refresh token
    const payload = await verifyToken(refreshToken);

    if (!payload || payload.type !== "refresh") {
      return NextResponse.json(
        { error: "Invalid refresh token" },
        { status: 401 }
      );
    }

    // Get user to ensure they still exist
    const user = await authService.getUserById(payload.userId);

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 401 }
      );
    }

    // Get user's accounts
    const accounts = await authService.getUserAccounts(payload.userId);
    const account = accounts[0]; // Default to first account

    // Generate new access token
    const accessToken = await generateAccessToken({
      userId: user.id,
      email: user.email,
      accountId: account?.id,
    });

    const response = NextResponse.json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
      account: account
        ? {
            id: account.id,
            slug: account.slug,
            name: account.name,
            type: account.type,
          }
        : null,
    });

    // Update access token cookie
    response.cookies.set("access_token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Token refresh failed";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
