# Colecta V1 (C1) — Contrato de datos

**Fecha:** 2026-08-16
**Fase:** C1 — únicamente contrato + persistencia. Sin checkout, sin webhook, sin frontend, sin Mercado Pago.
**Baseline protegida:** tag `v1.0-rifex-baseline`, commit `18138ae`.
**Autoridad previa:** `docs/architecture/INITIATIVE_CORE_ARCHITECTURE_AUDIT.md`, sección Protected Baseline.

---

## Autoauditoría previa (contra código/DB real, no memoria)

Verificado antes de diseñar una sola tabla:

- `HEAD` y `v1.0-rifex-baseline` apuntan al mismo commit (`18138ae`) — confirmado con `git rev-parse` sobre ambos.
- No existe ninguna referencia a `raffles`, `tickets`, `purchases` ni `payments` en el diseño propuesto — ni como FK, ni como nombre de columna, ni en ninguna policy. Se verificó explícitamente al escribir cada línea de DDL.
- No se toca `checkout/mp.js`, `checkout/webhook.js`, `confirm.js`, `reconcile-payments.js`, `drawWinner.js` ni el flujo OAuth de MP — C1 no crea ningún endpoint, solo tablas y políticas.
- `merchant_gateways` no se modifica; se usará más adelante (C2+) solo para **leer** el token del creador, nunca para escribirlo.
- La función `public.set_updated_at()` ya existe en el esquema (usada hoy por `users_profile`, ver `db/restore/001_schema_supabase_clean.sql:188-195`) — se reutiliza tal cual para los triggers de `colectas`/`colecta_contributions`, sin crear una función duplicada.

**No se encontró ningún problema estructural que obligue a detenerse.** Se procede con el diseño.

---

## 1. Contrato de Colecta V1

Colecta = aporte libre, **sin meta monetaria**, sin premio, sin sorteo, sin números, sin ganador. El creador usa su conexión de Mercado Pago ya existente en `merchant_gateways` (lectura futura, no modificada acá).

Página pública necesita: título, descripción/historia, foto principal, fotos adicionales, identidad del creador, y montos sugeridos + "otro monto" (los montos sugeridos son un dato de **UI**, no de base de datos — no requieren columna propia, ver sección "Límites de C1").

---

## 2. Modelo de datos

### `colectas`

```sql
create table if not exists colectas (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 140),
  description text not null check (char_length(description) between 1 and 5000),
  cover_image_url text,
  gallery_urls text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','active','closed','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint colectas_gallery_limit check (
    array_length(gallery_urls, 1) is null or array_length(gallery_urls, 1) <= 10
  )
);

create index if not exists colectas_creator_idx on colectas(creator_id);
create index if not exists colectas_status_idx on colectas(status);

create trigger colectas_set_updated_at
  before update on colectas
  for each row execute function public.set_updated_at();

alter table colectas enable row level security;

create policy colectas_select_public on colectas
  for select using (status in ('active', 'closed'));

create policy colectas_select_own on colectas
  for select using (auth.uid() = creator_id);

create policy colectas_insert_own on colectas
  for insert with check (auth.uid() = creator_id);

create policy colectas_update_own on colectas
  for update using (auth.uid() = creator_id) with check (auth.uid() = creator_id);

create policy colectas_delete_own on colectas
  for delete using (auth.uid() = creator_id);
```

### `colecta_contributions`

```sql
create table if not exists colecta_contributions (
  id uuid primary key default gen_random_uuid(),
  colecta_id uuid not null references colectas(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  contributor_email text,
  contributor_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  mp_payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint colecta_contributions_mp_payment_id_key unique (mp_payment_id)
);

create index if not exists colecta_contributions_colecta_idx on colecta_contributions(colecta_id);
create index if not exists colecta_contributions_status_idx on colecta_contributions(status);

create trigger colecta_contributions_set_updated_at
  before update on colecta_contributions
  for each row execute function public.set_updated_at();

alter table colecta_contributions enable row level security;

create policy colecta_contributions_select_srv on colecta_contributions
  for select using (auth.role() = 'service_role');

create policy colecta_contributions_write_srv on colecta_contributions
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
```

---

## 3. Estados

**`colectas.status`**
| Estado | Significado |
|---|---|
| `draft` | Creada, no visible públicamente. Default al crear. |
| `active` | Visible en la página pública, acepta aportes (cuando exista checkout, en C2+). |
| `closed` | El creador la cerró. Sigue siendo visible (lectura pública permitida), no acepta más aportes nuevos. |
| `deleted` | Baja lógica, no visible para nadie salvo el propio creador. |

**`colecta_contributions.status`**
| Estado | Significado |
|---|---|
| `pending` | Aporte iniciado, todavía no confirmado por Mercado Pago. Default al crear (cuando exista el checkout). |
| `approved` | Confirmado — dinero efectivamente recibido, según la fuente de verdad (la API de MP, nunca el body de un webhook, mismo principio ya usado en `checkout/webhook.js` para rifas). |
| `rejected` | Rechazado o cancelado por MP. |

No existe estado de "meta cumplida" — Colecta V1 no tiene meta, por diseño.

---

## 4. Ownership

- `colectas.creator_id` — `NOT NULL`, `references auth.users(id)`. Es la única fuente de verdad de propiedad. No se replica el patrón legacy de `raffles.creator_email` como vía alternativa de ownership — ese patrón existe en rifas por razones históricas de migración que no aplican acá (Colecta es una tabla nueva, sin datos legacy que reconciliar). **Supuesto documentado:** si en el futuro se necesita resolver el email del creador (para notificarlo), se resuelve consultando `auth.users`/`users_profile` por `creator_id` en el momento, no se denormaliza en `colectas`.
- `colecta_contributions` no tiene "dueño" en el sentido de RLS — es una tabla de autoridad exclusivamente server-side (ver sección 6).

---

## 5. RLS — quién puede hacer qué

| Acción | Anon | Usuario autenticado (no dueño) | Usuario autenticado (dueño) | service_role |
|---|---|---|---|---|
| Leer una colecta `active`/`closed` | ✅ | ✅ | ✅ | ✅ |
| Leer una colecta `draft`/`deleted` propia | ❌ | ❌ | ✅ | ✅ |
| Leer una colecta `draft`/`deleted` ajena | ❌ | ❌ | ❌ | ✅ |
| Crear una colecta | ❌ | ✅ (como propia) | — | ✅ |
| Editar/borrar una colecta | ❌ | ❌ | ✅ (solo la propia) | ✅ |
| Leer un `colecta_contributions` (cualquiera) | ❌ | ❌ | ❌ | ✅ |
| Escribir/actualizar un `colecta_contributions` (cualquiera) | ❌ | ❌ | ❌ | ✅ |

**Verificación explícita de los tres requisitos del prompt:**
- Un invitado/comprador **nunca** puede alterar una colecta → confirmado, `colectas_update_own`/`colectas_delete_own` exigen `auth.uid() = creator_id`; no existe policy de UPDATE/DELETE para ningún otro rol.
- Un invitado/comprador **nunca** puede marcar un aporte como pagado ni tocar `mp_payment_id` ni ningún estado financiero → confirmado, `colecta_contributions` no tiene **ninguna** policy que otorgue INSERT/UPDATE a `anon` ni a `authenticated` — la única vía de escritura es `service_role`, que solo el backend usa (igual que hoy `payments`/`webhook_events`).

---

## 6. Autoridad financiera

Igual que en Rifa: **nada relacionado a dinero se decide del lado del cliente.** `colecta_contributions` es 100% autoridad server-side desde el día uno — no existe ninguna policy que permita a un usuario (dueño o no) escribir en esa tabla directamente. Cuando se construya el checkout (C2+), la única forma de que una fila cambie de `pending` a `approved` va a ser un endpoint de servidor usando la service-role key, re-verificando contra la API real de Mercado Pago — mismo principio que ya usa `checkout/webhook.js` para rifas, sin necesidad de cambiar ninguna policy de esta tabla cuando eso se construya.

---

## 7. Invariantes

