import { getDataSource } from "@/lib/db/data-source";
import { User } from "@/entities/User";
import { Account } from "@/entities/Account";
import { AccountMembership } from "@/entities/AccountMembership";
import { hashPassword, verifyPassword, validatePassword } from "@/lib/auth/password";
import { generateTokenPair, generateRandomToken } from "@/lib/auth/jwt";
import { validateUsername, normalizeUsername } from "@/lib/validation/username";
import { v4 as uuidv4 } from "uuid";

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  username: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  user: {
    id: string;
    email: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  account: {
    id: string;
    slug: string;
    name: string;
    type: string;
  };
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  /**
   * Register a new user
   */
  async register(input: RegisterInput): Promise<AuthResult> {
    const ds = await getDataSource();

    // Normalize username
    const username = normalizeUsername(input.username);

    // Validate username format
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      throw new Error(usernameValidation.errors.join(", "));
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(input.email)) {
      throw new Error("Invalid email format");
    }

    // Validate password
    const passwordValidation = validatePassword(input.password);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.errors.join(", "));
    }

    // Check if username is already taken (across all accounts - personal + org)
    const accountRepo = ds.getRepository(Account);
    const existingAccount = await accountRepo.findOne({
      where: { slug: username },
    });
    if (existingAccount) {
      throw new Error("Username is already taken");
    }

    // Check if email already exists
    const userRepo = ds.getRepository(User);
    const existingUser = await userRepo.findOne({
      where: { email: input.email.toLowerCase() },
    });

    if (existingUser) {
      throw new Error("Email already registered");
    }

    // Create user
    const userId = uuidv4();
    const passwordHash = await hashPassword(input.password);

    const user = userRepo.create({
      id: userId,
      email: input.email.toLowerCase(),
      username,
      passwordHash,
      displayName: input.displayName,
      emailVerified: false,
      emailVerificationToken: generateRandomToken(),
      emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      createdById: userId,
    });

    await userRepo.save(user);

    // Create personal account with username as slug
    const accountId = uuidv4();

    const account = accountRepo.create({
      id: accountId,
      slug: username,
      name: input.displayName,
      type: "personal",
      ownerId: userId,
      createdById: userId,
    });

    await accountRepo.save(account);

    // Create account membership
    const membershipRepo = ds.getRepository(AccountMembership);
    const membership = membershipRepo.create({
      userId,
      accountId,
      role: "owner",
      acceptedAt: new Date(),
      createdById: userId,
    });

    await membershipRepo.save(membership);

    // Generate tokens
    const { accessToken, refreshToken } = await generateTokenPair({
      userId,
      email: user.email,
      accountId,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
      account: {
        id: account.id,
        slug: account.slug,
        name: account.name,
        type: account.type,
      },
      accessToken,
      refreshToken,
    };
  }

  /**
   * Login an existing user
   */
  async login(input: LoginInput): Promise<AuthResult> {
    const ds = await getDataSource();

    // Find user
    const userRepo = ds.getRepository(User);
    const user = await userRepo.findOne({
      where: { email: input.email.toLowerCase(), archivedAt: undefined },
    });

    if (!user) {
      throw new Error("Invalid email or password");
    }

    // Verify password
    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      throw new Error("Invalid email or password");
    }

    // Update last login
    user.lastLoginAt = new Date();
    await userRepo.save(user);

    // Get user's personal account (or first account)
    const membershipRepo = ds.getRepository(AccountMembership);
    const membership = await membershipRepo.findOne({
      where: { userId: user.id, archivedAt: undefined },
    });

    if (!membership) {
      throw new Error("No account found for user");
    }

    const accountRepo = ds.getRepository(Account);
    const account = await accountRepo.findOne({
      where: { id: membership.accountId },
    });

    if (!account) {
      throw new Error("Account not found");
    }

    // Generate tokens
    const { accessToken, refreshToken } = await generateTokenPair({
      userId: user.id,
      email: user.email,
      accountId: account.id,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
      account: {
        id: account.id,
        slug: account.slug,
        name: account.name,
        type: account.type,
      },
      accessToken,
      refreshToken,
    };
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string) {
    const ds = await getDataSource();
    const userRepo = ds.getRepository(User);
    return userRepo.findOne({
      where: { id: userId, archivedAt: undefined },
    });
  }

  /**
   * Get user's accounts
   */
  async getUserAccounts(userId: string) {
    const ds = await getDataSource();
    const membershipRepo = ds.getRepository(AccountMembership);
    const accountRepo = ds.getRepository(Account);

    const memberships = await membershipRepo.find({
      where: { userId, archivedAt: undefined },
    });

    const accountIds = memberships.map((m) => m.accountId);
    if (accountIds.length === 0) return [];

    return accountRepo
      .createQueryBuilder("account")
      .where("account.id IN (:...ids)", { ids: accountIds })
      .andWhere("account.archivedAt IS NULL")
      .getMany();
  }

  }

// Singleton instance
export const authService = new AuthService();
