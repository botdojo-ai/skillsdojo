"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface OAuthConsentFormProps {
  accountSlug: string;
  collectionSlug: string;
  redirectUri?: string;
  clientId?: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  scope: string;
  apiBase?: string;
}

export function OAuthConsentForm({
  accountSlug,
  collectionSlug,
  redirectUri,
  clientId,
  state,
  codeChallenge,
  codeChallengeMethod,
  scope,
  apiBase,
}: OAuthConsentFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async (action: "approve" | "deny") => {
    setIsLoading(true);
    setError(null);

    try {
      const callbackUrl = apiBase
        ? `${apiBase}/api/mcp/${accountSlug}/${collectionSlug}/oauth/callback`
        : `/api/mcp/${accountSlug}/${collectionSlug}/oauth/callback`;

      const response = await fetch(callbackUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          redirect_uri: redirectUri,
          client_id: clientId,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
          // Use write scope to allow editing skills in owned collections
          scope: "write",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error_description || data.error || "Authorization failed");
      }

      // Redirect to the client's callback URL
      if (data.redirect_url) {
        window.location.href = data.redirect_url;
      } else if (data.code) {
        // If no redirect URL, show the code to the user
        setError(`Authorization code: ${data.code}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => handleAction("deny")}
          disabled={isLoading}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Deny
        </button>
        <button
          onClick={() => handleAction("approve")}
          disabled={isLoading}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Authorizing...
            </span>
          ) : (
            "Authorize"
          )}
        </button>
      </div>
    </div>
  );
}
