// src/lib/warp/rifexHelp.js
// Fuente curada de `rifex.help.read` (Connector de Warp, Nivel 1): guía del
// menú interno real de Rifex para personas con sesión, por tema cerrado.
//
// Tomado del código actual del menú de cuenta y de la navegación móvil
// (src/components/Layout.jsx: `accountItems` + «Cerrar sesión»), de las
// tarjetas de /mis-iniciativas, del pie (Contacto) y, para los temas de pagos
// y perfil, de /panel/bancos, /api/checkout/mp, /api/profile/update,
// /preguntas-frecuentes, /seguridad y la fuente de servicios (rifexServices). No consulta la base ni
// la sesión: el asistente explica dónde está cada función y entrega el
// enlace, pero nunca ve qué tiene la persona (iniciativas, estado de Mercado
// Pago, perfil, pagos) ni actúa por ella.
//
// Fuera a propósito: administración, Rifas (su panel vive en /panel y queda
// fuera del asistente), herramientas internas, rutas con identificadores
// privados o tokens, y opciones que un usuario normal no ve.
import { publicOrigin } from './publicOrigin.js';

export const HELP_VERSION = '2026-11-12b';
export const HELP_FIELDS = Object.freeze(['title', 'summary', 'steps', 'url', 'requires_session', 'safety_notice']);

const OPEN_ACCOUNT_MENU =
  'Inicia sesión y abre el menú de tu cuenta: en computador, el botón con tu inicial arriba a la derecha; en el celular, el ícono de menú (☰) y luego la sección de tu cuenta.';
const CREDENTIALS_NOTE =
  'Nunca compartas tu clave de Mercado Pago, códigos de verificación ni datos bancarios por chat, correo ni formularios. El asistente no puede ver si tu cuenta está conectada.';
const PRIVATE_DATA_NOTE =
  'El asistente no puede ver tus datos ni el estado de tu cuenta: revísalos tú mismo en esa página.';

