import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TRANSLATE_ENDPOINT } from '../../../public/js/config/app.config.js';
import { EMULATOR_PROJECT_ID, EMULATOR_HOSTS } from '../../../public/js/config/firebase.config.js';
import { DATABASE_NAMESPACE, assertSafeTarget, verifySeedSnapshot } from '../../../scripts/emulator/seed.mjs';
import { FIXED_NOW } from '../../e2e/support/harness.mjs';

export const HOSTING = 'http://127.0.0.1:5050';
const DATABASE = `http://${EMULATOR_HOSTS.databaseHost}:${EMULATOR_HOSTS.databasePort}`;
const DATABASE_SOCKET = DATABASE.replace(/^http:/, 'ws:');
const SDK_BASE = 'https://www.gstatic.com/firebasejs/10.8.0';
const SDK_FILES = ['firebase-app.js', 'firebase-auth.js', 'firebase-database.js'];

export async function loadSdk() {
  return new Map(await Promise.all(SDK_FILES.map(async (file) => {
    const url = `${SDK_BASE}/${file}`;
    if (process.env.E2E_FIREBASE_SDK_DIR) return [url, await readFile(join(process.env.E2E_FIREBASE_SDK_DIR, file))];
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
    assert.ok(response.ok, `SDK Firebase indisponível: ${url} (${response.status})`);
    return [url, Buffer.from(await response.arrayBuffer())];
  })));
}

/** Leitura administrativa somente no Emulator demo para conferir escritas feitas pela interface. */
export async function readDatabase(path = '') {
  const url = new URL(`/${path}.json`, DATABASE);
  assert.equal(url.origin, DATABASE);
  url.searchParams.set('ns', DATABASE_NAMESPACE);
  const response = await fetch(url, {
    headers: { Authorization: 'Bearer owner' }, redirect: 'error', signal: AbortSignal.timeout(5_000),
  });
  assert.ok(response.ok, `Não foi possível consultar RTDB demo: ${path} (${response.status})`);
  return response.json();
}

export async function requireDemo() {
  const auth = new URL(EMULATOR_HOSTS.authUrl);
  assertSafeTarget({ projectId: EMULATOR_PROJECT_ID, authHost: auth.host, databaseHost: new URL(DATABASE).host });
  assert.equal(auth.protocol, 'http:');
  assert.equal(DATABASE_NAMESPACE, `${EMULATOR_PROJECT_ID}-default-rtdb`);
  const checks = await Promise.all([
    fetch(`${HOSTING}/auth.html`, { redirect: 'error', signal: AbortSignal.timeout(5_000) }),
    fetch(`${EMULATOR_HOSTS.authUrl}/emulator/v1/projects/${EMULATOR_PROJECT_ID}/config`, {
      redirect: 'error', signal: AbortSignal.timeout(5_000),
    }),
    readDatabase(),
  ]);
  assert.ok(checks[0].ok, 'Hosting Emulator não está disponível');
  assert.ok(checks[1].ok, 'Auth Emulator demo não está disponível');
  verifySeedSnapshot(checks[2]);
}

/** O SDK oficial chega ao navegador sem transformações. Só os serviços locais recebem tráfego de teste. */
export async function newBrowserContext(t, browser, sdk) {
  const context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
  const unexpected = [];
  const pageErrors = [];
  const sockets = new Set();
  let databaseOnline = true;
  t.after(async () => {
    await context.close();
    assert.deepEqual(unexpected, [], 'destinos externos ou namespaces inesperados');
    assert.deepEqual(pageErrors, [], 'erros JavaScript no navegador');
  });
  context.on('page', (page) => {
    page.setDefaultTimeout(10_000);
    page.on('pageerror', (error) => pageErrors.push(error.message));
  });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (sdk.has(url.href)) {
      return route.fulfill({ body: sdk.get(url.href), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } });
    }
    if (url.origin === HOSTING || url.origin === EMULATOR_HOSTS.authUrl) return route.continue();
    if (url.origin === DATABASE && url.searchParams.get('ns') === DATABASE_NAMESPACE) {
      return databaseOnline ? route.continue() : route.abort('internetdisconnected');
    }
    if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://cdnjs.cloudflare.com') {
      return route.fulfill({ body: '', contentType: 'text/css' });
    }
    if (url.href === TRANSLATE_ENDPOINT) {
      return route.fulfill({
        contentType: 'application/json', body: JSON.stringify({ text: 'mala' }),
        headers: {
          'access-control-allow-origin': HOSTING,
          'access-control-allow-headers': 'content-type',
          'access-control-allow-methods': 'POST, OPTIONS',
        },
      });
    }
    unexpected.push(`${url.origin}${url.pathname}`);
    return route.abort();
  });
  await context.routeWebSocket('**/*', (socket) => {
    const url = new URL(socket.url());
    if (url.origin !== DATABASE_SOCKET || url.searchParams.get('ns') !== DATABASE_NAMESPACE) {
      unexpected.push(`${url.origin}${url.pathname}`);
      return socket.close();
    }
    if (!databaseOnline) return socket.close();
    const server = socket.connectToServer();
    const connection = { socket, server };
    sockets.add(connection);
    socket.onClose((code, reason) => {
      sockets.delete(connection);
      server.close({ code, reason }).catch(() => {});
    });
    server.onClose((code, reason) => {
      sockets.delete(connection);
      socket.close({ code, reason }).catch(() => {});
    });
  });

  return {
    async open(path) {
      const page = await context.newPage();
      await page.clock.setFixedTime(FIXED_NOW);
      await page.goto(`${HOSTING}/${path}`);
      return page;
    },
    async loseDatabaseConnection() {
      databaseOnline = false;
      assert.ok(sockets.size > 0, 'O navegador não abriu uma conexão WebSocket com o Emulator');
      await Promise.all([...sockets].flatMap(({ socket, server }) => [socket.close(), server.close()]));
    },
    restoreDatabaseConnection() { databaseOnline = true; },
  };
}

/** Observa o resultado da regra usando a sessão real do navegador. */
export function browserRead(page, path) {
  return page.evaluate(async (requestedPath) => {
    const { database, ref, get } = await import('/js/core/firebase.js');
    try {
      return { value: (await get(ref(database, requestedPath))).val() };
    } catch (error) {
      return { error: error.code || error.message };
    }
  }, path);
}