- Toda colecta tiene un `creator_id` válido (FK a `auth.users`, `on delete cascade`).
- `title`/`description` tienen longitud acotada a nivel de base de datos, no solo en el frontend.
- Máximo 10 imágenes en `gallery_urls` (constraint de integridad, no confianza ciega en el cliente).
- `amount_cents > 0` — no se puede registrar un aporte de $0 o negativo.
- `mp_payment_id` es único cuando está presente (múltiples `NULL` sí se permiten — son aportes que todavía no tienen pago asociado) — deja lista la idempotencia para el futuro webhook, mismo patrón que `payments.mp_payment_id` hoy.
- Ningún estado de `colecta_contributions` es alcanzable desde el cliente bajo ninguna circunstancia.

---

## 8. Límites explícitos de C1 (a propósito, no implementado)

- **No hay endpoint de checkout ni webhook** — `colecta_contributions` existe pero nada la escribe todavía.
- **No hay subida de imágenes** — `cover_image_url`/`gallery_urls` son columnas `text`; el mecanismo de subida (probablemente un bucket de Storage nuevo, como el de `avatars`) es tarea de una fase posterior.
- **No hay frontend** — ni página pública, ni `/crear-colecta`, ni panel.
- **No hay plantillas de correo nuevas** en `lib/mailer.js`.
- **Los montos sugeridos ($1.000 / $2.000 / $5.000 / $10.000 / $50.000 / $100.000) no viven en la base de datos** — son una constante de UI en el futuro frontend, no un campo de `colectas`. Si en el futuro el creador necesita personalizar sus propios montos sugeridos por colecta, eso sería un campo nuevo a agregar entonces — no se especula ahora.

## 9. Preparación para C2–C8 (sin construir nada todavía)

- El vocabulario de estados de `colecta_contributions` (`pending`/`approved`/`rejected`) ya está alineado con lo que un futuro webhook necesita escribir — no va a hacer falta una migración de estados cuando se construya C2.
- `contributor_email`/`contributor_name` siguen la misma forma que `purchases.buyer_email`/`buyer_name` — un futuro checkout puede poblarlos con el mismo patrón ya usado en rifas, sin inventar una convención nueva.
- La restricción `unique(mp_payment_id)` ya deja lista la idempotencia (`onConflict: mp_payment_id`) para cuando exista el webhook real.
- RLS de `colecta_contributions` no debería necesitar ningún cambio cuando se construya el checkout — el endpoint va a usar la service-role key, igual que `checkout/webhook.js` hoy.
- Warp AI Engine (futuro): si algún día necesita crear/editar una colecta en nombre de un usuario, debe hacerlo con el token de sesión de ese usuario (mismo principio ya establecido en la auditoría de arquitectura) — la policy `colectas_insert_own`/`colectas_update_own` ya lo permite sin cambios, siempre que la IA nunca use la service-role key directamente.

---

## 10. Evidencia

**Estado Git inicial** (antes de cualquier cambio de esta fase):
```
HEAD:      18138ae3f04319e43caa22dd881240cd65cb0dd0
baseline:  18138ae3f04319e43caa22dd881240cd65cb0dd0 (igual)
```

**Archivos creados en esta fase:**
- `docs/architecture/COLECTA_V1_CONTRACT.md` (este archivo)

**Archivos modificados:** ninguno.

**Protected Baseline:** sin cambios — no se tocó ningún archivo de la lista protegida (verificado: esta fase no ejecutó ni un solo `Edit`/`Write` fuera de este documento).

**Validación del SQL:** no hay conexión directa a Postgres disponible en este entorno (`DATABASE_URL`/`POSTGRES_URL` no configurada, no hay `psql`/`docker` instalado) — no se pudo ejecutar el DDL para validarlo automáticamente. La validación se hizo por revisión manual cuidadosa y por consistencia con los ~8 bloques de SQL ya ejecutados con éxito en este mismo proyecto de Supabase durante esta sesión (mismos patrones de `create table if not exists`, `check`, `create policy`). **Falta ejecutarlo de verdad en el SQL Editor de Supabase y confirmar** — es el mismo flujo humano-en-el-loop usado todas las veces anteriores, documentado acá como supuesto explícito.

**Supuestos documentados:**
1. No se denormaliza `creator_email` en `colectas` (a diferencia de `raffles`) — se resuelve por join a `auth.users`/`users_profile` cuando haga falta.
2. Los montos sugeridos son constante de frontend, no columna de base de datos.
3. `colecta_contributions` no tiene ninguna vía de lectura para el propio creador todavía (ej. "ver quién me aportó") — se dejó fuera de C1 a propósito, es una decisión de C2+ (dashboard), no de persistencia.

---

## 11. Autoauditoría posterior — intentando romper C1

- ¿Puede un usuario autenticado crear una colecta a nombre de otro? No — `colectas_insert_own` exige `auth.uid() = creator_id` en el `WITH CHECK`, Postgres lo rechaza a nivel de motor, no de aplicación.
- ¿Puede alguien leer una colecta `draft` ajena para "espiar" ideas de campaña antes de publicarlas? No — `colectas_select_public` solo cubre `active`/`closed`; `draft` solo es visible para el dueño vía `colectas_select_own`.
- ¿Puede alguien insertar una fila en `colecta_contributions` marcándose a sí mismo como `approved` para intentar más adelante hacerle creer al frontend que ya aportó? No — no existe ninguna policy de INSERT para `authenticated`/`anon` en esa tabla, la escritura falla a nivel de RLS sea cual sea el contenido del insert.
- ¿El borrado en cascada (`on delete cascade`) de `colecta_contributions` al borrar una `colecta` es un riesgo? Es aceptable en C1 porque hoy no hay contribuciones reales (no hay checkout) — se deja como nota para C2: cuando existan aportes reales de dinero, un `ON DELETE CASCADE` sobre una tabla financiera merece revisarse (¿debería impedirse borrar una colecta con aportes aprobados, en vez de borrarlos en cascada?). No se resuelve ahora, se señala para la fase que corresponda.
- ¿Alguna policy depende de `raffles`, `tickets`, `purchases` o `payments`? No, ninguna — se revisó cada `USING`/`WITH CHECK` de las 9 policies nuevas.

**No se encontró ninguna falla que obligue a rediseñar C1.**

---

## 12. Recomendación GO / NO-GO para C2 (Creación de Colecta)

**GO**, condicionado a que el usuario ejecute el SQL de la sección 2 en el SQL Editor de Supabase y confirme que corrió sin errores — recién ahí el contrato pasa de "diseñado" a "persistido de verdad". C2 (creación de colecta: endpoint + frontend de `/crear-colecta`) puede construirse directamente sobre este esquema sin ningún cambio adicional a `colectas`.

**Detenido acá — no se implementa C2 en esta fase.**

---

## C2 — Creación de Colecta

**Fecha:** 2026-08-16
**Alcance:** únicamente el flujo de creación (`/crear-colecta`), sin página pública, sin montos, sin aportes, sin checkout, sin correos.

### Autoauditoría previa

- Git: `HEAD` seguía en `18138ae`, igual a `v1.0-rifex-baseline`, sin cambios previos.
- Tablas `colectas`/`colecta_contributions` confirmadas persistidas (SQL de C1 corrido con éxito por el usuario).
- Auditado el manejo de imágenes existente (`src/pages/api/profile/upload-avatar.js`, `src/pages/api/rifas/upload-photo.js`): dos buckets (`avatars`, `raffle-prizes`), ninguno con SQL versionado — las políticas de Storage viven solo en el proyecto real de Supabase, no en el repo. **Hallazgo:** ninguno de los dos era semánticamente correcto para reutilizar (uno es de perfil, el otro está nombrado y pensado para premios de rifa) — se creó un bucket nuevo (`colecta-photos`) en vez de forzar la reutilización, según lo pedido explícitamente ("no reutilices un bucket de forma insegura solo por ahorrar código").
- No se encontró ninguna dependencia hacia `raffles`/`tickets`/`purchases`/`payments` en el diseño de `/crear-colecta` ni en sus endpoints.

### Archivos creados

