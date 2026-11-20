import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACTORS, AGENDA_WEEK, DEMO_PASSWORD, PLANS } from '../fixtures/synthetic-data.mjs';
import { login } from '../e2e/support/actions.mjs';
import { expectToast, launchBrowser } from '../e2e/support/harness.mjs';
import { HOSTING, loadSdk, newBrowserContext, readDatabase, requireDemo } from './support/browser.mjs';

async function enter(context, actor) {
  const page = await context.open('auth.html');
  await login(page, actor.email, DEMO_PASSWORD);
  await page.waitForURL(/index\.html$/);
  return page;
}

test('Firebase Emulator: editar plano em duas abas preserva a identidade dos horários', { timeout: 45_000 }, async (t) => {
  await requireDemo();
  const sdk = await loadSdk();
  const browser = await launchBrowser();
  t.after(() => browser.close());
  const admin = await newBrowserContext(t, browser, sdk);
  const page = await enter(admin, ACTORS.admin);
  await page.goto(`${HOSTING}/plans.html`);
  await page.locator('#week-agenda .week-slot').first().waitFor();
  await page.locator('#tab-plans').click();
  await page.locator('#open-create-plan-btn').click();

  const name = 'Plano de teste de horários';
  await page.locator('#plan-name').fill(name);
  await page.locator('#plan-price').fill('50');
  await page.locator('#add-schedule-row-btn').click();
  await page.getByRole('combobox', { name: 'Dia do horário 2' }).selectOption('3');
  await page.locator('#save-plan-btn').click();
  await expectToast(page, 'Plano criado!');
  const plan = page.locator('.plan-card', { hasText: name });
  const planId = await plan.getAttribute('data-plan');
  assert.ok(planId);

  const oldSlotKey = `${planId}_3_1`;
  await page.locator('#tab-week').click();
  await page.locator(`[data-slot="${oldSlotKey}"]`).click();
  await page.locator('#slot-theme-select').selectOption({ label: 'Travel' });
  await page.locator('#slot-meet-link').fill('https://meet.example.test/antigo');
  await page.locator('#save-slot-btn').click();
  await expectToast(page, 'Tema vinculado ao encontro!');

  const secondTab = await admin.open('plans.html');
  await secondTab.locator('#week-agenda .week-slot').first().waitFor();
  const editName = `Editar plano ${name}`;
  for (const tab of [page, secondTab]) {
    await tab.locator('#tab-plans').click();
    await tab.getByRole('button', { name: editName }).click();
  }

  await page.getByRole('button', { name: 'Remover horário 2' }).click();
  await page.locator('#save-plan-btn').click();
  await page.locator('.modal--confirm [data-action="confirm"]').click();
  await expectToast(page, 'Plano atualizado!');
  await plan.locator('.plan-card__schedule').filter({ hasNotText: 'Qua' }).waitFor();
  assert.equal(await readDatabase(`plans/${planId}/nextSessionIndex`), 2);

  await secondTab.locator('#plan-price').fill('80');
  await secondTab.locator('#save-plan-btn').click();
  await expectToast(secondTab, 'Este plano mudou em outra tela.');
  assert.equal(await readDatabase(`plans/${planId}/price`), 50);

  await page.getByRole('button', { name: editName }).click();
  await page.locator('#add-schedule-row-btn').click();
  await page.getByRole('combobox', { name: 'Dia do horário 2' }).selectOption('3');
  await page.locator('#save-plan-btn').click();
  await plan.locator('.plan-card__schedule', { hasText: 'Qua' }).waitFor();
  await page.locator('#tab-week').click();
  const newSlot = page.locator(`[data-slot="${planId}_3_2"]`);
  await newSlot.locator('.week-slot__topic', { hasText: 'Tema não definido' }).waitFor();
  assert.equal(await newSlot.locator('.week-slot__link').count(), 0);
  assert.equal(await readDatabase(`plans/${planId}/nextSessionIndex`), 3);
  assert.equal(await readDatabase(`weekly_sessions/${AGENDA_WEEK}/${oldSlotKey}/topicTitle`), 'Travel');
});

test('Firebase Emulator: vínculo legado abre a agenda e a edição grava somente planId', { timeout: 45_000 }, async (t) => {
  await requireDemo();
  const sdk = await loadSdk();
  const browser = await launchBrowser();
  t.after(() => browser.close());
  const users = await readDatabase('users');
  const uid = Object.keys(users).find((key) => users[key].email === ACTORS.studentA.email);
  assert.equal(users[uid].plan, PLANS.essencial);
  assert.equal(users[uid].planId, undefined);

  const student = await enter(await newBrowserContext(t, browser, sdk), ACTORS.studentA);
  const agenda = student.locator('#student-agenda');
  const join = agenda.getByRole('link', { name: 'Entrar' });
  assert.equal(await join.getAttribute('href'), 'https://meet.example.test/essencial-quarta');
  assert.match(await agenda.textContent(), /Essencial/);
  assert.doesNotMatch(await agenda.textContent(), /Intensivo/);

  const admin = await enter(await newBrowserContext(t, browser, sdk), ACTORS.admin);
  await admin.goto(`${HOSTING}/admin.html`);
  const row = admin.locator('#users-table-body tr', { hasText: ACTORS.studentA.email });
  await row.locator('.badge-plan', { hasText: 'Essencial' }).waitFor();
  await row.locator('.edit-btn').click();
  assert.equal(await admin.locator('#user-plan-select').inputValue(), PLANS.essencial);
  await admin.locator('#save-user-btn').click();
  await expectToast(admin, 'Perfil atualizado com sucesso!');
  const updated = await readDatabase(`users/${uid}`);
  assert.equal(updated.planId, PLANS.essencial);
  assert.equal(updated.plan, undefined);
  assert.equal(updated.planName, undefined);

  await student.reload();
  assert.equal(await join.getAttribute('href'), 'https://meet.example.test/essencial-quarta');
});
