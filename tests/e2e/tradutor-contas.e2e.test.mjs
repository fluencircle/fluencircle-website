/**
 * E2E — tradutor público e criação de contas (Issues #5 e #8):
 * - no Emulator o visitante traduz e o site NÃO tenta gravar card;
 * - em produção (compatibilidade) a tentativa é negada pelas regras propostas
 *   e a pessoa vê que o card não foi salvo; a tradução continua na tela;
 * - falha do backend de tradução tem mensagem própria e não grava nada;
 * - perfil recusado pelas regras desfaz a conta de login criada.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeBackend, launchBrowser, newContext, openPage, expectToast, ORIGINS } from './support/harness.mjs';
import { ACTORS, SESSIONS, DEMO_PASSWORD } from '../fixtures/synthetic-data.mjs';
import { startLiveSession } from './support/actions.mjs';

const PRESENTER = 'aba-mediador-b-000001';
const liveSession = { sessionId: SESSIONS.both, topic: 'Travel', startedAt: '2026-11-19T14:00:00.000Z', presenterId: PRESENTER, version: 1, live: { [PRESENTER]: true } };
const anonymousWrites = (backend) => backend.log.filter((entry) => entry.uid === null && /^db\.(set|update|compareAndSet)$/.test(entry.op));

async function translate(page, word) {
  await page.locator('#sessionName', { hasText: 'Sessão ativa: Travel' }).waitFor();
  await page.fill('#sourceText', word);
  await page.locator('#translateBtn').click();
}

async function holdTranslation(page, word) {
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  let requests = 0;
  const isHeldRequest = (request) => request.method() === 'POST'
    && request.url().endsWith('/api/gemini/generate')
    && request.postDataJSON().prompt.endsWith(` ${word}`);
  await page.route('**/api/gemini/generate', async (route) => {
    if (isHeldRequest(route.request())) {
      requests += 1;
      markStarted();
      await wait;
    }
    await route.fallback();
  });
  return {
    started,
    release,
    count: () => requests,
    async finish() {
      const response = page.waitForResponse((result) => isHeldRequest(result.request()));
      release();
      await (await response).finished();
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    },
  };
}

