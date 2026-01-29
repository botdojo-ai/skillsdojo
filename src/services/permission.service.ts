import { getDataSource } from "@/lib/db/data-source";
import { AccountMembership } from "@/entities/AccountMembership";
import { SkillCollection } from "@/entities/SkillCollection";
import { TeamMembership } from "@/entities/TeamMembership";
import { TeamPermission, PermissionLevel } from "@/entities/TeamPermission";

export type AccessLevel = "none" | "read" | "write" | "admin" | "owner";

export interface CollectionAccess {
  canView: boolean;
  canEdit: boolean;
  canAdmin: boolean;
  isOwner: boolean;
  accessLevel: AccessLevel;
}

export class PermissionService {
  /**
   * Check user's access to a collection
   */
  async getCollectionAccess(
    collectionId: string,
    userId: string | null
  ): Promise<CollectionAccess> {
    const ds = await getDataSource();

    // Get collection with account info
    const collection = await ds.getRepository(SkillCollection).findOne({
      where: { id: collectionId, archivedAt: undefined },
    });

    if (!collection) {
      return this.noAccess();
    }

    // Public collections are readable by everyone
    if (collection.visibility === "public") {
      if (!userId) {
        return this.readOnlyAccess();
      }
    }

    // Unlisted collections are readable by anyone with the link
    if (collection.visibility === "unlisted") {
      if (!userId) {
        return this.readOnlyAccess();
      }
    }

    // Private collections require authentication
    if (!userId) {
      return this.noAccess();
    }

    // Check account membership
    const membership = await ds.getRepository(AccountMembership).findOne({
      where: { userId, accountId: collection.accountId, archivedAt: undefined },
    });

    if (membership) {
      switch (membership.role) {
        case "owner":
          return {
            canView: true,
            canEdit: true,
            canAdmin: true,
            isOwner: true,
            accessLevel: "owner",
          };
        case "admin":
          return {
            canView: true,
            canEdit: true,
            canAdmin: true,
            isOwner: false,
            accessLevel: "admin",
          };
        case "member":
          return {
            canView: true,
            canEdit: true,
            canAdmin: false,
            isOwner: false,
            accessLevel: "write",
          };
        case "viewer":
          return {
            canView: true,
            canEdit: false,
            canAdmin: false,
            isOwner: false,
            accessLevel: "read",
          };
      }
    }

    // Check team permissions
    const teamAccess = await this.getTeamAccess(
      collection.accountId,
      collectionId,
      userId
    );
    if (teamAccess.accessLevel !== "none") {
      return teamAccess;
    }

    // If collection is public/unlisted, allow read access
    if (collection.visibility !== "private") {
      return this.readOnlyAccess();
    }

    return this.noAccess();
  }

  /**
   * Check user's access to a collection by account slug and collection slug
   */
  async getCollectionAccessBySlug(
    accountSlug: string,
    collectionSlug: string,
    userId: string | null
  ): Promise<CollectionAccess & { collection?: SkillCollection }> {
    const ds = await getDataSource();

    // Find collection by slugs
    const collection = await ds
      .getRepository(SkillCollection)
      .createQueryBuilder("collection")
      .innerJoin("accounts", "account", "account.id = collection.accountId")
      .where("account.slug = :accountSlug", { accountSlug })
      .andWhere("collection.slug = :collectionSlug", { collectionSlug })
      .andWhere("collection.archivedAt IS NULL")
      .andWhere("account.archivedAt IS NULL")
      .getOne();

    if (!collection) {
      return { ...this.noAccess(), collection: undefined };
    }

    const access = await this.getCollectionAccess(collection.id, userId);
    return { ...access, collection };
  }

  /**
   * Check user's access through team membership
   */
  private async getTeamAccess(
    accountId: string,
    collectionId: string,
    userId: string
  ): Promise<CollectionAccess> {
    const ds = await getDataSource();

    // Get user's team memberships in this account
    const teamMemberships = await ds.getRepository(TeamMembership).find({
      where: { userId, accountId, archivedAt: undefined },
    });

    if (teamMemberships.length === 0) {
      return this.noAccess();
    }

    const teamIds = teamMemberships.map((tm) => tm.teamId);

    // Get team permissions for this collection
    const permissions = await ds
      .getRepository(TeamPermission)
      .createQueryBuilder("perm")
      .where("perm.teamId IN (:...teamIds)", { teamIds })
      .andWhere("perm.collectionId = :collectionId", { collectionId })
      .andWhere("perm.archivedAt IS NULL")
      .getMany();

    if (permissions.length === 0) {
      return this.noAccess();
    }

    // Get highest permission level
    let highestLevel: PermissionLevel = "read";
    for (const perm of permissions) {
      if (perm.permission === "admin") {
        highestLevel = "admin";
        break;
      } else if (perm.permission === "write") {
        highestLevel = "write";
      }
    }

    switch (highestLevel) {
      case "admin":
        return {
          canView: true,
          canEdit: true,
          canAdmin: true,
          isOwner: false,
          accessLevel: "admin",
        };
      case "write":
        return {
          canView: true,
          canEdit: true,
          canAdmin: false,
          isOwner: false,
          accessLevel: "write",
        };
      default:
        return this.readOnlyAccess();
    }
  }

  /**
   * Check if user has at least the specified access level
   */
  async hasAccess(
    collectionId: string,
    userId: string | null,
    requiredLevel: AccessLevel
  ): Promise<boolean> {
    const access = await this.getCollectionAccess(collectionId, userId);

    const levels: AccessLevel[] = ["none", "read", "write", "admin", "owner"];
    const userLevelIndex = levels.indexOf(access.accessLevel);
    const requiredLevelIndex = levels.indexOf(requiredLevel);

    return userLevelIndex >= requiredLevelIndex;
  }

  private noAccess(): CollectionAccess {
    return {
      canView: false,
      canEdit: false,
      canAdmin: false,
      isOwner: false,
      accessLevel: "none",
    };
  }

  private readOnlyAccess(): CollectionAccess {
    return {
      canView: true,
      canEdit: false,
      canAdmin: false,
      isOwner: false,
      accessLevel: "read",
    };
  }
}

export const permissionService = new PermissionService();
