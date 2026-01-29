import { NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/middleware";
import { organizationService } from "@/services/organization.service";
import { AccountRole } from "@/entities/AccountMembership";

type Params = { id: string };

// GET /api/organizations/[id]/members - List members
export const GET = withAuth(
  async (
    request: AuthenticatedRequest,
    { params }: { params: Promise<Params> }
  ) => {
    try {
      const { id } = await params;

      // Check if user is a member (can view other members)
      const isMember = await organizationService.isMember(
        id,
        request.user.userId
      );
      if (!isMember) {
        return NextResponse.json(
          { error: "You are not a member of this organization" },
          { status: 403 }
        );
      }

      const members = await organizationService.getMembers(id);
      return NextResponse.json({ members });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get members";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
);

// POST /api/organizations/[id]/members - Add member
export const POST = withAuth(
  async (
    request: AuthenticatedRequest,
    { params }: { params: Promise<Params> }
  ) => {
    try {
      const { id } = await params;

      // Check if user can manage members
      const canManage = await organizationService.canManageMembers(
        id,
        request.user.userId
      );
      if (!canManage) {
        return NextResponse.json(
          {
            error: "You do not have permission to add members to this organization",
          },
          { status: 403 }
        );
      }

      const body = await request.json();
      const { identifier, role } = body;

      if (!identifier) {
        return NextResponse.json(
          { error: "User identifier (username or email) is required" },
          { status: 400 }
        );
      }

      const validRoles: AccountRole[] = ["admin", "member", "viewer"];
      const memberRole = validRoles.includes(role) ? role : "member";

      const membership = await organizationService.addMemberByIdentifier(
        id,
        identifier,
        memberRole,
        request.user.userId
      );

      return NextResponse.json(membership, { status: 201 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to add member";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }
);

// DELETE /api/organizations/[id]/members - Remove member (self or by admin)
export const DELETE = withAuth(
  async (
    request: AuthenticatedRequest,
    { params }: { params: Promise<Params> }
  ) => {
    try {
      const { id } = await params;
      const { searchParams } = new URL(request.url);
      const userId = searchParams.get("userId");

      if (!userId) {
        return NextResponse.json(
          { error: "User ID is required" },
          { status: 400 }
        );
      }

      // Check if removing self or if user can manage members
      const isSelf = userId === request.user.userId;
      const canManage = await organizationService.canManageMembers(
        id,
        request.user.userId
      );

      if (!isSelf && !canManage) {
        return NextResponse.json(
          { error: "You do not have permission to remove this member" },
          { status: 403 }
        );
      }

      const removed = await organizationService.removeMember(id, userId);
      if (!removed) {
        return NextResponse.json(
          { error: "Member not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to remove member";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }
);

// PATCH /api/organizations/[id]/members - Update member role
export const PATCH = withAuth(
  async (
    request: AuthenticatedRequest,
    { params }: { params: Promise<Params> }
  ) => {
    try {
      const { id } = await params;

      // Check if user can manage members
      const canManage = await organizationService.canManageMembers(
        id,
        request.user.userId
      );
      if (!canManage) {
        return NextResponse.json(
          { error: "You do not have permission to update member roles" },
          { status: 403 }
        );
      }

      const body = await request.json();
      const { userId, role } = body;

      if (!userId || !role) {
        return NextResponse.json(
          { error: "User ID and role are required" },
          { status: 400 }
        );
      }

      const validRoles: AccountRole[] = ["owner", "admin", "member", "viewer"];
      if (!validRoles.includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }

      // Only owners can promote to owner
      if (role === "owner") {
        const currentRole = await organizationService.getMemberRole(
          id,
          request.user.userId
        );
        if (currentRole !== "owner") {
          return NextResponse.json(
            { error: "Only owners can promote to owner" },
            { status: 403 }
          );
        }
      }

      const membership = await organizationService.updateMemberRole(
        id,
        userId,
        role,
        request.user.userId
      );

      if (!membership) {
        return NextResponse.json(
          { error: "Member not found" },
          { status: 404 }
        );
      }

      return NextResponse.json(membership);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update member role";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }
);
