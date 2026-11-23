/**
 * @file Infraestrutura dos testes E2E (Playwright, sem rede).
 *
 * - Serve `public/` numa origem interceptada (nenhum servidor real é aberto).
 * - Troca o SDK do Firebase (CDN) pelos módulos de `fake-firebase/`, que falam por
 *   RPC com um banco SIMULADO compartilhado por todas as abas e contextos. Esse
 *   banco aplica as REGRAS PROPOSTAS com o simulador local (não é o Firebase).
 * - Simula o backend de tradução (Render) com um dicionário fixo.
 * - Bloqueia e registra qualquer outra requisição: os testes conferem que a
 *   página não tentou falar com serviços reais.
 *
 * Origem local (http://localhost:4173) → a página escolhe o ambiente Emulator;
 * origem de produção (https://fluentech-1e18a.web.app) → ambiente de produção.
 * Em ambos os casos nada sai da máquina.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRulesSimulator } from '../../support/rtdb-rules-simulator.js';
import { ACTORS, DEMO_PASSWORD, buildSyntheticDatabase } from '../../fixtures/synthetic-data.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '../../..');
const PUBLIC_ROOT = path.join(REPO_ROOT, 'public');
const FAKE_ROOT = path.join(HERE, 'fake-firebase');
export const RULES = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs/firebase/database.rules.proposta.json'), 'utf8'));

export const ORIGINS = Object.freeze({
  local: 'http://localhost:4173',
  production: 'https://fluentech-1e18a.web.app',
  /** Endereço de rede local (ex.: celular abrindo o servidor de desenvolvimento). Não é produção. */
  lan: 'http://192.168.0.10:5501',
  /** Canal de pré-visualização do Firebase Hosting. Não é produção. */
  preview: 'https://fluentech-1e18a--pr41-abc123.web.app',
});

/** Instante fixo dos testes (as sessões sintéticas são de 10 a 17/11/2026). */
export const FIXED_NOW = new Date('2026-11-19T15:00:00.000Z');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml',
};

/** Dicionário do backend de tradução simulado. */
const DICTIONARY = { dog: 'cachorro', cachorro: 'dog', house: 'casa', suitcase: 'mala', beach: 'praia' };

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clone = (value) => (value === undefined ? null : JSON.parse(JSON.stringify(value)));

/** Contas do Auth simulado: todos os atores sintéticos com a senha de demonstração. */
function defaultAccounts() {
  return Object.values(ACTORS).map((actor) => ({ uid: actor.uid, email: actor.email, password: DEMO_PASSWORD }));
}

/**
 * Backend simulado (Auth + Realtime Database) compartilhado pelas páginas.
 * @param {{ data?: object, accounts?: Array<{uid: string, email: string, password: string}> }} [options]
 */
