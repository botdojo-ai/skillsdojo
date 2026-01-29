/** @type {import('next').NextConfig} */
const nextConfig = {
  // TypeORM and its dependencies need to be external to work properly
  serverExternalPackages: ['typeorm', 'reflect-metadata', 'pg', 'pg-native'],

  // Empty turbopack config to use Turbopack (default in Next.js 16)
  turbopack: {},

  // URL rewrites for .well-known paths (Next.js treats dot-prefixed folders as private)
  async rewrites() {
    return [
      // RFC 8414 OAuth Authorization Server Metadata discovery (path-based)
      // mcp-remote looks for: /.well-known/oauth-authorization-server/api/mcp/:account/:collection
      {
        source: '/.well-known/oauth-authorization-server/api/mcp/:account/:collection',
        destination: '/api/mcp/:account/:collection/well-known/oauth-authorization-server',
      },
      // RFC 9728 Protected Resource Metadata discovery (path-based)
      {
        source: '/.well-known/oauth-protected-resource/api/mcp/:account/:collection',
        destination: '/api/mcp/:account/:collection/well-known/oauth-protected-resource',
      },
      // MCP OAuth discovery endpoints (direct path style)
      {
        source: '/api/mcp/:account/:collection/.well-known/:path*',
        destination: '/api/mcp/:account/:collection/well-known/:path*',
      },
      // Root .well-known endpoints
      {
        source: '/.well-known/:path*',
        destination: '/well-known/:path*',
      },
    ];
  },
};

export default nextConfig;
