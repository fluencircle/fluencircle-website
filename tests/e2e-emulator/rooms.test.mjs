import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTORS, DEMO_PASSWORD } from '../fixtures/synthetic-data.mjs';
import { launchBrowser, expectToast } from '../e2e/support/harness.mjs';
import { login, startLiveSession } from '../e2e/support/actions.mjs';
import { HOSTING, browserRead, loadSdk, newBrowserContext, readDatabase, requireDemo } from './support/browser.mjs';

test('círculos autenticados simultâneos sincronizam slide e chat sem trocar o tradutor público', { timeout: 75_000 }, async (t) => {
  await requireDemo();
  const sdk = await loadSdk();
  const browser = await launchBrowser();
  t.after(() => browser.close());

  async function signIn(actor) {
    const context = await newBrowserContext(t, browser, sdk);
    const page = await context.open('auth.html');
    await page.locator('#environment-badge').waitFor();
    await login(page, actor.email, DEMO_PASSWORD);
    await page.waitForURL(/index\.html$/);
    return { context, page };
  }

  async function end(page) {
    await page.locator('#end-meeting-btn').click();
    await page.locator('.modal--confirm [data-action="confirm"]').click();
    await expectToast(page, 'Sessão encerrada');
  }

  const [carla, diego, ana, bruno] = await Promise.all([
    signIn(ACTORS.mediatorA), signIn(ACTORS.mediatorB), signIn(ACTORS.studentA), signIn(ACTORS.studentB),
  ]);
  const technology = 'Technology & Daily Life';
  const travel = 'Travel';
  await Promise.all([carla.page.goto(`${HOSTING}/presentation.html`), diego.page.goto(`${HOSTING}/presentation.html`)]);
  await ana.page.setViewportSize({ width: 390, height: 844 });
  await startLiveSession(carla.page, technology);
  await carla.page.getByRole('link', { name: 'Abrir sala e chat' }).waitFor();
  await diego.page.locator('#share-public-translator').uncheck();
  await startLiveSession(diego.page, travel);
  await diego.page.getByRole('link', { name: 'Abrir sala e chat' }).waitFor();

  const published = await readDatabase('current_session');
  const rooms = await readDatabase('live_rooms');
  const travelId = Object.keys(rooms).find((id) => rooms[id].topic === travel);
  assert.equal(published.topic, technology);
  assert.equal(Object.keys(rooms).filter((id) => rooms[id].online).length, 2);
  assert.match((await browserRead(ana.page, `live_room_chat/${travelId}`)).error, /permission[_ ]denied/i);

  const chatLink = await carla.page.getByRole('link', { name: 'Abrir sala e chat' }).getAttribute('href');
  const hostChat = await carla.context.open(chatLink);
  await ana.page.getByRole('button', { name: `Entrar em ${technology}` }).click();
  await bruno.page.getByRole('button', { name: `Entrar em ${travel}` }).click();
  await carla.page.getByRole('link', { name: 'Abrir sala e chat' }).focus();
  await carla.page.keyboard.press('Space');
  assert.equal(await carla.page.locator('.slide').textContent(), technology);
  await carla.page.getByRole('link', { name: 'Abrir sala e chat' }).evaluate((link) => link.blur());
  await carla.page.keyboard.press('ArrowRight');
  await ana.page.locator('#room-slide', { hasText: 'How often do you use your phone?' }).waitFor();
  assert.equal(await bruno.page.locator('#room-slide').textContent(), travel);

  const message = 'Qual é a diferença entre “phone” e “mobile”?';
  await ana.page.getByLabel('Mensagem').fill(message);
  await ana.page.getByRole('button', { name: 'Enviar' }).click();
  await hostChat.locator('#room-chat', { hasText: message }).waitFor();
  assert.equal(await bruno.page.locator('#room-chat li').count(), 0);

  // Regressão: "Sair da sala" remove a inscrição no RTDB; voltar deve
  // exigir nova entrada antes de conceder leitura do chat.
  const profiles = await readDatabase('users');
  const anaUid = Object.entries(profiles).find(([, profile]) => profile.email === ACTORS.studentA.email)?.[0];
  assert.ok(anaUid, 'UID da aluna sintética não encontrado');
  assert.equal(await readDatabase(`live_room_members/${published.sessionId}/${anaUid}`), true);
  await ana.page.getByRole('button', { name: 'Sair da sala' }).click();
  await ana.page.getByRole('button', { name: `Entrar em ${technology}` }).waitFor();
  let membership = true;
  for (let attempt = 0; attempt < 25; attempt++) {
    membership = await readDatabase(`live_room_members/${published.sessionId}/${anaUid}`);
    if (membership === null) break;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  assert.equal(membership, null, 'o botão Sair deve remover o vínculo da sala');
  await ana.page.getByRole('button', { name: `Entrar em ${technology}` }).click();
  await ana.page.locator('#room-chat', { hasText: message }).waitFor();

  await diego.context.loseDatabaseConnection();
  await bruno.page.locator('#room-status', { hasText: 'Aguardando o mediador reconectar.' }).waitFor();
  assert.equal(await bruno.page.getByRole('button', { name: 'Enviar' }).isDisabled(), true);
  diego.context.restoreDatabaseConnection();
  await bruno.page.locator('#send-room-message:not([disabled])').waitFor();

  await end(carla.page);
  await ana.page.getByRole('button', { name: `Entrar em ${travel}` }).waitFor();
  assert.equal(await readDatabase(`live_room_chat/${published.sessionId}`), null);
  assert.equal(await readDatabase(`live_room_members/${published.sessionId}`), null);
  assert.ok(await readDatabase(`meeting_sessions/${published.sessionId}`));
  assert.equal(await bruno.page.locator('#room-slide').textContent(), travel);
  await end(diego.page);
  assert.equal(await readDatabase('current_session'), null);
});
