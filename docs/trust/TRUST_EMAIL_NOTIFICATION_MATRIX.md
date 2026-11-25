# Trust — Matriz de Correos y Notificaciones

## Cuatro categorías, nunca mezcladas

1. **Transaccionales** — resultado directo de una acción del usuario (compra confirmada, documento recibido). No requieren opt-in separado; son parte de usar el servicio.
2. **Seguridad** — cambios sensibles en la cuenta, alertas de fraude. Tampoco requieren opt-in — son protección del usuario, no marketing.
3. **Encuestas** — pedir feedback tras una operación. Deberían tener un opt-out simple, aunque no sean "marketing" puro.
4. **Marketing** — promociones, novedades, contenido no ligado a una transacción puntual. **Requiere consentimiento explícito y separado, con baja disponible en cada envío.**

**Regla explícita del mandato, ya adoptada como política de Rifex**: una compra o un aporte **nunca** se convierte automáticamente en consentimiento de marketing ilimitado. El checkbox de marketing, si existe, debe estar **desmarcado por defecto** y ser independiente de completar la compra.

## Correos por evento

| Evento | Categoría | Contenido |
|---|---|---|
| Registro completado | Transaccional | Bienvenida, confirmación de cuenta |
| Onboarding pendiente | Transaccional | Recordatorio de completar `/registro/continuar` |
| Documento recibido (verificación Trust) | Transaccional | Confirmación de recepción, tiempo estimado de revisión |
| Verificación aprobada | Transaccional | Confirmación, próximos pasos habilitados |
| Verificación rechazada | Transaccional | Motivo legible, cómo corregir |
| Documento por expirar | Transaccional/Seguridad | Aviso previo a la expiración del documento verificado |
| Cambio sensible (email, teléfono, medio de pago, contraseña) | Seguridad | Confirmación del cambio + cómo reportar si no fue el usuario |
| Compra/aporte confirmado | Transaccional | Recibo, detalle de la operación |
| Ticket/entrada emitida | Transaccional | El ticket mismo (ver EVENT-3, ya implementado — QR como credencial) |
| Cancelación | Transaccional | Motivo, próximos pasos (reembolso si aplica) |
| Reembolso procesado | Transaccional | Confirmación, monto, método |
| Ganador de rifa | Transaccional | Aviso + instrucciones para confirmar y coordinar entrega |
| Entrega de premio registrada | Transaccional | Aviso al ganador para que confirme o dispute |
| Evento realizado | Transaccional | Aviso a compradores, invitación a reportar si algo no coincidió con lo anunciado |
| Colecta cerrada | Transaccional | Aviso de que la rendición está disponible |
| Alerta de seguridad (posible fraude, login inusual) | Seguridad | Nunca pide contraseña ni datos sensibles por correo — solo informa y dirige al usuario a la plataforma |
| Encuesta post-operación | Encuesta | Opt-out simple, nunca obligatoria |
| Denuncia recibida sobre tu cuenta/iniciativa | Transaccional (informativo, no marketing) | Aviso de que se recibió una denuncia y que está en revisión — sin exponer al denunciante |
| Resultado de una apelación | Transaccional | Motivo de la decisión final |

## Defensas anti-phishing (amenaza #18 del threat model)

- Dominio de envío único, consistente, con SPF/DKIM/DMARC configurados.
- Ningún correo de Rifex pide contraseña, código de verificación completo, ni datos de tarjeta.
- Los enlaces de acción sensible (ej. confirmar entrega, aprobar cambio) siempre dirigen al dominio real de Rifex, nunca a un dominio de acortador de URLs de terceros.

## Relación con `ENABLE_EMAILS`

El proyecto ya tiene un flag `ENABLE_EMAILS` (ver `docs/WOP.md`, lista de variables) que permite desactivar el envío real en DEV — el diseño de Trust reutiliza exactamente ese mismo mecanismo, sin introducir un sistema de correo paralelo. Ningún correo de Trust debe enviarse realmente en DEV salvo prueba explícitamente autorizada, mismo criterio ya aplicado en EVENT-1 a EVENT-6.
