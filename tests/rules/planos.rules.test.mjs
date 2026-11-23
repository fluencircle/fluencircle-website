/**
 * Planos (`plans`), plano do usuário (`users/{uid}/planId`) e agenda da semana
 * (`weekly_sessions`) — funcionalidades do PR #2 reimplementadas (ADR-005).
 * Dados 100% sintéticos (tests/fixtures/synthetic-data.mjs).
 *
 * Executar: `npm run test:rules` (Emulator) ou `npm run test:rules:sim`.
 */
import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRulesEnv } from './support/rules-env.mjs';
import { ACTORS, PLANS, AGENDA_WEEK, buildSyntheticDatabase } from '../fixtures/synthetic-data.mjs';

const env = await createRulesEnv();
const { studentA, studentB, mediatorA, admin, noProfile, revoked } = ACTORS;
const NOW = '2026-11-19T12:00:00.000Z';

const validPlan = (overrides = {}) => ({
  name: 'Plano Novo', price: 150, sessions: [{ dayOfWeek: 5, startTime: '18:00', endTime: '18:50' }], createdAt: NOW, updatedAt: NOW, ...overrides,
});
const validSlot = (overrides = {}) => ({
  topicId: 'tema-viagem', topicTitle: 'Travel', questions: ['Beach?'], meetLink: 'https://meet.example.test/abc-defg', updatedAt: NOW, ...overrides,
});
const anaSlot = `weekly_sessions/${AGENDA_WEEK}/${PLANS.essencial}_3_1`;
const otherSlot = `weekly_sessions/${AGENDA_WEEK}/${PLANS.intensivo}_2_0`;

