/** @type {import('next').NextConfig} */
const nextConfig = {
  // TypeORM and its dependencies need to be external to work properly
  serverExternalPackages: ['typeorm', 'reflect-metadata', 'pg', 'pg-native'],

  // Empty turbopack config to use Turbopack (default in Next.js 16)
  turbopack: {},
};

export default nextConfig;