// Inventario del menú interno (también documenta lo que se ofrece por tema).
const TOPICS = Object.freeze({
  'account-panel': {
    title: 'Mis iniciativas',
    summary: 'Es el inicio de tu cuenta: desde aquí entras a Campañas, Eventos, Inscripciones y Medidor QR.',
    steps: [OPEN_ACCOUNT_MENU, 'Elige «Mis iniciativas».', 'Toca la tarjeta del módulo que quieres administrar.'],
    path: '/mis-iniciativas',
    safety_notice: PRIVATE_DATA_NOTE,
  },
  profile: {
    title: 'Perfil',
    summary: 'Es tu perfil público de creador en Rifex: tu nombre, tu foto y la descripción «Sobre mí».',
    steps: [OPEN_ACCOUNT_MENU, 'Elige «Perfil».'],
    path: '/perfil',
    safety_notice: 'El asistente no puede ver ni cambiar tu perfil. Para cambios que no estén en Perfil, escribe al equipo desde Contacto.',
  },
  'profile-edit': {
    title: 'Editar tu Perfil',
    summary: 'En Perfil puedes cambiar tu nombre, la descripción «Sobre mí» y tu foto.',
    steps: [
      OPEN_ACCOUNT_MENU,
      'Elige «Perfil».',
      'Para el nombre o la descripción: pulsa «Editar perfil», cambia los textos y pulsa «Guardar».',
      'Para la foto: toca tu foto o tu inicial (ícono ✎) y elige una imagen PNG, JPG o WebP.',
    ],
    path: '/perfil',
    safety_notice: 'El asistente no puede ver ni cambiar tu perfil. Para cambios que no estén en Perfil, escribe al equipo desde Contacto.',
  },
  'profile-fields': {
    title: 'Datos del Perfil',
    summary:
      'Ningún dato del Perfil es obligatorio: el nombre (hasta 80 caracteres), la descripción «Sobre mí» (se guarda hasta 280 caracteres) y la foto son opcionales.',
    steps: [OPEN_ACCOUNT_MENU, 'Elige «Perfil» y revisa tú mismo qué datos tienes.'],
    path: '/perfil',
    safety_notice: 'El asistente no puede ver tu perfil ni saber si está completo.',
  },
  'banks-payments': {
    title: 'Bancos & Pagos',
    summary:
      'Tiene dos secciones: «Ganancias» (lo vendido, la comisión de Rifex y lo que te queda neto) y «Proveedores de pago», donde conectas, verificas o desconectas Mercado Pago para recibir tus cobros. Stripe aparece como no disponible.',
    steps: [OPEN_ACCOUNT_MENU, 'Elige «Bancos & Pagos».', 'Revisa «Ganancias» o ve a «Proveedores de pago» para Mercado Pago.'],
    path: '/panel/bancos',
    safety_notice:
      `Conecta Mercado Pago solo desde Bancos & Pagos, dentro de tu sesión. ${CREDENTIALS_NOTE}`,
  },
  'mp-connect': {
    title: 'Conectar Mercado Pago para recibir cobros',
    summary:
      'Para recibir los pagos de tus Eventos y los aportes de tus Campañas conectas tu propia cuenta de Mercado Pago. La conexión se autoriza en Mercado Pago y luego Rifex valida que la cuenta sea tuya.',
    steps: [
      OPEN_ACCOUNT_MENU,
      'Elige «Bancos & Pagos».',
      'Si Rifex te lo pide, primero indica en qué país operarás.',
      'En «Proveedores de pago», pulsa «Conectar» en Mercado Pago y autoriza la conexión en la página de Mercado Pago; volverás a Rifex.',
      'Si aparece que falta validar la titularidad, pulsa «Verificar cuenta». Cuando la cuenta esté validada verás «Cuenta de Mercado Pago validada».',
      'Si no tienes cuenta, usa «Crear cuenta en Mercado Pago» y luego vuelve a «Conectar».',
    ],
    path: '/panel/bancos',
    safety_notice: `Conecta solo con el botón «Conectar» de Bancos & Pagos. ${CREDENTIALS_NOTE}`,
  },
  'collect-vs-pay': {
    session: false,
    title: 'Cobrar con Rifex y pagar una compra',
    summary:
      'Cobrar: como organizador, recibes en tu propia cuenta de Mercado Pago, conectada en Bancos & Pagos, lo que pagan por tus entradas y lo que aportan a tus campañas; Rifex descuenta una comisión del 7% al momento del pago. Pagar: quien compra una entrada o aporta paga en la página de Mercado Pago al momento de comprar o aportar, y no conecta nada en Bancos & Pagos.',
    steps: ['Si vas a cobrar, conecta Mercado Pago en Bancos & Pagos con el botón «Conectar».', 'Si vas a pagar, sigue el botón de compra o aporte de la iniciativa: el pago se completa en Mercado Pago.'],
    path: '/preguntas-frecuentes',
    safety_notice: CREDENTIALS_NOTE,
  },
  'payment-methods': {
    session: false,
    title: 'Medios de pago',
    summary:
      'Los pagos de Rifex se procesan con Mercado Pago: quien paga lo hace en la página de Mercado Pago, con los medios que Mercado Pago ofrezca en ese momento. Para recibir cobros, el único proveedor disponible es Mercado Pago; no se conecta una cuenta bancaria directamente en Rifex.',
    steps: ['Para pagar: sigue el botón de compra o aporte y elige el medio en la página de Mercado Pago.', 'Para cobrar: conecta tu cuenta de Mercado Pago en Bancos & Pagos.'],
    path: '/preguntas-frecuentes',
    safety_notice: CREDENTIALS_NOTE,
  },
  'payment-security': {
    session: false,
    title: 'Seguridad de pagos y credenciales',
    summary:
      'Los pagos se procesan mediante el proveedor de pagos conectado y se acreditan en la cuenta del organizador. La conexión con Mercado Pago se autoriza en la propia página de Mercado Pago, sin entregar tu clave a nadie.',
    steps: ['Conecta o revisa Mercado Pago solo desde Bancos & Pagos.', 'Si algo no cuadra, escribe al equipo desde Contacto sin incluir claves ni códigos.', 'Para más detalle, revisa la página Seguridad.'],
    path: '/seguridad',
    safety_notice:
      'Nunca envíes contraseñas, códigos de verificación, claves, datos bancarios ni credenciales de Mercado Pago, ni por chat, ni por el formulario, ni por correo.',
  },
  'mp-required': {
    title: 'Por qué Eventos y Campañas requieren Mercado Pago',
    summary:
      'En Eventos y Campañas el dinero de cada venta o aporte se acredita directamente en tu propia cuenta de Mercado Pago, y la comisión de Rifex se descuenta en ese momento. Por eso, para crear iniciativas con cobro, tu cuenta de Mercado Pago debe estar conectada y validada en Bancos & Pagos.',
    steps: [OPEN_ACCOUNT_MENU, 'Elige «Bancos & Pagos» y conecta y valida Mercado Pago.', 'Cuando veas «Tu cuenta ya está lista para crear iniciativas», continúa con tu Evento o Campaña.'],
    path: '/panel/bancos',
    safety_notice: CREDENTIALS_NOTE,
  },
  'mp-not-required': {
    session: false,
    title: 'Módulos que no necesitan Mercado Pago',
    summary:
      'Inscripciones (actividades gratuitas, nunca cobra a quien se inscribe) y Medidor QR (gratis) no necesitan Mercado Pago.',
    steps: ['Para Inscripciones, entra a la página de Inscripciones.', 'Para Medidor QR, entra a la página de Medidor QR.'],
    path: '/inscripciones',
    safety_notice: null,
  },
  events: {
    title: 'Mis eventos',
    summary: 'Lista de los eventos que creaste, para revisarlos y administrarlos.',
    steps: [OPEN_ACCOUNT_MENU, 'Elige «Mis iniciativas».', 'Toca «Ir a mis eventos».'],
    path: '/panel/eventos',
    safety_notice: PRIVATE_DATA_NOTE,
  },
  campaigns: {
    title: 'Mis campañas',
    summary: 'En la página de Campañas creas una campaña nueva y, más abajo, ves «Mis campañas».',
    steps: [OPEN_ACCOUNT_MENU, 'Elige «Mis iniciativas».', 'Toca «Ir a mis campañas».'],
    path: '/crear-colecta',
    safety_notice: PRIVATE_DATA_NOTE,
  },
  registrations: {
    title: 'Mis inscripciones',
    summary: 'Lista de las actividades con inscripción que creaste, con su acceso por QR y la lista de asistentes.',
    steps: [OPEN_ACCOUNT_MENU, 'Elige «Mis iniciativas».', 'Toca «Ir a mis inscripciones».'],
    path: '/panel/inscripciones',
    safety_notice: PRIVATE_DATA_NOTE,
  },
  'qr-meter': {
    title: 'Mis Medidores QR',
    summary: 'Lista de los Medidores QR que creaste, con sus métricas de escaneos y respuestas.',
    steps: [OPEN_ACCOUNT_MENU, 'Elige «Mis iniciativas».', 'Toca «Ir a mis Medidores QR».'],
    path: '/panel/medidor-qr',
    safety_notice: PRIVATE_DATA_NOTE,
  },
  promotion: {
    title: 'Difusión',
    summary: 'Guía con recomendaciones para difundir tus Campañas, Eventos e Inscripciones.',
    steps: [OPEN_ACCOUNT_MENU, 'Elige «Difusión».', 'Selecciona el tipo de iniciativa para ver sus recomendaciones.'],
    path: '/difusion',
    safety_notice: null,
  },
  support: {
    session: false,
    title: 'Contacto y soporte',
    summary: 'Formulario y correo del equipo de Rifex. Está en el pie de todas las páginas y no requiere sesión.',
    steps: ['Baja hasta el pie de cualquier página.', 'En «Soporte», elige «Contacto».', 'Escribe tu consulta en el formulario o al correo publicado.'],
    path: '/contacto',
    safety_notice:
      'Nunca envíes contraseñas, códigos de verificación, claves, datos bancarios ni credenciales de Mercado Pago, ni por el formulario ni por correo.',
  },
  logout: {
    title: 'Cerrar sesión',
    summary: 'La opción «Cerrar sesión» está al final del menú de tu cuenta. El asistente no puede cerrar tu sesión por ti.',
    steps: [OPEN_ACCOUNT_MENU, 'Elige «Cerrar sesión» (al final del menú).'],
    path: null,
    safety_notice: 'Si usas un equipo compartido, cierra la sesión al terminar.',
  },
});

export const HELP_TOPICS = Object.freeze(Object.keys(TOPICS));
// Ruta de cada tema (null si no tiene página propia); para pruebas y auditoría.
export const HELP_TOPIC_PATHS = Object.freeze(Object.fromEntries(Object.entries(TOPICS).map(([k, t]) => [k, t.path])));

export function readHelp({ topic } = {}) {
  const t = Object.prototype.hasOwnProperty.call(TOPICS, topic) ? TOPICS[topic] : null;
  if (!t) return null;
  return {
    title: t.title,
    summary: t.summary,
    steps: [...t.steps],
    url: t.path ? `${publicOrigin()}${t.path}` : null,
    requires_session: t.session !== false,
    safety_notice: t.safety_notice,
  };
}
