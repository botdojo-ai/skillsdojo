import { NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/middleware";
import { getSkillService } from "@/services/skill.service";

interface RouteParams {
  params: Promise<{ id: string; skillId: string }>;
}

// GET /api/collections/[id]/skills/[skillId] - Get skill
export const GET = withAuth(async (request: AuthenticatedRequest, context: RouteParams) => {
  const { skillId } = await context.params;

  const service = await getSkillService(request.context);
  const skill = await service.findById(skillId);

  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  return NextResponse.json(skill);
});

// PATCH /api/collections/[id]/skills/[skillId] - Update skill
export const PATCH = withAuth(async (request: AuthenticatedRequest, context: RouteParams) => {
  try {
    const { skillId } = await context.params;
    const body = await request.json();

    const { name, description, metadata, dependencies } = body;

    const service = await getSkillService(request.context);
    const skill = await service.updateSkill(skillId, {
      name,
      description,
      metadata,
      dependencies,
    });

    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    return NextResponse.json(skill);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update skill";
    return NextResponse.json({ error: message }, { status: 400 });
  }
});

// DELETE /api/collections/[id]/skills/[skillId] - Delete skill
export const DELETE = withAuth(async (request: AuthenticatedRequest, context: RouteParams) => {
  const { skillId } = await context.params;

  const service = await getSkillService(request.context);
  const deleted = await service.deleteSkill(skillId);

  if (!deleted) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
});
