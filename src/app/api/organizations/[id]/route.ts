import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/middleware";
import { organizationService } from "@/services/organization.service";
import { getDataSource } from "@/lib/db/data-source";
import { Account } from "@/entities/Account";

type Params = { id: string };

// GET /api/organizations/[id] - Get organization details
export const GET = withAuth(
  async (
    request: AuthenticatedRequest,
    { params }: { params: Promise<Params> }
  ) => {
    try {
      const { id } = await params;
      const ds = await getDataSource();

      const account = await ds.getRepository(Account).findOne({
        where: { id, type: "organization", archivedAt: undefined },
      });

      if (!account) {
        return NextResponse.json(
          { error: "Organization not found" },
          { status: 404 }
        );
      }

      // Check if user is a member
      const isMember = await organizationService.isMember(
        id,
        request.user.userId
      );
      const role = await organizationService.getMemberRole(
        id,
        request.user.userId
      );

      return NextResponse.json({
        id: account.id,
        slug: account.slug,
        name: account.name,
        type: account.type,
        description: account.description,
        avatarUrl: account.avatarUrl,
        isMember,
        role,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get organization";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
);

// PUT /api/organizations/[id] - Update organization
export const PUT = withAuth(
  async (
    request: AuthenticatedRequest,
    { params }: { params: Promise<Params> }
  ) => {
    try {
      const { id } = await params;

      // Check if user can manage this org
      const canManage = await organizationService.canManageMembers(
        id,
        request.user.userId
      );
      if (!canManage) {
        return NextResponse.json(
          { error: "You do not have permission to update this organization" },
          { status: 403 }
        );
      }

      const body = await request.json();
      const { name, description, avatarUrl } = body;

      const ds = await getDataSource();
      const accountRepo = ds.getRepository(Account);

      const account = await accountRepo.findOne({
        where: { id, type: "organization", archivedAt: undefined },
      });

      if (!account) {
        return NextResponse.json(
          { error: "Organization not found" },
          { status: 404 }
        );
      }

      if (name) account.name = name;
      if (description !== undefined) account.description = description;
      if (avatarUrl !== undefined) account.avatarUrl = avatarUrl;
      account.modifiedById = request.user.userId;

      await accountRepo.save(account);

      return NextResponse.json({
        id: account.id,
        slug: account.slug,
        name: account.name,
        type: account.type,
        description: account.description,
        avatarUrl: account.avatarUrl,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update organization";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
);

// DELETE /api/organizations/[id] - Delete organization
export const DELETE = withAuth(
  async (
    request: AuthenticatedRequest,
    { params }: { params: Promise<Params> }
  ) => {
    try {
      const { id } = await params;

      // Only owners can delete
      const role = await organizationService.getMemberRole(
        id,
        request.user.userId
      );
      if (role !== "owner") {
        return NextResponse.json(
          { error: "Only owners can delete an organization" },
          { status: 403 }
        );
      }

      const ds = await getDataSource();
      const accountRepo = ds.getRepository(Account);

      const account = await accountRepo.findOne({
        where: { id, type: "organization", archivedAt: undefined },
      });

      if (!account) {
        return NextResponse.json(
          { error: "Organization not found" },
          { status: 404 }
        );
      }

      // Soft delete
      account.archivedAt = new Date();
      account.archivedById = request.user.userId;
      await accountRepo.save(account);

      return NextResponse.json({ success: true });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to delete organization";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
);
