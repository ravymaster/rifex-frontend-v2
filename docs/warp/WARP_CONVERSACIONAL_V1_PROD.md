# Warp Conversacional V1 en Rifex PROD — preparación

Rama `prod/warp-conversational-v1`, creada desde `main` (`a776593`). Solo local; no publicada.

## Qué incluye
- **Paquetes vendorizados** con su SHA-256:
  - `@warp-ai/assistant` **0.7.6** (`warp-ai-assistant-0.7.6-1d80866.tgz`, sha256 `69ee9113…83fd9f`); el `.tgz` 0.7.5 se conserva en `vendor/warp-sdk-lite/` para el rollback;
  - `@warp-ai/connector` 0.4.0;
  - `@warp-ai/discovery` 0.1.0.
- **Connector** con 11 capacidades, todas de lectura pública, y los 22 contextos de página:
  - las 9 `rifex.*`, idénticas a lo certificado en `develop` (`eebf189`);
  - `site.navigation.list` y `site.content.read` (Warp Discovery), con el mapa de PROD.
- **Mapa de PROD** en `src/lib/warp/site-map.json`, fuera de `public/`:
  - 15 páginas de navegación y 10 documentos, con origen fijo `https://rifex.pro`;
  - generado con `warp-discover` desde el escaneo público de rifex.pro, con aprobación humana y sin edición manual;
  - mismas entradas que el mapa aprobado en `develop`; solo cambian el origen y la fecha de escaneo;
  - `/eventos` aparece una vez; `/soluciones/eventos` (duplicado) y `/reset-password` quedan fuera.
- **Rutas de servidor:**
  - `/api/v1/discovery`;
  - `/api/warp/capabilities/[capabilityId]`;
  - `/api/warp/chat` y `/api/warp/chat/actions`;
  - `/api/warp/assistant`;
  - `/api/warp/health`.
- **Botón global del asistente** en `_app.js`. Solo aparece si el servidor lo enciende.
- **Enlaces del asistente:** solo `https://rifex.pro` es clicable; el dominio de DEV queda como texto.

## Qué NO incluye
- La página `/piloto-warp`, el banner de DEV ni otros trabajos de `develop`, como analytics o la puerta de admin de DEV.
- Cambios en autenticación, pagos, comisión, RLS, base de datos ni Mercado Pago.
- Capacidades que modifiquen datos.
- La limpieza de `rate_limit_hits` de DEV ni otros cambios posteriores de `develop` (por ejemplo, el retiro de Replicate): llegan con la publicación normal.

## Identidad de uso y límite propio (0.7.6, PR #35 y #36 de `develop`)
- **Identidad seudónima diaria hacia Warp:** el servidor calcula una referencia opaca de 32 caracteres con `WARP_USAGE_IDENTITY_SECRET`, el día UTC, la clave del sitio y la IP que Vercel escribe en `x-real-ip`. Warp la recibe en `x-warp-client-ref`; chat y acciones comparten esa referencia y un solo límite en Warp.
- **Solo dos encabezados** llegan al handler del paquete: `content-type` y `x-real-ip`. Cookies, User-Agent, `x-forwarded-for` y `x-warp-client-ref` del navegador se descartan.
- **Límite propio de Rifex sin IP en claro:** la clave en `rate_limit_hits` es `warp-pilot-<chat|actions>:h:<32 hex>`, con los primeros 32 hex de `HMAC-SHA256(RIFEX_RATE_LIMIT_KEY_SECRET, "rifex-rl:v1|<día UTC>|warp-pilot|<ip confiable>")`. Nunca coincide con la referencia enviada a Warp. 20 mensajes por 10 minutos por scope.
- **Orden de la ruta:** activación → secreto del limitador → configuración de Warp → IP confiable → limitador → Warp.
- **Fallo cerrado:**

| Situación | Resultado |
|---|---|
| Falta `RIFEX_WARP_PILOT=on` | Botón oculto; chat y acciones 404 |
| Falta `WARP_AI_API_URL` o `WARP_AI_API_KEY` | Botón oculto; 503 `ASSISTANT_NOT_CONFIGURED` |
| Falta `WARP_USAGE_IDENTITY_SECRET` o tiene menos de 32 caracteres | Botón oculto; 503 |
| Falta `RIFEX_RATE_LIMIT_KEY_SECRET`, tiene menos de 32 caracteres o es igual al de identidad | Botón oculto; 503, sin escribir en el limitador |
| Falta `x-real-ip` o no tiene formato de IP | 503, sin escribir en el limitador ni llamar a Warp |

