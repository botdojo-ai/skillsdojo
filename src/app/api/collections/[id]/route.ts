import { NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/middleware";
import { getCollectionService } from "@/services/collection.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/collections/[id] - Get collection
export const GET = withAuth(async (request: AuthenticatedRequest, context: RouteParams) => {
  const { id } = await context.params;

  const service = await getCollectionService(request.context);
  const collection = await service.findByIdWithStats(id);

  if (!collection) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  return NextResponse.json(collection);
});

// PATCH /api/collections/[id] - Update collection
export const PATCH = withAuth(async (request: AuthenticatedRequest, context: RouteParams) => {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const { name, description, visibility, defaultBranch } = body;

    const service = await getCollectionService(request.context);
    const collection = await service.updateCollection(id, {
      name,
      description,
      visibility,
      defaultBranch,
    });

    if (!collection) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    return NextResponse.json(collection);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update collection";
    return NextResponse.json({ error: message }, { status: 400 });
  }
});

// DELETE /api/collections/[id] - Delete (archive) collection
export const DELETE = withAuth(async (request: AuthenticatedRequest, context: RouteParams) => {
  const { id } = await context.params;

  const service = await getCollectionService(request.context);
  const deleted = await service.deleteCollection(id);

  if (!deleted) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
});
