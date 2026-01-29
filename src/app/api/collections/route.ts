export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/middleware";
import { getCollectionService } from "@/services/collection.service";
import { getDataSource } from "@/lib/db/data-source";
import { Account } from "@/entities/Account";

// GET /api/collections - List collections
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const visibility = searchParams.get("visibility") as "public" | "private" | "unlisted" | undefined;

  const service = await getCollectionService(request.context);
  const result = await service.listCollections({ page, limit, visibility });

  // Add account info to each collection for navigation
  const ds = await getDataSource();
  const accountRepo = ds.getRepository(Account);
  const account = await accountRepo.findOne({
    where: { id: request.context.accountId },
    select: ["id", "slug", "name"],
  });

  const itemsWithAccount = result.items.map((item) => ({
    ...item,
    account: account ? { slug: account.slug, name: account.name } : null,
  }));

  return NextResponse.json({
    ...result,
    items: itemsWithAccount,
  });
});

// POST /api/collections - Create collection
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const body = await request.json();

    const { slug, name, description, visibility } = body;

    if (!slug || !name) {
      return NextResponse.json(
        { error: "Slug and name are required" },
        { status: 400 }
      );
    }

    const service = await getCollectionService(request.context);
    const collection = await service.createCollection({
      slug,
      name,
      description,
      visibility,
    });

    return NextResponse.json(collection, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create collection";
    return NextResponse.json({ error: message }, { status: 400 });
  }
});
