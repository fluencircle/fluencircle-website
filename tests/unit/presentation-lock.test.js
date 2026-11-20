// Decisões puras de posse da sessão ativa (Issue #9).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPresentationLive, publicSessionFrom, ownershipStatus, planPublish, planUnpublish, planReconnect,
  publishTransaction, unpublishTransaction, reconnectTransaction, isValidPresenterId,
} from '../../public/js/domain/presentation-lock.js';

const A = 'aba-A-0123456789abcdef';
const B = 'aba-B-0123456789abcdef';
const intent = (presenterId, sessionId = 's2') => ({ sessionId, topic: 'Travel', startedAt: '2026-11-19T12:00:00.000Z', presenterId });
const liveBy = (presenterId, version = 1, extra = {}) => ({ ...intent(presenterId, 's1'), version, live: { [presenterId]: true }, ...extra });

test('presenterId: 16 a 64 caracteres seguros', () => {
  assert.equal(isValidPresenterId(A), true);
  for (const bad of ['curto', 'a/b'.repeat(8), null, 42, 'x'.repeat(65)]) assert.equal(isValidPresenterId(bad), false);
  assert.throws(() => planPublish(null, intent('curto')), TypeError);
});

test('no ar: só com a presença do dono; formato antigo conta como no ar', () => {
  assert.equal(isPresentationLive(null), false);
  assert.equal(isPresentationLive(liveBy(A)), true);
  assert.equal(isPresentationLive({ ...liveBy(A), live: {} }), false);
  assert.equal(isPresentationLive({ ...liveBy(A), live: { [B]: true } }), false);
  assert.equal(isPresentationLive({ sessionId: 's1', topic: 'Antigo' }), true);
});

test('tradutor recebe só id e título de sessão no ar', () => {
  assert.deepEqual(publicSessionFrom(liveBy(A)), { sessionId: 's1', topic: 'Travel' });
  assert.equal(publicSessionFrom({ ...liveBy(A), live: {} }), null);
});

test('estado de posse visto por uma aba', () => {
  assert.equal(ownershipStatus(liveBy(A), A), 'live');
  assert.equal(ownershipStatus({ ...liveBy(A), live: {} }, A), 'offline');
  assert.equal(ownershipStatus(liveBy(B), A), 'taken-over');
  assert.equal(ownershipStatus(null, A), 'ended');
});

test('publicar sem ninguém: versão 1 e presença da própria aba', () => {
  assert.deepEqual(planPublish(null, intent(A)), { outcome: 'write', value: { ...intent(A), version: 1, live: { [A]: true } } });
});

test('publicar sobre apresentação viva de outra aba: conflito, sem gravar', () => {
  assert.deepEqual(planPublish(liveBy(B, 4), intent(A)), { outcome: 'conflict', current: liveBy(B, 4) });
});

test('assumir com confirmação: versão +1 e takeoverOf com o dono anterior', () => {
  const { outcome, value } = planPublish(liveBy(B, 4), intent(A), { takeover: liveBy(B, 4) });
  assert.equal(outcome, 'write');
  assert.equal(value.version, 5);
  assert.equal(value.takeoverOf, B);
  assert.deepEqual(value.live, { [A]: true });
});

test('confirmação de uma publicação não substitui outra que entrou durante o diálogo', () => {
  const shown = liveBy(B, 4);
  for (const current of [liveBy(B, 5), liveBy(B, 4, { sessionId: 'different' }), liveBy('aba-C-0123456789abcdef', 4)]) {
    assert.deepEqual(planPublish(current, intent(A), { takeover: shown }), { outcome: 'conflict', current });
  }
});

test('dono anterior caiu (sem presença): publica direto, versão +1, sem takeoverOf', () => {
  const { outcome, value } = planPublish({ ...liveBy(B, 2), live: {} }, intent(A));
  assert.equal(outcome, 'write');
  assert.equal(value.version, 3);
  assert.equal('takeoverOf' in value, false);
});

test('formato antigo: exige confirmação e recomeça a versão em 1', () => {
  const legacy = { sessionId: 's0', topic: 'Antigo', startedAt: '2026-11-18T10:00:00.000Z' };
  assert.equal(planPublish(legacy, intent(A)).outcome, 'conflict');
  const { value } = planPublish(legacy, intent(A), { takeover: legacy });
  assert.equal(value.version, 1);
  assert.equal('takeoverOf' in value, false);
});

test('mesma aba republica sem trocar a versão', () => {
  assert.equal(planPublish(liveBy(A, 7), intent(A)).value.version, 7);
});

test('encerrar: só a dona remove; outra aba não mexe', () => {
  assert.deepEqual(planUnpublish(liveBy(A), A), { outcome: 'remove' });
  assert.equal(planUnpublish(liveBy(B), A).outcome, 'not-owner');
  assert.deepEqual(planUnpublish(null, A), { outcome: 'already-gone' });
});

test('reconectar: restaura presença se ainda é dona; senão posse perdida', () => {
  assert.deepEqual(planReconnect({ ...liveBy(A, 3), live: {} }, A).value.live, { [A]: true });
  assert.equal(planReconnect({ ...liveBy(A, 3), live: {} }, A).value.version, 3);
  assert.equal(planReconnect(liveBy(B), A).outcome, 'lost');
  assert.equal(planReconnect(null, A).outcome, 'lost');
});

test('atualizadores de transação seguem as convenções do RTDB', () => {
  const publish = publishTransaction(intent(A));
  assert.equal(publish.update(liveBy(B)), undefined); // conflito → desiste
  assert.equal(publish.lastPlan().outcome, 'conflict');
  assert.equal(publishTransaction(intent(A)).update(null).version, 1);

  const end = unpublishTransaction(A);
  assert.equal(end.update(liveBy(A)), null); // remove
  assert.equal(end.update(liveBy(B)), undefined); // não é dona
  assert.equal(end.update(null), null); // cache vazio: deixa o servidor conferir

  const back = reconnectTransaction(A);
  assert.deepEqual(back.update({ ...liveBy(A), live: {} }).live, { [A]: true });
  assert.equal(back.update(liveBy(B)), undefined);
  assert.equal(back.update(null), null);
  assert.equal(back.lastPlan().outcome, 'lost');
});
