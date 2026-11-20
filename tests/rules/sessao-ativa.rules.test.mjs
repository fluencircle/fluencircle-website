/**
 * Concorrência na sessão ativa (`current_session`, Issue #9): dois mediadores,
 * duas abas do mesmo mediador, desconexão e retorno. As transações usam os
 * MESMOS atualizadores do serviço (public/js/domain/presentation-lock.js), e as
 * regras propostas conferem versão, posse e confirmação de "assumir".
 *
 * Executar: `npm run test:rules` (Emulator) ou `npm run test:rules:sim`.
 */
import { describe, test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRulesEnv } from './support/rules-env.mjs';
import { ACTORS, SESSIONS, buildSyntheticDatabase } from '../fixtures/synthetic-data.mjs';
import {
  publishTransaction, unpublishTransaction, reconnectTransaction, publicSessionFrom,
} from '../../public/js/domain/presentation-lock.js';

const env = await createRulesEnv();
const { mediatorA, mediatorB, studentA, admin } = ACTORS;
const NOW = '2026-11-19T12:00:00.000Z';
const TAB_A1 = 'aba-carla-1-0000000001';
const TAB_A2 = 'aba-carla-2-0000000002';
const TAB_B = 'aba-diego-0000000000003';
const CURRENT = 'current_session';

const intent = (presenterId, sessionId) => ({ sessionId, topic: sessionId === SESSIONS.anaOnly ? 'Technology & Daily Life' : 'Travel', startedAt: NOW, presenterId });

/** Publica como o serviço faz: transação + onDisconnect só da própria presença. */
async function publish(client, presenterId, sessionId, { takeover = false } = {}) {
  const confirmed = takeover ? await client.get(CURRENT) : false;
  const transaction = publishTransaction(intent(presenterId, sessionId), { takeover: confirmed });
  const result = await client.transaction(CURRENT, transaction.update);
  if (result.committed) await client.onDisconnectRemove(`${CURRENT}/live/${presenterId}`);
  return { committed: result.committed, plan: transaction.lastPlan() };
}

