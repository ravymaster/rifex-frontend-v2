# Trust — Verificación de Edad e Identidad

> **Actualización — TRUST-2 implementado en `rifex-dev` (2026-08-27).** El
> estado final descrito en este documento (edad e identidad
> **verificadas** contra un documento real) sigue siendo diseño puro —
> nada de eso existe todavía. Lo que TRUST-2 sí implementa es un peldaño
> intermedio, explícitamente distinto: exige que la fecha de nacimiento
> **declarada** implique 18+ (`age_requirement_met_from_declared_data`,
> nunca `age_verified`) y un RUT chileno **declarado con formato/dígito
> verificador válidos** (`rut_declared_and_format_valid`, nunca
> `identity_verified`) antes de poder crear, publicar o recaudar. Ningún
> código de TRUST-1/TRUST-2 escribe ni puede escribir `age_verified` o
> `identity_verified` — esas columnas ni siquiera existen todavía; se
> agregarán en TRUST-3+ cuando haya una verificación documental real que
> las respalde. Ver `docs/trust/TRUST_IMPLEMENTATION_ROADMAP.md`, sección
> TRUST-2, para el detalle completo.

## Principio rector

- Cualquier persona puede **explorar** Rifex sin registro.
- Un **comprador o aportante** entrega únicamente lo mínimo necesario para esa transacción puntual (nombre, email, medio de pago) — nunca se le exige verificación de identidad completa solo por comprar un boleto o aportar a una colecta.
- Solo quien **crea, publica, recauda o representa una iniciativa** (organizador de rifa, creador de colecta, organizador de evento) debe ser **mayor de 18 años**, y esa mayoría de edad debe estar **verificada**, no solo declarada.
- Declarar "soy mayor de 18" (checkbox) — que es exactamente lo que existe hoy en `legal_declarations`/`DECLARATION_TYPES.AGE_18` — **no es suficiente para publicar** bajo Rifex Trust. Es la base histórica del sistema, pero Trust la complementa, no la reemplaza silenciosamente: la declaración sigue existiendo como evidencia de aceptación consciente, pero deja de ser, por sí sola, la autoridad de "puede publicar".

## Tres niveles, nunca confundidos

1. **Edad declarada** — un checkbox o un campo de fecha de nacimiento que el usuario ingresa. Cero verificación. Es lo único que existe en Rifex hoy.
2. **Edad verificada** — la fecha de nacimiento fue confirmada contra un documento de identidad real, por un método de los descritos abajo.
3. **Identidad verificada** — no solo la edad: el nombre, RUT/RUN (u otro identificador nacional) y la persona detrás de la cuenta fueron confirmados contra un documento real, con algún grado de certeza de que quien presentó el documento es su titular.

Un organizador de Rifex Trust necesita, como mínimo, **edad verificada**. La **identidad verificada** es un nivel superior, requerido para operaciones de mayor riesgo (montos altos, colectas de salud, eventos masivos) — ver el motor de riesgo en `RIFEX_TRUST_CANONICAL_DESIGN.md`.

## Comparación de métodos

