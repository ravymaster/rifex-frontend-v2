# Declaración de medidas antifraude para Meta

> Documento interno, para uso en solicitudes de Meta (Facebook/Instagram Ads, verificación de negocio, etc.) que
> pidan describir las medidas antifraude de Rifex. Debe mantenerse veraz y actualizado — nunca ocultar ni falsear
> el proveedor de pagos ni el alcance real de las medidas si Meta solicita información específica.

## Declaración estándar

> Rifex verifica la consistencia entre los datos del creador y la titularidad de la cuenta receptora mediante su
> proveedor de pagos.

Esta es la frase exacta que la misión de corrección canónica (2026-08-27) autorizó usar. No ampliar ni dramatizar
más allá de lo que el sistema real hace hoy.

## Detalle real detrás de esa frase (para responder preguntas de seguimiento de Meta)

- **Registro obligatorio**: ningún usuario puede crear una rifa, colecta o evento sin completar un registro que
  incluye nombre (persona natural u organización), RUT chileno válido (verificado por dígito verificador), teléfono
  de contacto, declaración de mayoría de edad, y aceptación de Términos/Privacidad.
- **Proveedor de pagos**: Mercado Pago (Chile). Los pagos de compradores/aportantes van directo a la cuenta de
  Mercado Pago que el creador conecta — Rifex nunca los intermedia ni los retiene más allá de su comisión.
- **Verificación de titularidad**: cuando la API de Mercado Pago entrega un dato de identificación para la cuenta
  conectada, Rifex lo compara contra el RUT que el creador declaró en su registro. Si coinciden, la cuenta queda
  marcada como validada. Si no coinciden, o si la cuenta de Mercado Pago ya está vinculada a otra cuenta de Rifex,
  la cuenta queda con una revisión pendiente antes de operar sin restricciones.
- **Limitación real, honesta**: no todos los flujos de Mercado Pago para Chile entregan ese dato de identificación
  de forma confirmada — cuando no está disponible, Rifex no inventa una coincidencia ni bloquea al creador por
  ello; la cuenta queda marcada como pendiente de una verificación adicional.
- **Revisión documental excepcional**: para casos puntuales de mayor riesgo, Rifex puede pedir a un creador que
  suba una foto de su cédula de identidad chilena (frente y reverso) para que un humano la revise de forma privada
  antes de aprobar. Esto no es hoy un paso obligatorio para todos los creadores — es un mecanismo de respaldo.
- **Denuncias y evidencia**: cualquier persona puede reportar una iniciativa; Rifex pide a los creadores evidencia
  del sorteo y de la entrega del premio, que queda protegida para resolver disputas.
- **Consecuencias**: un incumplimiento verificado puede derivar en suspensión de cuenta y bloqueo para crear nuevas
  iniciativas. Rifex no determina por sí sola si algo constituye un delito.

## Qué NO decir

- No usar "verificación de identidad biométrica", "KYC completo", "0% fraude" ni afirmaciones similares que el
  sistema real no respalda.
- No prometer una tasa de detección de fraude específica — no existe una métrica real medida todavía.
- No describir el registro documental (TRUST-3A) como el flujo normal — es la excepción, no la regla.

## Referencias internas

- `docs/trust/TRUST_IMPLEMENTATION_ROADMAP.md` — estado real de TRUST-1/2/3A y de la corrección canónica de
  Mercado Pago como control principal.
- `docs/trust/MP_IDENTITY_MATCH_AUDIT.md` — auditoría real de qué entrega la API de Mercado Pago (y qué no se pudo
  confirmar en esta sesión).
- `src/pages/seguridad.js` — versión pública, dirigida a usuarios, de este mismo contenido.
