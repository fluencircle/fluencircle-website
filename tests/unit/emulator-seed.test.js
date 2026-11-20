import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  assertSafeTarget, isDirectExecution, verifySeedSnapshot, PROJECT_ID,
} from '../../scripts/emulator/seed.mjs';
import { buildSyntheticDatabase } from '../fixtures/synthetic-data.mjs';

const script = fileURLToPath(new URL('../../scripts/emulator/seed.mjs', import.meta.url));

test('detecção da entrada CLI normaliza caminho em vez de concatenar file://', () => {
  assert.equal(isDirectExecution(pathToFileURL(script).href, script), true);
  assert.equal(isDirectExecution(pathToFileURL(script).href, undefined), false);
  assert.equal(isDirectExecution('file:///different/seed.mjs', script), false);
});

test('detecção de entrada funciona com espaço e caracteres escapados', () => {
  const sample = resolve('Pasta com espaços', 'arquivo á.mjs');
  assert.equal(isDirectExecution(pathToFileURL(sample).href, sample), true);
  assert.equal(isDirectExecution(pathToFileURL(sample).href, sample + '.bak'), false);
});

test('invocação por Node --check NÃO termina silenciosamente (sem exigir servidor)', () => {
  const run = spawnSync(process.execPath, [script, '--check'], {
    encoding: 'utf8',
    env: { ...process.env,
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:9000' },
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /SEED_CLI_CHECK_OK: demo-fluencircle-audit/);
  assert.match(run.stdout, /nenhum dado foi gravado/);
});

test('verificador detecta carga sintética completa e rejeita banco vazio ou parcial', () => {
  const snapshot = buildSyntheticDatabase();
  const count = verifySeedSnapshot(snapshot);
  assert.ok(count.users >= 5);
  assert.equal(count.sessions, 3);
  assert.equal(count.plans, 2);
  assert.throws(() => verifySeedSnapshot(null), /vazio/);
  assert.throws(() => verifySeedSnapshot({ users: snapshot.users }), /coleção sintética/);
});

test('seed rejeita projeto que não é demo e endereço remoto', () => {
  const valid = { projectId: PROJECT_ID, authHost: '127.0.0.1:9099',
    databaseHost: '127.0.0.1:9000' };
  assert.doesNotThrow(() => assertSafeTarget(valid));
  assert.throws(() => assertSafeTarget({ ...valid, projectId: 'fluentech-1e18a' }), /não é demo/);
  assert.throws(() => assertSafeTarget({ ...valid, databaseHost: 'firebaseio.com:9000' }), /não é local/);
});
