/**
 * Ferramenta de medição (scripts/benchmarks/page-performance-lib.mjs): os números
 * do relatório de desempenho só valem se a contagem de operações do RTDB e a carga
 * sintética estiverem corretas.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRtdbFrames, buildSyntheticVolume, median, SCALES, createRandom } from '../../scripts/benchmarks/page-performance-lib.mjs';
import { buildSyntheticDatabase } from '../fixtures/synthetic-data.mjs';

const out = (a, p, extra = {}) => ({ dir: 'out', data: JSON.stringify({ t: 'd', d: { r: 1, a, b: { p, ...extra } } }) });

test('conta get, listen, escritas e onDisconnect pelo protocolo do RTDB', () => {
  const summary = summarizeRtdbFrames([
    out('g', '/users/u1', { q: {} }),
    out('q', '/current_session', { h: '' }),
    out('n', '/current_session'),
    out('p', '/flashcards/s1/c1', { d: { front: 'a' } }),
    out('m', '/', { d: { 'a/b': 1 } }),
    out('o', '/current_session/live/x', { d: null }),
    { dir: 'out', data: JSON.stringify({ t: 'c', d: { t: 'p', d: {} } }) }, // controle: ignorado
    { dir: 'in', data: '{"t":"d","d":{"r":1,"b":{"s":"ok","d":{"role":"student"}}}}' },
  ]);
  assert.equal(summary.reads, 1);
  assert.equal(summary.listens, 1);
  assert.equal(summary.unlistens, 1);
  assert.equal(summary.writes, 2);
  assert.equal(summary.onDisconnect, 1);
  assert.equal(summary.paths['get /users/u1'], 1);
  assert.equal(summary.paths['listen /current_session'], 1);
  assert.ok(summary.bytesIn > 0);
});

test('remonta mensagens divididas em vários quadros ("N" + partes)', () => {
  const message = JSON.stringify({ t: 'd', d: { r: 7, a: 'g', b: { p: '/flashcards', q: {} } } });
  const half = Math.floor(message.length / 2);
  const summary = summarizeRtdbFrames([
    { dir: 'out', data: '2' },
    { dir: 'out', data: message.slice(0, half) },
    { dir: 'out', data: message.slice(half) },
  ]);
  assert.equal(summary.reads, 1);
  assert.equal(summary.paths['get /flashcards'], 1);
});

test('quadros inválidos não quebram o resumo', () => {
  const summary = summarizeRtdbFrames([{ dir: 'out', data: 'não é json' }, { dir: 'in', data: '' }]);
  assert.equal(summary.reads + summary.listens + summary.writes, 0);
});

test('mediana de listas pares, ímpares e vazias', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test('gerador aleatório é determinístico pela semente', () => {
  const a = createRandom(42);
  const b = createRandom(42);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test('escala pequena não altera a fixture', () => {
  const database = buildSyntheticDatabase();
  const before = JSON.stringify(database);
  const info = buildSyntheticVolume(database, { scale: 'small', studentUid: 'student-ana', mediatorEmail: 'm@example.test' });
  assert.equal(JSON.stringify(database), before);
  assert.equal(info.sessions, 3);
});

test('escala média: o aluno medido tem o mesmo número de sessões que na grande', () => {
  const studentUid = 'student-ana';
  const medium = buildSyntheticDatabase();
  const large = buildSyntheticDatabase();
  const m = buildSyntheticVolume(medium, { scale: 'medium', studentUid, mediatorEmail: 'm@example.test' });
  const l = buildSyntheticVolume(large, { scale: 'large', studentUid, mediatorEmail: 'm@example.test' });
  assert.equal(m.addedStudentSessions, SCALES.medium.studentSessions);
  assert.equal(l.addedStudentSessions, SCALES.large.studentSessions);
  assert.equal(m.studentSessions, l.studentSessions);
  assert.equal(l.extraSessions, SCALES.large.sessions);
  assert.equal(l.extraCards, SCALES.large.sessions * SCALES.large.cardsPerSession);
});

test('carga sintética mantém o índice do aluno coerente com as presenças', () => {
  const studentUid = 'student-ana';
  const database = buildSyntheticDatabase();
  buildSyntheticVolume(database, { scale: 'medium', studentUid, mediatorEmail: 'm@example.test' });
  for (const [sessionId, entry] of Object.entries(database.user_sessions[studentUid])) {
    assert.ok(database.meeting_sessions[sessionId].attendees[studentUid], `presença ausente em ${sessionId}`);
    assert.equal(entry.topic, database.meeting_sessions[sessionId].topic);
  }
  // Só dados fictícios: e-mails no domínio reservado example.test.
  assert.ok(Object.values(database.users).every((u) => u.email.endsWith('@example.test')));
});