describe(`${env.label} sessão ativa: posse, versão e desconexão`, () => {
  beforeEach(() => env.seed(buildSyntheticDatabase()));
  after(() => env.cleanup());

  test('mediador A publica: versão 1, presença da aba e leitura pública mínima', async () => {
    const carla = env.as(mediatorA);
    assert.equal((await publish(carla, TAB_A1, SESSIONS.anaOnly)).committed, true);
    const node = await env.adminGet(CURRENT);
    assert.equal(node.version, 1);
    assert.deepEqual(node.live, { [TAB_A1]: true });
    assert.deepEqual(publicSessionFrom(await env.allowed(env.as(null).get(CURRENT))), { sessionId: SESSIONS.anaOnly, topic: 'Technology & Daily Life' });
  });

  test('dois mediadores: B não sobrescreve A sem confirmar; regra nega gravação às cegas', async () => {
    await publish(env.as(mediatorA), TAB_A1, SESSIONS.anaOnly);
    const diego = env.as(mediatorB);
    const attempt = await publish(diego, TAB_B, SESSIONS.both);
    assert.equal(attempt.committed, false);
    assert.equal(attempt.plan.outcome, 'conflict');
    await env.denied(diego.set(CURRENT, { ...intent(TAB_B, SESSIONS.both), version: 2, live: { [TAB_B]: true } }));
    assert.equal((await env.adminGet(CURRENT)).presenterId, TAB_A1);
  });

  test('B assume com confirmação: versão 2 e takeoverOf = A', async () => {
    await publish(env.as(mediatorA), TAB_A1, SESSIONS.anaOnly);
    assert.equal((await publish(env.as(mediatorB), TAB_B, SESSIONS.both, { takeover: true })).committed, true);
    const node = await env.adminGet(CURRENT);
    assert.equal(node.presenterId, TAB_B);
    assert.equal(node.version, 2);
    assert.equal(node.takeoverOf, TAB_A1);
    assert.deepEqual(node.live, { [TAB_B]: true });
  });

  test('aba antiga de A não derruba B: sua desconexão só apaga a própria chave', async () => {
    const carla = env.as(mediatorA);
    await publish(carla, TAB_A1, SESSIONS.anaOnly);
    await publish(env.as(mediatorB), TAB_B, SESSIONS.both, { takeover: true });
    await carla.goOffline();
    await new Promise((resolve) => setTimeout(resolve, env.driver === 'emulator' ? 1500 : 0));
    const node = await env.adminGet(CURRENT);
    assert.equal(node.presenterId, TAB_B);
    assert.deepEqual(node.live, { [TAB_B]: true });
    assert.ok(publicSessionFrom(node));
  });

  test('aba antiga de A não reativa a própria presença nem regrava com versão velha', async () => {
    const carla = env.as(mediatorA);
    await publish(carla, TAB_A1, SESSIONS.anaOnly);
    await publish(env.as(mediatorB), TAB_B, SESSIONS.both, { takeover: true });
    await env.denied(carla.set(`${CURRENT}/live/${TAB_A1}`, true));
    await env.denied(carla.set(CURRENT, { ...intent(TAB_A1, SESSIONS.anaOnly), version: 2, live: { [TAB_A1]: true } }));
    const end = unpublishTransaction(TAB_A1);
    const result = await carla.transaction(CURRENT, end.update);
    assert.equal(result.committed, false);
    assert.equal(end.lastPlan().outcome, 'not-owner');
    assert.equal((await env.adminGet(CURRENT)).presenterId, TAB_B);
  });

  test('duas abas do mesmo mediador seguem a mesma posse por aba', async () => {
    await publish(env.as(mediatorA), TAB_A1, SESSIONS.anaOnly);
    const secondTab = env.as(mediatorA);
    assert.equal((await publish(secondTab, TAB_A2, SESSIONS.both)).committed, false);
    await env.denied(secondTab.set(CURRENT, { ...intent(TAB_A2, SESSIONS.both), version: 2, live: { [TAB_A2]: true } }));
    assert.equal((await publish(secondTab, TAB_A2, SESSIONS.both, { takeover: true })).committed, true);
    assert.equal((await env.adminGet(CURRENT)).takeoverOf, TAB_A1);
  });

  test('desconexão do dono tira a sessão do tradutor e libera publicação sem confirmar', async () => {
    const carla = env.as(mediatorA);
    await publish(carla, TAB_A1, SESSIONS.anaOnly);
    await carla.goOffline();
    const node = await env.waitForAdmin(CURRENT, (value) => !value?.live);
    assert.equal(publicSessionFrom(node), null);
    const diego = env.as(mediatorB);
    assert.equal((await publish(diego, TAB_B, SESSIONS.both)).committed, true);
    assert.equal((await env.adminGet(CURRENT)).version, 2);
    assert.equal('takeoverOf' in (await env.adminGet(CURRENT)), false);
  });

  test('retorno da conexão: dona restaura a presença; quem perdeu a posse não restaura', async () => {
    const carla = env.as(mediatorA);
    await publish(carla, TAB_A1, SESSIONS.anaOnly);
    await carla.goOffline();
    await env.waitForAdmin(CURRENT, (value) => !value?.live);
    await carla.goOnline();
    // Como o serviço: onDisconnect dispara uma vez só; ao voltar, registra de novo e restaura.
    await carla.onDisconnectRemove(`${CURRENT}/live/${TAB_A1}`);
    const back = reconnectTransaction(TAB_A1);
    assert.equal((await carla.transaction(CURRENT, back.update)).committed, true);
    assert.deepEqual((await env.adminGet(CURRENT)).live, { [TAB_A1]: true });

    await carla.goOffline();
    await env.waitForAdmin(CURRENT, (value) => !value?.live);
    await publish(env.as(mediatorB), TAB_B, SESSIONS.both);
    await carla.goOnline();
    const lost = reconnectTransaction(TAB_A1);
    assert.equal((await carla.transaction(CURRENT, lost.update)).committed, false);
    assert.equal(lost.lastPlan().outcome, 'lost');
    assert.equal((await env.adminGet(CURRENT)).presenterId, TAB_B);
  });

  test('dona encerra: nó removido e tradutor sem sessão', async () => {
    const carla = env.as(mediatorA);
    await publish(carla, TAB_A1, SESSIONS.anaOnly);
    await carla.onDisconnectCancel(`${CURRENT}/live/${TAB_A1}`);
    const end = unpublishTransaction(TAB_A1);
    assert.equal((await carla.transaction(CURRENT, end.update)).committed, true);
    assert.equal(await env.adminGet(CURRENT), null);
  });

  test('formato antigo publicado antes da mudança pode ser substituído com confirmação', async () => {
    await env.seed({ ...buildSyntheticDatabase(), current_session: { sessionId: SESSIONS.anaOnly, topic: 'Technology & Daily Life', startedAt: NOW } });
    assert.ok(publicSessionFrom(await env.adminGet(CURRENT)), 'tradutor continua vendo o formato antigo');
    const diego = env.as(mediatorB);
    assert.equal((await publish(diego, TAB_B, SESSIONS.both)).committed, false);
    assert.equal((await publish(diego, TAB_B, SESSIONS.both, { takeover: true })).committed, true);
    assert.equal((await env.adminGet(CURRENT)).version, 1);
  });

  test('esquema: id de posse, versão inteira, presença só do dono, sem campos extras', async () => {
    const carla = env.as(mediatorA);
    const base = { ...intent(TAB_A1, SESSIONS.anaOnly), version: 1, live: { [TAB_A1]: true } };
    await env.denied(carla.set(CURRENT, { ...base, presenterId: 'curto', live: { curto: true } }));
    await env.denied(carla.set(CURRENT, { ...base, version: 1.5 }));
    await env.denied(carla.set(CURRENT, { ...base, live: { [TAB_A1]: true, [TAB_B]: true } }));
    await env.denied(carla.set(CURRENT, { ...base, mediatorEmail: mediatorA.email }));
    await env.denied(carla.set(CURRENT, { ...base, sessionId: 'nao-existe' }));
    await env.allowed(carla.set(CURRENT, base));
  });

  test('aluno e visitante não publicam, não assumem e não mexem na presença', async () => {
    await publish(env.as(mediatorA), TAB_A1, SESSIONS.anaOnly);
    for (const actor of [studentA, null]) {
      const client = env.as(actor);
      await env.denied(client.set(`${CURRENT}/live/${TAB_A1}`, null));
      await env.denied(client.set(CURRENT, { ...intent(TAB_B, SESSIONS.both), version: 2, takeoverOf: TAB_A1, live: { [TAB_B]: true } }));
      await env.denied(client.remove(CURRENT));
    }
  });

  test('RISCO ACEITO: qualquer membro da equipe consegue encerrar (o cliente só encerra o próprio)', async () => {
    await publish(env.as(mediatorA), TAB_A1, SESSIONS.anaOnly);
    await env.allowed(env.as(admin).remove(CURRENT));
    assert.equal(await env.adminGet(CURRENT), null);
  });
});