| # | Método | Qué demuestra | Qué NO demuestra | Costo | Fricción UX | Riesgo de privacidad |
|---|---|---|---|---|---|---|
| 1 | Fecha declarada + RUT declarado | Nada verificable — es autodeclaración pura | Identidad, edad real, que el RUT le pertenece | Cero | Mínima | Bajo (pero también protege poco) |
| 2 | Cédula/carnet revisado manualmente (foto subida, revisor humano compara) | Que existe un documento con esa foto/nombre/RUT/fecha de nacimiento, a juicio de un revisor humano | Que el documento es auténtico (revisores humanos no detectan falsificaciones sofisticadas de forma confiable); que quien subió la foto es el titular | Medio (tiempo humano) | Media | Medio — Rifex custodia imágenes de cédulas si no se diseña con cuidado |
| 3 | Verificación documental externa (proveedor especializado, sin liveness) | Autenticidad del documento con mayor confianza que revisión manual (detección de plantillas, hologramas, MRZ) | Que quien subió el documento es su titular real (alguien puede subir el documento de otra persona) | Medio-alto (por verificación) | Media | Medio — depende del proveedor y su propia retención |
| 4 | Documento + *liveness*/*face match* (selfie comparada biométricamente contra la foto del documento) | Autenticidad del documento **y** que quien está presente es, con alta probabilidad, su titular | Certeza absoluta (ningún sistema biométrico es 100%); requiere manejo cuidadoso de datos biométricos (Ley 21.719, sección "datos sensibles") | Alto | Alta (selfie + foto de documento, en móvil) | **Alto** — datos biométricos son categoría sensible bajo Ley 21.719, exige consentimiento explícito e informado |
| 5 | Integración oficial disponible (ej. validación contra un registro civil/RENIEC-equivalente, si existiera una API pública/autorizada en Chile) | El más alto nivel de certeza posible, si existe y es accesible legalmente | No evaluado en esta sesión si Chile ofrece una integración así de forma abierta a terceros privados — **requiere investigación adicional dedicada, no asumida** | Desconocido | Baja si es fluida | Bajo si el intermediario no retiene el dato, alto si lo hace |
| 6 | Certificado de nacimiento como alternativa excepcional | Que existe un registro de nacimiento con ese nombre/fecha | **Nada sobre quién lo está presentando** — ver advertencia obligatoria abajo | Bajo | Baja | **Alto** |

### Advertencia obligatoria sobre el certificado de nacimiento

Por instrucción explícita de esta misión, **no se recomienda el certificado de nacimiento como mecanismo principal** de verificación de edad o identidad, por estas razones, todas reales y no descartables:

- **No demuestra que quien lo sube sea el titular** — cualquiera con acceso al certificado de un tercero (un padre, un familiar, alguien que lo encontró) puede subirlo. Es, de todos los métodos, el que menos ata el documento a la persona presente.
- **Contiene información adicional** más allá de la fecha de nacimiento — nombres de los padres, a veces información de estado civil de estos, número de inscripción — datos que Rifex no necesita para verificar edad y cuya recolección violaría el principio de **proporcionalidad** (sección 1.3 de `TRUST_LEGAL_PRIVACY_MATRIX_CHILE.md`).
- **Aumenta el riesgo de privacidad** por la razón anterior: se estaría recolectando más de lo necesario, de más personas (los padres) de las que dieron su consentimiento.
- **Puede ser desproporcionado** como exigencia estándar — es un documento pensado para trámites civiles, no para verificación de identidad de plataformas digitales.
- **Puede pertenecer a otra persona** sin que Rifex tenga forma razonable de detectarlo con los medios descritos en los métodos 1-3.

**Uso aceptable, solo como excepción documentada**: un caso límite donde un usuario legítimamente carece de cédula vigente (por ejemplo, la perdió y está en trámite de reposición) podría, como excepción manual y con revisión humana reforzada — nunca automática — presentar un certificado de nacimiento **junto con** otra prueba de que es la persona (ej. una cédula vencida + el certificado, ambos con el mismo RUT). Nunca como puerta de entrada estándar.

## Recomendación de esta sesión (no vinculante, para revisión de Rodrigo)

Para el nivel "edad verificada" mínimo que Rifex Trust exige a todo organizador:

- **TRUST-2/TRUST-3** (ver `TRUST_IMPLEMENTATION_ROADMAP.md`): método **3** (verificación documental externa, sin *liveness*) como primer paso real, combinado con revisión humana como respaldo (método 2) para los casos que el proveedor marque como dudosos — un híbrido 2+3, no 100% automático desde el día uno.
- El método **4** (con *face match*/*liveness*) se reserva para el nivel "identidad verificada" superior, cuando el motor de riesgo (`RIFEX_TRUST_CANONICAL_DESIGN.md`) señale una operación de riesgo alto (montos grandes, colecta de salud, evento masivo) — nunca como exigencia universal desde el registro.
- El método **6** (certificado de nacimiento) queda como excepción manual documentada, nunca como flujo estándar, tal como se advirtió arriba.
- El método **5** (integración oficial) queda marcado explícitamente como **pendiente de investigación dedicada** — no se afirma en este documento que exista o no una vía oficial abierta a terceros en Chile; sería el ideal si existe, pero no debe asumirse.

## OCR / verificación documental — comparación de enfoque (Fase 10)

