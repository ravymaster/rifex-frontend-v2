// next.config.mjs
/** HOTFIX para Vercel: evita recursión de micromatch */
const nextConfig = {
  experimental: {
    outputFileTracing: false, // Desactiva tracing que rompe el build
  },
};

export default nextConfig;
