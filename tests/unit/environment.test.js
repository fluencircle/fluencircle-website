// Seleção de ambiente (Issue #15), fechada por padrão: só os endereços publicados
// (PRODUCTION_HOSTNAMES) usam produção; todo o resto usa o Emulator.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveEnvironment, settingsForHostname, isLocalHostname, normalizeHostname, ENVIRONMENTS, ENVIRONMENT_SETTINGS,
} from '../../public/js/config/environment.js';
import { PRODUCTION_HOSTNAMES } from '../../public/js/config/firebase.config.js';

test('endereços locais selecionam o Emulator', () => {
  for (const host of ['localhost', '127.0.0.1', '::1', '[::1]', 'LOCALHOST', 'app.localhost']) {
    assert.equal(resolveEnvironment(host), ENVIRONMENTS.EMULATOR, host);
  }
});

test('regressão: endereços que antes caíam em PRODUÇÃO agora usam o Emulator', () => {
  // 0.0.0.0 é o link que `npm run serve` (python http.server) imprimia no terminal.
  for (const host of ['0.0.0.0', '127.0.0.2', '192.168.0.10', '10.0.0.5', 'meu-pc.local', 'fluentech-1e18a--pr12-abc123.web.app',
    'localhost.evil.example', 'fluentech-1e18a.web.app.evil.example', '', undefined, null]) {
    assert.equal(resolveEnvironment(host), ENVIRONMENTS.EMULATOR, String(host));
  }
});

test('só os endereços publicados do projeto real selecionam produção', () => {
  assert.deepEqual([...PRODUCTION_HOSTNAMES], ['fluentech-1e18a.web.app', 'fluentech-1e18a.firebaseapp.com']);
  for (const host of [...PRODUCTION_HOSTNAMES, 'FLUENTECH-1E18A.WEB.APP', ' fluentech-1e18a.firebaseapp.com. ']) {
    assert.equal(resolveEnvironment(host), ENVIRONMENTS.PRODUCTION, host);
  }
});

test('normaliza caixa, espaços e ponto final de FQDN', () => {
  assert.equal(normalizeHostname(' Fluentech-1e18a.Web.App. '), 'fluentech-1e18a.web.app');
  assert.equal(normalizeHostname(undefined), '');
});

test('reconhece endereços desta máquina (loopback, 0.0.0.0, *.localhost)', () => {
  for (const host of ['localhost', '127.0.0.1', '127.1.2.3', '[::1]', '0.0.0.0', 'x.localhost']) assert.equal(isLocalHostname(host), true, host);
  for (const host of ['192.168.0.10', '1270.0.0.1', '127.0.0.1.evil.example', 'localhost.evil.example', '']) assert.equal(isLocalHostname(host), false, host);
});

test('endereço local usa o selo padrão do Emulator', () => {
  for (const host of ['localhost', '127.0.0.1', '0.0.0.0']) {
    assert.equal(settingsForHostname(host), ENVIRONMENT_SETTINGS.emulator, host);
  }
});

test('endereço não reconhecido usa o Emulator e avisa no selo', () => {
  const lan = settingsForHostname('192.168.0.10');
  assert.equal(lan.name, ENVIRONMENTS.EMULATOR);
  assert.equal(lan.firebase.projectId, 'demo-fluencircle-audit');
  assert.deepEqual(lan.emulators, ENVIRONMENT_SETTINGS.emulator.emulators);
  assert.match(lan.badge, /Endereço não reconhecido \(192\.168\.0\.10\).*nunca a produção/);
  assert.match(settingsForHostname('').badge, /arquivo local/);
  assert.ok(Object.isFrozen(lan));
});

test('endereço publicado usa a configuração de produção, sem selo', () => {
  assert.equal(settingsForHostname('fluentech-1e18a.web.app'), ENVIRONMENT_SETTINGS.production);
});

test('configuração do Emulator não contém nenhum identificador do projeto real', () => {
  const emulator = JSON.stringify(ENVIRONMENT_SETTINGS.emulator.firebase);
  assert.match(ENVIRONMENT_SETTINGS.emulator.firebase.projectId, /^demo-/);
  assert.doesNotMatch(emulator, /fluentech|AIza/);
  assert.equal(ENVIRONMENT_SETTINGS.emulator.emulators.databaseHost, '127.0.0.1');
  assert.match(ENVIRONMENT_SETTINGS.emulator.badge, /Emulator/);
});

test('produção não liga Emulator nem mostra selo', () => {
  assert.equal(ENVIRONMENT_SETTINGS.production.emulators, null);
  assert.equal(ENVIRONMENT_SETTINGS.production.badge, null);
  assert.equal(ENVIRONMENT_SETTINGS.production.firebase.projectId, 'fluentech-1e18a');
});

test('tradutor público: grava direto só em produção (compatibilidade); no Emulator não tenta', () => {
  assert.equal(ENVIRONMENT_SETTINGS.production.publicTranslatorSavesFlashcards, true);
  assert.equal(ENVIRONMENT_SETTINGS.emulator.publicTranslatorSavesFlashcards, false);
  assert.equal(settingsForHostname('192.168.0.10').publicTranslatorSavesFlashcards, false);
});
