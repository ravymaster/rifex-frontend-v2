# INSCRIPCIONES V1 — Secuencia manual de prueba en DEV (para Rodrigo)

Nunca hagas un pago real en ningún paso — Inscripciones V1 no requiere ni ofrece pago alguno.

1. Crea o usa una cuenta de Rifex en el despliegue DEV.
2. **No conectes Mercado Pago.**
3. Entra a Inscripciones (Mis iniciativas → Inscripciones, o directo a `/inscripciones`).
4. Crea una actividad (`/crear-inscripcion`) — nombre, fecha, modalidad, lugar.
5. Publícala.
6. Abre el link público (`/inscripcion/[id]`) en una ventana de incógnito.
7. Inscribe un participante (nombre, email, teléfono opcional).
8. Verifica que recibes/ves la confirmación en pantalla.
9. Abre el QR desde el enlace de confirmación (`/i/[token]`).
10. Vuelve a la cuenta del organizador → panel de la actividad → Scanner.
11. Escanea (o pega manualmente) el QR — debe decir **PASA**.
12. Escanéalo de nuevo — debe decir **YA REGISTRADO**.
13. Revisa el panel de la actividad — Inscritos/Asistieron/Pendientes deben reflejar lo anterior.
14. Descarga el Excel de inscritos.
15. Intenta crear una segunda actividad gratuita el mismo mes calendario.
16. Verifica el bloqueo mensual — debe mostrarse el mensaje de cupo gratuito ya usado, sin opción de pago.
