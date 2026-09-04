// src/lib/difusionGuides.js
// DIFUSIÓN V1.1 — MULTIPRODUCTO. Contenido puro (sin JSX, sin lógica de
// red, sin IA) para las 4 guías de /difusion. No es un CMS ni una tabla
// nueva — es solo la estructura de datos mínima para evitar duplicar el
// markup de la página 4 veces (una por producto).
//
// "registration" (Inscripciones) todavía no es un producto real de
// Rifex — available:false marca esto explícitamente, y difusion.jsx no
// le muestra un botón "Copiar ejemplo" funcional (solo vista previa),
// para no simular una funcionalidad que no existe.
export const DIFFUSION_PRODUCTS = [
  { key: "raffle", label: "Rifas" },
  { key: "campaign", label: "Campañas" },
  { key: "event", label: "Eventos" },
  { key: "registration", label: "Inscripciones" },
];

export const DIFFUSION_GUIDES = {
  raffle: {
    key: "raffle",
    label: "Rifas",
    tagline: "Precauciones especiales",
    available: true,
    intro: [
      "Las redes sociales pueden aplicar restricciones adicionales a publicaciones o anuncios relacionados con rifas, sorteos, premios o actividades asociadas al azar.",
      "Dependiendo de la plataforma, el contenido puede ser revisado, limitado o rechazado.",
    ],
    clarifications: [
      "Una publicación orgánica y un anuncio pagado no son necesariamente tratados igual.",
      "Los anuncios pueden tener requisitos adicionales.",
      "Cambiar palabras no convierte una actividad restringida en una actividad permitida.",
      "Revisa siempre las políticas vigentes de la plataforma antes de publicar.",
    ],
    doList: [
      "Claridad sobre qué estás organizando.",
      "Información real.",
      "Organizador identificado.",
      "Enlace oficial de Rifex.",
      "Condiciones disponibles en la iniciativa.",
      "Texto natural y no engañoso.",
    ],
    sensitiveWordsNote:
      "Palabras como “rifa”, “sorteo”, “premio” o expresiones relacionadas con azar pueden activar revisiones adicionales en algunas plataformas.",
    example: `Estamos organizando una iniciativa para apoyar [motivo o causa].

Puedes conocer todos los detalles, condiciones y formas de participar en el siguiente enlace:

[enlace de tu iniciativa]

Organiza: [nombre del organizador]`,
    exampleNote:
      "Adapta este ejemplo a tu iniciativa. No publiques información falsa ni ocultes deliberadamente la naturaleza de lo que estás ofreciendo.",
    adNote:
      "Los anuncios pagados pueden estar sujetos a controles adicionales y, en algunos casos, a requisitos especiales. Meta, TikTok y otras plataformas pueden aplicar restricciones especiales a determinadas actividades relacionadas con premios, sorteos o azar. Un cambio de redacción no convierte una actividad restringida en una actividad permitida.",
  },

  campaign: {
    key: "campaign",
    label: "Campañas",
    tagline: "Comparte tu causa con claridad",
    available: true,
    intro: [],
    doList: [
      "Explica el motivo de la campaña.",
      "Identifica al organizador.",
      "Describe para qué se utilizarán los aportes.",
      "Usa información verificable.",
      "Dirige al enlace oficial de Rifex.",
    ],
    avoidList: [
      "Evita promesas exageradas.",
      "Evita garantías de resultados.",
      "Evita mensajes de “dinero fácil”.",
      "Evita presión engañosa.",
      "No ofrezcas contraprestaciones que la campaña no contempla.",
    ],
    example: `Estamos realizando una campaña para apoyar [causa o proyecto].

En Rifex puedes conocer el objetivo, la información del organizador y todos los detalles de la campaña.

Más información y aportes:

[enlace de tu campaña]

Organiza: [nombre del organizador]`,
    exampleNote: "Adapta el texto a tu campaña y comunica siempre información real y comprobable.",
    adNote: "Evita afirmaciones engañosas o resultados garantizados al promocionar tu campaña, orgánica o pagada.",
  },

  event: {
    key: "event",
    label: "Eventos",
    tagline: "Guía de difusión",
    available: true,
    intro: [],
    doList: [
      "Nombre del evento.",
      "Fecha.",
      "Hora.",
      "Lugar.",
      "Tipo de actividad.",
      "Información relevante.",
      "Disponibilidad de entradas.",
      "Enlace oficial.",
    ],
    avoidList: ["Evita información falsa.", "No prometas cosas que el evento no ofrece."],
    extraNote: "Puedes mencionar entradas digitales y QR cuando corresponda.",
    example: `🎫 ¡Ya están disponibles las entradas!

[Nombre del evento]

📅 [fecha]
🕒 [hora]
📍 [lugar]

Conoce todos los detalles y obtén tu entrada digital aquí:

[enlace del evento]

Organiza: [nombre del organizador]`,
    exampleNote: "Adapta este ejemplo a tu evento con información real y verificable.",
    adNote: "Cada plataforma mantiene sus propias políticas publicitarias — revísalas antes de contratar un anuncio.",
  },

  registration: {
    key: "registration",
    label: "Inscripciones",
    tagline: "Próximamente",
    available: false,
    previewText:
      "Cuando Inscripciones esté disponible, podrás compartir actividades gratuitas como talleres, cursos, capacitaciones y actividades comunitarias.",
    example: `📝 Inscripciones abiertas

[Nombre de la actividad]

📅 [fecha]
👥 Cupos: [cantidad]

Inscríbete aquí:

[enlace]

Organiza: [nombre del organizador]`,
  },
};

export const DIFFUSION_COMMON_AD_NOTE =
  "Las políticas de las plataformas pueden cambiar. Revisa siempre las reglas vigentes antes de publicar o contratar anuncios.";
