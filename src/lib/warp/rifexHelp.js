// src/lib/warp/rifexHelp.js
// Fuente curada de `rifex.help.read` (Connector de Warp, Nivel 1): guía del
// menú interno real de Rifex para personas con sesión, por tema cerrado.
//
// Tomado del código actual del menú de cuenta y de la navegación móvil
// (src/components/Layout.jsx: `accountItems` + «Cerrar sesión»), de las
// tarjetas de /mis-iniciativas y del pie (Contacto). No consulta la base ni
// la sesión: el asistente explica dónde está cada función y entrega el
// enlace, pero nunca ve qué tiene la persona (iniciativas, estado de Mercado
// Pago, perfil, pagos) ni actúa por ella.
//
// Fuera a propósito: administración, Rifas (su panel vive en /panel y queda
// fuera del asistente), herramientas internas, rutas con identificadores
// privados o tokens, y opciones que un usuario normal no ve.
import { publicOrigin } from './publicOrigin.js';

export const HELP_VERSION = '2026-11-12';
export const HELP_FIELDS = Object.freeze(['title', 'summary', 'steps', 'url', 'requires_session', 'safety_notice']);

const OPEN_ACCOUNT_MENU =
  'Inicia sesión y abre el menú de tu cuenta: en computador, el botón con tu inicial arriba a la derecha; en el celular, el ícono de menú (☰) y luego la sección de tu cuenta.';
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
    summary: 'Muestra tu perfil público de creador. Con «Editar perfil» cambias tu nombre y la descripción «Sobre mí».',
    steps: [OPEN_ACCOUNT_MENU, 'Elige «Perfil».', 'Pulsa «Editar perfil», cambia tu nombre o la descripción y pulsa «Guardar».'],
    path: '/perfil',
    safety_notice: 'El asistente no puede ver ni cambiar tu perfil. Para cambios que no estén en Perfil, escribe al equipo desde Contacto.',
  },
  'banks-payments': {
    title: 'Bancos & Pagos',
    summary: 'Aquí conectas Mercado Pago para recibir los pagos de tus ventas y aportes, y revisas el estado de tu conexión.',
    steps: [OPEN_ACCOUNT_MENU, 'Elige «Bancos & Pagos».', 'En «Proveedores de pago», sigue los pasos para conectar o revisar Mercado Pago.'],
    path: '/panel/bancos',
    safety_notice:
      'Conecta Mercado Pago solo desde Bancos & Pagos, dentro de tu sesión. Nunca compartas tu clave de Mercado Pago, códigos de verificación ni datos bancarios por chat, correo ni formularios. El asistente no puede ver si tu cuenta está conectada.',
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
    requires_session: topic !== 'support',
    safety_notice: t.safety_notice,
  };
}
