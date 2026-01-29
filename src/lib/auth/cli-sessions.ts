// In-memory store for CLI auth sessions (in production, use Redis or similar)
// Map of state -> { createdAt, status, token?, user?, account? }

export interface CliAuthSession {
  createdAt: Date;
  status: "pending" | "complete" | "expired";
  accessToken?: string;
  refreshToken?: string;
  user?: { id: string; email: string };
  account?: { id: string; slug: string; name: string };
}

export const cliAuthSessions = new Map<string, CliAuthSession>();

// Clean up expired sessions periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    const expiryMs = 10 * 60 * 1000; // 10 minutes

    for (const [state, session] of cliAuthSessions) {
      if (now - session.createdAt.getTime() > expiryMs) {
        cliAuthSessions.delete(state);
      }
    }
  }, 60 * 1000); // Check every minute
}
