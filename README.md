# Rifex Frontend v2

Panel y flujo de rifas con Next.js (App de ejemplo).  
**Estado:** estable – sin cambios de BD en esta versión.

## Stack
- Next.js / React
- Supabase (auth + DB)
- Mercado Pago (checkout)
- CSS Modules

## Demo local
```bash
# 1) Instalar deps
npm install

# 2) Variables de entorno
# copiar docs/dotenv.example -> .env.local y completar claves
# (NO commitear .env.local)

# 3) Dev
npm run dev

# 4) Build / start
npm run build
npm start
