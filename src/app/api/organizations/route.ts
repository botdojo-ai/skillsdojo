import { NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/middleware";
import { organizationService } from "@/services/organization.service";

// POST /api/organizations - Create new organization
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const body = await request.json();
    const { slug, name, description } = body;

    if (!slug || !name) {
      return NextResponse.json(
        { error: "Organization name and slug are required" },
        { status: 400 }
      );
    }

    const org = await organizationService.create(
      { slug, name, description },
      request.user.userId
    );

    return NextResponse.json(org, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create organization";
    return NextResponse.json({ error: message }, { status: 400 });
  }
});

// GET /api/organizations - List user's organizations
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const orgs = await organizationService.getUserOrganizations(
      request.user.userId
    );
    return NextResponse.json({ organizations: orgs });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get organizations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
