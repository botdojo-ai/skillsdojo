/**
 * JWKS Endpoint (RFC 7517)
 * GET /.well-known/jwks.json
 *
 * Returns the JSON Web Key Set for token verification.
 * Note: Since we use HS256 (symmetric key), this returns an empty keyset.
 * In production with RS256, this would return public keys.
 */

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET() {
  // For HS256, we don't expose the secret key in JWKS
  // This endpoint exists for spec compliance
  // In production, you would use RS256 and expose public keys here
  const jwks = {
    keys: [],
  };

  return NextResponse.json(jwks, {
    headers: {
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