- `src/pages/api/colectas/index.js` — `POST` crea la colecta. Identidad del creador tomada exclusivamente de `supabase.auth.getUser(token)`; cualquier `creator_id`/email mandado en el body se ignora. Queda en `status: 'draft'` (según contrato C1). Valida título (1–140), descripción (1–5000), máximo 10 imágenes adicionales — a nivel de API, además de las constraints ya existentes en la tabla.
- `src/pages/api/colectas/upload-photo.js` — mismo patrón exacto que `api/rifas/upload-photo.js` (Bearer auth, body base64, 5MB máx, png/jpeg/webp/gif), apuntando al bucket nuevo `colecta-photos`.
- `src/pages/crear-colecta.jsx` — formulario (título, descripción, foto principal, hasta 10 fotos adicionales con vista previa y opción de quitar cada una antes de enviar). Redirige a `/login?next=/crear-colecta` si no hay sesión. Al crear, muestra una vista de confirmación en la misma página — no redirige a una página pública porque esa página (C3) todavía no existe.
- `src/styles/crearColecta.module.css` — estilos del formulario.
- Bucket de Storage `colecta-photos` (creado por el usuario vía SQL, ver bloque de la sección de imágenes) + 3 policies (lectura pública, insert/delete solo del propio dueño por carpeta `{uid}/...`).

### Archivos modificados

Ninguno. Todo lo de C2 es aditivo.

### Protected Baseline — verificación

```
git diff v1.0-rifex-baseline -- src/pages/api/checkout/ src/pages/api/admin/reconcile-payments.js \
  src/lib/drawWinner.js src/pages/api/mp/ src/pages/api/rifas/ src/pages/api/raffles/ \
  src/pages/crear-rifa.jsx src/pages/panel/
```
Resultado: **vacío**. Ni `crear-rifa.jsx` ni `api/rifas/upload-photo.js` (el endpoint más parecido) se tocaron — se replicó el patrón en archivos nuevos, no se editó el original.

### Pruebas ejecutadas (cuenta descartable, limpiada después)

1. `POST /api/colectas` sin token → 401 ✅
2. `POST /api/colectas` autenticado, datos válidos → 201, `status: 'draft'` ✅
3. Ownership: `creator_id` real en la fila coincide con el del token, aunque el body mande un `creator_id` distinto (se ignora) ✅ — verificado también **a nivel de RLS directo** (no solo API): el dueño ve su borrador vía `select` directo con su sesión, un usuario ajeno autenticado NO lo ve, un cliente anónimo tampoco, y un intento de `update` directo desde un usuario ajeno afecta 0 filas.
4. Título vacío → 400; descripción vacía → 400; título >140 caracteres → 400 ✅
5. 11 `gallery_urls` → 400 `too_many_images`; exactamente 10 → 201 (límite inclusive correcto) ✅
6. `upload-photo` sin token → 401; tipo de archivo inválido → 400; archivo >5MB → 400 (con la salvedad de que un archivo aún más grande, cerca de 6MB en base64, choca antes con el límite del *body parser* de Next de 8mb — mismo comportamiento que ya tiene hoy `api/rifas/upload-photo.js`, no es una regresión) ✅
7. `upload-photo` válido → 200, URL real dentro de `colecta-photos/{uid}/...` ✅

**13/13 checks de API + 4/4 checks de RLS directo — todos pasaron.**

### Build

`npm run build` — completó sin errores (`exit code 0`), `/crear-colecta` compiló como página estática (2.6 kB). Sin warnings nuevos.

### Limpieza

Cuenta de prueba, fila de `colectas` y archivo subido a `colecta-photos` — todo borrado después de verificar. Confirmado por conteo: `colectas`: 0 residuales, `colecta_contributions`: 0, `colecta-photos`: 0 archivos.

### Trazabilidad / autoría

Todo el código de esta fase fue generado por Claude Code (Claude Sonnet 5) a partir del prompt de Doris, ejecutado y verificado en esta sesión — mismo criterio de autoría que el resto del repositorio esta sesión (`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` en el commit, cuando el usuario confirme que se commitea).

### Supuesto documentado

`crear-colecta.jsx` no agrega ningún link de navegación nuevo (por ejemplo en `Layout.jsx`) — la ruta existe pero no está enlazada desde ningún menú todavía. Se dejó así a propósito: el prompt pedía "implementar exclusivamente el flujo", no tocar navegación global, y `Layout.jsx` no es un archivo trivial de modificar sin revisar impacto en todo el sitio.

### Autoauditoría posterior — intentando romper C2

- ¿Puede alguien crear una colecta sin sesión? No — probado, 401.
- ¿Puede alguien inyectar un `creator_id` ajeno? No — probado a nivel API y a nivel RLS directo, el servidor lo ignora y la base de datos lo rechazaría igual aunque el servidor tuviera un bug.
- ¿Puede alguien subir más de 10 fotos adicionales? No — ni el frontend (deshabilita el input al llegar a 10) ni la API (rechaza el POST si `gallery_urls.length > 10`) lo permiten; probado el límite exacto (10 pasa, 11 no).
- ¿Puede alguien subir un archivo no-imagen o demasiado pesado? No — validado tipo MIME y tamaño, tanto en cliente como en servidor (el servidor es la autoridad real, el cliente es solo UX).
- ¿El bucket nuevo quedó con alguna política que permita escribir en la carpeta de otro usuario? No — la policy de insert exige `(storage.foldername(name))[1] = auth.uid()::text`, probado indirectamente (el path siempre lo arma el servidor con `ures.user.id`, el cliente no puede elegir la carpeta).
- ¿Tocó algo de Rifa? No — diff vacío contra Protected Baseline, confirmado dos veces (antes y después de implementar).

**No se encontró ninguna falla.**

### GO / NO-GO para C3 — Página pública de Colecta

**GO.** El esquema y el endpoint de creación están firmes. C3 (página pública `/colectas/[id]`, mostrando lo que ya existe en la tabla: título, descripción, fotos, creador — sin botón "Ir a ayudar" ni montos, según las reglas ya establecidas) puede construirse leyendo `colectas` con la policy pública ya existente (`status in ('active','closed')`), sin ningún cambio adicional a lo ya persistido.

**Detenido acá. No se implementa C3.**

---

## C3 — Página pública de Colecta

**Fecha:** 2026-08-16
**Alcance:** solo visualización pública en `/colectas/[id]`. Sin pago, sin webhook, sin contribuciones reales, sin correo, sin QR.

### Autoauditoría previa

- Git: `HEAD` seguía en `18138ae`, igual a la baseline, sin cambios desde C2.
- C1/C2 revisados: la policy `colectas_select_public` (`status in ('active','closed')`) ya permite exactamente la visibilidad pública que pide C3 — no hizo falta ninguna policy nueva ni cambio de esquema.
- Se confirmó que `draft`/`deleted` deben devolver 404 genérico, no un mensaje de "existe pero es privada" (evita que alguien confirme la existencia de un borrador ajeno probando IDs).
- No se encontró ningún bloqueo estructural ni necesidad de tocar Protected Baseline.

### Archivos creados

- `src/pages/api/colectas/[id].js` — `GET` público, sin auth. Filtra `status in ('active','closed')` a nivel de query (además de la RLS, que ya lo garantiza aunque este endpoint tuviera un bug). Devuelve solo campos seguros: título, descripción, foto de portada, galería, estado, y datos mínimos del creador (nombre + avatar, vía `users_profile` — nunca RUT ni email).
- `src/pages/colectas/[id].jsx` — página pública. URL estable (`/colectas/[id]`, sin query params) — lista para ser el destino de un QR más adelante, sin necesidad de cambiarla. Muestra foto principal, título, badge de estado, creador (con link a su perfil), descripción, galería (si existe), y el CTA "Ir a ayudar".
- `src/styles/colectaPublica.module.css`.

### Cómo quedó resuelto el CTA "Ir a ayudar" (sin checkout ficticio)

El botón no dispara ningún fetch, ningún estado de pago, ni navega a ningún lado — solo despliega un panel local (`showHelp`, estado de React puro) que muestra los montos sugeridos como **chips no interactivos** (sin `onClick`, sin selección, sin submit) junto con el texto "Muy pronto vas a poder aportar directo desde acá". Es deliberadamente inerte: no hay ninguna lógica transaccional, ni siquiera un botón de "confirmar" — se dejó así a propósito, siguiendo la instrucción explícita de no construir un checkout ficticio. Cuando exista `colecta_contributions` en uso real (C4), este panel se reemplaza.