describe(`${env.label} planos e agenda semanal (PR #2)`, () => {
  before(() => env.seed(buildSyntheticDatabase()));
  beforeEach(() => env.seed(buildSyntheticDatabase()));
  after(() => env.cleanup());

  describe('plans', () => {
    test('equipe lê o catálogo; aluno não', async () => {
      assert.equal(Object.keys(await env.allowed(env.as(mediatorA).get('plans'))).length, 2);
      await env.allowed(env.as(admin).get('plans'));
      await env.denied(env.as(studentA).get('plans'));
      await env.denied(env.as(null).get('plans'));
    });
    test('aluna lê só o próprio plano; aluno sem plano não lê nenhum', async () => {
      assert.equal((await env.allowed(env.as(studentA).get(`plans/${PLANS.essencial}`))).name, 'Essencial');
      await env.denied(env.as(studentA).get(`plans/${PLANS.intensivo}`));
      await env.denied(env.as(studentB).get(`plans/${PLANS.essencial}`));
    });
    test('conta sem perfil, revogada e visitante não leem planos', async () => {
      for (const actor of [noProfile, revoked, null]) await env.denied(env.as(actor).get(`plans/${PLANS.essencial}`));
    });
    test('só o admin cria, edita e apaga planos', async () => {
      await env.allowed(env.as(admin).set('plans/plano-novo', validPlan()));
      await env.allowed(env.as(admin).update(`plans/${PLANS.intensivo}`, { price: 99, updatedAt: NOW }));
      await env.denied(env.as(mediatorA).set('plans/plano-x', validPlan()));
      await env.denied(env.as(studentA).update(`plans/${PLANS.essencial}`, { price: 0 }));
      await env.allowed(env.as(admin).remove(`plans/${PLANS.intensivo}`));
    });
    test('esquema: campos obrigatórios, preço, dia, horário e campos extras', async () => {
      const a = env.as(admin);
      await env.denied(a.set('plans/p1', validPlan({ name: '' })));
      await env.denied(a.set('plans/p1', validPlan({ price: -1 })));
      await env.denied(a.set('plans/p1', validPlan({ price: '120' })));
      await env.denied(a.set('plans/p1', validPlan({ sessions: [{ dayOfWeek: 7, startTime: '18:00', endTime: '18:50' }] })));
      await env.denied(a.set('plans/p1', validPlan({ sessions: [{ dayOfWeek: 1, startTime: '6pm', endTime: '18:50' }] })));
      await env.denied(a.set('plans/p1', validPlan({ sessions: [{ dayOfWeek: 1, startTime: '18:00', endTime: '18:50', sala: 'x' }] })));
      await env.denied(a.set('plans/p1', validPlan({ ativo: true })));
      const { sessions, ...withoutSessions } = validPlan();
      assert.ok(sessions);
      await env.denied(a.set('plans/p1', withoutSessions));
    });
    test('o próximo índice pode avançar e não pode ser reduzido ou apagado', async () => {
      const a = env.as(admin);
      const path = `plans/${PLANS.essencial}`;
      await env.allowed(a.update(path, { 'sessions/100': validPlan().sessions[0], nextSessionIndex: 101 }));
      await env.allowed(a.update(path, { 'sessions/100': null }));
      await env.denied(a.update(path, { nextSessionIndex: 100 }));
      await env.denied(a.update(path, { nextSessionIndex: null }));
      await env.denied(a.update(path, { nextSessionIndex: 101.5 }));
      await env.denied(a.update(path, { nextSessionIndex: 1000001 }));
    });
  });

  describe('users/{uid}/planId', () => {
    test('admin vincula e desvincula um plano existente', async () => {
      await env.allowed(env.as(admin).update(`users/${studentB.uid}`, { planId: PLANS.intensivo, updatedAt: NOW }));
      await env.allowed(env.as(admin).update(`users/${studentA.uid}`, { planId: null, plan: null, planName: null, updatedAt: NOW }));
      await env.denied(env.as(studentA).get(anaSlot));
    });
    test('plano inexistente ou id malformado é recusado', async () => {
      await env.denied(env.as(admin).update(`users/${studentB.uid}`, { planId: 'nao-existe' }));
      await env.denied(env.as(admin).update(`users/${studentB.uid}`, { planId: 'a/b' }));
    });
    test('aluno não escolhe o próprio plano', async () => {
      await env.denied(env.as(studentB).update(`users/${studentB.uid}`, { planId: PLANS.essencial }));
      await env.denied(env.as(studentA).set(`users/${studentA.uid}/planId`, PLANS.intensivo));
    });
    test('um perfil com vínculo legado pode ser atualizado e normalizado pelo admin', async () => {
      const a = env.as(admin);
      const path = `users/${studentA.uid}`;
      await env.allowed(a.update(path, { firstName: 'Ana Aparecida' }));
      await env.denied(a.update(path, { plan: PLANS.intensivo }));
      await env.denied(a.update(`users/${studentB.uid}`, { plan: PLANS.essencial }));
      await env.allowed(a.update(path, { planId: PLANS.intensivo }));
      await env.allowed(env.as(studentA).get(`plans/${PLANS.intensivo}`));
      await env.allowed(env.as(studentA).get(otherSlot));
      await env.denied(env.as(studentA).get(`plans/${PLANS.essencial}`));
      await env.denied(env.as(studentA).get(anaSlot));
      await env.allowed(a.update(path, { plan: null, planName: null }));
      assert.equal(await env.allowed(a.get(`${path}/plan`)), null);
      assert.equal(await env.allowed(a.get(`${path}/planName`)), null);
    });
  });

  describe('weekly_sessions', () => {
    test('equipe lê a semana inteira; aluno não', async () => {
      await env.allowed(env.as(mediatorA).get(`weekly_sessions/${AGENDA_WEEK}`));
      await env.denied(env.as(studentA).get(`weekly_sessions/${AGENDA_WEEK}`));
      await env.denied(env.as(studentA).get('weekly_sessions'));
    });
    test('aluna lê os encontros do próprio plano, não os de outro plano', async () => {
      assert.equal((await env.allowed(env.as(studentA).get(anaSlot))).topicTitle, 'Travel');
      // encontro do próprio plano ainda sem tema: leitura permitida, valor vazio
      assert.equal(await env.allowed(env.as(studentA).get(`weekly_sessions/${AGENDA_WEEK}/${PLANS.essencial}_1_0`)), null);
      await env.denied(env.as(studentA).get(otherSlot));
    });
    test('encontro com índice novo tem a mesma separação de leitura por plano', async () => {
      const slot = `weekly_sessions/${AGENDA_WEEK}/${PLANS.essencial}_5_100`;
      await env.allowed(env.as(mediatorA).set(slot, validSlot()));
      assert.equal((await env.allowed(env.as(studentA).get(slot))).topicTitle, 'Travel');
      await env.denied(env.as(studentB).get(slot));
      await env.denied(env.as(null).get(slot));
    });
    test('id de outro plano que começa com o id do meu plano não abre os encontros dele', async () => {
      // ids do push() podem conter "_": o plano "<meu>_x" não pode ser lido por quem tem "<meu>"
      for (const otherId of [`${PLANS.essencial}x`, `${PLANS.essencial}_x`]) {
        await env.allowed(env.as(admin).set(`plans/${otherId}`, validPlan()));
        await env.allowed(env.as(mediatorA).set(`weekly_sessions/${AGENDA_WEEK}/${otherId}_5_0`, validSlot()));
        await env.denied(env.as(studentA).get(`weekly_sessions/${AGENDA_WEEK}/${otherId}_5_0`));
      }
    });
    test('aluno sem plano, sem perfil e visitante não leem encontros', async () => {
      for (const actor of [studentB, noProfile, revoked, null]) await env.denied(env.as(actor).get(anaSlot));
    });
    test('equipe define e limpa tema/link; aluno não', async () => {
      const slot = `weekly_sessions/${AGENDA_WEEK}/${PLANS.essencial}_1_0`;
      await env.allowed(env.as(mediatorA).set(slot, validSlot()));
      await env.allowed(env.as(admin).remove(slot));
      await env.denied(env.as(studentA).set(slot, validSlot()));
      await env.denied(env.as(studentA).update(anaSlot, { meetLink: 'https://phishing.example.test' }));
    });
    test('esquema: semana, chave, link https e campos extras', async () => {
      const m = env.as(mediatorA);
      await env.denied(m.set(`weekly_sessions/2026-47/${PLANS.essencial}_1_0`, validSlot()));
      await env.denied(m.set(`weekly_sessions/${AGENDA_WEEK}/qualquer`, validSlot()));
      await env.denied(m.set(`weekly_sessions/${AGENDA_WEEK}/${PLANS.essencial}_9_0`, validSlot()));
      await env.denied(m.set(anaSlot, validSlot({ meetLink: 'http://meet.example.test/x' })));
      await env.denied(m.set(anaSlot, validSlot({ meetLink: 'javascript:alert(1)' })));
      await env.denied(m.set(anaSlot, validSlot({ meetLink: 'https://x.test/"><img>' })));
      await env.denied(m.set(anaSlot, validSlot({ topicTitle: '' })));
      await env.denied(m.set(anaSlot, validSlot({ mediadora: 'Carla' })));
      const { meetLink, questions, ...minimal } = validSlot();
      assert.ok(meetLink && questions);
      await env.allowed(m.set(anaSlot, minimal));
    });
  });
});
