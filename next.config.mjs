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

  // PUBLIC SURFACE FINAL CLEANUP — headers de seguridad de bajo riesgo,
  // verificados contra el uso real del sitio antes de agregarlos: no se
  // toca CSP (requeriría inventariar todos los orígenes de Supabase
  // Auth/Google OAuth/Mercado Pago/Meta Pixel/hCaptcha y el riesgo de
  // romper algo real es alto para esta misión). Permissions-Policy
  // permite explícitamente camera=self (scanner QR real en
  // panel/eventos/[id]/scanner.jsx) y clipboard-write=self (copiar link
  // en colectas/[id].jsx) — todo lo demás que no se usa queda deshabilitado.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), clipboard-write=(self), microphone=(), geolocation=(), payment=(), usb=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;