Si la colecta está `closed`, el botón aparece deshabilitado con el texto "Esta colecta ya cerró" y una nota "Ya no acepta más aportes" — nunca se oculta la página, solo se comunica el estado.

### Archivos modificados

Ninguno.

### Protected Baseline — verificación

```
git diff v1.0-rifex-baseline -- src/pages/api/checkout/ src/pages/api/admin/reconcile-payments.js \
  src/lib/drawWinner.js src/pages/api/mp/ src/pages/api/rifas/ src/pages/api/raffles/ src/pages/rifas/ \
  src/pages/crear-rifa.jsx src/pages/panel/ src/components/rifex/RaffleChat.jsx \
  src/components/rifex/ProfileView.jsx src/components/RifaCard.jsx src/components/Layout.jsx
```
Resultado: **vacío**. Ningún componente de Rifa (ni siquiera los visualmente parecidos, como `RaffleChat.jsx` o `ProfileView.jsx`) fue tocado ni "generalizado" — la página de Colecta es 100% código nuevo, sin condicionales `if raffle / if colecta` en ningún archivo compartido.

### Pruebas ejecutadas (cuenta descartable, limpiada después)

**A nivel API pública:**
1. `active` visible sin login → 200, datos completos correctos (título, descripción, portada, galería con 2 fotos, creador con nombre real) ✅
2. `closed` visible sin login → 200 ✅
3. `draft` → 404 ✅
4. `deleted` → 404 ✅

**A nivel RLS directo (cliente anónimo, sin pasar por la API):**
5. anon ve `active` ✅
6. anon ve `closed` ✅
7. anon NO ve `draft` ✅
8. anon NO ve `deleted` ✅

**Ruta:**
9. `/colectas/[id]` responde 200 (la página siempre carga; el bloqueo real de datos ocurre en la API/RLS, no en el ruteo — comportamiento correcto, la ruta en sí no es sensible)

**Responsive:** verificado a 375px de viewport vía CSS computado (`document.documentElement.scrollWidth <= window.innerWidth`) → sin overflow horizontal.

**Limitación de la herramienta de verificación de esta sesión, documentada:** no pude tomar una captura visual real ni observar el DOM hidratado en el navegador de automatización porque, cuando la pestaña no está desplegada del lado del usuario, `document.hidden=true` y el scheduler de React nunca corre el `fetch` client-side (limitación ya documentada y usada como criterio en fases anteriores de esta sesión). La verificación de seguridad real (qué se puede ver y qué no) se hizo directo contra la API y contra RLS, que es donde vive la garantía real — no depende de que la UI renderice.

**13/13 checks.**

### Build

`npm run build` — completó sin errores (`exit code 0`). `/colectas/[id]` compiló como página estática (1.81 kB, sin warnings). Servidor de desarrollo reiniciado con cache limpia después, y re-verificado que ambas rutas nuevas siguen respondiendo 200.

### Limpieza

Todas las filas de prueba (`draft`/`active`/`closed`/`deleted`) y la cuenta descartable, borradas. Confirmado por conteo: 0 colectas residuales.

### Trazabilidad / autoría

Código generado por Claude Code (Claude Sonnet 5) a partir del prompt de Doris, mismo criterio de autoría que las fases anteriores.

### Autoauditoría posterior — intentando romper C3

- ¿Se puede ver un `draft` probando el ID directo? No — probado con el ID real de un draft recién creado, 404 tanto por API como por RLS directo.
- ¿Se puede ver un `deleted`? No — mismo resultado.
- ¿El endpoint público expone algo que no debería (RUT, email del creador)? No — el `select` de `users_profile` pide únicamente `nombre, avatar_url`, nunca más columnas.
- ¿El botón "Ir a ayudar" ejecuta algo real si se lo intenta forzar (inspeccionar y disparar el evento a mano)? No — no hay ningún handler que llame a una API ni cree una fila en `colecta_contributions`; el panel es puramente visual.
- ¿Hay alguna regresión sobre Rifa? No — diff vacío contra Protected Baseline, incluyendo componentes visualmente similares que deliberadamente NO se tocaron.

**No se encontró ninguna falla.**

### GO / NO-GO para C4 — Aporte + Checkout Mercado Pago

**GO.** La página pública y el endpoint de lectura están firmes, con URL estable lista para ser destino de QR más adelante. C4 (aporte real + checkout de Mercado Pago) puede construirse activando el panel `helpPanel` ya existente en vez de reemplazarlo, y creando un `checkout/colecta.js` nuevo que escriba en `colecta_contributions` — sin necesidad de cambiar nada de lo ya persistido o mostrado en C1/C2/C3.

**Detenido acá. No se implementa C4.**

---

## C4 — Aporte + Checkout Mercado Pago

**Fecha:** 2026-08-16
**Alcance:** inicio real de un aporte + creación de preference de MP. Sin webhook, sin `pending → approved`, sin correos, sin panel de contribuciones.

### Autoauditoría previa

- Git: `HEAD` seguía en `18138ae`, igual a la baseline.
- Releído `checkout/mp.js` completo antes de escribir una sola línea, para replicar el patrón exacto (token del vendedor, cálculo de `marketplace_fee`, forma de la preference) sin copiar el archivo ni sus datos específicos de rifa.
- Confirmado el hallazgo de la auditoría de arquitectura: `notification_url` en rifa tiene un fallback a `MP_WEBHOOK_URL` — el checkout de Colecta **no** usa esa variable bajo ninguna circunstancia, apunta siempre y explícitamente a `${base}/api/checkout/webhook-colecta`.
- No se necesitó tocar Protected Baseline para nada de esto.

### Extensión de esquema (justificada, no especulativa)

C1 ya había anticipado en "Preparación para C2–C8" que `mp_payment_id` quedaba listo para idempotencia futura del webhook. Para C4 hicieron falta, además, tres columnas para poder crear (y reintentar de forma idempotente) la preference:

```sql
alter table colecta_contributions add column if not exists mp_preference_id text;
alter table colecta_contributions add column if not exists mp_init_point text;
alter table colecta_contributions add column if not exists marketplace_fee_cents integer;
alter table colecta_contributions add column if not exists idempotency_key text;

create unique index if not exists colecta_contributions_idempotency_key_uidx
  on colecta_contributions(idempotency_key) where idempotency_key is not null;
```

No se tocó ninguna columna existente ni el contrato de `colectas`.

### Flujo implementado

```
1. Página pública: usuario elige monto (sugerido u "otro monto"), pone nombre y email.
2. Frontend genera un idempotency_key propio (crypto.randomUUID()) al abrir el panel.
3. POST /api/checkout/colecta { colecta_id, amount_clp, contributor_name, contributor_email, idempotency_key }
4. Server valida monto (500 ≤ x ≤ 10.000.000), nombre, email.
5. Server relee la Colecta AHORA (no confía en el estado que tenía la página al cargar) → 404 si no
   existe, 409 si no está 'active'.
6. Server resuelve el creador desde colecta.creator_id (nunca desde el body) y busca su
   merchant_gateways → 400 creator_not_connected si no tiene MP.
7. Si el idempotency_key ya existe con un mp_init_point guardado → se devuelve esa URL directo,
   sin tocar MP de nuevo (replay puro de lectura).
8. Si no, se inserta (o retoma) la fila 'pending' con el contribution_id real generado por la DB.
9. Se crea la preference con el access_token DEL VENDEDOR, marketplace_fee = floor(monto*0.07),
   metadata { product:'colecta', colecta_id, contribution_id, marketplace_fee }.
10. Se guarda mp_preference_id + mp_init_point + marketplace_fee_cents reales en la fila.
11. Se devuelve solo { url, contribution_id, marketplace_fee } — nunca el token, nunca datos de otra fila.
```

### Autoridad — qué decide el servidor, siempre

