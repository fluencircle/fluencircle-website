import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTORS, AGENDA_WEEK, DEMO_PASSWORD, PLANS, SESSIONS } from '../fixtures/synthetic-data.mjs';
import { expectToast, FIXED_NOW, launchBrowser } from '../e2e/support/harness.mjs';
import { finishDeck, login, startLiveSession } from '../e2e/support/actions.mjs';
import { HOSTING, browserRead, loadSdk, newBrowserContext, readDatabase, requireDemo } from './support/browser.mjs';

const go = (page, path) => page.goto(`${HOSTING}/${path}`);
const role = (page, label) => page.locator('#user-role-badge', { hasText: label }).waitFor();
const liveStatus = (page, text) => page.locator('#presentation-status', { hasText: text }).waitFor();
const translatorStatus = (page, text) => page.locator('#sessionName', { hasText: text }).waitFor();
const deckTopics = async (page) => {
  const topics = page.locator('#sessions-grid .srs-card-topic');
  await topics.first().waitFor();
  return (await topics.allTextContents()).sort();
};

async function enter(context, actor, label) {
  const page = await context.open('auth.html');
  await page.locator('#environment-badge', { hasText: 'demo-fluencircle-audit' }).waitFor();
  await Promise.all([
    page.waitForResponse((response) => response.url().startsWith('http://127.0.0.1:9099/')
      && response.url().includes('accounts:signInWithPassword') && response.ok()),
    login(page, actor.email, DEMO_PASSWORD),
  ]);
  await page.waitForURL(/index\.html$/);
  await role(page, label);
  return page;
}

async function endPresentation(page) {
  await page.locator('#end-meeting-btn').click();
  await page.locator('.modal--confirm [data-action="confirm"]').click();
  await expectToast(page, 'Sessão encerrada');
}

