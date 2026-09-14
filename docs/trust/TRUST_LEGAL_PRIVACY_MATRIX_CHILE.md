# Trust — Matriz Legal y de Privacidad (Chile)

Investigación con fuentes oficiales, cada afirmación fechada. Este documento **no es asesoría legal** — clasifica cada punto en una de cuatro categorías explícitas, tal como exige el mandato de esta misión, y nunca afirma "Rifex cumple toda la ley" sin revisión profesional.

**Clasificación usada en todo el documento:**
1. **Obligación legal confirmada** — verificado contra fuente oficial o fuente secundaria confiable con fecha.
2. **Política voluntaria de Rifex** — decisión de producto, no exigida por ley, adoptada por criterio propio.
3. **Recomendación de seguridad** — buena práctica de la industria, no necesariamente ley.
4. **Requiere abogado chileno** — zona gris, insuficientemente verificada, o materia que depende de análisis caso a caso.

---

## 1. Marco de protección de datos personales

### 1.1 Ley 19.628 sobre Protección de la Vida Privada (1999)

**[1 — Obligación legal confirmada]** Ley marco vigente desde 1999, regula el tratamiento de datos personales de personas naturales en Chile. Sigue siendo el régimen operativo primario a la fecha de este documento (26 de agosto de 2026), mientras la Ley 21.719 completa su período de vacancia legal. Fuente: Biblioteca del Congreso Nacional (BCN), Ley Chile, `idNorma=141599`.

### 1.2 Ley 21.719 — reforma integral de protección de datos personales

**[1 — Obligación legal confirmada, con fecha de entrada en vigencia futura]**
- Publicada en el Diario Oficial el **13 de diciembre de 2024**.
- Modifica sustancialmente la Ley 19.628 (no la deroga por completo, la reforma).
- **La mayoría de sus disposiciones entra en plena vigencia el 1 de diciembre de 2026** — es decir, aproximadamente 3 meses después de la fecha de este documento. A la fecha de escritura, Chile está en el tramo final de la vacancia legal de esta reforma.
- Crea una nueva **Agencia de Protección de Datos Personales**, con poder sancionatorio real.
- Multas de hasta **20.000 UTM**, o hasta **4% de los ingresos anuales** de la empresa en caso de reincidencia.
- Otorga derechos **ARCO** completos (Acceso, Rectificación, Cancelación, Oposición) más portabilidad de datos.
- Exige **notificación de brechas de seguridad en un plazo de 72 horas**.
- El marco está alineado, en su diseño general, con estándares internacionales como el GDPR europeo (fuente secundaria, no verificado artículo por artículo).

**Categorías de datos sensibles bajo Ley 21.719** [1 — obligación legal confirmada, fuente secundaria fechada]:
- Datos de salud.
- Perfil biológico y **biométrico**.
- Origen racial o étnico.
- Afiliación sindical, política o gremial.
- Convicciones religiosas o filosóficas.
- Vida y orientación sexual.
- **Situación socioeconómica** — categoría adicional propia del caso chileno, sin equivalente directo en GDPR.