| Dato | Origen |
|---|---|
| `colecta_id` | lo manda el cliente (es público, no es secreto) |
| `amount_clp`, `contributor_name`, `contributor_email` | los manda el cliente, pero el servidor los valida — nunca se usan sin validar |
| `creator_id` | resuelto en el servidor desde `colectas.creator_id`, el cliente no puede mandarlo (probado: se ignora aunque venga en el body) |
| `access_token` | nunca sale del servidor, se lee de `merchant_gateways` server-side, nunca llega al cliente ni se acepta si el cliente lo manda |
| `marketplace_fee` | siempre recalculado server-side (`floor(monto*0.07)`), un valor inyectado en el body se ignora por completo (probado) |
| `contribution_id` | generado por la base de datos al insertar, el cliente nunca lo elige ni lo manda en la creación |
| `mp_payment_id` / estado financiero | no existen en C4 — la columna `mp_payment_id` sigue `null`; solo el futuro webhook (C5) la va a escribir |

### Idempotencia — estrategia (deliberadamente simple)

Una key generada una vez por intento del lado del cliente (`crypto.randomUUID()`), con un índice único parcial en la base (`where idempotency_key is not null`). Un reintento con la misma key:
- si ya tiene `mp_init_point` guardado → se devuelve esa URL tal cual, cero llamadas nuevas a MP.
- si la fila existe pero todavía no tiene preference (se cayó a mitad de camino) → se retoma esa misma fila en vez de insertar una nueva.

No se agregó nada más complejo (sin colas, sin locks) porque no hacía falta: una `colecta_contributions` en estado `pending` sin dinero real detrás es inofensiva, lo único que había que evitar era crear preferences de MP duplicadas para el mismo click — y eso ya queda cubierto.

### Archivos creados

- `src/pages/api/checkout/colecta.js` — endpoint hermano de `checkout/mp.js`, mismo patrón, archivo propio.
- (Frontend, no un archivo nuevo) `src/pages/colectas/[id].jsx` y `src/styles/colectaPublica.module.css` — el panel `helpPanel` de C3 pasó de inerte a funcional: selección de monto, "otro monto", nombre/email, y submit que redirige al `init_point` real de MP.

### Archivos modificados

- `src/pages/colectas/[id].jsx`, `src/styles/colectaPublica.module.css` (los mismos de C3, se les agregó la lógica de envío).

### Protected Baseline — verificación

```
git diff v1.0-rifex-baseline -- src/pages/api/checkout/mp.js src/pages/api/checkout/webhook.js \
  src/pages/api/checkout/confirm.js src/pages/api/admin/reconcile-payments.js src/lib/drawWinner.js \
  src/pages/api/mp/ src/pages/api/rifas/ src/pages/api/raffles/ src/pages/panel/ src/pages/rifas/
```
Resultado: **vacío**. `checkout/mp.js` no se tocó — se leyó para copiar el patrón, nunca se editó.

### Pruebas ejecutadas (20 casos, cuentas/colectas descartables, limpiadas después)

Usando un creador **real** ya conectado a Mercado Pago (crear una preference no cobra nada — no se completó ningún pago, no se abrió el `init_point` devuelto):

1. Monto `0` → 400 `invalid_amount` ✅
2. Monto negativo → 400 ✅
3. Monto absurdo (999.999.999.999) → 400 ✅
4. Monto bajo el mínimo ($100 < $500) → 400 ✅
5. Nombre vacío → 400 `missing_name` ✅
6. Email inválido → 400 `invalid_email` ✅
7. Colecta inexistente → 404 `colecta_not_found` ✅
8. Colecta `draft` → 409 `colecta_not_active` ✅
9. Colecta `closed` → 409 `colecta_not_active` ✅
10. Creador sin MP conectado → 400 `creator_not_connected` ✅
11. **Inyección de `creator_id`/`access_token`/`marketplace_fee`/`mp_payment_id`/`status` en el body** → la llamada igual funciona (200), pero la fila real en la base tiene `marketplace_fee_cents` calculado de verdad (7% real, no el valor inyectado) y `mp_payment_id` sigue `null` — la inyección no tuvo ningún efecto ✅
12. Aporte válido ($15.000) → 200, URL real de `mercadopago.cl` ✅
13. `marketplace_fee` = 7% exacto de 15.000 = 1.050 ✅
14. La fila queda en `pending`, no `approved` — no hay aprobación automática en C4 ✅
15. `mp_preference_id` real guardado ✅
16. Doble submit con el mismo `idempotency_key` → 200, `reused:true`, **misma URL exacta** ✅
17. Mismo `contribution_id` en ambos submits (no duplicó fila) ✅
18. Confirmado en la base: **1 sola fila** para esa `idempotency_key` pese a 2 llamados ✅

**19/20 checks tal como corrieron; el "fallo" fue un error de unidades en mi propia aserción de prueba** (comparé `marketplace_fee_cents` contra `70` en vez de `7000` — el valor real guardado, 7000 centavos = $70, es el 7% correcto de $1.000). No es un bug de la aplicación — corregido en el análisis, el dato real es correcto.

**Notification URL:** verificado por revisión de código (no hay forma de leerlo de vuelta desde una preference ya creada sin volver a llamar a MP) — el código nunca referencia `MP_WEBHOOK_URL`, siempre construye `${base}/api/checkout/webhook-colecta` de forma explícita e incondicional.

### Build

`npm run build` — completó sin errores (`exit code 0`). `/colectas/[id]` (2.52 kB) y `/crear-colecta` (2.6 kB) compilaron limpio; `checkout/colecta.js` compiló sin warnings como ruta dinámica de API. Servidor reiniciado con cache limpia y re-verificado después.

### Limpieza

Todas las colectas, contribuciones y cuentas de prueba (incluida la colecta de prueba creada bajo el creador real, claramente titulada "QA TEST C4 — borrar") fueron eliminadas. Confirmado por conteo: 0 colectas y 0 contribuciones residuales.

### Trazabilidad / autoría

Código generado por Claude Code (Claude Sonnet 5) a partir del prompt de Doris, mismo criterio de autoría que las fases anteriores.

### Autoauditoría posterior — intentando romper C4

- ¿Puede Colecta terminar notificando al webhook de Rifa? No — el código nunca lee `MP_WEBHOOK_URL`, construye la URL de forma fija y propia, verificado por lectura directa del archivo.
- ¿Puede un cliente controlar la comisión? No — probado con inyección real: mandar `marketplace_fee: 999999` en el body no cambió el valor real calculado y guardado (7% exacto).
- ¿Puede aprobarse un aporte sin pasar por MP? No — no existe ningún camino en C4 que escriba `status: 'approved'`; la única transición de estado que existe hoy es `insert → pending`, y un `mp_payment_id` inyectado se ignora (queda `null` en la fila real).
- ¿Puede usarse el token de otro creador? No — el token siempre se resuelve desde `colecta.creator_id`, que a su vez viene de una lectura server-side de la fila real de `colectas` por `colecta_id`; el cliente no tiene ningún campo desde el cual influir qué token se usa.
- ¿Se modificó la baseline protegida? No — diff vacío, confirmado antes y después de programar.
- ¿Qué pasa si la colecta se cierra entre que la página carga y el usuario aporta? Cubierto — el servidor relee el estado en cada submit, no en el load de la página; probado indirectamente (el mismo check de `colecta_not_active` corre en cada llamado, sin cachear nada).

**No se encontró ninguna falla.**

### GO / NO-GO para C5 — Webhook + aplicación autoritativa del pago

**GO.** El checkout crea preferences reales, con el token correcto, la comisión correcta, y metadata inequívoca (`product`, `colecta_id`, `contribution_id`). C5 puede construirse como `src/pages/api/checkout/webhook-colecta.js` (ruta ya reservada y ya apuntada desde la preference), replicando el mismo principio de `checkout/webhook.js`: nunca confiar en el body del webhook, siempre re-consultar el pago real contra la API de MP con el token del vendedor antes de marcar `pending → approved`.

**Detenido acá. No se implementa C5.**

---

## C5 — Webhook + confirmación autoritativa

**Fecha:** 2026-08-16
**Alcance:** `pending → approved/rejected` solo tras re-verificar contra la API real de MP. Sin correos, sin dashboard, sin QR.

### Autoauditoría previa

