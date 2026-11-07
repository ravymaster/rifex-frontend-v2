// src/lib/medidorQrTemplates.js
// MEDIDOR QR V1 — las plantillas son UX pura (sección 3 del mandato:
// "NO son arquitecturas ni tablas diferentes"). Cada una es solo un
// question/options precargado que el creador puede editar antes de
// crear — todas terminan produciendo el MISMO contrato
// (medidores_qr.question + medidores_qr.options), nunca una tabla o
// endpoint distinto por plantilla. 'custom' es la única sin precarga:
// el creador escribe su propia pregunta y 2-4 alternativas.
export const MEDIDOR_QR_TEMPLATES = [
  {
    key: 'convocatoria',
    label: 'Convocatoria',
    icon: '📣',
    question: '¿Piensas asistir a esta actividad?',
    options: ['Asistiré', 'Tal vez asistiré', 'Solo me interesa', 'No asistiré'],
  },
  {
    key: 'satisfaccion',
    label: 'Satisfacción',
    icon: '😊',
    question: '¿Cómo fue tu experiencia con nosotros?',
    options: ['Excelente', 'Buena', 'Regular', 'Mala'],
  },
  {
    key: 'interes_producto',
    label: 'Interés en producto',
    icon: '🛍️',
    question: '¿Qué tan interesado estás en este producto?',
    options: ['Lo compraría', 'Me interesa', 'Tal vez', 'No me interesa'],
  },
  {
    key: 'comercio',
    label: 'Comercio / nuevos productos',
    icon: '🏪',
    question: '¿Qué te gustaría encontrar aquí?',
    options: ['Más variedad', 'Mejores precios', 'Nuevos productos', 'Está bien así'],
  },
  {
    key: 'atencion_cliente',
    label: 'Atención al cliente',
    icon: '🤝',
    question: '¿Cómo evaluarías la atención recibida?',
    options: ['Excelente', 'Buena', 'Regular', 'Mala'],
  },
  {
    key: 'gastronomia',
    label: 'Gastronomía',
    icon: '🍽️',
    question: '¿Qué te pareció tu comida?',
    options: ['Excelente', 'Buena', 'Regular', 'Mala'],
  },
  {
    key: 'taller_curso',
    label: 'Taller / curso / actividad',
    icon: '🎓',
    question: '¿Qué tan probable es que te inscribas?',
    options: ['Me inscribiré', 'Tal vez', 'Solo tengo curiosidad', 'No me interesa'],
  },
  {
    key: 'preferencia',
    label: 'Preferencia',
    icon: '⭐',
    question: '¿Cuál prefieres?',
    options: ['Opción A', 'Opción B', 'Ambas', 'Ninguna'],
  },
  {
    key: 'recomendacion',
    label: 'Recomendación',
    icon: '👍',
    question: '¿Recomendarías este lugar o servicio?',
    options: ['Sí', 'Probablemente sí', 'Probablemente no', 'No'],
  },
  {
    key: 'personalizado',
    label: 'Personalizado',
    icon: '✏️',
    question: '',
    options: ['', ''],
  },
];

export function findMedidorQrTemplate(key) {
  return MEDIDOR_QR_TEMPLATES.find((t) => t.key === key) || null;
}
