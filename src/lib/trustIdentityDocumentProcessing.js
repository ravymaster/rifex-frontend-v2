// src/lib/trustIdentityDocumentProcessing.js
// TRUST-3A — procesamiento defensivo de imágenes de documentos de
// identidad. Mismo pipeline real que src/pages/api/colectas/
// upload-photo.js (sharp: decodificación real, re-encode desde cero,
// EXIF descartado, corrección de orientación), adaptado a que un
// documento NO debe recortarse (fit:'inside', nunca 'cover') y con
// defensas explícitas adicionales (magic bytes, límite de píxeles de
// entrada, límite de dimensiones) porque acá el archivo es
// significativamente más sensible que una foto de portada.
import { createHash } from 'crypto';
import sharp from 'sharp';
import {
  detectImageMimeFromMagicBytes,
  MAX_DOCUMENT_DIMENSION,
  MAX_DOCUMENT_INPUT_PIXELS,
} from './trustIdentityVerificationPolicy.js';

export class InvalidDocumentImageError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'InvalidDocumentImageError';
    this.reason = reason;
  }
}

/**
 * Procesa una imagen de documento subida: valida magic bytes reales,
 * decodifica con sharp bajo un límite explícito de píxeles de entrada
 * (anti decompression-bomb), rechaza dimensiones excesivas, corrige
 * orientación EXIF y descarta el resto de los metadatos, re-encodea a
 * JPEG sin recortar contenido. Nunca confía en el nombre de archivo ni
 * en el Content-Type que mande el cliente.
 *
 * @returns {Promise<{buffer: Buffer, mimeType: 'image/jpeg', sha256: string, byteSize: number}>}
 * @throws {InvalidDocumentImageError} con un `reason` estable, nunca un mensaje libre de sharp.
 */
export async function processDocumentImage(rawBuffer) {
  const detected = detectImageMimeFromMagicBytes(rawBuffer);
  if (!detected) {
    throw new InvalidDocumentImageError('invalid_image_format');
  }

  let image;
  try {
    image = sharp(rawBuffer, { failOn: 'error', limitInputPixels: MAX_DOCUMENT_INPUT_PIXELS });
    // Fuerza la decodificación real ahora (no perezosa) — si el buffer
    // no es una imagen real (o excede el límite de píxeles), esto tira.
    var metadata = await image.metadata();
  } catch (err) {
    throw new InvalidDocumentImageError('invalid_image_corrupt_or_too_large');
  }

  // El formato que sharp realmente decodificó, no lo que el cliente
  // afirmó — cierra el caso de un "polyglot" que pasa el sniff de magic
  // bytes pero decodifica como otra cosa.
  if (metadata.format !== 'jpeg' && metadata.format !== 'png') {
    throw new InvalidDocumentImageError('invalid_image_format');
  }

  if (
    (metadata.width && metadata.width > MAX_DOCUMENT_DIMENSION) ||
    (metadata.height && metadata.height > MAX_DOCUMENT_DIMENSION)
  ) {
    throw new InvalidDocumentImageError('image_dimensions_too_large');
  }

  let buffer;
  try {
    buffer = await sharp(rawBuffer, { failOn: 'error', limitInputPixels: MAX_DOCUMENT_INPUT_PIXELS })
      .rotate() // normaliza orientación EXIF antes de descartar el resto de los metadatos
      .resize(MAX_DOCUMENT_DIMENSION, MAX_DOCUMENT_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    throw new InvalidDocumentImageError('invalid_image_corrupt_or_too_large');
  }

  const sha256 = createHash('sha256').update(buffer).digest('hex');

  return { buffer, mimeType: 'image/jpeg', sha256, byteSize: buffer.length };
}
