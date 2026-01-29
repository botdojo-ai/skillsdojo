// Reserved usernames that cannot be used (routes, system names, etc.)
export const RESERVED_USERNAMES = [
  // Routes
  "api",
  "login",
  "register",
  "logout",
  "dashboard",
  "admin",
  "settings",
  "skills",
  "collections",
  "search",
  "explore",
  "trending",
  "popular",
  // System
  "system",
  "public",
  "private",
  "null",
  "undefined",
  "root",
  "support",
  "help",
  "about",
  "contact",
  "terms",
  "privacy",
  "security",
  // Special
  "new",
  "edit",
  "delete",
  "create",
  "update",
  "remove",
  "add",
  // Organization
  "org",
  "orgs",
  "organization",
  "organizations",
  "team",
  "teams",
  // Features
  "pulls",
  "issues",
  "wiki",
  "actions",
  "projects",
  "releases",
  // Auth
  "auth",
  "oauth",
  "callback",
  "verify",
  "reset",
  "password",
];

export interface UsernameValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a username according to our rules:
 * - 3-39 characters (like GitHub)
 * - Lowercase alphanumeric + hyphens only
 * - Cannot start or end with hyphen
 * - Cannot have consecutive hyphens
 * - Cannot be a reserved word
 */
export function validateUsername(username: string): UsernameValidation {
  const errors: string[] = [];

  // Length check (3-39 characters like GitHub)
  if (username.length < 3) {
    errors.push("Username must be at least 3 characters");
  }
  if (username.length > 39) {
    errors.push("Username must be 39 characters or less");
  }

  // Character validation (lowercase alphanumeric + hyphens)
  if (!/^[a-z0-9-]+$/.test(username)) {
    errors.push(
      "Username can only contain lowercase letters, numbers, and hyphens"
    );
  }

  // Cannot start or end with hyphen
  if (username.startsWith("-") || username.endsWith("-")) {
    errors.push("Username cannot start or end with a hyphen");
  }

  // Cannot have consecutive hyphens
  if (username.includes("--")) {
    errors.push("Username cannot contain consecutive hyphens");
  }

  // Reserved words check
  if (RESERVED_USERNAMES.includes(username.toLowerCase())) {
    errors.push("This username is reserved");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Normalize a username (lowercase, trim)
 */
export function normalizeUsername(username: string): string {
  return username.toLowerCase().trim();
}
