// tests/analyticsEvents.test.mjs
// ADMIN ANALYTICS — certifica el allowlist estricto de la analítica
// propia: ningún módulo/evento fuera de lo declarado en el mandato puede
// llegar a analytics_events, payment_approved/qr_scan/qr_response NUNCA
// existen como event_type válido, y todo dato de contexto (UTM/referrer)
// se sanea antes de insertar — nunca se confía en el navegador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANALYTICS_MODULES,
  ANALYTICS_EVENT_TYPES,
  isValidUuid,
  classifyDeviceFromUA,
  classifyTrafficFromUA,
  sanitizeReferrerHost,
  sanitizeUtmField,
  validateTrackPayload,
} from '../src/lib/analyticsEvents.js';

const VALID_UUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

test('ANALYTICS_MODULES never includes anything beyond the 4 mandated public-page modules', () => {
  assert.deepEqual([...ANALYTICS_MODULES].sort(), ['campaign', 'event', 'raffle', 'registration']);
});

test('ANALYTICS_EVENT_TYPES never includes payment_approved, qr_scan or qr_response', () => {
  assert.equal(ANALYTICS_EVENT_TYPES.includes('payment_approved'), false);
  assert.equal(ANALYTICS_EVENT_TYPES.includes('qr_scan'), false);
  assert.equal(ANALYTICS_EVENT_TYPES.includes('qr_response'), false);
  assert.deepEqual(
    [...ANALYTICS_EVENT_TYPES].sort(),
    ['cta_click', 'checkout_start', 'form_complete', 'form_start', 'page_view'].sort()
  );
});

test('isValidUuid accepts a real UUID and rejects garbage', () => {
  assert.equal(isValidUuid(VALID_UUID), true);
  assert.equal(isValidUuid('not-a-uuid'), false);
  assert.equal(isValidUuid(''), false);
  assert.equal(isValidUuid(null), false);
  assert.equal(isValidUuid(123), false);
});

test('classifyDeviceFromUA recognizes mobile, tablet and desktop', () => {
  assert.equal(classifyDeviceFromUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'mobile');
  assert.equal(classifyDeviceFromUA('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'tablet');
  assert.equal(classifyDeviceFromUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'desktop');
  assert.equal(classifyDeviceFromUA(''), 'unknown');
  assert.equal(classifyDeviceFromUA(undefined), 'unknown');
});

test('classifyTrafficFromUA flags well-known bots as bot, everything else as human', () => {
  assert.equal(classifyTrafficFromUA('Googlebot/2.1 (+http://www.google.com/bot.html)'), 'bot');
  assert.equal(classifyTrafficFromUA('facebookexternalhit/1.1'), 'bot');
  assert.equal(classifyTrafficFromUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0'), 'human');
});

test('sanitizeReferrerHost keeps only the hostname, never the full URL', () => {
  assert.equal(sanitizeReferrerHost('https://www.instagram.com/p/abc123/?utm_source=ig'), 'www.instagram.com');
  assert.equal(sanitizeReferrerHost('not a url'), null);
  assert.equal(sanitizeReferrerHost(''), null);
  assert.equal(sanitizeReferrerHost(undefined), null);
});

test('sanitizeUtmField rejects HTML/script-like content and oversized values', () => {
  assert.equal(sanitizeUtmField('instagram_story'), 'instagram_story');
  assert.equal(sanitizeUtmField('<script>alert(1)</script>'), null);
  assert.equal(sanitizeUtmField('a'.repeat(200)).length <= 100, true);
  assert.equal(sanitizeUtmField(''), null);
  assert.equal(sanitizeUtmField(null), null);
});

test('validateTrackPayload accepts a well-formed payload', () => {
  const result = validateTrackPayload({
    module: 'raffle',
    entity_id: VALID_UUID,
    event_type: 'page_view',
    visitor_id: VALID_UUID,
    utm_source: 'instagram',
    referrer: 'https://instagram.com/p/x',
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.module, 'raffle');
  assert.equal(result.value.referrer_host, 'instagram.com');
});

test('validateTrackPayload rejects an invalid module (cross-module/typo protection)', () => {
  const result = validateTrackPayload({
    module: 'not_a_real_module',
    entity_id: VALID_UUID,
    event_type: 'page_view',
    visitor_id: VALID_UUID,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'invalid_module');
});

test('validateTrackPayload rejects payment_approved even if a client tried to send it', () => {
  const result = validateTrackPayload({
    module: 'raffle',
    entity_id: VALID_UUID,
    event_type: 'payment_approved',
    visitor_id: VALID_UUID,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'invalid_event_type');
});

test('validateTrackPayload rejects a non-UUID entity_id or visitor_id', () => {
  assert.equal(
    validateTrackPayload({ module: 'raffle', entity_id: 'x', event_type: 'page_view', visitor_id: VALID_UUID }).ok,
    false
  );
  assert.equal(
    validateTrackPayload({ module: 'raffle', entity_id: VALID_UUID, event_type: 'page_view', visitor_id: 'x' }).ok,
    false
  );
});

test('validateTrackPayload rejects a missing/malformed body', () => {
  assert.equal(validateTrackPayload(null).ok, false);
  assert.equal(validateTrackPayload(undefined).ok, false);
  assert.equal(validateTrackPayload('a string').ok, false);
  assert.equal(validateTrackPayload({}).ok, false);
});

test('validateTrackPayload never lets extra/PII-shaped fields through the allowlist', () => {
  const result = validateTrackPayload({
    module: 'raffle',
    entity_id: VALID_UUID,
    event_type: 'page_view',
    visitor_id: VALID_UUID,
    email: 'someone@example.com',
    full_name: 'Someone Real',
    extra: { arbitrary: 'payload' },
  });
  assert.equal(result.ok, true);
  assert.equal('email' in result.value, false);
  assert.equal('full_name' in result.value, false);
  assert.equal('extra' in result.value, false);
});
