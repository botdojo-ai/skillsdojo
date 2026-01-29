/**
 * OAuth Consent Page
 * /mcp/oauth/[account]/[collection]/consent
 *
 * Displays the OAuth consent form for authorizing MCP client access.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDataSource } from "@/lib/db/data-source";
import { Account } from "@/entities/Account";
import { AccountMembership } from "@/entities/AccountMembership";
import { SkillCollection } from "@/entities/SkillCollection";
import { verifyToken, TokenPayload } from "@/lib/auth/jwt";
import { OAuthConsentForm } from "./consent-form";

interface PageProps {
  params: Promise<{
    account: string;
    collection: string;
  }>;
  searchParams: Promise<{
    redirect_uri?: string;
    client_id?: string;
    state?: string;
    code_challenge?: string;
    code_challenge_method?: string;
    scope?: string;
    api_base?: string;
  }>;
}

async function getCurrentUser(): Promise<TokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (payload?.type !== "access") return null;

  return payload;
}

export default async function OAuthConsentPage({ params, searchParams }: PageProps) {
  const { account: accountSlug, collection: collectionSlug } = await params;
  const query = await searchParams;

  // Check authentication
  const user = await getCurrentUser();
  if (!user) {
    // Redirect to sign-in with return URL
    const currentUrl = `/mcp/oauth/${accountSlug}/${collectionSlug}/consent?${new URLSearchParams(query as Record<string, string>).toString()}`;
    redirect(`/login?redirect=${encodeURIComponent(currentUrl)}`);
  }

  // Get database connection
  const ds = await getDataSource();
  const accountRepo = ds.getRepository(Account);
  const membershipRepo = ds.getRepository(AccountMembership);
  const collectionRepo = ds.getRepository(SkillCollection);

  // Look up the account
  const accountRecord = await accountRepo.findOne({
    where: { slug: accountSlug },
  });

  if (!accountRecord) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-lg">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Account Not Found</h1>
          <p className="text-gray-600">The requested account does not exist.</p>
        </div>
      </div>
    );
  }

  // Verify user has access to this account
  const membership = await membershipRepo.findOne({
    where: {
      accountId: accountRecord.id,
      userId: user.userId,
    },
  });

  if (!membership) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-lg">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600">You do not have access to this account.</p>
        </div>
      </div>
    );
  }

  // Look up the collection
  const collectionRecord = await collectionRepo.findOne({
    where: {
      accountId: accountRecord.id,
      slug: collectionSlug,
      archivedAt: undefined,
    },
  });

  if (!collectionRecord) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-lg">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Collection Not Found</h1>
          <p className="text-gray-600">The requested collection does not exist.</p>
        </div>
      </div>
    );
  }

  // Parse scope to display permissions
  const scope = query.scope || "read";
  const scopes = scope.split(" ");

  const scopeDescriptions: Record<string, string> = {
    read: "View skills and collection content",
    contribute: "Create pull requests and suggest changes",
    write: "Create, edit, and delete skills",
    admin: "Full administrative access",
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-8 text-white">
          <h1 className="text-2xl font-bold mb-2">Authorize MCP Access</h1>
          <p className="text-blue-100 text-sm">
            An application is requesting access to your collection
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Collection Info */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">{collectionRecord.name}</h2>
                <p className="text-sm text-gray-500">
                  {accountRecord.name} / {collectionSlug}
                </p>
              </div>
            </div>
            {collectionRecord.description && (
              <p className="text-sm text-gray-600 mt-2">{collectionRecord.description}</p>
            )}
          </div>

          {/* Requested Permissions */}
          <div className="mb-6">
            <h3 className="font-medium text-gray-900 mb-3">Requested Permissions</h3>
            <ul className="space-y-2">
              {scopes.map((s) => (
                <li key={s} className="flex items-start gap-2">
                  <svg
                    className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="text-sm text-gray-700">
                    {scopeDescriptions[s] || s}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Client Info */}
          {query.client_id && (
            <div className="mb-6 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Client ID</p>
              <p className="text-sm text-gray-700 font-mono break-all">
                {query.client_id}
              </p>
            </div>
          )}

          {/* Consent Form */}
          <OAuthConsentForm
            accountSlug={accountSlug}
            collectionSlug={collectionSlug}
            redirectUri={query.redirect_uri}
            clientId={query.client_id}
            state={query.state}
            codeChallenge={query.code_challenge}
            codeChallengeMethod={query.code_challenge_method}
            scope={scope}
            apiBase={query.api_base}
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t">
          <p className="text-xs text-gray-500 text-center">
            By authorizing, you grant this application access to the specified
            collection with the permissions listed above.
          </p>
        </div>
      </div>
    </div>
  );
}
