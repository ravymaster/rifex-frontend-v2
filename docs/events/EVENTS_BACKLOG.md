# Eventos — Backlog (ideas de negocio, sin alcance ni implementación)

Este documento junta requisitos de negocio descubiertos entre sesiones que
todavía no tienen un EVENT-N asignado. Nada de lo que aparece acá está
scopeado, autorizado ni implementado — es solo el lugar donde queda
registrado para no perderlo hasta que alguien lo convierta en un EVENT-N
real con su propio spec.

## QR promocional descargable por evento

**Origen**: descubierto por Rodrigo, registrado durante la sesión TRUST-2
(2026-08-27) por instrucción explícita — sin iniciar EVENT-7 ni ampliar el
código de esa misión.

**Necesidad de negocio, tal como la planteó Rodrigo**: cada evento debe
generar un QR promocional descargable que lleve directamente a su página
de compra. Este QR promocional es distinto del QR individual de acceso
que ya se entrega después de comprar (ver `EVENT4_STAFF_SCANNER_CHECKIN.md`
para ese QR de acceso, uno por ticket, generado en la emisión — EVENT-3).
El objetivo es convertir carteles, publicaciones e historias en puntos de
venta inmediatos: un afiche físico o un post en redes con este QR debe
llevar a alguien directo al checkout del evento, sin buscarlo.

**Distinciones clave a resolver cuando esto se scopee** (no resueltas
acá, solo señaladas para quien lo tome):
- Un QR promocional es por EVENTO (o por tipo de entrada, a decidir), no
  por ticket ni por comprador — no identifica a nadie, no es sensible.
- Debe apuntar a la página pública del evento (`/eventos/[id]`) o
  directo al flujo de checkout — a decidir cuál da mejor conversión.
- Generación: probablemente reutilizable la misma librería `qrcode` ya
  usada para los QR de acceso individual (ver EVENT-3), pero el dato
  codificado y el ciclo de vida son completamente distintos (un QR de
  acceso es de un solo uso lógico y personal; el promocional es público,
  reusable indefinidamente mientras el evento esté publicado).
- Descargable: probablemente como imagen (PNG/SVG) desde
  `/panel/eventos/[id]`, para que el organizador lo baje e imprima o lo
  suba a redes.

No implementar nada de esto hasta que exista un EVENT-N con spec propio.