| Opción | Descripción | Seguridad | Privacidad | Costo | Precisión | UX móvil | Dependencia externa | Falsos positivos | Retención | Cumplimiento |
|---|---|---|---|---|---|---|---|---|---|---|
| **A. Revisión manual pura** | Un humano mira la foto subida y decide | Baja-media (falsificaciones sofisticadas pasan) | Rifex custodia la imagen si no se diseña con cuidado | Bajo en herramientas, alto en tiempo humano a escala | Baja-media, depende del revisor | Aceptable | Ninguna | Altos (criterio humano variable) | Definir explícitamente — ver `TRUST_DATA_RETENTION_MATRIX.md` | Manejable si se documenta el proceso |
| **B. OCR sin reconocimiento facial** | Extrae texto del documento (nombre, RUT, fecha de nacimiento, vigencia) automáticamente, sin comparar rostro | Media (detecta inconsistencias de formato, no falsificaciones visuales sofisticadas) | Media — no toca biometría, pero sigue manejando datos de identidad | Medio | Media-alta para extracción de texto | Buena | Media (proveedor de OCR) | Medios | Definir — el resultado (texto extraído + válido/inválido) puede conservarse sin conservar la imagen | Más simple — no entra en la categoría de dato biométrico sensible |
| **C. Proveedor KYC con documento + *liveness* + *face match*** | Suite completa: valida el documento, compara con una selfie en vivo | Alta | **Baja si Rifex no diseña con cuidado** — dato biométrico es sensible bajo Ley 21.719 | Alto (por verificación, con volumen) | Alta | Depende del proveedor, generalmente buena en apps modernas | **Alta** — Rifex queda dependiente del proveedor para una función crítica | Bajos, pero existen y deben tener revisión humana de respaldo | El proveedor típicamente recomienda no retener la imagen más allá de lo necesario — Rifex debería preferir recibir solo el **resultado**, no la imagen | Requiere el consentimiento explícito e informado de datos biométricos exigido por Ley 21.719 |

**Preferencia de diseño explícita** (instrucción directa de la misión, adoptada como política de Rifex — categoría 2): **Rifex debe preferir recibir el resultado de la verificación (aprobado/rechazado + los campos extraídos necesarios) y no conservar la imagen del documento cuando sea técnicamente viable.** Esto reduce drásticamente la superficie de un eventual incidente de seguridad — no se puede filtrar una cédula que nunca se guardó. Ver el detalle de qué se conserva vs. qué se descarta en `TRUST_DATA_RETENTION_MATRIX.md`.

## Defensas técnicas recomendadas para cualquier imagen que sí deba procesarse temporalmente

- Restringir formatos aceptados (ej. JPEG/PNG/HEIC, nunca ejecutables ni formatos "polyglot" que combinan una imagen válida con código embebido).
- Límite de dimensiones/tamaño de archivo antes de procesar.
- Re-codificar la imagen (nunca reenviar el archivo tal cual fue subido a ningún sistema downstream) — elimina payloads maliciosos embebidos en metadata o en la estructura del archivo.
- Eliminar metadata EXIF (que puede contener geolocalización u otra información no solicitada) antes de cualquier almacenamiento, aunque sea temporal.
- Escaneo de malware sobre el archivo subido antes de procesarlo.
- Hash del archivo para detectar duplicados exactos (útil para detectar reuso del mismo documento en múltiples cuentas — señal para el motor de riesgo).
- Detección básica de desenfoque/ilegibilidad antes de enviar a revisión (evita rechazos innecesarios y reduce carga de revisión humana).
- Validación de formato del RUT/RUN y su dígito verificador (algoritmo módulo 11, público) — validación de forma, nunca sustituto de verificación real de identidad.
- Verificación de vigencia del documento (fecha de expiración) — un documento vencido no debe aprobarse automáticamente, sin importar qué tan "legible" sea.
- Revisión humana como respaldo — nunca 100% automático sin la posibilidad de que un `trust_reviewer` intervenga (ver `TRUST_ROLES_AUTHORIZATION.md`).

## Reconocimiento facial propio — advertencia explícita

Por instrucción directa de esta misión: **no se recomienda que Rifex construya su propio sistema de reconocimiento facial** sin, como mínimo:
- Evaluación jurídica específica (dato biométrico = categoría sensible bajo Ley 21.719, exige consentimiento informado explícito, ver sección de datos biométricos en `TRUST_LEGAL_PRIVACY_MATRIX_CHILE.md`).
- Diseño de consentimiento granular y revocable, separado del resto del registro.
- Análisis de seguridad dedicado (un sistema biométrico propio es un objetivo de alto valor para un atacante).
- Política de retención explícita y mínima (idealmente cero retención de la imagen biométrica una vez emitido el resultado).
- Comparación de costo/beneficio contra proveedores especializados que ya resolvieron estos problemas (opción C de la tabla de arriba) — construir esto desde cero rara vez se justifica para una plataforma del tamaño actual de Rifex.

Esta recomendación es deliberadamente conservadora: **no implementar reconocimiento facial propio en ninguna fase del roadmap** (`TRUST_IMPLEMENTATION_ROADMAP.md`) sin una decisión explícita y documentada de Rodrigo después de revisar esta sección.
