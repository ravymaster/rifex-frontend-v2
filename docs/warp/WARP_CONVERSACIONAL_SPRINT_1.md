# Warp Conversacional — Sprint 1 comercial (Rifex DEV)

Relación comercial del piloto asistido de Warp Conversacional dentro de Rifex. No es el Control Plane:
- no crea clientes ni claves en Warp;
- no cobra;
- no activa nada;
- no toca Token Guard, Warp DEV ni Warp PROD.

## Qué incluye
| Pieza | Archivos |
|---|---|
| Tarjeta en el catálogo de la portada | `src/pages/index.js` (card `warp-conversacional`: categoría, estado «Piloto asistido», CTA «Ver demostración»), `src/styles/index.module.css` |
| Landing pública `/warp-conversacional` | `src/pages/warp-conversacional.jsx`, `src/styles/warpConversacional.module.css` (usa `ProductSections`) |
| Demostración con preguntas sugeridas | `src/lib/warp/assistantPrefill.js`, `src/components/warp/WarpAssistantGlobal.jsx` |
| Formulario «Solicitar piloto» | `src/components/warp/WarpPilotRequestForm.jsx` |
| Validación compartida | `src/lib/warpPilotRequest.js` |
| API del usuario | `src/pages/api/warp-conversacional/solicitudes.js` → `src/lib/warpPilotServer.js` |
| API admin | `src/pages/api/admin/warp-conversacional/solicitudes/{index,[id]}.js` |
| Mis solicitudes de Warp | `src/pages/panel/warp.jsx` (enlazada desde `/mis-iniciativas`) |
| Admin «Solicitudes Warp» | `src/pages/admin/warp.jsx` (enlazada desde `/admin`) |
| Correos | `src/lib/warpPilotMailer.js` (sobre `sendEmail` de `mailer.js`, sin modificarlo) |
| Base de datos | `db/migrations/2026-11-24a_warp_pilot_requests.sql`, más `db/checks/…_check.sql` y `db/rollback/…_rollback.sql` |
| Superficie pública | `public/sitemap.xml` y `src/lib/publicSurfaceClassification.js` (3 rutas) |

## Demostración: nunca se envía sola
- Cada botón dispara el evento del navegador `rifex:warp-assistant-prefill` con una de las 5 preguntas permitidas.
- `WarpAssistantGlobal` escucha ese evento. Crea el cliente de chat del paquete (`createWarpChatClient`) con exactamente los mismos valores que usaría el paquete y se lo entrega al widget.
- Al recibir una pregunta permitida:
  - llama a `client.setDraftText(pregunta)` y `widget.open()`;
  - lleva el foco al campo del propio widget.
- **No llama a `send`.** La persona decide si la envía.
- Las preguntas que no están en la lista se ignoran.
- Si el asistente está apagado, la página muestra «El asistente no está disponible en este momento».

## Solicitud de piloto
- **Acceso:** la página es pública; para enviar se requiere sesión de Rifex.
  - Sin sesión, se guardan en `sessionStorage` solo la empresa, el dominio, el tipo de sitio, el objetivo, la información y el tráfico (nunca nombre, correo ni teléfono).
  - Luego se pide iniciar sesión con `next=/warp-conversacional#solicitar` y, al volver, el formulario se restaura.
- **Identidad:** viene del token (`auth.getUser`), nunca del cuerpo de la solicitud.
- **Inserción:** se hace con un cliente Supabase que lleva el JWT del usuario, así que RLS se aplica de verdad. `service_role` nunca se usa para el usuario.
- **Validación (cliente y servidor):**
  - **dominio:**
    - se normaliza: minúsculas, sin `www`, sin ruta;
    - se rechazan esquemas peligrosos, credenciales en la URL, puertos, IP, `localhost` y TLD internos;
    - se guarda solo el dominio y siempre se trata como https;
  - límites de longitud;
  - limpieza de caracteres de control y espacios;
  - honeypot (`website`);
  - detección de contraseñas, claves y tokens en los campos libres.
