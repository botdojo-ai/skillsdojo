import { AsyncLocalStorage } from "async_hooks";

/**
 * Request context containing user and account info.
 * Passed to services for automatic scoping.
 */
export interface RequestContext {
  userId: string;
  accountId: string;
  email?: string;
  isAdmin?: boolean;
}

// AsyncLocalStorage for request context
const contextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Run a function with a request context
 */
export function withContext<T>(ctx: RequestContext, fn: () => T): T {
  return contextStorage.run(ctx, fn);
}

/**
 * Get the current request context
 * @throws Error if no context is set
 */
export function getContext(): RequestContext {
  const ctx = contextStorage.getStore();
  if (!ctx) {
    throw new Error("No request context available");
  }
  return ctx;
}

/**
 * Get the current request context or null
 */
export function getContextOrNull(): RequestContext | null {
  return contextStorage.getStore() || null;
}