describe('E2E [Firebase simulado] tradutor público e contas', () => {
  let browser;
  before(async () => { browser = await launchBrowser(); });
  after(async () => { await browser?.close(); });

  test('Emulator: visitante traduz e o site não tenta gravar flashcard', async () => {
    const backend = createFakeBackend();
    backend.adminSet('current_session', liveSession);
    const ctx = await newContext(browser, backend, { origin: ORIGINS.local });
    const { page } = await openPage(ctx, 'circle-translator.html');
    await translate(page, 'dog');
    await page.waitForFunction(() => document.getElementById('targetText').value === 'cachorro');
    await page.locator('#statusMessage.info', { hasText: 'não salva flashcards automaticamente' }).waitFor();
    assert.deepEqual(anonymousWrites(backend), []);
    await ctx.context.close();
  });

  test('produção (compatibilidade): tentativa direta é negada pelas regras e a tradução fica na tela', async () => {
    const backend = createFakeBackend();
    backend.adminSet('current_session', liveSession);
    const before = backend.adminGet(`flashcards/${SESSIONS.both}`);
    const ctx = await newContext(browser, backend, { origin: ORIGINS.production });
    const { page } = await openPage(ctx, 'circle-translator.html');
    await translate(page, 'house');
    await page.locator('#statusMessage.warning', { hasText: 'bloqueada pelas regras de segurança' }).waitFor();
    assert.equal(await page.inputValue('#targetText'), 'casa');
    assert.equal(anonymousWrites(backend).length, 1, 'houve UMA tentativa, negada');
    assert.deepEqual(backend.adminGet(`flashcards/${SESSIONS.both}`), before);
    await ctx.context.close();
  });

  test('backend de tradução fora do ar: mensagem própria e nenhuma gravação', async () => {
    const backend = createFakeBackend();
    backend.adminSet('current_session', liveSession);
    const ctx = await newContext(browser, backend, { origin: ORIGINS.production, failTranslations: true });
    const { page } = await openPage(ctx, 'circle-translator.html');
    await translate(page, 'dog');
    await page.locator('#statusMessage.error', { hasText: 'Não foi possível traduzir agora' }).waitFor();
    assert.deepEqual(anonymousWrites(backend), []);
    await ctx.context.close();
  });

  test('tradutor público ignora Enter repetido e resposta de texto já substituído', async (t) => {
    const ctx = await newContext(browser, createFakeBackend());
    const { page } = await openPage(ctx, 'circle-translator.html');
    const pending = await holdTranslation(page, 'dog');
    t.after(async () => { pending.release(); await ctx.context.close(); });

    const source = page.locator('#sourceText');
    await source.fill('dog');
    await source.press('Enter');
    await pending.started;
    await source.press('Enter');
    assert.equal(await page.locator('#translateBtn').isDisabled(), true);

    await source.fill('house');
    await source.press('Enter');
    await page.waitForFunction(() => document.getElementById('targetText').value === 'casa');
    await pending.finish();
    assert.equal(await page.inputValue('#targetText'), 'casa');
    assert.equal(pending.count(), 1);
  });

  test('mediadora salva somente o par traduzido após edição do texto durante a requisição', async (t) => {
    const backend = createFakeBackend();
    const ctx = await newContext(browser, backend);
    const { page } = await openPage(ctx, 'presentation.html', { as: ACTORS.mediatorA });
    await startLiveSession(page, 'Travel');
    await page.locator('#open-translator-btn').click();
    const pending = await holdTranslation(page, 'dog');
    t.after(async () => { pending.release(); await ctx.context.close(); });

    const source = page.locator('#normal-text');
    await source.fill('dog');
    await source.press('Enter');
    await pending.started;
    await source.press('Enter');
    await source.fill('house');
    await pending.finish();
    assert.equal(await page.inputValue('#translated-text'), '');
    assert.equal(await page.locator('#add-flashcards-btn').isDisabled(), true);
    assert.equal(pending.count(), 1);

    await source.press('Enter');
    await page.waitForFunction(() => document.getElementById('translated-text').value === 'casa');
    await page.locator('#add-flashcards-btn').click();
    await expectToast(page, 'Card "house" adicionado aos Flashcards!');
    const sessionId = backend.adminGet('current_session/sessionId');
    assert.equal(backend.adminGet(`meeting_sessions/${sessionId}/templateId`), 'tema-viagem');
    const [saved] = Object.values(backend.adminGet(`flashcards/${sessionId}`));
    assert.equal(saved.front, 'house');
    assert.equal(saved.back, 'casa');
  });

  test('perfil recusado pelas regras desfaz a conta de login criada', async () => {
    const backend = createFakeBackend();
    const ctx = await newContext(browser, backend);
    const { page } = await openPage(ctx, 'admin.html', { as: ACTORS.admin });
    await page.locator('#users-table-body .user-name-cell').first().waitFor();
    await page.locator('#open-create-user-modal-btn').click();
    await page.fill('#user-firstname', 'N'.repeat(81)); // regra: firstName até 80 caracteres
    await page.fill('#user-lastname', 'Longo');
    await page.fill('#user-email-input', 'nome.longo@example.test');
    await page.fill('#user-password-input', DEMO_PASSWORD);
    await page.locator('#save-user-btn').click();
    await expectToast(page, 'A conta de login criada foi desfeita');
    assert.equal(backend.accountExists('nome.longo@example.test'), false, 'sem conta órfã no Auth');
    assert.ok(!Object.values(backend.adminGet('users')).some((user) => user.email === 'nome.longo@example.test'));
    assert.equal(await page.locator('#user-email').textContent(), ACTORS.admin.email, 'admin continua logado');
    await ctx.context.close();
  });
});
