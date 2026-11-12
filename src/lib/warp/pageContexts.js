// src/lib/warp/pageContexts.js
// Contexto de página para el asistente (Assistant 0.7.5, Warp Nivel 1).
//
// Tabla fija y cerrada: plantilla de ruta de Next.js → pageContext. La clave
// es `router.pathname` (la plantilla, p. ej. "/eventos/[id]"), nunca la URL
// real: no se leen slugs, query, hash, DOM, formularios, cookies ni sesión.
// Una ruta que no está en la tabla no envía contexto.
//
// El contexto solo orienta («Ya estoy aquí, ¿qué hago?»): no da permisos, no
// habilita capacidades ni prueba ningún rol. Cada combinación debe estar
// declarada también en `allowedPageContexts` de la configuración privada de
// Warp (ver PAGE_CONTEXT_ALLOWLIST).
//
// Sin contexto, a propósito:
//   - checkout, órdenes y resultados de pago: pagos;
//   - scanner de eventos e inscripciones: operación de acceso;
//   - /admin y /panel/admin/*: administración (el asistente público no
//     entrega datos administrativos);
//   - Rifas: excluidas del asistente;
//   - detalles de pago, callbacks y credenciales (Bancos & Pagos solo recibe
//     un contexto genérico de sección);
//   - detalles del panel con id de una iniciativa, perfiles de otras
//     personas, enlaces con token y páginas de respuesta de Medidor QR:
//     podrían sugerir datos privados o de terceros;
//   - recuperación de contraseña y callbacks técnicos.

const ctx = (pageId, module, area, guidance) => Object.freeze({ pageId, module, area, guidance });

export const PAGE_CONTEXTS = Object.freeze({
  '/': ctx('home', 'home', 'public', 'browse'),
  '/eventos': ctx('events-home', 'events', 'public', 'browse'),
  '/eventos/[id]': ctx('event-detail', 'events', 'public', 'view-details'),
  '/crear-evento': ctx('event-create', 'events', 'account', 'create-or-learn'),
  '/campanas': ctx('campaigns-home', 'campaigns', 'public', 'browse'),
  '/colectas/[id]': ctx('campaign-detail', 'campaigns', 'public', 'view-details'),
  '/crear-colecta': ctx('campaign-create', 'campaigns', 'account', 'create-or-learn'),
  '/inscripciones': ctx('registrations-home', 'registrations', 'public', 'browse'),
  '/inscripcion/[id]': ctx('registration-detail', 'registrations', 'public', 'view-details'),
  '/crear-inscripcion': ctx('registration-create', 'registrations', 'account', 'create-or-learn'),
  '/medidor-qr': ctx('qr-meter-home', 'qr-meter', 'public', 'create-or-learn'),
  '/crear-medidor-qr': ctx('qr-meter-create', 'qr-meter', 'account', 'create-or-learn'),
  '/contacto': ctx('support-contact', 'support', 'public', 'get-help'),
  '/login': ctx('account-login', 'account', 'public', 'sign-in'),
  '/register': ctx('account-register', 'account', 'public', 'sign-up'),
  // Menú interno (secciones generales; nunca su contenido). La combinación
  // `account-panel` corresponde a /mis-iniciativas, el inicio real de la cuenta
  // (/panel es el panel de Rifas y queda fuera).
  '/mis-iniciativas': ctx('account-panel', 'account', 'account', 'account-orientation'),
  '/perfil': ctx('account-profile', 'account', 'account', 'account-orientation'),
  '/panel/eventos': ctx('account-events', 'events', 'account', 'account-orientation'),
  '/panel/inscripciones': ctx('account-registrations', 'registrations', 'account', 'account-orientation'),
  '/panel/medidor-qr': ctx('account-qr-meter', 'qr-meter', 'account', 'account-orientation'),
  '/difusion': ctx('account-promotion', 'promotion', 'account', 'account-orientation'),
  // Bancos & Pagos: solo la sección. Nunca indica si Mercado Pago está
  // conectado ni banco, correo, RUT, cuenta, saldo o estado.
  '/panel/bancos': ctx('banks-payments', 'account', 'account', 'payments-settings'),
  // «Mis campañas» no tiene página propia: vive al final de /crear-colecta
  // (contexto campaign-create de arriba), a la que lleva «Ir a mis campañas».
});

// Rutas visuales evaluadas y dejadas sin contexto, con su motivo (documentación
// y pruebas; no se envía nada para ellas).
export const EXCLUDED_PAGE_CONTEXT_ROUTES = Object.freeze({
  '/checkout': 'payments',
  '/eventos/orden/[token]': 'payments',
  '/eventos/pago/exito': 'payments',
  '/eventos/pago/pendiente': 'payments',
  '/eventos/pago/error': 'payments',
  '/panel/eventos/[id]/scanner': 'operations',
  '/panel/inscripciones/[id]/scanner': 'operations',
  '/admin': 'administration',
  '/admin/cumplimiento': 'administration',
  '/admin/cumplimiento/[id]': 'administration',
  '/panel/admin/trust': 'administration',
  '/panel/admin/trust/[userId]': 'administration',
  '/panel': 'raffles',
  '/rifas': 'raffles',
  '/rifas/[id]': 'raffles',
  '/rifas/[id]/checkout': 'raffles',
  '/rifas/crear': 'raffles',
  '/crear-rifa': 'raffles',
  '/soluciones/rifas': 'raffles',
  '/terminos-rifas': 'raffles',
  '/c/[token]': 'raffles',
  '/chat/[raffleId]': 'raffles',
  '/panel/eventos/[id]': 'private-data',
  '/panel/inscripciones/[id]': 'private-data',
  '/panel/medidor-qr/[id]': 'private-data',
  '/panel/cumplimiento': 'private-data',
  '/panel/cumplimiento/[id]': 'private-data',
  '/perfil/[id]': 'private-data',
  '/i/[token]': 'private-data',
  '/t/[token]': 'private-data',
  '/cumplimiento/caso/[token]': 'private-data',
  '/m/[slug]': 'third-party-respondent',
  '/reset-password': 'account-recovery',
  '/auth/callback': 'technical',
  '/piloto-warp': 'technical',
});

export function pageContextFor(pathname) {
  const key = typeof pathname === 'string' ? pathname : '';
  return Object.prototype.hasOwnProperty.call(PAGE_CONTEXTS, key) ? PAGE_CONTEXTS[key] : null;
}

// Lista exacta para `allowedPageContexts` en la configuración privada de Warp.
export const PAGE_CONTEXT_ALLOWLIST = Object.freeze(Object.values(PAGE_CONTEXTS).map((c) => ({ ...c })));
