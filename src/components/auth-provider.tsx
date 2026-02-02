"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";

interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
}

interface Account {
  id: string;
  slug: string;
  name: string;
  type: string;
}

interface AuthContextType {
  user: User | null;
  account: Account | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Safe hook that doesn't throw - for components that might render before provider
export function useAuthSafe() {
  return useContext(AuthContext);
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const userRef = useRef(user);

  const clearAuth = useCallback(() => {
    setUser(null);
    setAccount(null);
    // Clear any localStorage tokens that might cause stale UI
    if (typeof window !== "undefined") {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");
    }
  }, []);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      // Try to refresh using the refresh token cookie
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setAccount(data.account);
        return true;
      }
    } catch {
      // Refresh failed, user is not authenticated
    }
    clearAuth();
    return false;
  }, [clearAuth]);

  const checkAuth = useCallback(async () => {
    try {
      // Try to get current user
      const res = await fetch("/api/auth/me", {
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setAccount(data.accounts?.[0] || null);
        return;
      }

      // If access token expired, try to refresh
      if (res.status === 401) {
        const refreshed = await refresh();
        if (!refreshed) {
          // Auth completely failed - make sure state is cleared
          clearAuth();
        }
        return;
      }

      // Any other error status - clear auth
      clearAuth();
    } catch {
      clearAuth();
    } finally {
      setLoading(false);
    }
  }, [refresh, clearAuth]);

  // Keep ref in sync with user state
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    checkAuth();

    // Set up periodic auth check (every 30 minutes)
    // Server-side will proactively refresh tokens > 2 hours old on any API call
    // This is a fallback to ensure UI stays in sync if user is idle
    const refreshInterval = setInterval(() => {
      if (userRef.current) {
        checkAuth();
      }
    }, 30 * 60 * 1000);

    return () => clearInterval(refreshInterval);
  }, [checkAuth]);

  const login = async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      credentials: "include",
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Login failed");
    }

    const data = await res.json();
    setUser(data.user);
    setAccount(data.account);
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      clearAuth();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        account,
        loading,
        isAuthenticated: !!user,
        login,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
