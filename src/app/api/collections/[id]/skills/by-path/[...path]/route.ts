import { NextRequest, NextResponse } from "next/server";
import { getDataSource } from "@/lib/db/data-source";
import { Skill } from "@/entities/Skill";
import { SkillCollection } from "@/entities/SkillCollection";
import { withOptionalAuth } from "@/lib/auth/middleware";
import { TokenPayload } from "@/lib/auth/jwt";
import { RequestContext } from "@/lib/db/context";

/**
 * GET /api/collections/[id]/skills/by-path/[...path]
 * Get skill by collection ID and skill path
 */
export const GET = withOptionalAuth(async (
  request: NextRequest & { user?: TokenPayload; context?: RequestContext },
  { params }: { params: Promise<{ id: string; path: string[] }> }
) => {
  try {
    const { id: collectionId, path: pathSegments } = await params;
    const skillPath = pathSegments.join("/");

    const ds = await getDataSource();

    // Get collection
    const collectionRepo = ds.getRepository(SkillCollection);
    const collection = await collectionRepo.findOne({
      where: { id: collectionId, archivedAt: undefined },
    });

    if (!collection) {
      return NextResponse.json(
        { error: "Collection not found" },
        { status: 404 }
      );
    }

    // Check visibility
    if (collection.visibility === "private") {
      if (!request.context || request.context.accountId !== collection.accountId) {
        return NextResponse.json(
          { error: "Collection not found" },
          { status: 404 }
        );
      }
    }

    // Get skill by path
    const skillRepo = ds.getRepository(Skill);
    const skill = await skillRepo.findOne({
      where: {
        collectionId,
        path: skillPath,
        archivedAt: undefined,
      },
    });

    if (!skill) {
      return NextResponse.json(
        { error: "Skill not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(skill);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get skill";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
