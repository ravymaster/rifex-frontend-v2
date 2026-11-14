# Trust — Evidencia Posterior a la Transacción

Principio: la confianza en Rifex no termina cuando se cobra el dinero — el sistema debe registrar qué pasó **después**, con evidencia protegida, y solo exponer públicamente un resumen mínimo, nunca el detalle privado.

## Rifas/Sorteos

```text
1. Ganador determinado (mecanismo de sorteo ya certificado en DRAW-1/1B/2)
2. Aviso al ganador (correo, ver TRUST_EMAIL_NOTIFICATION_MATRIX.md)
3. Confirmación del ganador (el ganador confirma que fue contactado y acepta el premio)
4. El creador registra la entrega (evidencia: foto, guía de despacho, comprobante — proporcional al valor del premio)
5. El ganador confirma la entrega, o la disputa
6. La evidencia de entrega queda protegida (no pública) — accesible solo a las partes involucradas y a Trust en caso de disputa
7. Estado público limitado: "Premio entregado y confirmado" (o "en disputa", o "pendiente") — nunca se expone la evidencia misma públicamente
```

Si el ganador disputa la entrega, el caso pasa a la cola de Trust (`trust_reviewer`) con toda la evidencia disponible de ambas partes — mismo patrón de revisión humana que el resto del sistema.

## Eventos

```text
1. El evento finaliza (fecha real, no solo la fecha programada — EVENT-1..5 ya distinguen esto)
2. El organizador confirma que el evento se realizó
3. Los compradores de entradas pueden reportar un problema (evento no realizado, condiciones distintas a lo anunciado, etc.)
4. Trust procesa las señales (¿cuántos reportes?, ¿de cuántas cuentas distintas?, ¿el organizador tiene historial?)
5. El historial del organizador se actualiza — visible internamente para Trust, resumido públicamente como parte de su nivel de confianza, nunca como un detalle de "3 personas se quejaron de tal evento"
```

## Colectas

```text
1. La campaña finaliza (fecha declarada de cierre, o cierre manual del creador)
2. El creador publica una actualización/rendición de cómo se usaron los fondos — proporcional al monto recaudado (ver documentos por producto en RIFEX_TRUST_CANONICAL_DESIGN.md)
3. Los aportantes reciben un aviso de que la rendición está disponible
4. Los aportantes pueden reportar uso engañoso de los fondos
5. Igual que Eventos: las señales alimentan el historial de Trust del creador, revisadas por un humano antes de cualquier acción, nunca automáticas
```

## Principio compartido entre los tres productos

- La evidencia posterior **nunca es opcional para montos altos** — es proporcional al riesgo (ver el motor de riesgo en `RIFEX_TRUST_CANONICAL_DESIGN.md`): una rifa de bajo valor puede pedir solo una foto de entrega; una colecta de salud de monto alto puede requerir rendición documentada.
- El estado público siempre es un **resumen limitado y no acusatorio** ("entregado y confirmado" / "en revisión" / "sin confirmar") — nunca expone la evidencia privada ni acusaciones no resueltas.
- Toda disputa pasa por revisión humana (`trust_reviewer`) antes de cualquier acción visible sobre la cuenta del creador/organizador — nunca una suspensión automática solo por un reporte.
- Esto retroalimenta directamente la **reputación basada en operaciones reales** (Fase 2 del mandato): el nivel de Trust de un creador no depende solo de sus documentos de identidad, sino de su historial real de entregas confirmadas, colectas rendidas y eventos realizados sin disputas — nunca un número público, ver `RIFEX_TRUST_CANONICAL_DESIGN.md`, motor de riesgo.