export function createFakeBackend({ data = buildSyntheticDatabase(), accounts = defaultAccounts() } = {}) {
  const db = createRulesSimulator({ rules: RULES, data, now: () => FIXED_NOW.getTime() });
  const accountsByEmail = new Map(accounts.map((account) => [account.email.toLowerCase(), { ...account }]));
  const connections = new Map(); // page → estado da conexão
  const log = [];
  let uidSeq = 0;
  let connectionSeq = 0;

  function connectionFor(page) {
    if (!connections.has(page)) {
      const state = { id: `conexao-${++connectionSeq}`, online: true, waiters: [], listeners: new Map() };
      connections.set(page, state);
      page.on('close', () => closeConnection(page));
      page.on('framenavigated', (frame) => {
        // Nova página carregada na mesma aba = conexão nova; a antiga "cai".
        if (frame === page.mainFrame() && connections.get(page) === state) closeConnection(page);
      });
    }
    return connections.get(page);
  }

  function closeConnection(page) {
    const state = connections.get(page);
    if (!state) return;
    connections.delete(page);
    if (db.disconnect(state.id) > 0) notifyAll();
  }

  const authFor = (auth) => (auth ? { uid: auth.uid, token: { email: auth.email ?? null, email_verified: true } } : null);
  const errorOf = (error) => ({ error: { code: error.code || 'UNKNOWN', message: error.message } });

  async function waitOnline(state) {
    if (state.online) return;
    await Promise.race([
      new Promise((resolve) => state.waiters.push(resolve)),
      delay(10000).then(() => { throw Object.assign(new Error('desconectado'), { code: 'disconnected' }); }),
    ]);
  }

  /** Reenvia valores observados que mudaram, respeitando a leitura de cada ouvinte. */
  function notifyAll() {
    for (const [page, state] of connections) {
      for (const [listenerId, listener] of state.listeners) {
        let value;
        try { value = db.read(listener.path, listener.auth); } catch { value = null; }
        const json = JSON.stringify(value);
        if (json === listener.last) continue;
        listener.last = json;
        page.evaluate(([id, v]) => globalThis.__e2eDbPush?.(id, v), [listenerId, value]).catch(() => {});
      }
    }
  }

  async function handle(page, op, payload = {}) {
    const state = connectionFor(page);
    const auth = authFor(payload.auth);
    log.push({ op, path: payload.path, uid: payload.auth?.uid ?? null });
    try {
      switch (op) {
        case 'auth.signIn': {
          const account = accountsByEmail.get(String(payload.email).toLowerCase());
          if (!account || account.password !== payload.password) return { error: 'auth/invalid-credential' };
          return { user: { uid: account.uid, email: account.email } };
        }
        case 'auth.createUser': {
          const email = String(payload.email || '');
          if (!/^[^@\s]+@[^@\s]+$/.test(email)) return { error: 'auth/invalid-email' };
          if (!payload.password || payload.password.length < 6) return { error: 'auth/weak-password' };
          if (accountsByEmail.has(email.toLowerCase())) return { error: 'auth/email-already-in-use' };
          const account = { uid: `uid-e2e-${++uidSeq}`, email, password: payload.password };
          accountsByEmail.set(email.toLowerCase(), account);
          return { user: { uid: account.uid, email } };
        }
        case 'auth.deleteUser': {
          for (const [email, account] of accountsByEmail) if (account.uid === payload.uid) accountsByEmail.delete(email);
          return {};
        }
        case 'db.get':
          await waitOnline(state);
          return { value: db.read(payload.path, auth) };
        case 'db.subscribe': {
          const value = db.read(payload.path, auth);
          state.listeners.set(payload.listenerId, { path: payload.path, auth, last: JSON.stringify(value) });
          return { value };
        }
        case 'db.unsubscribe':
          state.listeners.delete(payload.listenerId);
          return {};
        case 'db.set':
          await waitOnline(state);
          db.set(payload.path, payload.value, auth);
          notifyAll();
          return {};
        case 'db.update':
          await waitOnline(state);
          db.update(payload.path, payload.values, auth);
          notifyAll();
          return {};
        case 'db.compareAndSet': {
          await waitOnline(state);
          const current = db.adminGet(payload.path);
          if (JSON.stringify(current) !== JSON.stringify(payload.expected ?? null)) return { ok: false, stale: true };
          db.set(payload.path, payload.value, auth);
          notifyAll();
          return { ok: true, value: db.adminGet(payload.path) };
        }
        case 'db.onDisconnect':
          db.onDisconnect(state.id, { op: payload.op, path: payload.path, value: payload.value }, auth);
          return {};
        case 'db.onDisconnectCancel':
          db.cancelOnDisconnect(state.id, payload.path);
          return {};
        default:
          return { error: { code: 'UNKNOWN_OP', message: `Operação desconhecida: ${op}` } };
      }
    } catch (error) {
      return errorOf(error);
    }
  }

  return {
    handle,
    log,
    /** Lê o banco sem regras (para conferir o efeito das ações). */
    adminGet: (p = '') => clone(db.adminGet(p)),
    adminSet: (p, value) => { db.adminSet(p, value); notifyAll(); },
    /** Simula queda de rede desta aba: o servidor executa os onDisconnect dela. */
    async dropConnection(page) {
      const state = connectionFor(page);
      state.online = false;
      db.disconnect(state.id);
      notifyAll();
      await page.evaluate(() => globalThis.__e2eConnection?.(false));
    },
    /** Simula o retorno da rede desta aba. */
    async restoreConnection(page) {
      const state = connectionFor(page);
      state.online = true;
      state.waiters.splice(0).forEach((resolve) => resolve());
      await page.evaluate(() => globalThis.__e2eConnection?.(true));
    },
    accountExists: (email) => accountsByEmail.has(String(email).toLowerCase()),
  };
}

