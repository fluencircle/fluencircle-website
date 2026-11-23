/**
 * Cliente do tradutor (public/js/services/translate.service.js) com `fetch` falso:
 * sem rede e sem backend real.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateText, TranslationError } from '../../public/js/services/translate.service.js';
import { TRANSLATE_ENDPOINT, TRANSLATOR_MAX_LENGTH, TRANSLATE_TIMEOUT_MS } from '../../public/js/config/app.config.js';

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test('envia o prompt e devolve o texto da tradução, sem espaços nas pontas', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return jsonResponse({ text: '  praia \n' }); };
  assert.equal(await translateText(' beach ', { fetchImpl }), 'praia');
  assert.equal(calls[0].url, TRANSLATE_ENDPOINT);
  assert.equal(calls[0].init.method, 'POST');
  assert.match(JSON.parse(calls[0].init.body).prompt, /Texto a ser traduzido: beach$/);
  assert.ok(calls[0].init.signal instanceof AbortSignal, 'requisição cancelável');
});

test('texto vazio ou acima do limite nem chega ao backend', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return jsonResponse({ text: 'x' }); };
  await assert.rejects(translateText('   ', { fetchImpl }), (e) => e instanceof TranslationError && e.code === 'empty');
  await assert.rejects(translateText('a'.repeat(TRANSLATOR_MAX_LENGTH + 1), { fetchImpl }), (e) => e.code === 'too-long');
  assert.equal(called, false);
});

test('HTTP de erro vira TranslationError com o status', async () => {
  await assert.rejects(translateText('beach', { fetchImpl: async () => jsonResponse({}, 503) }),
    (e) => e instanceof TranslationError && e.code === 'http' && e.status === 503);
});

test('resposta fora do formato { text: string } é recusada (antes virava tradução vazia)', async () => {
  for (const body of [{}, { text: 42 }, null, { translation: 'praia' }]) {
    await assert.rejects(translateText('beach', { fetchImpl: async () => jsonResponse(body) }), (e) => e.code === 'invalid-response', JSON.stringify(body));
  }
  const notJson = { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } };
  await assert.rejects(translateText('beach', { fetchImpl: async () => notJson }), (e) => e.code === 'invalid-response');
});

test('backend que não responde é cancelado no tempo limite', async () => {
  const hanging = (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  const started = Date.now();
  await assert.rejects(translateText('beach', { fetchImpl: hanging, timeoutMs: 30 }),
    (e) => e instanceof TranslationError && e.code === 'timeout');
  assert.ok(Date.now() - started < 1000);
});

test('o tempo limite padrão cobre o "despertar" do Render sem deixar a tela presa', () => {
  assert.ok(TRANSLATE_TIMEOUT_MS >= 15000 && TRANSLATE_TIMEOUT_MS <= 60000);
});
