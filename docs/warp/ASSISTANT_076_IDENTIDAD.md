# Assistant 0.7.6 en Rifex DEV: identidad seudónima de uso

## Qué cambia
- `@warp-ai/assistant` pasa de 0.7.5 a **0.7.6** (`vendor/warp-sdk-lite/warp-ai-assistant-0.7.6-1d80866.tgz`, sha256 `69ee9113…83fd9f`).
- El paquete 0.7.5 queda en `vendor/warp-sdk-lite/` para el rollback.
- **Único archivo de código:** `src/lib/warp/assistantPilot.js`.
  - Lee `WARP_USAGE_IDENTITY_SECRET` (solo servidor) y configura `usageIdentity: { secret, trustedProxy: 'vercel', required: true }`.
  - Reenvía al handler interno del paquete **solo** `content-type` y `x-real-ip`.
  - Crea el handler dentro de `try/catch`.
- **Sin cambios:** widget, contextos, Discovery, capacidades, contratos, autenticación, pagos, Mercado Pago, comisiones, RLS y base de datos.

## Cómo funciona
- El servidor de Rifex calcula una referencia opaca de 32 caracteres a partir de:
  - el secreto privado;
  - el día UTC;
  - la clave del sitio;
  - la IP que escribe Vercel en `x-real-ip`.
- Warp la recibe en `x-warp-client-ref` y la usa para el límite por persona.
- **Rotación:** cambia una vez por día UTC (21:00 en Chile continental en horario de verano).
- **Lo que no puede cambiar la referencia:** navegar, recargar, borrar datos del navegador o abrir otra conversación.
- **Lo que no puede elegir la referencia:** lo que envía el navegador (`x-warp-client-ref`, `x-forwarded-for`, campos del cuerpo).
- **Chat y acciones** usan la misma referencia y comparten el límite.
- Otro sitio, o PROD con su propio secreto y clave, produce otra referencia.

## Qué es y qué no es
- Es una **identidad seudónima de red**, no de una persona.
- Quienes comparten IP pública (oficina, hogar, NAT de un operador móvil) comparten la referencia del día y el límite por persona.
  - Se acepta temporalmente para Conversacional V1.
  - El límite por sitio y el presupuesto siguen protegiendo el gasto.

## Lo que nunca sale ni se registra
- Hacia Warp no viajan la IP, el correo, las cookies, la sesión, el User-Agent ni ids reales. El cuerpo solo lleva `message`, `conversationId` y `pageContext`.
- El adaptador no tiene logs.
- La referencia no vuelve al navegador.
- El límite propio de Rifex (20 por 10 minutos por scope) ya no guarda la IP: ver la sección siguiente.

## Límite propio de Rifex: clave HMAC
- **Antes:** `warp-pilot-<scope>:ip:<IP>` en `rate_limit_hits` (IP en claro).
- **Ahora:** `warp-pilot-<scope>:h:<32 hex>`, con `scope` = `chat` o `actions`.
  - Referencia: primeros 32 caracteres hex de `HMAC-SHA256(RIFEX_RATE_LIMIT_KEY_SECRET, "rifex-rl:v1|<día UTC>|warp-pilot|<ip confiable>")`.
  - Se calcula solo en el servidor, con la misma IP confiable de Vercel (`x-real-ip`, validada) que usa la identidad de Warp.
  - Cambia cada día UTC y con cada secreto; nunca contiene la IP y nunca coincide con la referencia que recibe Warp (otro secreto, otro formato).
  - Chat y acciones mantienen cupos separados en Rifex con la misma referencia; en Warp siguen compartiendo un solo límite.
- **Orden de la ruta:** secreto del limitador → configuración de Warp → IP confiable → limitador → Warp. Sin secreto válido o sin IP no se guarda nada y la respuesta es 503.
- **Borde del día UTC:** la clave cambia a las 00:00 UTC; quien escriba justo en ese momento puede usar un cupo extra de 10 minutos, igual que el borde de ventana fija que ya existía.
- **Registros antiguos:** las claves `warp-pilot-%:ip:%` que ya existían y las filas vencidas se borran con `db/pending/2026-11-19a_rate_limit_retention_purge.sql`, preparada y **sin ejecutar** hasta un GO explícito.

## Fallar cerrado
| Situación | Resultado |
|---|---|
| Falta `WARP_USAGE_IDENTITY_SECRET` o tiene menos de 32 caracteres | Botón oculto (`{ enabled: false }`); chat y acciones → 503 `ASSISTANT_NOT_CONFIGURED` |
| El paquete rechaza la configuración al crear el handler | 503, nunca 500 |
| Falta `RIFEX_RATE_LIMIT_KEY_SECRET`, tiene menos de 32 caracteres o es igual al secreto de identidad | Botón oculto; chat y acciones → 503, sin escribir en el limitador |
| Falta `x-real-ip` o no tiene formato de IP | 503, sin escribir en el limitador ni llamar a Warp |

En local (`next dev`) no hay `x-real-ip`, así que el chat responde 503. Es esperado: nunca se usa el asistente sin identidad.

## Variables (solo nombres)
| Variable | Dónde |
|---|---|
| `WARP_USAGE_IDENTITY_SECRET` | Nueva. Solo en el proyecto Vercel de Rifex DEV (`rifex-frontend-main`), entorno Production, Sensitive. Secreto propio, de 64 caracteres hexadecimales |
| `RIFEX_RATE_LIMIT_KEY_SECRET` | Nueva. Solo en el proyecto Vercel de Rifex DEV (`rifex-frontend-main`), entorno Production, Sensitive. Secreto propio, de 64 caracteres hexadecimales, distinto de `WARP_USAGE_IDENTITY_SECRET` (si son iguales, el asistente queda apagado) |
| `RIFEX_WARP_PILOT`, `WARP_AI_API_URL`, `WARP_AI_API_KEY` | Existentes, sin cambios |

- No reutilizar el secreto de Warp, de OpenAI ni de PROD.
- PROD tendrá otro secreto, en otra misión.

## Nota sobre el bundle del navegador
- El botón global carga el paquete con `import('@warp-ai/assistant')`. Ese chunk ya contenía en 0.7.5 el código del handler de servidor.
- En 0.7.6 también incluye el código público de `usageIdentity.js`: el nombre del encabezado y el algoritmo.
- **No incluye** el secreto, el nombre de la variable, la clave, la URL de Warp ni ninguna IP. Sin el secreto, la referencia no se puede calcular.
- Para dejarlo en 0, el paquete debería separar la entrada del navegador de la del servidor. Queda como pendiente para Notebook.

## Rollback
1. **Apagar el asistente:** quitar `RIFEX_WARP_PILOT` y volver a desplegar.
2. **Despliegue:** Instant Rollback de `rifex-frontend-main` al despliegue anterior, con 0.7.5.
3. **Código:** `git revert -m 1 <merge>` en una rama nueva y PR a `develop`. Vuelve `package.json` a 0.7.5, cuyo tgz sigue en `vendor/`.
4. **Variable:** `WARP_USAGE_IDENTITY_SECRET` puede quedarse; 0.7.5 no la lee.
5. **Clave HMAC del limitador:** `git revert -m 1 <merge>` de ese cambio vuelve a `:ip:` (no recomendado: vuelve a guardar IP). Quitar `RIFEX_RATE_LIMIT_KEY_SECRET` sin revertir el código apaga el asistente (503), sin afectar el resto del sitio.
6. **Warp:** no se toca, ni su volumen ni `/data`.
