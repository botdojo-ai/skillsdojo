/** @type {import('next').NextConfig} */
const nextConfig = {
  // TypeORM and its dependencies need to be external to work properly
  serverExternalPackages: ['typeorm', 'reflect-metadata', 'pg'],

  // Webpack config for handling TypeORM
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Don't bundle these server-only packages
      config.externals = config.externals || [];
      config.externals.push({
        'pg-native': 'commonjs pg-native',
      });
    }
    return config;
  },
};

export default nextConfig;
