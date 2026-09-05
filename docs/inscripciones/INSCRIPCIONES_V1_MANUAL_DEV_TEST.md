# INSCRIPCIONES V1 — Secuencia manual de prueba (DEV y PROD)

Nunca hagas un pago real en ningún paso — Inscripciones V1 no requiere ni ofrece pago alguno.

**Confirmado ejecutado en PROD real el 2026-09-04** por Rodrigo (cuenta `rodrigo0878`/`rodrigo00787@hotmail.com`, sin Mercado Pago conectado) — ver `INSCRIPCIONES_V1_ARCHITECTURE.md`, sección "PROD promotion", para el detalle completo de la ejecución real.

1. Crea o usa una cuenta de Rifex.
2. **No conectes Mercado Pago.**
3. Entra a Inscripciones (Mis iniciativas → Inscripciones, o directo a `/inscripciones`).
4. Crea una actividad (`/crear-inscripcion`) — nombre, fecha, modalidad, lugar.
5. Publícala.
6. Abre el link público (`/inscripcion/[id]`) en una ventana de incógnito (o pásaselo a alguien más).
7. Inscribe un participante (nombre, email, teléfono opcional).
8. Verifica que recibes/ves la confirmación en pantalla.
9. Abre el QR desde el enlace de confirmación (`/i/[token]`) — disponible inmediatamente, sin depender del correo (el correo puede tardar o caer en spam según el proveedor).
10. Vuelve a la cuenta del organizador → panel de la actividad → Scanner.
11. Escanea con la cámara, o usa "Ingresar código manualmente" con el código del link — ambos caminos ejecutan la misma validación real. Debe decir **PASA**.
12. Repite el mismo código — debe decir **YA REGISTRADO**.
13. Revisa el panel de la actividad — Inscritos/Asistieron/Pendientes deben reflejar lo anterior.
14. Descarga el Excel de inscritos — confirma columnas Nombre/Email/Teléfono/Fecha de inscripción/Estado/Hora de check-in, sin `qr_token` ni datos técnicos.
15. Intenta crear una segunda actividad gratuita el mismo mes calendario.
16. Verifica el bloqueo mensual — debe mostrarse el mensaje de cupo gratuito ya usado, sin opción de pago.

**Nota**: el check-in no valida la fecha de la actividad — se puede escanear inmediatamente después de inscribirse, aunque la fecha configurada sea futura.
