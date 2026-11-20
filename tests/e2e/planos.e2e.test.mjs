/**
 * E2E — planos e agenda semanal (funcionalidades do PR #2, ADR-005):
 * admin cria plano e vincula a um aluno; equipe define tema e link de um
 * encontro; aluno vê só a agenda do próprio plano na home. O banco simulado
 * aplica as regras propostas. Relógio fixo em 19/11/2026 (semana 2026-W47).
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeBackend, launchBrowser, newContext, openPage, expectToast, unexpectedErrors } from './support/harness.mjs';
import { ACTORS, PLANS, AGENDA_WEEK } from '../fixtures/synthetic-data.mjs';

const slotTexts = (page, container) => page.locator(`${container} .week-slot`).evaluateAll((cards) =>
  cards.map((card) => `${card.querySelector('.week-slot__when').textContent.trim()} | ${card.querySelector('.week-slot__topic').textContent} | ${card.querySelector('.badge-plan').textContent}`));

describe('E2E [Firebase simulado] planos e agenda semanal', () => {
  let browser;
  before(async () => { browser = await launchBrowser(); });
  after(async () => { await browser?.close(); });

  test('aluna com plano vê a agenda da semana com tema, perguntas e link', async () => {
    const ctx = await newContext(browser, createFakeBackend());
    const { page, errors } = await openPage(ctx, 'index.html', { as: ACTORS.studentA });
    await page.locator('#student-agenda .week-slot').first().waitFor();
    assert.equal(await page.locator('#student-week-subtitle').textContent(), 'Semana 16/11 a 22/11');
    assert.deepEqual(await slotTexts(page, '#student-agenda'), [
      'Seg 16 · 18:00 – 18:50 | Tema a definir | Essencial',
      'Qua 18 · 18:00 – 18:50 | Travel | Essencial',
    ]);
    const join = page.locator('#student-agenda .week-slot__join');
    assert.equal(await join.count(), 1);
    assert.equal(await join.getAttribute('href'), 'https://meet.example.test/essencial-quarta');
    assert.equal(await join.getAttribute('rel'), 'noopener noreferrer');
    await page.locator('.week-slot__questions summary').click();
    assert.deepEqual(await page.locator('.week-slot__questions li').allTextContents(), ['Where did you go last?', 'Beach or mountains?']);
    assert.deepEqual(unexpectedErrors(errors), []);
    await ctx.context.close();
  });

  test('aluno sem plano e equipe sem plano não veem a seção da agenda', async () => {
    const ctx = await newContext(browser, createFakeBackend());
    for (const actor of [ACTORS.studentB, ACTORS.mediatorA]) {
      const { page, errors } = await openPage(ctx, 'index.html', { as: actor });
      await page.locator('#user-role-badge:not(.hidden)').waitFor();
      await page.waitForLoadState('networkidle');
      assert.equal(await page.locator('#student-week').isHidden(), true, actor.email);
      assert.deepEqual(unexpectedErrors(errors), []);
      await page.close();
    }
    await ctx.context.close();
  });

  test('aluno é barrado em plans.html', async () => {
    const ctx = await newContext(browser, createFakeBackend());
    const { page } = await openPage(ctx, 'plans.html', { as: ACTORS.studentA });
    await expectToast(page, 'Acesso negado. Página restrita à equipe.');
    await page.waitForURL(/index\.html$/);
    await ctx.context.close();
  });

  test('mediadora define tema e link de um encontro; o aluno passa a ver', async () => {
    const backend = createFakeBackend();
    const ctx = await newContext(browser, backend);
    const { page, errors } = await openPage(ctx, 'plans.html', { as: ACTORS.mediatorA });
    await page.locator('#week-agenda .week-slot').first().waitFor();
    assert.deepEqual(await slotTexts(page, '#week-agenda'), [
      'Seg 16 · 18:00 – 18:50 | Tema não definido | Essencial',
      'Ter 17 · 19:00 – 19:50 | Technology & Daily Life | Intensivo',
      'Qua 18 · 18:00 – 18:50 | Travel | Essencial',
    ]);
    // mediador não gerencia o catálogo
    await page.locator('#tab-plans').click();
    await page.locator('#plans-grid .plan-card').first().waitFor();
    assert.equal(await page.locator('#open-create-plan-btn').isVisible(), false);
    assert.equal(await page.locator('.plan-card__actions').count(), 0);
    await page.locator('#tab-week').click();

    // teclado: o card é ativável com Enter
    await page.locator(`[data-slot="${PLANS.essencial}_1_0"]`).focus();
    await page.keyboard.press('Enter');
    await page.locator('#slot-modal:not(.hidden)').waitFor();
    await page.selectOption('#slot-theme-select', { label: 'Technology & Daily Life' });
    await page.fill('#slot-meet-link', 'javascript:alert(1)');
    await page.click('#save-slot-btn');
    await expectToast(page, 'Use um link https:// válido');
    await page.fill('#slot-meet-link', 'https://meet.example.test/segunda');
    await page.click('#save-slot-btn');
    await expectToast(page, 'Tema vinculado ao encontro!');
    await page.locator(`[data-slot="${PLANS.essencial}_1_0"] .week-slot__topic`, { hasText: 'Technology & Daily Life' }).waitFor();

    const saved = backend.adminGet(`weekly_sessions/${AGENDA_WEEK}/${PLANS.essencial}_1_0`);
    assert.equal(saved.topicId, 'tema-tecnologia');
    assert.equal(saved.topicTitle, 'Technology & Daily Life');
    assert.deepEqual(Object.values(saved.questions), ['How often do you use your phone?', 'Would you live in a "smart" home?']);
    assert.equal(saved.meetLink, 'https://meet.example.test/segunda');

    const student = await openPage(ctx, 'index.html', { as: ACTORS.studentA });
    await student.page.locator(`#student-agenda [data-slot="${PLANS.essencial}_1_0"] .week-slot__topic`, { hasText: 'Technology & Daily Life' }).waitFor();
    assert.equal(await student.page.locator('#student-agenda .week-slot__join').count(), 2);

    // remover o tema volta o encontro a "não definido"
    await page.locator(`[data-slot="${PLANS.essencial}_3_1"]`).click();
    await page.click('#clear-slot-btn');
    await expectToast(page, 'Tema removido do encontro.');
    assert.equal(backend.adminGet(`weekly_sessions/${AGENDA_WEEK}/${PLANS.essencial}_3_1`), null);

    // navegação de semanas: a próxima ainda não tem temas
    await page.click('#next-week-btn');
    await page.locator('#week-label', { hasText: '23/11 a 29/11' }).waitFor();
    await page.locator('#week-agenda .week-slot--empty').first().waitFor();
    assert.equal(await page.locator('#week-agenda .week-slot:not(.week-slot--empty)').count(), 0);
    assert.deepEqual(unexpectedErrors(errors), []);
    await ctx.context.close();
  });

  test('admin cria plano, vincula ao aluno em Acessos e o aluno passa a ter agenda', async () => {
    const backend = createFakeBackend();
    const ctx = await newContext(browser, backend);
    const { page, errors } = await openPage(ctx, 'plans.html', { as: ACTORS.admin });
    await page.locator('#week-agenda .week-slot').first().waitFor();
    await page.locator('#tab-plans').click();
    await page.click('#open-create-plan-btn');
    await page.fill('#plan-name', 'Fim de semana');
    await page.fill('#plan-price', '59,90');
    // horário inválido é recusado antes de gravar
    await page.locator('.schedule-row__day').selectOption('6');
    await page.locator('.schedule-row__start').fill('11:00');
    await page.locator('.schedule-row__end').fill('10:00');
    await page.click('#save-plan-btn');
    await expectToast(page, 'Horário 1: o fim deve ser depois do início.');
    await page.locator('.schedule-row__end').fill('11:50');
    await page.click('#save-plan-btn');
    await expectToast(page, 'Plano criado!');
    const card = page.locator('.plan-card', { hasText: 'Fim de semana' });
    await card.waitFor();
    assert.match(await card.textContent(), /R\$ 59,90\/mês/);
    assert.match(await card.textContent(), /Sáb 11:00–11:50/);

    const plans = backend.adminGet('plans');
    const [newPlanId] = Object.keys(plans).filter((id) => plans[id].name === 'Fim de semana');
    assert.ok(newPlanId);
    assert.deepEqual(Object.values(plans[newPlanId].sessions), [{ dayOfWeek: 6, startTime: '11:00', endTime: '11:50' }]);
    assert.equal(plans[newPlanId].price, 59.9);

    const admin = await openPage(ctx, 'admin.html', { as: ACTORS.admin });
    const row = admin.page.locator('#users-table-body tr', { hasText: ACTORS.studentB.email });
    await row.waitFor();
    assert.equal(await row.locator('.badge-no-plan').count(), 1);
    // busca pelo nome do plano encontra a aluna do Essencial
    await admin.page.fill('#admin-search-bar', 'essencial');
    assert.deepEqual(await admin.page.locator('#users-table-body .user-name-cell').allTextContents(), ['AAna Aluna']);
    await admin.page.fill('#admin-search-bar', '');
    await row.locator('.edit-btn').click();
    await admin.page.selectOption('#user-plan-select', { label: 'Fim de semana (R$ 59,90/mês)' });
    await admin.page.click('#save-user-btn');
    await expectToast(admin.page, 'Perfil atualizado com sucesso!');
    await row.locator('.badge-plan', { hasText: 'Fim de semana' }).waitFor();
    assert.equal(backend.adminGet(`users/${ACTORS.studentB.uid}/planId`), newPlanId);

    const bruno = await openPage(ctx, 'index.html', { as: ACTORS.studentB });
    await bruno.page.locator('#student-agenda .week-slot').first().waitFor();
    assert.deepEqual(await slotTexts(bruno.page, '#student-agenda'), ['Sáb 21 · 11:00 – 11:50 | Tema a definir | Fim de semana']);

    // desvincular: a agenda some
    await row.locator('.edit-btn').click();
    await admin.page.selectOption('#user-plan-select', '');
    await admin.page.click('#save-user-btn');
    await expectToast(admin.page, 'Perfil atualizado com sucesso!');
    assert.equal(backend.adminGet(`users/${ACTORS.studentB.uid}/planId`), null);
    assert.deepEqual(unexpectedErrors([...errors, ...admin.errors, ...bruno.errors]), []);
    await ctx.context.close();
  });

  test('remover o último horário e criar outro em edição posterior não herda tema nem link', async () => {
    const backend = createFakeBackend();
    const ctx = await newContext(browser, backend);
    const { page, errors } = await openPage(ctx, 'plans.html', { as: ACTORS.admin });
    await page.locator('#week-agenda .week-slot').first().waitFor();
    await page.locator('#tab-plans').click();
    const editPlan = page.getByRole('button', { name: 'Editar plano Essencial' });
    await editPlan.click();
    await page.getByRole('button', { name: 'Remover horário 2' }).click();
    await page.locator('#save-plan-btn').click();
    await page.locator('.modal--confirm [data-action="confirm"]').click();
    await expectToast(page, 'Plano atualizado!');
    const planCard = page.locator(`[data-plan="${PLANS.essencial}"]`);
    await planCard.locator('.plan-card__schedule').filter({ hasNotText: 'Qua' }).waitFor();
    assert.equal(backend.adminGet(`plans/${PLANS.essencial}/nextSessionIndex`), 100);

    await editPlan.click();
    await page.locator('#add-schedule-row-btn').click();
    await page.getByRole('combobox', { name: 'Dia do horário 2' }).selectOption('3');
    await page.locator('#save-plan-btn').click();
    await planCard.locator('.plan-card__schedule', { hasText: 'Qua' }).waitFor();
    assert.equal(backend.adminGet(`plans/${PLANS.essencial}/nextSessionIndex`), 101);
    const oldKey = `${PLANS.essencial}_3_1`;
    assert.equal(backend.adminGet(`weekly_sessions/${AGENDA_WEEK}/${oldKey}/topicTitle`), 'Travel');

    const student = await openPage(ctx, 'index.html', { as: ACTORS.studentA });
    const newSlot = student.page.locator(`#student-agenda [data-slot="${PLANS.essencial}_3_100"]`);
    await newSlot.locator('.week-slot__topic', { hasText: 'Tema a definir' }).waitFor();
    assert.equal(await newSlot.locator('.week-slot__join').count(), 0);
    assert.equal(await student.page.locator(`#student-agenda [data-slot="${oldKey}"]`).count(), 0);
    assert.deepEqual(unexpectedErrors([...errors, ...student.errors]), []);
    await ctx.context.close();
  });

  test('uma edição aberta antes da gravação de outra aba não sobrescreve o plano', async () => {
    const backend = createFakeBackend();
    const ctx = await newContext(browser, backend);
    const first = await openPage(ctx, 'plans.html', { as: ACTORS.admin });
    const second = await openPage(ctx, 'plans.html', { as: ACTORS.admin });
    for (const { page } of [first, second]) {
      await page.locator('#week-agenda .week-slot').first().waitFor();
      await page.locator('#tab-plans').click();
      await page.getByRole('button', { name: 'Editar plano Essencial' }).click();
    }

    await first.page.locator('#plan-price').fill('200');
    await first.page.locator('#save-plan-btn').click();
    await expectToast(first.page, 'Plano atualizado!');
    await second.page.locator('#plan-price').fill('300');
    await second.page.locator('#save-plan-btn').click();
    await expectToast(second.page, 'Este plano mudou em outra tela.');
    assert.equal(backend.adminGet(`plans/${PLANS.essencial}/price`), 200);
    assert.deepEqual(unexpectedErrors([...first.errors, ...second.errors]), []);
    await ctx.context.close();
  });
});
