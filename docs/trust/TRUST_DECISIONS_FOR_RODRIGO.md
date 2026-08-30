# Trust — Decisiones que Rodrigo debe revisar

Consolidado de cada punto marcado como "requiere abogado", "decisión de producto pendiente" o "supuesto sin verificar" en los 12 documentos de diseño de `docs/trust/`. Ordenado por prioridad, no por documento de origen.

## Prioridad 1 — antes de cualquier avance real de Trust

1. **Encaje legal de Rifas/Colectas de personas naturales bajo la Ley 10.262** (`TRUST_LEGAL_PRIVACY_MATRIX_CHILE.md`, sección 2). Chile trata las rifas/sorteos y las colectas públicas como actividades en principio restringidas a personas jurídicas sin fines de lucro, con autorización del Ministerio del Interior. El modelo de Rifex (creadores individuales) existe en una zona gris real y activa (documentada por prensa de abril 2026 sobre "rifas de influencers"). **Este es, con evidencia real, el hallazgo de mayor relevancia de toda esta misión** — ninguna cantidad de verificación de identidad lo resuelve por sí sola. Recomendado: consulta con abogado chileno especializado en la materia antes de escalar volumen o promover Eventos a producción.
2. **Vulnerabilidad `create_tickets_for_raffle` pendiente en PROD** (heredada de EVENT-6 Fase 2, no de esta misión de Trust, pero sigue sin resolverse en PROD). Ver `docs/handover/HANDOVER_NOTEBOOK_TO_DESKTOP_2026-08.md` — acción urgente, ejecutable **solo desde el PC de escritorio en Santiago**, nunca desde este notebook.

## Prioridad 2 — antes de implementar TRUST-3 (documentos privados)

3. **Preparación operativa para la Ley 21.719** — entra en vigencia plena el 1 de diciembre de 2026, quedan aproximadamente 3 meses desde la fecha de este documento. Trust está diseñado para ser compatible desde el día uno, pero eso no reemplaza una revisión legal real antes de esa fecha.
4. **Método de verificación de identidad a usar en TRUST-2/3** — esta sesión recomienda un híbrido de verificación documental externa + revisión humana de respaldo (método 3+2 de `TRUST_AGE_IDENTITY_VERIFICATION.md`), reservando *liveness*/*face match* (método 4) solo para operaciones de mayor riesgo. Es una recomendación, no una decisión tomada — Rodrigo debe confirmarla o ajustarla.
5. **Retención de imágenes de documentos** — esta sesión recomienda **no conservar la imagen**, solo el resultado de verificación, cuando sea técnicamente viable. Confirmar si esto es viable con el proveedor que finalmente se elija (TRUST-8).

## Prioridad 3 — decisiones de producto, sin urgencia legal inmediata

6. **Certificado de nacimiento como excepción, nunca como flujo estándar** — ya diseñado así, con advertencia explícita en `TRUST_AGE_IDENTITY_VERIFICATION.md`. Confirmar que se mantiene esta postura.
7. **No construir reconocimiento facial propio** — recomendación explícita de esta sesión, requiere decisión documentada de Rodrigo antes de que cualquier etapa del roadmap lo contemple.
8. **No exigir certificado de antecedentes penales por defecto** — reservado como medida excepcional, jurídicamente sensible. Confirmar postura.
9. **Estructura de roles de revisión** (`trust_reviewer`, `trust_supervisor`, `support_readonly`, `security_auditor`) y la regla de apelación revisada por una persona distinta — con un equipo pequeño, esta última regla puede ser difícil de cumplir en la práctica; Rodrigo debe decidir cómo se resuelve esa tensión operativa real, no solo aceptar el diseño ideal.
10. **Domicilio como dato condicional, nunca universal** — confirmar que esta postura de proporcionalidad es aceptable para el negocio (podría sentirse "menos estricto" de lo que algunos usuarios esperan, pero está alineada con la ley).

## Prioridad 2b — agregado 2026-08-27, misión "onboarding MP como control principal"

2b.1. **2FA obligatorio para revisores y administradores, todavía sin implementar.** Decisión registrada en esta
sesión: 2FA queda **opcional para creadores** en esta fase, pero debería ser **obligatorio antes de producción**
para cualquier cuenta con `app_metadata.role === 'admin'` (incluye la cola de revisión de TRUST-3A). No se
implementó código — es una decisión de producto pendiente de ejecución.

2b.2. **Coincidencia RUT Rifex ↔ titular Mercado Pago: no se pudo confirmar empíricamente si la API lo entrega
para Chile.** Ver `docs/trust/MP_IDENTITY_MATCH_AUDIT.md` para el detalle completo — la documentación oficial de
Mercado Pago bloqueó todos los intentos de acceso automatizado, y este entorno no tenía credenciales de una app de
Mercado Pago para probar en vivo. El código quedó implementado de forma defensiva (nunca inventa una coincidencia,
nunca bloquea si el dato no está disponible), pero **alguien con credenciales reales de Mercado Pago debe conectar
una cuenta de prueba y confirmar el comportamiento real** antes de considerar este control "verificado en
producción".

## Prioridad 4 — expansión futura, sin urgencia

11. **Ningún país fuera de Chile queda habilitado por este diseño** — Argentina, Perú, Colombia, Uruguay y Brasil solo tienen una investigación comparativa inicial (`TRUST_COUNTRY_COMPLIANCE_PACKS.md`), no verificada al mismo nivel que Chile. Cualquier expansión real requiere su propia investigación dedicada y abogado local.
12. **Brasil en particular** tiene la mayor distancia (idioma, complejidad regulatoria de juegos de azar con cambios recientes) — marcado como el de mayor esfuerzo si se considera en el futuro.

## Supuestos que esta sesión no pudo verificar con certeza (marcados explícitamente en cada documento de origen)

- Si existe una integración oficial chilena de verificación de identidad abierta a terceros privados (método 5 de `TRUST_AGE_IDENTITY_VERIFICATION.md`) — no confirmado ni descartado.
- El estado exacto de un eventual proyecto de ley de datos personales más reciente en Argentina (mencionado en fuentes de agosto 2026, sin confirmar si fue aprobado).
- El marco específico de rifas/sorteos/colectas de Perú, Colombia, Uruguay y Brasil — solo mencionado el marco general de protección de datos de cada uno, no el de juegos de azar/colectas.
- Aplicabilidad exacta del derecho a retracto (Ley 19.496) a la compra de un boleto de rifa o una entrada de evento.

## Cómo usar este documento

Cada punto aquí tiene su desarrollo completo en el documento de origen citado — este archivo es un índice de decisiones, no un sustituto de leerlos. Ninguna de estas decisiones bloquea la lectura del resto del diseño; sí deberían bloquear el inicio de TRUST-1 en adelante hasta que Rodrigo las revise.
