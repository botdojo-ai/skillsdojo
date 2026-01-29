export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { getDataSource } from "@/lib/db/data-source";
import { Account } from "@/entities/Account";
import { validateUsername } from "@/lib/validation/username";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username");

  if (!username) {
    return NextResponse.json(
      { error: "Username parameter required" },
      { status: 400 }
    );
  }

  const normalizedUsername = username.toLowerCase().trim();

  // Validate format first
  const validation = validateUsername(normalizedUsername);
  if (!validation.valid) {
    return NextResponse.json({
      available: false,
      reason: validation.errors[0],
    });
  }

  // Check database for existing account with this slug
  const ds = await getDataSource();
  const existing = await ds.getRepository(Account).findOne({
    where: { slug: normalizedUsername },
  });

  return NextResponse.json({
    available: !existing,
    reason: existing ? "Username is already taken" : null,
  });
}