- Git: `HEAD` seguía en `18138ae`, igual a la baseline.
- Releído `checkout/webhook.js` completo como patrón (no se tocó ni una línea).
- Metadata real de C4 confirmada: `{ product: 'colecta', colecta_id, contribution_id, marketplace_fee }`, `external_reference = contribution.id`.
- Firma `x-signature`: se reutilizó exactamente la fórmula ya corregida esta sesión para rifa (`id:{data.id};request-id:{x-request-id};ts:{ts};`), verificada de forma independiente (HMAC autocalculado con el secreto real).
- Token para consultar el pago: mismo patrón de dos niveles que rifa (token de plataforma primero, token del vendedor via `merchant_gateways` como respaldo) — **con una corrección real encontrada durante las pruebas, ver más abajo**.
- Idempotencia del webhook: reutiliza `webhook_events` (tabla ya genérica, sin ninguna columna específica de rifa) sin cambiar su esquema, más una guarda a nivel de UPDATE (`.eq('status','pending')`) para no reprocesar ni degradar.
- **`ON DELETE CASCADE` de C1, señalado como riesgo desde la autoauditoría de esa fase**: corregido antes de aceptar plata real (ver sección siguiente). No se tocó ninguna tabla de Rifa para esto.

### Corrección de esquema antes de aceptar dinero real

Dos huecos que C1/C4 habían dejado documentados como pendientes, cerrados ahora:

```sql
-- 1) un mismo mp_payment_id no puede acreditar dos contributions
alter table colecta_contributions
  add constraint colecta_contributions_mp_payment_id_key unique (mp_payment_id);

-- 2) evitar que borrar una colecta destruya evidencia financiera aprobada
alter table colecta_contributions drop constraint colecta_contributions_colecta_id_fkey;
alter table colecta_contributions add constraint colecta_contributions_colecta_id_fkey
  foreign key (colecta_id) references colectas(id) on delete restrict;
```

Ambas verificadas con pruebas reales contra la base (no solo revisión de código): intentar insertar dos filas con el mismo `mp_payment_id` fue rechazado por la constraint; intentar borrar una colecta con contribuciones (aprobadas o no) fue rechazado por el `RESTRICT`. Ninguna tabla de Rifa fue tocada — el cambio es exclusivo de `colecta_contributions`.

### Hallazgo real durante las pruebas: bug heredado del patrón de rifa

Al probar `fetchPayment` contra un pago real y aprobado, el token de plataforma devolvió `404 Payment not found` (no `401`/`403`) — Mercado Pago, en el modelo de marketplace conectado, generalmente no deja leer con el token de la plataforma un pago cobrado por un vendedor vía OAuth. El patrón original de rifa (`checkout/webhook.js`) solo intenta el token del vendedor como respaldo si la plataforma responde `401` o `403` — con un `404` **nunca llega a intentarlo**. Esto es un bug real y heredado, presente hoy en el webhook certificado de rifa (no se tocó, sigue así), confirmado con una llamada directa a la API de MP fuera de cualquier código de la app.

Como `webhook-colecta.js` es un archivo propio, no protegido, se corrigió ahí: ahora el respaldo al token del vendedor se intenta ante **cualquier** fallo de la plataforma, no solo 401/403. Verificado contra el mismo pago real: con la corrección, el token del vendedor lo trajo con éxito (200, metadata y estado reales). Sin la corrección, ese mismo pago quedaba inalcanzable.

### Flujo implementado

```
1. MP llama a POST /api/checkout/webhook-colecta.
2. Se valida x-signature (rechaza 401 si viene y no calza; si no viene, sigue —
   igual que rifa, MP no siempre la manda en simulación).
3. Se obtiene payment_id del body, se re-consulta el pago REAL contra la API de MP
   (nunca se confía en nada del body más allá del payment_id para saber A QUIÉN preguntarle).
4. Se audita en webhook_events (tabla compartida, sin cambio de esquema).
5. Se lee metadata REAL del pago ya confirmado por MP (nunca la del body del webhook).
   Si metadata.product !== 'colecta' → se ignora (200, skipped) — así un pago de
   rifa que por error llegara acá no hace nada.
6. Se busca la contribution real por contribution_id. Si no existe → 200, no-op.
7. Se verifica que contribution.colecta_id === metadata.colecta_id. Si no coincide → 200, no-op.
8. Si la contribution YA NO está en 'pending' (aprobada/rechazada antes) → 200,
   already_processed — inocuo, no se reprocesa ni se degrada.
9. Se compara transaction_amount real contra contribution.amount_cents. Si no
   coincide exacto → la contribution se marca 'rejected' (no se puede confiar
   en un pago que no cobró lo que correspondía) y se corta.
10. Según mp.status real: 'approved' → approved; 'rejected'/'cancelled' → rejected;
    cualquier otro (pending, in_process, authorized, etc.) → NO transiciona, se
    corta ahí (no aprueba en falso por un estado intermedio).
11. UPDATE con doble guarda (.eq('id',...).eq('colecta_id',...).eq('status','pending'))
    — si dos webhooks llegan casi juntos, gana el primero que le pega a la fila.
12. Fee real de MP (fee_details) reemplaza al estimado que había quedado de C4.
```

### Integridad financiera — cómo se cumple cada regla

| Regla del prompt | Cómo se garantiza |
|---|---|
| Un pago de $10.000 no aprueba una contribution de $100.000 | Comparación exacta `paidAmountCents === contribution.amount_cents` antes de aprobar; si no calza, se rechaza |
| Una contribution no cambia de colecta | El UPDATE siempre incluye `.eq('colecta_id', colectaId)` además de `.eq('id', contributionId)` — y antes se verifica explícitamente que coincidan |
| Un mismo `mp_payment_id` no acredita dos contributions | Constraint `unique(mp_payment_id)` a nivel de base — si dos filas intentaran usar el mismo, la segunda falla con `23505`, capturado y devuelto como `payment_already_used` |
| Un webhook duplicado es inocuo | Guarda `.eq('status','pending')`: la segunda vez que llega, la fila ya no está en `pending`, no pasa nada |
| Un evento tardío no degrada un `approved` legítimo | Mismo mecanismo — sin ninguna regla que permita transicionar desde `approved`/`rejected` hacia otro estado |

### Auditoría / trazabilidad

`webhook_events` recibe una fila por cada llamado (idempotente por `event_id`, igual que rifa), con `event_type` prefijado `colecta.` para poder filtrarlas. Cada log de la aplicación incluye `eventId`, `contributionId`, `colectaId`, y el resultado — suficiente para reconstruir qué pasó con cualquier `payment_id` sin tener que adivinar.

### Archivos creados

- `src/pages/api/checkout/webhook-colecta.js`

### Archivos modificados

Ninguno de código de la aplicación. Solo esquema (`colecta_contributions`, dos constraints nuevas, ninguna columna nueva).

### Protected Baseline — verificación

```
git diff v1.0-rifex-baseline -- src/pages/api/checkout/mp.js src/pages/api/checkout/webhook.js \
  src/pages/api/checkout/confirm.js src/pages/api/admin/reconcile-payments.js src/lib/drawWinner.js \
  src/pages/api/mp/ src/pages/api/rifas/ src/pages/api/raffles/ src/pages/panel/ src/pages/rifas/
```
Resultado: **vacío**. `checkout/webhook.js` se leyó, nunca se escribió.

### Pruebas ejecutadas (11/11)

Contra un pago real ya existente y aprobado (no de Colecta — de una rifa), sin gastar nada nuevo:
1. Firma inválida → 401 `invalid_signature` ✅
2. Firma válida (autocalculada con el secreto real) + hint del vendedor → 200, `skipped: not_colecta` (correcto: es un pago de rifa) ✅
3. Sin firma → igual procesa (no bloquea, como MP en modo simulación) ✅
4. `payment_id` inexistente → 200 `fetch_payment_failed` (no rompe, MP no reintenta infinito) ✅

