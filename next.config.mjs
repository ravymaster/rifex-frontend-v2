// next.config.mjs
const nextConfig = {
  output: 'standalone',                // empaqueta deps y simplifica el trace
  experimental: {
    // Esta sí existe en v14 y a veces evita loops del tracer:
    outputFileTracingRoot: process.cwd(),
    // ⚠️ NO uses outputFileTracing aquí (no es una key válida).
  },
};

export default nextConfig;
