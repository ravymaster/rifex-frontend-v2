// tests/trustIdentityDocumentProcessing.test.mjs
// TRUST-3A — procesamiento defensivo real de imágenes (sharp real, sin
// mocks — se prueba contra el pipeline de verdad, mismo criterio que
// upload-photo.js). Genera sus propias imágenes sintéticas con sharp,
// nunca usa archivos ni datos reales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { processDocumentImage, InvalidDocumentImageError } from '../src/lib/trustIdentityDocumentProcessing.js';
import { MAX_DOCUMENT_DIMENSION } from '../src/lib/trustIdentityVerificationPolicy.js';

async function makeJpeg(width = 200, height = 120) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 50, b: 50 } } })
    .jpeg()
    .toBuffer();
}

async function makePng(width = 200, height = 120) {
  return sharp({ create: { width, height, channels: 4, background: { r: 10, g: 200, b: 10, alpha: 1 } } })
    .png()
    .toBuffer();
}

test('processDocumentImage: JPEG válido -> se re-codifica a JPEG con hash real', async () => {
  const buf = await makeJpeg();
  const result = await processDocumentImage(buf);
  assert.equal(result.mimeType, 'image/jpeg');
  assert.equal(result.sha256.length, 64);
  assert.ok(result.byteSize > 0);
  // El resultado nunca es el buffer original tal cual (siempre re-codificado).
  assert.notEqual(result.buffer.equals(buf), true);
});

test('processDocumentImage: PNG válido también se acepta y re-codifica a JPEG', async () => {
  const buf = await makePng();
  const result = await processDocumentImage(buf);
  assert.equal(result.mimeType, 'image/jpeg');
});

test('processDocumentImage: mismo contenido siempre produce el mismo hash (determinismo para deduplicación)', async () => {
  const buf = await makeJpeg(150, 100);
  const r1 = await processDocumentImage(buf);
  const r2 = await processDocumentImage(buf);
  assert.equal(r1.sha256, r2.sha256);
});

test('processDocumentImage: texto plano con nombre .jpg falso -> invalid_image_format', async () => {
  const fake = Buffer.from('esto no es una imagen, solo texto', 'utf8');
  await assert.rejects(() => processDocumentImage(fake), (err) => {
    assert.ok(err instanceof InvalidDocumentImageError);
    assert.equal(err.reason, 'invalid_image_format');
    return true;
  });
});

test('processDocumentImage: PDF real (%PDF) -> invalid_image_format, nunca se procesa como imagen', async () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< >>\nendobj\n', 'utf8');
  await assert.rejects(() => processDocumentImage(pdf), (err) => {
    assert.equal(err.reason, 'invalid_image_format');
    return true;
  });
});

test('processDocumentImage: JPEG truncado/corrupto -> invalid_image_corrupt_or_too_large', async () => {
  const real = await makeJpeg();
  const corrupted = real.subarray(0, Math.floor(real.length / 3));
  await assert.rejects(() => processDocumentImage(corrupted), (err) => {
    assert.ok(err instanceof InvalidDocumentImageError);
    return true;
  });
});

test('processDocumentImage: JPEG "polyglot" (datos extra pegados después del EOI) se limpia igual — el re-encode descarta cualquier payload extra', async () => {
  const real = await makeJpeg();
  const withTrailer = Buffer.concat([real, Buffer.from('<script>alert(1)</script>PK\x03\x04fake-zip-entry')]);
  const result = await processDocumentImage(withTrailer);
  assert.equal(result.mimeType, 'image/jpeg');
  // El buffer de salida jamás contiene el payload extra pegado.
  assert.equal(result.buffer.includes('<script>'), false);
});

test('processDocumentImage: dimensiones excesivas -> image_dimensions_too_large', async () => {
  const huge = await makeJpeg(MAX_DOCUMENT_DIMENSION + 500, 100);
  await assert.rejects(() => processDocumentImage(huge), (err) => {
    assert.equal(err.reason, 'image_dimensions_too_large');
    return true;
  });
});

test('processDocumentImage: buffer vacío -> rechazado sin lanzar una excepción no controlada', async () => {
  await assert.rejects(() => processDocumentImage(Buffer.from([])), (err) => {
    assert.ok(err instanceof InvalidDocumentImageError);
    return true;
  });
});

test('processDocumentImage: EXIF se descarta (nunca se llama withMetadata en el pipeline de salida)', async () => {
  const withExif = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 1, g: 2, b: 3 } } })
    .withMetadata({ orientation: 6, exif: { IFD0: { Make: 'FixtureCam' } } })
    .jpeg()
    .toBuffer();
  const result = await processDocumentImage(withExif);
  const outMeta = await sharp(result.buffer).metadata();
  assert.equal(outMeta.exif, undefined);
});
