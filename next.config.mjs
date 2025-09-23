// next.config.mjs
const nextConfig = {
  output: 'standalone',               // simplifica el tracing en Vercel
  experimental: {
    outputFileTracingRoot: process.cwd(), // opción válida en v14
  },
};
export default nextConfig;