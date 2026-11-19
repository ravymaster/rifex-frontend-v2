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
- **Comportamiento previo, sin cambios:** el límite propio de Rifex (`warp-pilot-chat:ip:*` y `warp-pilot-actions:ip:*`, 20 por 10 minutos) sigue usando la IP como clave en su tabla de límites.

## Fallar cerrado
| Situación | Resultado |
|---|---|
| Falta `WARP_USAGE_IDENTITY_SECRET` o tiene menos de 32 caracteres | Botón oculto (`{ enabled: false }`); chat y acciones → 503 `ASSISTANT_NOT_CONFIGURED` |
| El paquete rechaza la configuración al crear el handler | 503, nunca 500 |
| Falta `x-real-ip` o no tiene formato de IP | 503, sin llamar a Warp |

En local (`next dev`) no hay `x-real-ip`, así que el chat responde 503. Es esperado: nunca se usa el asistente sin identidad.

## Variables (solo nombres)
| Variable | Dónde |
|---|---|
| `WARP_USAGE_IDENTITY_SECRET` | Nueva. Solo en el proyecto Vercel de Rifex DEV (`rifex-frontend-main`), entorno Production, Sensitive. Secreto propio, de 64 caracteres hexadecimales |
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
5. **Warp:** no se toca, ni su volumen ni `/data`.
