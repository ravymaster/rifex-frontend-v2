// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: { outputFileTracingRoot: process.cwd() },

  // Forzar dominio canónico: www.rifex.pro -> rifex.pro
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.rifex.pro' }],
        destination: 'https://rifex.pro/:path*',
        permanent: true, // 308
      },
    ];
  },
};

export default nextConfig;


