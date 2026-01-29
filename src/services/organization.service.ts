import { getDataSource } from "@/lib/db/data-source";
import { Account } from "@/entities/Account";
import { AccountMembership, AccountRole } from "@/entities/AccountMembership";
import { User } from "@/entities/User";
import { validateUsername, normalizeUsername } from "@/lib/validation/username";
import { v4 as uuidv4 } from "uuid";

export interface CreateOrganizationInput {
  slug: string;
  name: string;
  description?: string;
}

export interface OrganizationResult {
  id: string;
  slug: string;
  name: string;
  type: "organization";
  description: string | null;
  avatarUrl: string | null;
}

export interface OrganizationMember {
  userId: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: AccountRole;
  acceptedAt: Date | null;
  invitedAt: Date | null;
}

export class OrganizationService {
  /**
   * Create a new organization
   */
  async create(
    input: CreateOrganizationInput,
    userId: string
  ): Promise<OrganizationResult> {
    const ds = await getDataSource();
    const slug = normalizeUsername(input.slug);

    // Validate organization slug (same rules as username)
    const validation = validateUsername(slug);
    if (!validation.valid) {
      throw new Error(validation.errors.join(", "));
    }

    // Check slug uniqueness across all accounts (personal + org)
    const accountRepo = ds.getRepository(Account);
    const existing = await accountRepo.findOne({
      where: { slug },
    });
    if (existing) {
      throw new Error("This organization name is already taken");
    }

    // Create organization account
    const accountId = uuidv4();
    const account = accountRepo.create({
      id: accountId,
      slug,
      name: input.name,
      type: "organization",
      description: input.description || null,
      ownerId: userId,
      createdById: userId,
    });
    await accountRepo.save(account);

    // Add creator as owner member
    const membershipRepo = ds.getRepository(AccountMembership);
    const membership = membershipRepo.create({
      userId,
      accountId,
      role: "owner",
      acceptedAt: new Date(),
      createdById: userId,
    });
    await membershipRepo.save(membership);

    return {
      id: account.id,
      slug: account.slug,
      name: account.name,
      type: "organization",
      description: account.description,
      avatarUrl: account.avatarUrl,
    };
  }

  /**
   * Get organization by slug
   */
  async getBySlug(slug: string): Promise<OrganizationResult | null> {
    const ds = await getDataSource();
    const account = await ds.getRepository(Account).findOne({
      where: { slug: slug.toLowerCase(), type: "organization" },
    });

    if (!account) return null;

    return {
      id: account.id,
      slug: account.slug,
      name: account.name,
      type: "organization",
      description: account.description,
      avatarUrl: account.avatarUrl,
    };
  }

  /**
   * Get organizations for a user
   */
  async getUserOrganizations(userId: string): Promise<OrganizationResult[]> {
    const ds = await getDataSource();
    const memberships = await ds.getRepository(AccountMembership).find({
      where: { userId, archivedAt: undefined },
    });

    if (memberships.length === 0) return [];

    const accountIds = memberships.map((m) => m.accountId);
    const accounts = await ds
      .getRepository(Account)
      .createQueryBuilder("account")
      .where("account.id IN (:...ids)", { ids: accountIds })
      .andWhere("account.type = :type", { type: "organization" })
      .andWhere("account.archivedAt IS NULL")
      .getMany();

    return accounts.map((a) => ({
      id: a.id,
      slug: a.slug,
      name: a.name,
      type: "organization" as const,
      description: a.description,
      avatarUrl: a.avatarUrl,
    }));
  }

  /**
   * Get members of an organization
   */
  async getMembers(orgId: string): Promise<OrganizationMember[]> {
    const ds = await getDataSource();
    const memberships = await ds.getRepository(AccountMembership).find({
      where: { accountId: orgId, archivedAt: undefined },
    });

    if (memberships.length === 0) return [];

    const userIds = memberships.map((m) => m.userId);
    const users = await ds
      .getRepository(User)
      .createQueryBuilder("user")
      .where("user.id IN (:...ids)", { ids: userIds })
      .andWhere("user.archivedAt IS NULL")
      .getMany();

    const userMap = new Map(users.map((u) => [u.id, u]));

    return memberships
      .map((m) => {
        const user = userMap.get(m.userId);
        if (!user) return null;
        return {
          userId: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          role: m.role,
          acceptedAt: m.acceptedAt,
          invitedAt: m.invitedAt,
        };
      })
      .filter((m): m is OrganizationMember => m !== null);
  }

