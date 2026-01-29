export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/services/auth.service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { email, password, displayName, username } = body;

    if (!email || !password || !displayName || !username) {
      return NextResponse.json(
        { error: "Email, password, display name, and username are required" },
        { status: 400 }
      );
    }

    const result = await authService.register({
      email,
      password,
      displayName,
      username,
    });

    // Set refresh token as HTTP-only cookie
    const response = NextResponse.json({
      user: result.user,
      account: result.account,
      accessToken: result.accessToken,
    });

    response.cookies.set("refresh_token", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });

    // Also set access token as cookie for SSR
    response.cookies.set("access_token", result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 15 * 60, // 15 minutes
      path: "/",
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