/** Abre o Chromium do Playwright (ou o Chrome indicado em E2E_CHROME_PATH). */
export async function launchBrowser() {
  let playwright;
  try {
    playwright = await import('playwright');
  } catch (error) {
    throw new Error(`Testes E2E exigem o pacote "playwright" (npm install). ${error.message}`);
  }
  return playwright.chromium.launch({
    executablePath: process.env.E2E_CHROME_PATH || undefined,
    args: ['--no-sandbox'],
  });
}

async function routeRequest(route, origin, network) {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin === origin) {
    if (url.pathname === '/__blank__') return route.fulfill({ status: 200, body: '<!doctype html><title>blank</title>', contentType: 'text/html' });
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.join(PUBLIC_ROOT, relative);
    if (!file.startsWith(PUBLIC_ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      network.missing.push(relative);
      return route.fulfill({ status: 404, body: 'not found' });
    }
    return route.fulfill({ status: 200, body: fs.readFileSync(file), headers: { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' } });
  }
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    const fake = path.join(FAKE_ROOT, path.basename(url.pathname));
    if (fs.existsSync(fake)) {
      return route.fulfill({ status: 200, body: fs.readFileSync(fake), headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } });
    }
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'cdnjs.cloudflare.com') {
    return route.fulfill({ status: 200, body: '/* css de CDN simulado */', headers: { 'content-type': 'text/css', 'access-control-allow-origin': '*' } });
  }
  if (url.hostname === 'fluencircle-backend.onrender.com') {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    let body = {};
    try { body = JSON.parse(request.postData() || '{}'); } catch { /* corpo inválido */ }
    network.translations.push(body);
    if (network.failTranslations) return route.fulfill({ status: 503, body: 'indisponível', headers: cors });
    const word = (/Texto a ser traduzido: ([\s\S]*)$/.exec(body.prompt || '')?.[1] || '').trim();
    return route.fulfill({ status: 200, body: JSON.stringify({ text: DICTIONARY[word.toLowerCase()] || `tradução de ${word}` }), headers: { 'content-type': 'application/json', ...cors } });
  }
  network.blocked.push(`${request.method()} ${url.origin}${url.pathname}`);
  return route.abort();
}

/**
 * Cria um contexto de navegador (equivale a um navegador/pessoa diferente).
 * `failTranslations: true` faz o backend de tradução simulado responder 503.
 * @returns {Promise<{ context: import('playwright').BrowserContext, network: { blocked: string[], missing: string[], translations: object[] } }>}
 */
export async function newContext(browser, backend, { origin = ORIGINS.local, viewport = { width: 1366, height: 768 }, failTranslations = false } = {}) {
  const context = await browser.newContext({ viewport, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const network = { blocked: [], missing: [], translations: [], origin, failTranslations };
  await context.exposeBinding('__e2eRpc', (source, op, payload) => backend.handle(source.page, op, payload));
  await context.route('**/*', (route) => routeRequest(route, origin, network));
  return { context, network };
}

/**
 * Abre uma página com relógio fixo e, se pedido, já autenticada.
 * @param {{ context: object, network: object }} ctx
 * @param {string} pagePath ex.: 'flash-cards.html'
 * @param {{ as?: { uid: string, email: string } | null }} [options]
 */
export async function openPage({ context, network }, pagePath, { as = null } = {}) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message || error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto(`${network.origin}/__blank__`);
  await page.evaluate((user) => {
    localStorage.clear();
    sessionStorage.clear();
    if (user) localStorage.setItem('__e2e_auth:[DEFAULT]', JSON.stringify(user));
  }, as ? { uid: as.uid, email: as.email } : null);
  await page.goto(`${network.origin}/${pagePath}`);
  return { page, errors };
}

/** Espera um aviso (toast) com o texto indicado. */
export async function expectToast(page, text, timeout = 5000) {
  await page.waitForFunction((expected) => {
    const toast = document.getElementById('app-toast');
    return Boolean(toast && toast.classList.contains('toast-visible') && toast.textContent.includes(expected));
  }, text, { timeout });
}

/** Erros de console/página que não são falhas esperadas de regra. */
export function unexpectedErrors(errors) {
  return errors.filter((message) => !/PERMISSION_DENIED|Failed to load resource|net::ERR_FAILED/.test(message));
}