- **Rate limit:** 5 solicitudes por hora por usuario (`warp-solicitud:<user_id>`, sin IP).
- **Duplicados:** un solo pedido activo por usuario y dominio (índice único parcial). Responde 409 `duplicate_active_request`.
- **Respuesta:** identificador corto, estado y siguiente paso. Se envían los correos. No hay cobro, no se crean claves de Warp y no se activa nada.

## Seguridad en Supabase (`warp_pilot_requests`)
- **anon:** sin ningún permiso.
- **authenticated:**
  - `INSERT` de los campos del formulario, solo para sí mismo (`user_id = auth.uid()`). `status` nace en `solicitud` y no es insertable; `internal_notes` tampoco.
  - `SELECT` de sus propias filas, con permiso por columna. **`internal_notes` no es legible por ningún usuario**, ni siquiera por la API directa de Supabase.
  - `UPDATE` solo de `status` e `internal_notes`, y solo con `app_metadata.role = 'admin'`.
  - Sin `DELETE`.
- **`warp_pilot_request_history`:** RLS sin políticas; solo `service_role`.
- **Panel admin:** opera en el servidor (`resolveAdmin` + `service_role`).
- **Validación real:** `tests/warpPilotRequestsRls.test.mjs` corre la migración sobre Postgres (PGlite) con los roles de Supabase emulados: dos usuarios, un admin y anon. Ejecución: `PGLITE_PATH=<ruta a @electric-sql/pglite/dist/index.js> node --test tests/warpPilotRequestsRls.test.mjs`.

## Correos
- **Cliente:** identificador, dominio, siguiente paso, aviso de que no hay cobro ni activación, y enlace a `/panel/warp`.
- **Admin:** usuario, empresa, dominio, tipo de sitio y enlace a `/admin/warp?id=…`.
  - Destinatarios: `ADMIN_EMAILS` (variable existente).
  - Si no está configurada, el aviso se omite. **Rifex DEV hoy no tiene `ADMIN_EMAILS`**, así que en DEV solo sale el correo al cliente, y solo si `ENABLE_EMAILS=true`.
- **Nunca incluyen** el texto libre completo, notas internas ni secretos.
- Un fallo de Resend no cambia el resultado de la solicitud.

## Preparación para Discovery (sin reescaneo)
- **Contenido legible:** la página es HTML estático y semántico (`h1`/`h2`, listas, FAQ y JSON-LD Service + FAQPage) e incluye nombre, descripción, funciones, precio del piloto, instalación, seguridad, límites y proceso de solicitud.
- **Indexación:** está en `sitemap.xml` y no está bloqueada por `robots.txt`.
- **Pendiente para cuando haya GO de reescaneo; no se tocó nada de esto:**
  1. **Mapa aprobado (`src/lib/warp/site-map.json`):** hay que regenerarlo con `warp-discover` y aprobarlo de nuevo, con la persona que aprueba ejecutando el script, para sumar `/warp-conversacional` a la navegación y como documento de contenido. No se edita a mano. Discovery seguiría en **11 capacidades**; solo cambian las entradas de `site.navigation.list` y `site.content.read`.
  2. **`rifex.services.list` (`src/lib/warp/rifexServices.js`):** si se quiere que el asistente lo nombre como servicio, hay que agregar «Warp Conversacional» a la lista. Cambia la respuesta de la capacidad, no su contrato.
  3. **Contextos de página (`src/lib/warp/pageContexts.js`):** opcionalmente, un contexto `warp-commercial` para `/warp-conversacional`. Pasarían de 22 a 23, y hay que avisar a Warp antes.
  4. **Ayuda (`rifexHelp.js`):** opcionalmente, un tema «Cómo contratar Warp Conversacional».
- PROD no cambia nada de esto hasta su propio GO.

## Rollback
1. **Código:** `git revert -m 1 <merge>` en una rama nueva, con PR a `develop`.
2. **Base DEV:** primero `db/checks/2026-11-24a_warp_pilot_requests_check.sql` (conteos); luego, si corresponde, `db/rollback/2026-11-24a_warp_pilot_requests_rollback.sql`. Borra las solicitudes guardadas; no toca otras tablas.
3. **Desactivar solo el formulario:** revertir el commit del formulario o de la API. La página y la tarjeta pueden quedar.