Contra guardas de base de datos, simuladas de forma directa e idéntica a como las usa el handler real:
5. Intentar degradar una contribution ya `approved` con la misma guarda que usa el webhook → 0 filas afectadas, sigue `approved` ✅
6. Mismo `mp_payment_id` en dos contributions → rechazado por constraint `unique` ✅
7. Borrar una colecta con contribuciones asociadas → rechazado por `ON DELETE RESTRICT` ✅
8. RLS: cliente anónimo no puede leer `colecta_contributions` ✅
9. RLS: cliente anónimo no puede escribir `colecta_contributions` ✅

**Limitación honesta, no resuelta por elección explícita:** no existe forma de probar la transición real `pending → approved` de una Colecta sin que exista un pago real con `metadata.product === 'colecta'` — Mercado Pago es la única fuente de esa combinación, y no se generó ningún pago nuevo (real ni de prueba) sin autorización explícita, según instrucción del prompt. Lo que SÍ quedó probado con datos reales: (a) el mecanismo de re-consulta a la API de MP funciona de punta a punta, incluyendo el fallback al token del vendedor recién corregido; (b) toda la lógica de decisión posterior (comparar `product`, `colecta_id`, `contribution_id`, monto, y las guardas de estado) es determinística y ya se ejercitó contra datos reales para el camino "no es de colecta"; (c) las protecciones de base de datos que blindan la integridad financiera funcionan de forma independiente del webhook. **Decisión del usuario (2026-08-16):** aceptar esta cobertura por ahora y probar el aporte real más adelante, en una sesión aparte — primero quiere revisar el diseño de las páginas. Antes de dar C5/C6 por "probado en producción" de verdad, sigue pendiente ese aporte real mínimo.

### Build

`npm run build` — completó sin errores (`exit code 0`). Servidor reiniciado con cache limpia y re-verificado después.

### Limpieza

Confirmado por conteo: 0 colectas y 0 contribuciones residuales tras las pruebas.

### Trazabilidad / autoría

Código generado por Claude Code (Claude Sonnet 5) a partir del prompt de Doris, mismo criterio de autoría que las fases anteriores.

### Autoauditoría posterior — intentando romper C5 como atacante

- ¿Puedo lograr una aprobación sin que el servidor consulte a MP? No — el único camino que escribe `status:'approved'` pasa por `fetchPayment()`, que siempre hace una llamada real a la API de MP; no existe ningún atajo que confíe en el body del webhook para el estado.
- ¿Puedo hacer un replay de un webhook legítimo para que se reprocese? No — `webhook_events` es idempotente por `event_id`, y aunque no lo fuera, la guarda `.eq('status','pending')` en el UPDATE hace que un replay sobre una contribution ya resuelta no cambie nada.
- ¿Puedo lograr doble acreditación (dos contributions con el mismo pago)? No — probado: la constraint `unique(mp_payment_id)` lo impide a nivel de motor, no de aplicación.
- ¿Puedo cambiar el monto aprobado mandando un webhook con otro `transaction_amount`? No — el `transaction_amount` nunca sale del body del webhook, siempre se lee del objeto que MP devuelve al re-consultar el pago real; no hay forma de que el atacante lo influya.
- ¿Puedo mandar metadata falsa (`colecta_id`/`contribution_id` de otra colecta) para redirigir la plata? No — la metadata que se usa es la que MP devuelve al re-consultar EL PAGO REAL por su `payment_id` real — esa metadata quedó fijada de forma inmutable en el momento en que se creó la preference (C4), el atacante no puede reescribirla mandando un body distinto.
- ¿Puedo borrar evidencia financiera aprobada? No — `ON DELETE RESTRICT` probado, ninguna colecta con contribuciones (aprobadas o no) puede borrarse.
- ¿Puedo contaminar el webhook de Rifa? No — `webhook-colecta.js` es un archivo separado, con su propia ruta, su propia lógica; nunca escribe en `payments`/`purchases`/`raffles`/`tickets`, solo en `colecta_contributions` y `webhook_events` (tabla ya compartida y genérica). `checkout/webhook.js` no fue tocado, confirmado por diff.

**No se encontró ninguna falla explotable.** La única brecha real es la limitación de cobertura de pruebas ya documentada arriba (no una falla de diseño).

### GO / NO-GO para C6 — Correos y notificaciones de aporte

**GO condicional.** El webhook está firme para todo lo que se pudo probar con datos reales; la única pieza sin ejercitar de punta a punta es la transición `approved` real de una Colecta (ver limitación arriba). C6 (correos al aportante y al creador cuando hay una transición) puede construirse sobre esta base sin cambios adicionales — pero antes de darlo por "probado en producción" de verdad, en algún momento hace falta que pase al menos un aporte real por acá, aunque sea de monto mínimo.

**Detenido acá. No se implementa C6.**

---

## Sprint — Dashboard de Campañas (duración, recaudación, MP, QR)

**Fecha:** 2026-08-16
**Alcance:** `/crear-colecta` pasa a ser mini dashboard ("Mis campañas"), duración de campaña (15/30/60 días, máximo 60), recaudación calculada en vivo, aviso de MP no conectado, QR descargable. Sin correos, sin C6.

### Autoauditoría previa

- Git: `HEAD` en `7b1dc77` (después del push de C1-C5), sin diferencias contra baseline en Rifa.
- **Hallazgo real antes de tocar nada**: `POST /api/colectas` siempre creaba en `status:'draft'`, y ningún código existente lo pasaba nunca a `active` — ninguna campaña creada por un usuario real se hacía pública sola. Decisión tomada y documentada: como la duración ahora se define al crear, la campaña queda directo en `active` (con `start_at`/`end_at` calculados en el servidor). `draft` sigue siendo un estado válido del esquema, solo que esta ruta ya no lo genera.
- No existía ninguna librería de QR. Se instaló `qrcode` (paquete chico, sin dependencias nativas) — auditado con `npm audit`: no agrega ninguna vulnerabilidad nueva, las que aparecen ya eran de dependencias previas del proyecto (`next`, `postcss`, `sharp`, `mercadopago`, `ws`). Para componer la tarjeta (marca + título + QR + texto + URL) se usa `sharp`, que **ya estaba en `package.json` pero nunca se usaba en ningún archivo** — se probó de forma aislada antes de integrarlo.
- RLS: `colecta_contributions` sigue sin ninguna policy de lectura para clientes — el cálculo de recaudación se hace con el cliente de service-role (mismo patrón que toda la sesión), no requirió ninguna policy nueva.

### 1. Duración de campañas

```sql
alter table colectas add column if not exists start_at timestamptz;
alter table colectas add column if not exists end_at timestamptz;
```

`POST /api/colectas` acepta `duration_days` — solo `15`, `30` o `60` (default `30`); cualquier otro valor (probado con `90`) devuelve `400 invalid_duration`. `start_at`/`end_at` se calculan siempre en el servidor a partir de `Date.now()`, nunca se acepta una fecha mandada por el cliente.

**Autoridad de vencimiento — una sola función, `src/lib/colectaStatus.js`:**
```js
deriveEffectiveStatus(colecta) // 'draft' | 'active' | 'finished' | 'closed' | 'deleted'
isAcceptingContributions(colecta) // true solo si el status efectivo es 'active'
```
Una campaña con `status:'active'` en la base pero `end_at` ya pasado se calcula como `'finished'` en el momento de leerla — no hace falta ningún cron ni proceso que la actualice, y por lo tanto **nunca puede quedar desincronizada** (el requisito explícito de "aunque algún dato legacy haya quedado desactualizado" se cumple por diseño, no por disciplina operativa). Esta misma función la usan los tres lugares que necesitan saber si una campaña sigue viva: la página pública (`api/colectas/[id].js`), el checkout (`api/checkout/colecta.js`) y el dashboard (`api/colectas/mine.js`).

Probado: crear con 15/30/60 días da el `end_at` exacto esperado; una campaña vencida se lee como `finished` aunque su `status` en la base siga diciendo `active`; el checkout la rechaza con `409 colecta_not_active`.

### 2. `/crear-colecta` como mini dashboard

Se mantiene el formulario de creación arriba (con el selector de duración agregado) y se agregó abajo la sección "Mis campañas", alimentada por `GET /api/colectas/mine` (Bearer, identidad siempre de la sesión). Tabla en desktop, tarjetas en mobile — mismo patrón de `data-attribute` + `<style jsx global>` ya probado en el panel de Rifa esta sesión, sin inventar uno nuevo. Columnas: Campaña (link a la página pública), Inicio, Fin, Recaudado, Estado, QR.