describe('E2E com Hosting, Auth e Realtime Database do Firebase Emulator', { timeout: 75_000 }, () => {
  let browser;
  let sdk;
  before(async () => {
    await requireDemo();
    sdk = await loadSdk();
    browser = await launchBrowser();
  });
  after(async () => { await browser?.close(); });
  const context = (t) => newBrowserContext(t, browser, sdk);

  test('visitante chega ao login, vê o tradutor público e recebe negação do RTDB para perfis', async (t) => {
    const visitor = await context(t);
    const page = await visitor.open('index.html');
    await page.waitForURL(/auth\.html$/);
    await page.locator('#environment-badge', { hasText: 'demo-fluencircle-audit' }).waitFor();
    await go(page, 'circle-translator.html');
    await translatorStatus(page, 'Nenhuma sessão ativa');
    assert.match((await browserRead(page, 'users')).error, /permission[_ ]denied/i);
  });

  test('admin autentica, rejeita credenciais inválidas e cria uma conta sem perder a sessão', async (t) => {
    const admin = await context(t);
    const page = await admin.open('auth.html');
    await page.locator('#environment-badge').waitFor();
    await login(page, ACTORS.admin.email, 'senha-incorreta');
    await expectToast(page, 'incorret');
    await login(page, ACTORS.noProfile.email, DEMO_PASSWORD);
    await expectToast(page, 'Conta não encontrada ou acesso revogado.');
    await login(page, ACTORS.revoked.email, DEMO_PASSWORD);
    await expectToast(page, 'Esta conta foi excluída pelo administrador.');
    await login(page, ACTORS.admin.email, DEMO_PASSWORD);
    await page.waitForURL(/index\.html$/);
    await role(page, 'Admin');

    await go(page, 'admin.html');
    await page.locator('#users-table-body tr', { hasText: ACTORS.studentA.email }).waitFor();
    await page.locator('#open-create-user-modal-btn').click();
    const email = `teste-${randomUUID()}@example.test`;
    await page.fill('#user-firstname', 'Helena');
    await page.fill('#user-lastname', 'Integração');
    await page.fill('#user-email-input', email);
    await page.fill('#user-password-input', DEMO_PASSWORD);
    await page.selectOption('#user-role-select', 'student');
    await page.locator('#save-user-btn').click();
    await expectToast(page, 'Perfil de Helena criado com sucesso!');
    assert.equal(await page.locator('#user-email').textContent(), ACTORS.admin.email);
    await enter(await context(t), { email }, 'Aluno');
  });

  test('alunos veem só os decks atribuídos, inclusive o índice histórico, e a agenda do próprio plano', async (t) => {
    const ana = await enter(await context(t), ACTORS.studentA, 'Aluno');
    const agenda = ana.locator('#student-agenda');
    const call = agenda.getByRole('link', { name: 'Entrar' });
    await call.waitFor();
    assert.equal(await call.getAttribute('href'), 'https://meet.example.test/essencial-quarta');
    assert.match(await agenda.textContent(), /Essencial/);
    assert.doesNotMatch(await agenda.textContent(), /Intensivo/);
    await go(ana, 'flash-cards.html');
    assert.deepEqual(await deckTopics(ana), ['Technology & Daily Life', 'Travel']);
    assert.match((await browserRead(ana, `flashcards/${SESSIONS.brunoOnly}`)).error, /permission[_ ]denied/i);
    assert.match((await browserRead(ana, 'meeting_sessions')).error, /permission[_ ]denied/i);
    await go(ana, 'presentation.html');
    await expectToast(ana, 'Acesso restrito a Mediadores.');
    await ana.waitForURL(/index\.html$/);

    const bruno = await enter(await context(t), ACTORS.studentB, 'Aluno');
    await go(bruno, 'flash-cards.html');
    assert.deepEqual(await deckTopics(bruno), ['Travel', 'Travel II']);
    await bruno.getByRole('button', { name: 'Estudar Travel', exact: true }).click();
    await bruno.getByText('beach', { exact: true }).waitFor();
  });

  test('mediador configura encontro semanal e só a aluna vinculada recebe tema, perguntas e link', async (t) => {
    const mediator = await enter(await context(t), ACTORS.mediatorA, 'Mediador');
    await go(mediator, 'plans.html');
    const slotKey = `${PLANS.essencial}_1_0`;
    const slot = mediator.locator(`#week-agenda [data-slot="${slotKey}"]`);
    await slot.press('Enter');
    await mediator.selectOption('#slot-theme-select', { label: 'Technology & Daily Life' });
    const meetLink = 'https://meet.example.test/segunda';
    await mediator.fill('#slot-meet-link', meetLink);
    await mediator.locator('#save-slot-btn').click();
    await expectToast(mediator, 'Tema vinculado ao encontro!');
    const slotPath = `weekly_sessions/${AGENDA_WEEK}/${slotKey}`;
    const saved = await readDatabase(slotPath);
    assert.equal(saved.topicId, 'tema-tecnologia');
    assert.equal(saved.meetLink, meetLink);

    const ana = await enter(await context(t), ACTORS.studentA, 'Aluno');
    const studentSlot = ana.locator(`#student-agenda [data-slot="${slotKey}"]`);
    assert.equal(await studentSlot.getByRole('link', { name: 'Entrar' }).getAttribute('href'), meetLink);
    await studentSlot.locator('.week-slot__questions summary').click();
    assert.deepEqual(await studentSlot.locator('.week-slot__questions li').allTextContents(), saved.questions);
    const bruno = await enter(await context(t), ACTORS.studentB, 'Aluno');
    assert.match((await browserRead(bruno, slotPath)).error, /permission[_ ]denied/i);

    await slot.press('Enter');
    await mediator.locator('#clear-slot-btn').click();
    await expectToast(mediator, 'Tema removido do encontro.');
    assert.equal(await readDatabase(slotPath), null);
  });

  test('mediador conduz sessão, registra presença e flashcard, e aluno persiste revisão', async (t) => {
    const mediator = await enter(await context(t), ACTORS.mediatorA, 'Mediador');
    await go(mediator, 'presentation.html');
    const visitor = await (await context(t)).open('circle-translator.html');
    await startLiveSession(mediator, 'Technology & Daily Life');
    await liveStatus(mediator, 'Publicada no tradutor público.');
    await translatorStatus(visitor, 'Sessão ativa: Technology & Daily Life');
    const { sessionId, topic, startedAt } = await readDatabase('current_session');
    assert.equal((await readDatabase(`meeting_sessions/${sessionId}`)).mediatorEmail, ACTORS.mediatorA.email);
    await visitor.fill('#sourceText', 'suitcase');
    await visitor.locator('#translateBtn').click();
    await visitor.waitForFunction(() => document.querySelector('#targetText').value === 'mala');
    await visitor.locator('#statusMessage', { hasText: 'não salva flashcards automaticamente' }).waitFor();
    assert.equal(await readDatabase(`flashcards/${sessionId}`), null);

    await mediator.locator('#open-attendance-btn').click();
    await mediator.fill('#attendance-search-bar', 'Ana');
    await mediator.locator('#student-options-list .custom-select-option', { hasText: 'Ana Aluna' }).click();
    await expectToast(mediator, 'Ana Aluna adicionado à lista de presença!');
    const users = await readDatabase('users');
    const anaUid = Object.keys(users).find((uid) => users[uid].email === ACTORS.studentA.email);
    assert.deepEqual(await readDatabase(`meeting_sessions/${sessionId}/attendees/${anaUid}`), { addedAt: FIXED_NOW.toISOString() });
    assert.deepEqual(await readDatabase(`user_sessions/${anaUid}/${sessionId}`), { topic, startedAt });
    await mediator.locator('#close-attendance-btn').click();

    await mediator.locator('#open-translator-btn').click();
    await mediator.fill('#normal-text', 'suitcase');
    await mediator.locator('#translate-btn').click();
    await mediator.waitForFunction(() => document.querySelector('#translated-text').value === 'mala');
    await mediator.locator('#add-flashcards-btn').click();
    await expectToast(mediator, 'Card "suitcase" adicionado aos Flashcards!');
    const cards = Object.values(await readDatabase(`flashcards/${sessionId}`));
    assert.deepEqual(cards.map(({ front, back }) => [front, back]), [['suitcase', 'mala']]);
    await endPresentation(mediator);
    await translatorStatus(visitor, 'Nenhuma sessão ativa');

    const ana = await enter(await context(t), ACTORS.studentA, 'Aluno');
    await go(ana, 'flash-cards.html');
    await ana.getByRole('button', { name: 'Estudar Travel', exact: true }).click();
    await finishDeck(ana);
    await expectToast(ana, 'Etapa de 1 Dia concluída!');
    const review = await readDatabase(`student_reviews/${anaUid}/${SESSIONS.both}`);
    assert.equal(review.stage, 1);
    assert.equal(review.stage1CompletedAt, FIXED_NOW.toISOString());
  });

  test('duas sessões de mediadores e duas abas da mesma conta preservam a publicação mais recente', async (t) => {
    const ctxA = await context(t);
    const carla = await enter(ctxA, ACTORS.mediatorA, 'Mediador');
    const diego = await enter(await context(t), ACTORS.mediatorB, 'Mediador');
    const visitor = await (await context(t)).open('circle-translator.html');
    await go(carla, 'presentation.html');
    await go(diego, 'presentation.html');
    await startLiveSession(carla, 'Technology & Daily Life');
    await translatorStatus(visitor, 'Sessão ativa: Technology & Daily Life');
    const initialSession = await readDatabase('current_session');
    const before = Object.keys(await readDatabase('meeting_sessions')).length;

    await startLiveSession(diego, 'Travel');
    const confirmation = diego.locator('.modal--confirm', { hasText: 'Technology & Daily Life' });
    await confirmation.locator('[data-action="cancel"]').click();
    assert.equal(Object.keys(await readDatabase('meeting_sessions')).length, before);
    await diego.locator('#start-presentation-btn:not([disabled])').click();
    await confirmation.locator('[data-action="confirm"]').click();
    await liveStatus(carla, 'Outra tela assumiu');
    await translatorStatus(visitor, 'Sessão ativa: Travel');
    const takeover = await readDatabase('current_session');
    assert.equal(takeover.version, initialSession.version + 1);
    assert.notEqual(takeover.sessionId, initialSession.sessionId);
    await endPresentation(carla);
    assert.equal((await readDatabase('current_session')).sessionId, takeover.sessionId);

    await startLiveSession(carla, 'Technology & Daily Life');
    await carla.locator('.modal--confirm [data-action="confirm"]').click();
    await liveStatus(carla, 'Publicada');
    const secondTab = await ctxA.open('presentation.html');
    await startLiveSession(secondTab, 'Travel');
    await secondTab.locator('.modal--confirm', { hasText: 'Technology & Daily Life' }).locator('[data-action="confirm"]').click();
    await liveStatus(carla, 'Outra tela assumiu');
    await carla.close();
    await liveStatus(secondTab, 'Publicada');
    await translatorStatus(visitor, 'Sessão ativa: Travel');
    await endPresentation(secondTab);
    await translatorStatus(visitor, 'Nenhuma sessão ativa');
  });

  test('queda do WebSocket executa onDisconnect no RTDB e reconexão restaura a apresentação', async (t) => {
    const staff = await context(t);
    const mediator = await enter(staff, ACTORS.mediatorA, 'Mediador');
    await go(mediator, 'presentation.html');
    const visitor = await (await context(t)).open('circle-translator.html');
    await startLiveSession(mediator, 'Technology & Daily Life');
    await liveStatus(mediator, 'Publicada');
    await translatorStatus(visitor, 'Sessão ativa: Technology & Daily Life');
    const initial = await readDatabase('current_session');

    await staff.loseDatabaseConnection();
    await liveStatus(mediator, 'Sem conexão');
    await translatorStatus(visitor, 'Nenhuma sessão ativa');
    const disconnected = await readDatabase('current_session');
    assert.equal(disconnected.sessionId, initial.sessionId);
    assert.equal(disconnected.live, undefined);

    staff.restoreDatabaseConnection();
    await liveStatus(mediator, 'Publicada');
    await translatorStatus(visitor, 'Sessão ativa: Technology & Daily Life');
    assert.deepEqual(await readDatabase('current_session'), initial);
    await endPresentation(mediator);
  });
});