**Datos biométricos específicamente** [1]: huella, iris, rostro, voz. Su tratamiento exige **consentimiento previo e informado** sobre el sistema usado, la finalidad, el período de uso, y cómo ejercer los derechos del titular. Esto es directamente relevante para cualquier verificación futura con *liveness*/*face match* — ver `TRUST_AGE_IDENTITY_VERIFICATION.md`.

**Menores de edad bajo Ley 21.719** [1]:
- **Niños/niñas**: menores de 14 años. Requiere consentimiento verificable de padres/representantes para cualquier tratamiento de sus datos.
- **Adolescentes**: 14 a 17 años. Sus datos **sensibles** también requieren consentimiento de padres/representantes si son menores de 16.
- El tratamiento de datos de menores debe atender siempre al **interés superior del menor** y a su **autonomía progresiva** (art. 16 quáter).
- Los datos de menores **no pueden usarse con fines comerciales ni publicitarios**.

**Implicancia directa para Rifex Trust** [2 — política voluntaria, más estricta que el mínimo legal]: el umbral de 18 años que Rifex ya aplica para crear/publicar/recaudar (ver EVENT-1 a EVENT-5, `legal_declarations`) es **más estricto** que el umbral legal de 14/16/17 años de la Ley 21.719 — Rifex nunca necesita construir un flujo de "consentimiento parental" porque, por diseño de producto, ningún menor puede operar como creador/organizador en absoluto. Esto es una decisión de negocio que **reduce** la superficie de cumplimiento respecto de menores, no la elimina completamente (un comprador/aportante menor de edad sigue siendo una posibilidad real y debe tratarse con cuidado — ver Fase 4).

### 1.3 Principios que ambas leyes comparten (base para el diseño de Trust)

**[1 — obligación legal confirmada, principios generales del derecho de protección de datos, consistentes entre 19.628 y 21.719]**:
- **Finalidad**: los datos solo pueden recolectarse y tratarse para el propósito declarado, no para cualquier uso futuro no anunciado.
- **Proporcionalidad**: no recolectar más de lo necesario para el propósito declarado — principio directamente citado en el mandato de esta misión ("no debe solicitar documentos innecesarios").
- **Consentimiento**: libre, informado, inequívoco — nunca implícito por el solo hecho de usar el servicio.
- **Seguridad**: medidas técnicas y organizativas razonables para proteger los datos tratados.
- **Conservación limitada**: los datos no deben conservarse indefinidamente sin una razón declarada — ver `TRUST_DATA_RETENTION_MATRIX.md`.
- **Derechos del titular**: acceso, rectificación, cancelación, oposición (y portabilidad bajo 21.719).

Estos cinco principios son la columna vertebral del diseño de Rifex Trust en todos los documentos de esta carpeta — cada campo de dato propuesto en `TRUST_UNIFIED_ONBOARDING.md` se justifica contra "finalidad" y "proporcionalidad" explícitamente.

---

## 2. Marco legal de rifas y sorteos — hallazgo material, no solo de privacidad

**[4 — REQUIERE ABOGADO CHILENO, hallazgo de alta relevancia para el modelo de negocio]**

A diferencia de la protección de datos (donde el marco es razonablemente claro), el marco legal de **rifas y sorteos en Chile es restrictivo por diseño** y presenta una **zona gris real y actual** directamente relevante al producto central de Rifex:

- El ordenamiento jurídico chileno trata las rifas/sorteos como **juegos de azar**, en principio **prohibidos salvo autorización expresa** de la autoridad — fuente: BCN, "Regulación de rifas y sorteos de bienes inmuebles" (documento de investigación BCN, sin fecha de acceso exacta más allá de esta búsqueda de 2026).
- La norma habilitante principal es la **Ley N° 10.262 (1952)** y su reglamento, que permite rifas y sorteos **cuando son organizados por personas jurídicas sin fines de lucro** (instituciones de beneficencia, deportivas, mutualistas) **con autorización del Ministerio del Interior** (antes Intendentes Regionales, hoy Delegados Presidenciales Regionales).
- El trámite de autorización se solicita en línea a través de la plataforma del Ministerio del Interior (ChileAtiende, ficha 3760) — exige estatutos, certificado de personalidad jurídica y antecedentes del representante legal.
- **Colectas públicas** comparten exactamente el mismo marco (misma Ley 10.262, Decreto N° 969/1975) — misma exigencia de personalidad jurídica y estatutos, mismo procedimiento.
- Fuente periodística de 2026 (`g5noticias.cl`, abril 2026) documenta explícitamente que las **"rifas de influencers"** — es decir, rifas organizadas por **personas naturales**, no instituciones — existen en un **"vacío legal" que actualmente tensiona la regulación** en Chile.

**Implicancia directa para Rifex**: el modelo de negocio actual de Rifex (Rifas y Colectas creadas mayoritariamente por **personas naturales**, no por instituciones sin fines de lucro con personalidad jurídica) **no encaja limpiamente** en el marco habilitante de la Ley 10.262 tal como está escrito. Esto **no significa que Rifex sea ilegal** — significa que es una **zona de incertidumbre regulatoria real, activa y de alta relevancia**, que requiere análisis de un abogado chileno especializado, idealmente antes de cualquier escalamiento significativo de volumen o de la promoción de Eventos a producción. Ninguna cantidad de diseño de Trust (verificación de identidad, KYC, etc.) resuelve por sí sola esta pregunta — Trust puede, en el futuro, **apoyar** una eventual formalización (por ejemplo, permitiendo que un creador se identifique como "persona jurídica sin fines de lucro" con estatutos verificados, si Rifex decide ese camino), pero la decisión de fondo es legal, no técnica.

**Recomendación explícita**: este hallazgo debe figurar en `TRUST_DECISIONS_FOR_RODRIGO.md` como el punto de mayor prioridad de todo el documento.

---

## 3. Comercio electrónico y consumidores

**[4 — Requiere abogado chileno]** La Ley 19.496 sobre Protección de los Derechos de los Consumidores aplica en general a las transacciones de Rifex (compra de entradas, boletos de rifa, aportes a colectas) en la medida en que constituyan relaciones de consumo — pero **no fue verificada artículo por artículo en esta sesión**. Puntos que típicamente requieren revisión (sin afirmar cómo se resuelven):
- Derecho a retracto en compras a distancia — su aplicabilidad exacta a la compra de un boleto de rifa o una entrada de evento (bienes no siempre "devolvibles" por naturaleza) no fue determinada aquí.
- Información previa obligatoria al consumidor (condiciones, plazos, mecanismo de sorteo, política de reembolso).
- Boletas/facturas y obligaciones tributarias del intermediario de pago (Mercado Pago) vs. el organizador — fuera del alcance de este documento.

## 4. Comunicaciones y marketing

**[3 — Recomendación de seguridad / buena práctica, alineado con principios generales de 19.628/21.719]** Aunque esta sesión no verificó una ley chilena específica de "anti-spam" con el mismo nivel de detalle que la ley de datos personales, el principio de **finalidad** (sección 1.3) ya exige, por sí solo, que un correo transaccional (ej. "tu ticket fue emitido") nunca se use como base para inscribir automáticamente al usuario en marketing continuo sin un consentimiento separado y revocable — ver `TRUST_EMAIL_NOTIFICATION_MATRIX.md` para el diseño concreto de esta separación.

## 5. Resumen de banderas para revisión legal (consolidado en `TRUST_DECISIONS_FOR_RODRIGO.md`)

| # | Tema | Categoría | Urgencia |
|---|---|---|---|
| 1 | Encaje legal de Rifas/Colectas de personas naturales bajo Ley 10.262 | Requiere abogado | **Alta — antes de escalar** |
| 2 | Preparación operativa para Ley 21.719 (vence vacancia legal el 1-dic-2026) | Obligación legal confirmada, con plazo | Alta — quedan ~3 meses desde este documento |
| 3 | Derecho a retracto y Ley 19.496 aplicada a boletos/entradas/aportes | Requiere abogado | Media |
| 4 | Boletas/facturación y split de pago vía Mercado Pago | Requiere abogado | Media |
| 5 | Consentimiento de marketing separado del transaccional | Recomendación adoptada por diseño | Ya incorporado al diseño |

---

**Fuentes citadas en este documento** (todas consultadas el 26 de agosto de 2026, vía búsqueda web con motor de búsqueda, no acceso directo verificado línea por línea al texto legal completo — recomendado que un abogado confirme el texto vigente exacto en leychile.cl antes de cualquier decisión de producto basada en este documento):
- BCN / Ley Chile, Ley 19.628 (`idNorma=141599`).
- BCN / Ley Chile, Ley 21.719 (`idNorma=1198671`), publicada 13-dic-2024.
- BCN, "Historia de la Ley N° 19.628".
- BCN, "Regulación de rifas y sorteos de bienes inmuebles" (documento de investigación).
- BCN, "Regulación de las colectas en Chile" (documento de investigación).
- ChileAtiende, ficha 3760, "Autorización para realizar rifas, sorteos y colectas públicas".
- Carey Abogados, nota sobre publicación de Ley 21.719 en el Diario Oficial.
- g5noticias.cl, "Rifas de influencers bajo la lupa: el vacío legal que tensiona la regulación en Chile" (abril 2026).
- Diversas guías de estudios jurídicos/consultoras sobre Ley 21.719 (Prey, Cheers Contracts, Araya, xmslatam, Yourdevs, Idónea, Confidata) — usadas como fuentes secundarias para fechas y categorías, no como fuente primaria del texto legal.