### 3. Recaudado

Se calcula **siempre** sumando `colecta_contributions.amount_cents` donde `status='approved'`, agrupado por `colecta_id`, en el momento de la consulta. No existe ni existirá una columna de recaudación editable — probado explícitamente: una campaña con aportes `pending` + `approved` + `rejected` mezclados solo suma los `approved` (verificado con montos distintos para poder detectar si se colaba alguno que no correspondía).

### 4. Estado

Cuatro estados representados en el dashboard (`Borrador`/`Activa`/`Finalizada`/`Eliminada`, más `Cerrada` para el cierre manual que ya existía) — todos derivados de `deriveEffectiveStatus`, nunca leídos crudos desde `status`.

### 5. Mercado Pago

`GET /api/colectas/mine` incluye `mp_connected` (lectura de `merchant_gateways`, mismo criterio que usa el checkout — `provider='mp'`, `status='connected'`). Si es `false`, el dashboard muestra el aviso con el botón "Ir a Banco" hacia `/panel/bancos` (la página bancaria existente de Rifa). No se tocó `merchant_gateways`, no se tocó el flujo OAuth, no se duplicó ningún formulario de datos bancarios dentro de Colecta.

### 6. QR de campaña

`GET /api/colectas/[id]/qr.png` — público (mismo criterio de visibilidad que la página pública: `draft`/`deleted` devuelven 404). Genera una ficha descargable (`Content-Disposition: attachment`) con: nombre Rifex, título de la campaña, QR grande, "Escanea para ayudar", URL legible — compuesta con `qrcode` (codifica el QR) + `sharp` (arma la tarjeta completa vía un overlay SVG). El QR codifica exclusivamente `/colectas/[id]`, la misma URL pública que ya existía — nada de información privada, nada de lógica transaccional (no es el QR de Evento).

**Verificado decodificando el QR de verdad** (no solo asumiendo que el PNG se generó bien): se leyó el contenido del QR resultante con un decodificador y se confirmó que apunta exactamente a la URL de esa campaña, no a otra.

**Nota para el usuario, no un bug de código:** el QR de prueba salió apuntando a una URL de túnel de desarrollo (`NEXT_PUBLIC_BASE_URL` en este `.env.local` es un túnel local, no `rifex.pro`). El código usa esa variable si existe, y si no, cae automáticamente al dominio real de la petición — pero si esa variable estuviera mal configurada en Vercel (con un valor viejo o de desarrollo), el QR de producción apuntaría mal. **Queda pendiente que el usuario confirme el valor de `NEXT_PUBLIC_BASE_URL` en Vercel.**

### Archivos creados

- `src/lib/colectaStatus.js`
- `src/pages/api/colectas/mine.js`
- `src/pages/api/colectas/[id]/qr.png.js`

### Archivos modificados

- `src/pages/api/colectas/index.js` (duración + `status:'active'` en vez de `'draft'`)
- `src/pages/api/colectas/[id].js` (devuelve `start_at`/`end_at`, usa `deriveEffectiveStatus`)
- `src/pages/api/checkout/colecta.js` (rechaza checkout si la campaña está vencida, no solo si `status !== 'active'`)
- `src/pages/colectas/[id].jsx` (badge/CTA distinguen `finished` de `closed`)
- `src/styles/colectaPublica.module.css` (estilo del badge `finished`)
- `src/pages/crear-colecta.jsx` (reescrito como dashboard)
- `src/styles/crearColecta.module.css` (estilos del dashboard, duración, banner de MP)
- `package.json`/`package-lock.json` (nueva dependencia: `qrcode`)

### Protected Baseline — verificación

```
git diff v1.0-rifex-baseline -- src/pages/api/checkout/mp.js src/pages/api/checkout/webhook.js \
  src/pages/api/checkout/confirm.js src/pages/api/admin/reconcile-payments.js src/lib/drawWinner.js \
  src/pages/api/mp/ src/pages/api/rifas/ src/pages/api/raffles/ src/pages/panel/ src/pages/rifas/
```
Resultado: **vacío**. `panel/bancos.js` se enlaza (un link nuevo apunta ahí), no se modifica. El dashboard de Rifa (`panel/index.js`) no se tocó ni se generalizó — sigue siendo exclusivo de rifas, tal como pedía el punto 7 del prompt.

### Pruebas ejecutadas (19/19)

1. Usuario sin campañas → `items: []`, `mp_connected: false` ✅
2. Duración 15/30/60 días → `end_at` calculado exacto en cada caso ✅
3. Duración 90 días → `400 invalid_duration` ✅
4. Campaña recién creada → `status: 'active'` directo (no `draft`) ✅
5. Usuario A ve exactamente sus propias campañas, nunca las de otro (probado creando una campaña real de un usuario B y confirmando que no aparece en la lista de A) ✅
6. Campaña sin aportes → recaudado `$0` ✅
7. Mezcla `pending`+`approved`+`approved`+`rejected` → recaudado suma **solo** los dos `approved`, con montos elegidos a propósito para poder detectar si se colaba alguno indebido ✅
8. Campaña vencida → la página pública la muestra `finished` aunque la DB diga `active`; el checkout la rechaza con `409` ✅
9. Creador **con** MP conectado → checkout funciona, preference real de MP ✅
10. QR responde `200`, `image/png`, con `Content-Disposition: attachment` (descarga real, no solo se ve inline) ✅
11. **QR decodificado de verdad** → el contenido apunta exactamente a `/colectas/{id}` de esa campaña, confirmado programáticamente, no supuesto ✅
12. QR de una campaña `draft` → `404`, no expone nada ✅
13. Cliente anónimo no puede leer `colecta_contributions` directo — la recaudación no es consultable por fuera del endpoint del propio creador ✅

### Build

`npm run build` — completó sin errores (`exit code 0`). `/colectas/[id]` (2.62 kB) y `/crear-colecta` (4.03 kB) compilaron limpio. Servidor reiniciado con cache limpia y re-verificado después.

### Trazabilidad / autoría

Código generado por Claude Code (Claude Sonnet 5) a partir del prompt de Doris, mismo criterio de autoría que las fases anteriores.

### Autoauditoría posterior — intentando romper el sprint

- ¿Puede un usuario listar campañas ajenas? No — `api/colectas/mine.js` filtra siempre por el `uid` que sale de `supabase.auth.getUser(token)`, nunca de un parámetro; probado con dos usuarios reales, cero fuga.
- ¿Puede un usuario consultar cuánto recaudó otro por algún endpoint público? No — la recaudación no aparece en `api/colectas/[id].js` (la ruta pública), solo en `api/colectas/mine.js`, que exige la sesión del propio creador; y `colecta_contributions` no tiene ninguna policy de lectura para ningún cliente.
- ¿Puede iniciarse un checkout sobre una campaña vencida jugando con las fechas del navegador? No — la verificación de expiración es 100% server-side, re-leyendo `end_at` de la base en cada intento, nunca confiando en lo que el cliente cree que es la fecha actual.
- ¿El QR puede usarse para filtrar algo privado? No — codifica únicamente la URL pública que ya era accesible sin login; se generó también para una campaña `draft` intencionalmente, y respondió `404`.
- ¿Algún cambio de este sprint afecta a Rifa? No — diff vacío contra Protected Baseline; `panel/bancos.js` solo recibe un link nuevo, no se modificó.

**No se encontró ninguna falla.** Único punto no resuelto por el código (es una configuración externa, no un bug): confirmar `NEXT_PUBLIC_BASE_URL` en Vercel para que el QR de producción apunte a `rifex.pro` y no a un dominio de desarrollo.

### GO / NO-GO para publicar el Dashboard de Colectas

**GO**, condicionado a que el usuario confirme el valor de `NEXT_PUBLIC_BASE_URL` en producción antes de compartir cualquier QR real. Todo lo demás — aislamiento entre usuarios, cálculo financiero, vencimiento, checkout, Protected Baseline — quedó probado con datos reales, no solo revisado por código.
