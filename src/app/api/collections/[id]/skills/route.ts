export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/middleware";
import { getSkillService } from "@/services/skill.service";
import { getCollectionService } from "@/services/collection.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/collections/[id]/skills - List skills in collection
export const GET = withAuth(async (request: AuthenticatedRequest, context: RouteParams) => {
  const { id: collectionId } = await context.params;
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const query = searchParams.get("q") || "";

  // Check if user has access to this collection (owns it or it's public)
  const collectionService = await getCollectionService(request.context);
  const collection = await collectionService.findByIdPublic(collectionId);

  if (!collection) {
    return NextResponse.json(
      { error: "Collection not found or access denied" },
      { status: 404 }
    );
  }

  const service = await getSkillService(request.context);

  const result = query
    ? await service.searchSkills(query, { collectionId, page, limit })
    : await service.listByCollection(collectionId, { page, limit });

  return NextResponse.json(result);
});

// POST /api/collections/[id]/skills - Create skill
export const POST = withAuth(async (request: AuthenticatedRequest, context: RouteParams) => {
  try {
    const { id: collectionId } = await context.params;
    const body = await request.json();

    const { path, name, description, metadata, dependencies } = body;

    if (!path || !name) {
      return NextResponse.json(
        { error: "Path and name are required" },
        { status: 400 }
      );
    }

    const service = await getSkillService(request.context);
    const skill = await service.createSkill({
      collectionId,
      path,
      name,
      description,
      metadata,
      dependencies,
    });

    return NextResponse.json(skill, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create skill";
    return NextResponse.json({ error: message }, { status: 400 });
  }
});