- En PROD no hubo piloto de Warp, así que no existen claves `warp-pilot-%:ip:%` que limpiar. La retención de filas vencidas de PROD, si se decide, tendrá su propio ensayo y GO.

## Variables de PROD (solo por nombre)

| Variable | Tipo | Para qué |
|---|---|---|
| `RIFEX_WARP_PILOT` | privada (`on`) | Enciende el botón y las rutas del chat. Sin ella: botón oculto y chat 404 |
| `WARP_AI_API_URL` | privada | URL del Warp de PROD (solo servidor) |
| `WARP_AI_API_KEY` | privada, Sensitive | Clave del sitio para Warp PROD (solo servidor) |
| `WARP_USAGE_IDENTITY_SECRET` | privada, Sensitive, **nueva** | Secreto de la identidad seudónima. 64 hex, exclusivo de PROD |
| `RIFEX_RATE_LIMIT_KEY_SECRET` | privada, Sensitive, **nueva** | Secreto de la clave HMAC del limitador. 64 hex, exclusivo de PROD, distinto de `WARP_USAGE_IDENTITY_SECRET` |
| `NEXT_PUBLIC_BASE_URL` | pública | Debe ser `https://rifex.pro`; sin valor, se usa `https://rifex.pro` |
| `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_*` | existentes | Catálogo público y límite de mensajes (sin cambios) |

- Ninguna variable de Warp va en `NEXT_PUBLIC_*`.
- Los dos secretos nuevos se generan en el momento de cargarlos (por ejemplo, `openssl rand -hex 32` en tubería directa a `vercel env add <NOMBRE> production --sensitive`), sin mostrarlos ni guardarlos en archivos.
- Deben ser distintos entre sí y distintos de los de DEV. No reutilizar secretos de Warp, OpenAI ni DEV.
- Se cargan solo en el proyecto Vercel de PROD (`rifex-frontend-v2`), entorno Production.

## Comportamiento al desplegar
- `/api/v1/discovery` y `/api/warp/capabilities/*` quedan públicas apenas se despliega el código, aunque el asistente esté apagado. Solo exponen información pública de lectura.
- Sin `RIFEX_WARP_PILOT=on` y sin configuración de servidor, `/api/warp/assistant` responde `{"enabled":false}` y el botón no aparece.

## Orden de despliegue
1. **Crear Warp PROD:** sitio `rifex.pro` con las 11 capacidades, los 22 contextos, el presupuesto compartido, el gobernador y una clave propia.
2. **Publicar Discovery sin encender el Assistant:** merge a `main` y despliegue sin `RIFEX_WARP_PILOT` ni secretos de Warp.
3. **Verificar sin IA:** `/api/v1/discovery` y `/api/warp/health` con 11/11 capacidades, `/api/warp/assistant` → `{"enabled":false}`, chat 404.
4. **Cargar secretos y conexión:** `WARP_AI_API_URL`, `WARP_AI_API_KEY`, `WARP_USAGE_IDENTITY_SECRET` y `RIFEX_RATE_LIMIT_KEY_SECRET`.
5. **Encender el Assistant:** `RIFEX_WARP_PILOT=on` y redespliegue del mismo commit.
6. **QA pagado controlado:** pocas preguntas acordadas, con conteos de `rate_limit_hits` (solo `:h:`, ninguna `:ip:`).

## Rollback
- **Fase 5–6 (Assistant encendido):** quitar `RIFEX_WARP_PILOT` y redesplegar el mismo commit; el botón desaparece y el chat vuelve a 404. Discovery sigue igual.
- **Fase 4 (secretos):** quitar cualquiera de los dos secretos apaga solo el asistente (503); el resto del sitio no cambia.
- **Fase 2–3 (código):** Instant Rollback al despliegue PROD anterior y `git revert -m 1 <merge>` en `main`.
- **Fase 1 (Warp PROD):** desactivar o revocar la clave del sitio en Warp; Rifex responde 503 sin afectar el resto.
- **Solo el paquete:** volver `package.json` a `warp-ai-assistant-0.7.5-80db790.tgz` (sigue en `vendor/`) y redesplegar.
- No hay tablas ni migraciones que deshacer; las filas `:h:` son contadores efímeros.
