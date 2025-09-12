# ONBOARDING – Cómo poner al día a Ailén en 1 minuto

## 1) Subir ZIP
- Ve a **scripts/pack-zip.(sh|ps1)** y ejecuta para generar `rifex-frontend-<fecha>.zip` sin `node_modules`.
- Sube ese ZIP al chat. Ailén lo abre y mapea estructura automáticamente.

## 2) Qué le importa a Ailén leer
- `package.json`, `src/pages/**` (checkout, rifas, crear-rifa), `src/lib/**`
- `docs/STATUS.md` (este documento)
- `db/README_DB.md` y `db/db/schema_snapshot.json`

## 3) Palabras clave a mencionar en el chat
- “usamos **raffles/tickets/purchases**; **NO** rifas/rifa_tickets”
- “tickets → available/pending/sold; purchases → initiated/approved/pending/rejected/failure”
- “tickets 1..N se crean en **/api/rifas/index.js** al crear rifa”

## 4) Flujo típico para reanudar
1. Confirmar `.env.local`
2. Crear rifa → ver tickets
3. Comprar → abrir preferencia MP
4. Confirmar en `/checkout/success`