  /**
   * Add a member to an organization
   */
  async addMember(
    orgId: string,
    userId: string,
    role: AccountRole,
    invitedBy: string
  ): Promise<AccountMembership> {
    const ds = await getDataSource();
    const membershipRepo = ds.getRepository(AccountMembership);

    // Check if already a member
    const existing = await membershipRepo.findOne({
      where: { userId, accountId: orgId, archivedAt: undefined },
    });
    if (existing) {
      throw new Error("User is already a member of this organization");
    }

    // Verify the organization exists
    const account = await ds.getRepository(Account).findOne({
      where: { id: orgId, type: "organization", archivedAt: undefined },
    });
    if (!account) {
      throw new Error("Organization not found");
    }

    const membership = membershipRepo.create({
      userId,
      accountId: orgId,
      role,
      invitedAt: new Date(),
      createdById: invitedBy,
    });

    return membershipRepo.save(membership);
  }

  /**
   * Add a member by username or email
   */
  async addMemberByIdentifier(
    orgId: string,
    identifier: string,
    role: AccountRole,
    invitedBy: string
  ): Promise<AccountMembership> {
    const ds = await getDataSource();
    const userRepo = ds.getRepository(User);

    // Try to find user by username or email
    const user = await userRepo.findOne({
      where: [
        { username: identifier.toLowerCase(), archivedAt: undefined },
        { email: identifier.toLowerCase(), archivedAt: undefined },
      ],
    });

    if (!user) {
      throw new Error("User not found");
    }

    return this.addMember(orgId, user.id, role, invitedBy);
  }

  /**
   * Remove a member from an organization
   */
  async removeMember(orgId: string, userId: string): Promise<boolean> {
    const ds = await getDataSource();
    const membershipRepo = ds.getRepository(AccountMembership);

    const membership = await membershipRepo.findOne({
      where: { userId, accountId: orgId, archivedAt: undefined },
    });

    if (!membership) return false;

    // Cannot remove the last owner
    if (membership.role === "owner") {
      const ownerCount = await membershipRepo.count({
        where: { accountId: orgId, role: "owner", archivedAt: undefined },
      });
      if (ownerCount <= 1) {
        throw new Error("Cannot remove the last owner of the organization");
      }
    }

    // Soft delete
    membership.archivedAt = new Date();
    await membershipRepo.save(membership);
    return true;
  }

  /**
   * Update a member's role
   */
  async updateMemberRole(
    orgId: string,
    userId: string,
    role: AccountRole,
    updatedBy: string
  ): Promise<AccountMembership | null> {
    const ds = await getDataSource();
    const membershipRepo = ds.getRepository(AccountMembership);

    const membership = await membershipRepo.findOne({
      where: { userId, accountId: orgId, archivedAt: undefined },
    });

    if (!membership) return null;

    // If demoting from owner, ensure there's at least one other owner
    if (membership.role === "owner" && role !== "owner") {
      const ownerCount = await membershipRepo.count({
        where: { accountId: orgId, role: "owner", archivedAt: undefined },
      });
      if (ownerCount <= 1) {
        throw new Error("Cannot demote the last owner");
      }
    }

    membership.role = role;
    membership.modifiedById = updatedBy;
    return membershipRepo.save(membership);
  }

  /**
   * Check if a user is a member of an organization
   */
  async isMember(orgId: string, userId: string): Promise<boolean> {
    const ds = await getDataSource();
    const membership = await ds.getRepository(AccountMembership).findOne({
      where: { userId, accountId: orgId, archivedAt: undefined },
    });
    return !!membership;
  }

  /**
   * Get a user's role in an organization
   */
  async getMemberRole(
    orgId: string,
    userId: string
  ): Promise<AccountRole | null> {
    const ds = await getDataSource();
    const membership = await ds.getRepository(AccountMembership).findOne({
      where: { userId, accountId: orgId, archivedAt: undefined },
    });
    return membership?.role || null;
  }

  /**
   * Check if a user can manage members (owner or admin)
   */
  async canManageMembers(orgId: string, userId: string): Promise<boolean> {
    const role = await this.getMemberRole(orgId, userId);
    return role === "owner" || role === "admin";
  }
}

export const organizationService = new OrganizationService();
