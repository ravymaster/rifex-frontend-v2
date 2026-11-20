# Keepalive de Supabase DEV

Evita que el proyecto Supabase DEV (`nwxrvwbzqbhznscyirbq`, plan gratuito) se pause por inactividad. Lo hace con una consulta real y mínima, disparada desde fuera de Supabase aproximadamente cada 3 días.

## Arquitectura
```
GitHub Actions (repositorio privado ravymaster/rifex-dev-keepalive)
  └─ cada ~3 días (cron "17 9 */3 * *", UTC) o manual (workflow_dispatch)
       └─ POST https://rifex-frontend-main.vercel.app/api/internal/dev-keepalive
            Authorization: Bearer <RIFEX_DEV_KEEPALIVE_SECRET>
            └─ Rifex DEV (Vercel rifex-frontend-main, rama develop)
                 └─ HEAD /rest/v1/events?select=id&limit=1 con el cliente anónimo
                      └─ Supabase DEV
```

**Por qué un repositorio aparte:**
- En GitHub Actions, `schedule` y `workflow_dispatch` solo funcionan con el workflow en la rama por defecto (`main`), y cada commit en `main` redespliega Rifex PROD.
- Vercel Cron, en el plan Hobby, no ofrece alertas de fallo ni encabezado propio.
- El repositorio privado aparte programa DEV sin tocar `main` ni PROD.

## Ruta `POST /api/internal/dev-keepalive`
- **Código:** `src/lib/devKeepalive.js` y `src/pages/api/internal/dev-keepalive.js`; pruebas en `tests/devKeepalive.test.mjs`.
- **Solo existe en Rifex DEV:** exige `isDevStage()` y que `NEXT_PUBLIC_SUPABASE_URL` tenga exactamente el host `nwxrvwbzqbhznscyirbq.supabase.co`. En PROD o en cualquier otro entorno responde 404, aunque tenga el secreto.
- **Respuestas según el secreto:**
  - sin `RIFEX_DEV_KEEPALIVE_SECRET` configurado, o con menos de 32 caracteres: 404;
  - secreto ausente o incorrecto: 401;
  - el secreto se compara en tiempo constante.
- **Método:** solo POST; cualquier otro responde 405.
- **Consulta:**
  - HEAD de solo lectura sobre `events`, con la clave anónima (sin `service_role`);
  - respeta RLS, no devuelve filas ni conteos y no escribe;
  - timeout de 5 s.
- **Respuesta:** solo `{ ok, supabase, durationMs, at }`.
  - `200 { ok: true, supabase: "ok" }`: Supabase DEV ejecutó la consulta.
  - `503 { ok: false, supabase: "error" | "timeout" }`: Supabase falló o no respondió a tiempo, sin detalles internos.
- **Log:** una línea por ejecución, `dev-keepalive supabase=<estado> durationMs=<n>`, sin secretos, IP ni encabezados.
- **Aislamiento:** no llama a Warp ni a OpenAI, y no toca pagos ni datos comerciales.

## Secretos (solo nombres)
| Nombre | Dónde |
|---|---|
| `RIFEX_DEV_KEEPALIVE_SECRET` | Vercel `rifex-frontend-main` (Rifex DEV), entorno Production, Sensitive |
| `RIFEX_DEV_KEEPALIVE_SECRET` | GitHub Actions Secret del repositorio privado `ravymaster/rifex-dev-keepalive` (mismo valor) |
| `RIFEX_DEV_KEEPALIVE_URL` | GitHub Actions Secret del repositorio privado (URL completa de la ruta DEV) |

- **Generación:** 32 bytes aleatorios en 64 hex, creados en memoria y cargados por tubería en Vercel y GitHub.
- **Lo que nunca se hace:** mostrarlo, guardarlo en git ni enviarlo al navegador.
- **Rotación:** generar un valor nuevo, cargarlo en los dos lugares y redesplegar DEV.

## Operación
- **Frecuencia:** cron `17 9 */3 * *` (UTC), los días 1, 4, 7… de cada mes. Entre el día 31 y el 1 el intervalo es de 1 día; nunca supera 3 días. GitHub puede retrasar las ejecuciones programadas unos minutos.
- **Responsable:** Rodrigo (dueño de `ravymaster`); recibe los correos de fallo de GitHub Actions.
- **Ejecución manual:** en el repositorio `ravymaster/rifex-dev-keepalive`, Actions → «Rifex DEV keepalive» → Run workflow. También con `gh workflow run dev-keepalive.yml -R ravymaster/rifex-dev-keepalive`.
- **Cómo detectar fallos:**
  - la ejecución aparece en rojo y GitHub envía un correo;
  - falla si el HTTP no es 200, si falta `ok:true` o si `supabase` no es `"ok"`;
  - el resumen del job muestra solo el estado, la duración y la hora.
- **Cómo desactivarlo:**
  - temporal: Actions → «Rifex DEV keepalive» → Disable workflow (o `gh workflow disable dev-keepalive.yml -R ravymaster/rifex-dev-keepalive`);
  - definitivo: el rollback completo de abajo.
- **Inactividad de GitHub:** GitHub puede desactivar los workflows programados de un repositorio sin actividad durante 60 días. Si pasa, se reactivan desde Actions; el README del repositorio lo recuerda.
- **Última ejecución exitosa:** ver la sección «Registro» al final.

## Rollback
1. Deshabilitar el workflow en `ravymaster/rifex-dev-keepalive`.
2. Eliminar `RIFEX_DEV_KEEPALIVE_SECRET` de Vercel DEV (`rifex-frontend-main`) y redesplegar DEV: la ruta pasa a responder 404.
3. Revertir el PR en `develop` (`git revert -m 1 <merge>` en una rama nueva).
4. No se borran datos y no se toca Supabase PROD.

## Registro
- 2026-11-20: implementación y primera ejecución manual (ver el informe en `~/warp-renacar-exchange/`).
