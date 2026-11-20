/**
 * @file Medição REPRODUTÍVEL de desempenho das páginas no navegador, contra o
 * Firebase Emulator LOCAL e dados SINTÉTICOS (nunca produção).
 *
 *   firebase emulators:exec --config firebase.emulator.json --project demo-fluencircle-audit \
 *     --only auth,database "node scripts/benchmarks/page-performance.mjs --scale=medium --runs=5"
 *
 * Ou `npm run bench:pages -- --scale=medium` (usa o comando acima).
 *
 * O que faz:
 * 1. Recusa qualquer alvo que não seja Emulator local de projeto `demo-*`.
 * 2. Recria as contas de demonstração e grava a carga sintética da escala pedida.
 * 3. Serve `public/` por HTTP/2 + TLS (certificado autoassinado temporário) e gzip,
 *    o mais próximo do Firebase Hosting que dá para ter localmente. Só as portas do
 *    Emulator são reescritas em `firebase.config.js`, e somente nesta resposta local.
 * 4. Abre cada página com cache frio (contexto novo), já autenticado pelo papel
 *    adequado, e coleta: FCP, LCP, CLS, instante em que a autenticação foi resolvida
 *    (`#user-email` preenchido), instante em que os dados apareceram (seletor da
 *    página), requisições e bytes por tipo, e as OPERAÇÕES do Realtime Database
 *    lidas dos quadros WebSocket (get, listen, set, update), com bytes recebidos.
 *
 * Opções:
 *   --scale=small|medium|large   volume sintético (padrão: small)
 *   --runs=N                     repetições por página (padrão: 5); relata mediana, mín. e máx.
 *   --network=none|mobile        `mobile`: latência 150 ms, 1,6 Mbit/s, 750 kbit/s, CPU 4x (padrão: none)
 *   --protocol=h2|h1             HTTP/2 com TLS (padrão) ou HTTP/1.1 sem TLS
 *   --pages=a,b                  subconjunto de ids de página (ver PAGES)
 *   --scenario=pages|study-loop  `study-loop`: abre/fecha o modo de estudo N vezes e mede heap/listeners
 *   --skip-seed                  reaproveita a carga já gravada (mesma escala)
 *   --out=arquivo.json           grava os resultados brutos e o resumo
 *   --label=texto                rótulo livre gravado no JSON (ex.: "antes", "depois")
 *
 * Limites (declarados também no relatório): Emulator na mesma máquina (sem latência
 * real de servidor), throttling do DevTools (aproximação, aplicado por requisição),
 * Chromium headless do Playwright. Os números comparam versões NAS MESMAS condições;
 * não são previsão de produção.
 */
import { createServer as createHttp1Server } from 'node:http';
import { createSecureServer } from 'node:http2';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import { ACTORS, DEMO_PASSWORD, buildSyntheticDatabase } from '../../tests/fixtures/synthetic-data.mjs';
import { assertSafeTarget, PROJECT_ID, DATABASE_NAMESPACE } from '../emulator/seed.mjs';
import { summarizeRtdbFrames, buildSyntheticVolume, median, SCALES } from './page-performance-lib.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
// BENCH_PUBLIC_DIR permite medir outra versão (ex.: `git archive <ref> public`) nas MESMAS condições.
const PUBLIC_DIR = resolve(process.env.BENCH_PUBLIC_DIR || join(ROOT, 'public'));

// ---------------------------------------------------------------------------
// Opções
// ---------------------------------------------------------------------------

function parseOptions(argv) {
  const options = {
    scale: 'small', runs: 5, network: 'none', protocol: 'h2', pages: null,
    scenario: 'pages', skipSeed: false, out: null, label: '',
  };
  for (const arg of argv) {
    const [key, value = ''] = arg.replace(/^--/, '').split('=');
    if (key === 'scale') options.scale = value;
    else if (key === 'runs') options.runs = Number(value);
    else if (key === 'network') options.network = value;
    else if (key === 'protocol') options.protocol = value;
    else if (key === 'pages') options.pages = value.split(',').filter(Boolean);
    else if (key === 'scenario') options.scenario = value;
    else if (key === 'skip-seed') options.skipSeed = true;
    else if (key === 'out') options.out = value;
    else if (key === 'label') options.label = value;
    else throw new Error(`Opção desconhecida: ${arg}`);
  }
  if (!Object.hasOwn(SCALES, options.scale)) throw new Error(`Escala inválida: ${options.scale}. Use ${Object.keys(SCALES).join(', ')}.`);
  if (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > 50) throw new Error('--runs deve ser inteiro entre 1 e 50.');
  if (!['none', 'mobile'].includes(options.network)) throw new Error('--network deve ser none ou mobile.');
  if (!['h2', 'h1'].includes(options.protocol)) throw new Error('--protocol deve ser h2 ou h1.');
  if (!['pages', 'study-loop'].includes(options.scenario)) throw new Error('--scenario deve ser pages ou study-loop.');
  return options;
}

// ---------------------------------------------------------------------------
// Carga sintética no Emulator (mesmo mecanismo de scripts/emulator/seed.mjs)
// ---------------------------------------------------------------------------

async function request(url, init) {
  const response = await fetch(url, init);
  const body = await response.text();
  if (!response.ok) throw new Error(`${init.method} ${url} → ${response.status}: ${body.slice(0, 200)}`);
  return body ? JSON.parse(body) : null;
}

async function seed(target, scale) {
  await request(`http://${target.authHost}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' });
  const uids = {};
  for (const [key, actor] of Object.entries(ACTORS)) {
    const created = await request(`http://${target.authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-fluencircle-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: actor.email, password: DEMO_PASSWORD, returnSecureToken: true }),
    });
    uids[key] = created.localId;
  }
  const database = buildSyntheticDatabase({ uids });
  const volume = buildSyntheticVolume(database, { scale, studentUid: uids.studentA, mediatorEmail: ACTORS.mediatorA.email });
  const body = JSON.stringify(database);
  await request(`http://${target.databaseHost}/.json?ns=${DATABASE_NAMESPACE}`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body,
  });
  return { uids, volume: { ...volume, databaseBytes: Buffer.byteLength(body) } };
}

// ---------------------------------------------------------------------------
// Servidor estático local (HTTP/2 + TLS + gzip, ou HTTP/1.1)
// ---------------------------------------------------------------------------

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg']);

function makeHandler({ authPort, databasePort }) {
  return (req, res) => {
    try {
      const url = new URL(req.url, 'http://local');
      let path = decodeURIComponent(url.pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = normalize(join(PUBLIC_DIR, path));
      if (!file.startsWith(PUBLIC_DIR + sep) || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }
      let body = readFileSync(file);
      // Só a configuração do Emulator muda de porta; nada mais é reescrito.
      if (path === '/js/config/firebase.config.js') {
        body = Buffer.from(body.toString('utf8')
          .replace("'http://127.0.0.1:9099'", `'http://127.0.0.1:${authPort}'`)
          .replace('databasePort: 9000', `databasePort: ${databasePort}`));
      }
      const ext = extname(file);
      const headers = { 'content-type': CONTENT_TYPES[ext] || 'application/octet-stream', 'cache-control': 'no-cache' };
      if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
        body = gzipSync(body);
        headers['content-encoding'] = 'gzip';
      }
      headers['content-length'] = String(body.length);
      res.writeHead(200, headers);
      res.end(body);
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(String(error));
    }
  };
}

async function startStaticServer(protocol, ports) {
  const handler = makeHandler(ports);
  let server;
  let tempDir = null;
  if (protocol === 'h2') {
    tempDir = mkdtempSync(join(tmpdir(), 'fc-bench-'));
    const key = join(tempDir, 'key.pem');
    const cert = join(tempDir, 'cert.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1',
      '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
    server = createSecureServer({ key: readFileSync(key), cert: readFileSync(cert), allowHTTP1: true }, handler);
  } else {
    server = createHttp1Server(handler);
  }
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address();
  return {
    origin: `${protocol === 'h2' ? 'https' : 'http'}://localhost:${port}`,
    close: () => new Promise((done) => {
      server.close(() => done());
      if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    }),
  };
}

// ---------------------------------------------------------------------------
// Páginas medidas
// ---------------------------------------------------------------------------

/** `ready`: seletor que indica dados desenhados (ou estado vazio/erro definitivo). */
const PAGES = [
  { id: 'login', path: 'auth.html', actor: null, ready: '#login-form' },
  { id: 'translator', path: 'circle-translator.html', actor: null, ready: '#sessionName:not(:empty)' },
  { id: 'home-student', path: 'index.html', actor: 'studentA', ready: '#student-agenda .week-slot, #student-agenda .empty-state:not(:first-child), #student-agenda p' },
  { id: 'flashcards-student', path: 'flash-cards.html', actor: 'studentA', ready: '#sessions-grid .srs-meeting-card, #sessions-grid .empty-state' },
  { id: 'flashcards-staff', path: 'flash-cards.html', actor: 'mediatorA', ready: '#sessions-grid .srs-meeting-card, #sessions-grid .empty-state' },
  { id: 'sessions-staff', path: 'manage-meetings.html', actor: 'mediatorA', ready: '#manage-meetings-grid .manage-meeting-card' },
  { id: 'presentation-staff', path: 'presentation.html', actor: 'mediatorA', ready: '#option-list .meeting-option' },
  { id: 'plans-admin', path: 'plans.html', actor: 'admin', ready: '#week-agenda .week-slot' },
  { id: 'admin', path: 'admin.html', actor: 'admin', ready: '#users-table-body .user-name-cell' },
];

/** Instrumentação injetada antes de qualquer script da página. */
const INIT_SCRIPT = `(() => {
  const marks = { readyAt: null, authAt: null, lcp: 0, cls: 0 };
  window.__fcBench = marks;
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) marks.lcp = e.startTime; })
      .observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) marks.cls += e.value; })
      .observe({ type: 'layout-shift', buffered: true });
  } catch {}
  const check = () => {
    const selector = window.__fcReadySelector;
    if (marks.readyAt === null && selector && document.querySelector(selector)) marks.readyAt = performance.now();
    const email = document.getElementById('user-email');
    if (marks.authAt === null && email && email.textContent.trim()) marks.authAt = performance.now();
  };
  new MutationObserver(check).observe(document, { childList: true, subtree: true, characterData: true });
  document.addEventListener('DOMContentLoaded', check);
})();`;

const NETWORK_PROFILES = {
  // Mesmos parâmetros do perfil móvel do Lighthouse ("slow 4G" + CPU 4x), aplicados pelo DevTools.
  mobile: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, cpu: 4 },
};

async function loginStates(browser, origin) {
  const states = {};
  for (const actor of ['studentA', 'mediatorA', 'admin']) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await page.goto(`${origin}/auth.html`);
    await page.fill('#email', ACTORS[actor].email);
    await page.fill('#password', DEMO_PASSWORD);
    await Promise.all([page.waitForURL(/index\.html$/, { timeout: 30000 }), page.click('#login-btn')]);
    states[actor] = await context.storageState({ indexedDB: true });
    await context.close();
  }
  return states;
}

async function measurePage(browser, origin, pageDef, state, network) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, ...(state ? { storageState: state } : {}) });
  await context.addInitScript(`window.__fcReadySelector = ${JSON.stringify(pageDef.ready)};`);
  await context.addInitScript(INIT_SCRIPT);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Performance.enable');
  if (network !== 'none') {
    const profile = NETWORK_PROFILES[network];
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: profile.latency,
      downloadThroughput: profile.downloadThroughput, uploadThroughput: profile.uploadThroughput,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  }

  const requests = new Map();
  const frames = [];
  cdp.on('Network.requestWillBeSent', (e) => {
    if (!requests.has(e.requestId)) requests.set(e.requestId, { url: e.request.url, type: e.type || 'Other', bytes: 0, status: 0 });
  });
  cdp.on('Network.responseReceived', (e) => { const r = requests.get(e.requestId); if (r) { r.status = e.response.status; r.type = e.type || r.type; } });
  cdp.on('Network.loadingFinished', (e) => { const r = requests.get(e.requestId); if (r) r.bytes = e.encodedDataLength; });
  cdp.on('Network.webSocketFrameReceived', (e) => frames.push({ dir: 'in', data: e.response.payloadData }));
  cdp.on('Network.webSocketFrameSent', (e) => frames.push({ dir: 'out', data: e.response.payloadData }));

  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });

  const started = Date.now();
  await page.goto(`${origin}/${pageDef.path}`, { waitUntil: 'load', timeout: 120000 });
  let readyTimedOut = false;
  try {
    await page.waitForFunction(() => window.__fcBench && window.__fcBench.readyAt !== null, null, { timeout: 120000, polling: 50 });
  } catch {
    readyTimedOut = true;
  }
  // Pequena espera para capturar deslocamentos de layout e quadros tardios.
  await page.waitForTimeout(400);
  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    return {
      domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
      load: nav ? nav.loadEventEnd : null,
      fcp: fcp ? fcp.startTime : null,
      lcp: window.__fcBench.lcp || null,
      cls: window.__fcBench.cls,
      readyAt: window.__fcBench.readyAt,
      authAt: window.__fcBench.authAt,
      url: location.pathname,
    };
  });
  const { metrics } = await cdp.send('Performance.getMetrics');
  const metric = (name) => metrics.find((m) => m.name === name)?.value ?? null;
  await context.close();

  const byType = {};
  let totalBytes = 0;
  for (const r of requests.values()) {
    if (r.url.startsWith('data:')) continue;
    const bucket = (byType[r.type] ||= { count: 0, bytes: 0 });
    bucket.count++;
    bucket.bytes += r.bytes;
    totalBytes += r.bytes;
  }
  const thirdParty = [...requests.values()].filter((r) => !r.url.startsWith(origin) && /^https?:/.test(r.url) && !/127\.0\.0\.1/.test(r.url));
  return {
    page: pageDef.id,
    redirectedTo: timing.url,
    wallMs: Date.now() - started,
    ...timing,
    readyTimedOut,
    requests: [...requests.values()].filter((r) => !r.url.startsWith('data:')).length,
    transferBytes: totalBytes,
    byType,
    thirdPartyRequests: thirdParty.length,
    thirdPartyBytes: thirdParty.reduce((sum, r) => sum + r.bytes, 0),
    rtdb: summarizeRtdbFrames(frames),
    heapUsedBytes: metric('JSHeapUsedSize'),
    domNodes: metric('Nodes'),
    jsEventListeners: metric('JSEventListeners'),
    consoleErrors,
  };
}

// ---------------------------------------------------------------------------
// Cenário de vazamento: abrir/fechar o modo de estudo repetidamente
// ---------------------------------------------------------------------------

// waitForSelector devolve um ElementHandle que, sem dispose, mantém o elemento vivo
// e falsearia a medição de vazamento. locator.waitFor() não retém nada.
const waitVisible = (page, selector, { timeout }) => page.locator(selector).first().waitFor({ timeout });

async function studyLoop(browser, origin, state, iterations) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, storageState: state });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.goto(`${origin}/flash-cards.html`);
  await waitVisible(page, '#sessions-grid .srs-meeting-card', { timeout: 60000 });
  const sample = async (iteration) => {
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.collectGarbage');
    const { metrics } = await cdp.send('Performance.getMetrics');
    const get = (name) => metrics.find((m) => m.name === name)?.value ?? null;
    return { iteration, heapUsedBytes: get('JSHeapUsedSize'), domNodes: get('Nodes'), jsEventListeners: get('JSEventListeners') };
  };
  const samples = [await sample(0)];
  for (let i = 1; i <= iterations; i++) {
    await page.click('#sessions-grid .srs-meeting-card');
    await waitVisible(page, '#flash-cards-container .card', { timeout: 30000 });
    // Percorre a pilha inteira: vira e avança cada cartão, esperando a animação
    // de saída terminar (a posição só muda depois dela).
    const total = await page.locator('#flash-cards-container .card:not(.completion-card)').count();
    for (let c = 1; c <= total; c++) {
      const card = page.locator(`#card-${c}`);
      await card.click();
      await card.locator('.btn-next').click();
      await page.waitForFunction((id) => document.getElementById(id)?.dataset.position === '-1', `card-${c}`, { timeout: 10000 });
    }
    await waitVisible(page, '#completion-card:not(.hidden)', { timeout: 10000 });
    await page.click('#back-to-meetings-btn');
    await waitVisible(page, '#sessions-grid .srs-meeting-card', { timeout: 60000 });
    if (i === 1 || i % 5 === 0 || i === iterations) samples.push(await sample(i));
  }
  // Quais elementos continuam vivos sem estar no documento (candidatos a vazamento).
  const { result: prototype } = await cdp.send('Runtime.evaluate', { expression: 'Element.prototype' });
  const { objects } = await cdp.send('Runtime.queryObjects', { prototypeObjectId: prototype.objectId });
  const { result: detached } = await cdp.send('Runtime.callFunctionOn', {
    objectId: objects.objectId,
    returnByValue: true,
    functionDeclaration: `function () {
      const counts = {};
      for (const el of this) {
        // queryObjects também devolve os protótipos (HTMLDivElement.prototype...), cujo getter lança erro.
        try { if (el.isConnected) continue; } catch { continue; }
        const key = el.tagName.toLowerCase() + (el.id ? '#' + el.id.replace(/[0-9]+/g, 'N') : '') + (el.classList.length ? '.' + [...el.classList].join('.') : '');
        counts[key] = (counts[key] || 0) + 1;
      }
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12);
    }`,
  });
  await context.close();
  return { samples, detachedElements: detached.value };
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

function summarize(results) {
  const pick = (list, key) => list.map((r) => r[key]).filter((v) => typeof v === 'number');
  const stats = (values) => (values.length ? { median: median(values), min: Math.min(...values), max: Math.max(...values) } : null);
  const byPage = {};
  for (const r of results) (byPage[r.page] ||= []).push(r);
  const summary = {};
  for (const [page, list] of Object.entries(byPage)) {
    summary[page] = {
      runs: list.length,
      redirectedTo: list[0].redirectedTo,
      readyTimeouts: list.filter((r) => r.readyTimedOut).length,
      fcp: stats(pick(list, 'fcp')),
      lcp: stats(pick(list, 'lcp')),
      cls: stats(pick(list, 'cls')),
      authAt: stats(pick(list, 'authAt')),
      readyAt: stats(pick(list, 'readyAt')),
      load: stats(pick(list, 'load')),
      requests: stats(pick(list, 'requests')),
      transferBytes: stats(pick(list, 'transferBytes')),
      thirdPartyBytes: stats(pick(list, 'thirdPartyBytes')),
      stylesheets: stats(list.map((r) => r.byType.Stylesheet?.count ?? 0)),
      scripts: stats(list.map((r) => r.byType.Script?.count ?? 0)),
      rtdbReads: stats(list.map((r) => r.rtdb.reads)),
      rtdbListens: stats(list.map((r) => r.rtdb.listens)),
      rtdbBytesIn: stats(list.map((r) => r.rtdb.bytesIn)),
      heapUsedBytes: stats(pick(list, 'heapUsedBytes')),
      jsEventListeners: stats(pick(list, 'jsEventListeners')),
      rtdbPaths: list[0].rtdb.paths,
      consoleErrors: [...new Set(list.flatMap((r) => r.consoleErrors))].slice(0, 5),
    };
  }
  return summary;
}

function printTable(summary) {
  const ms = (s) => (s ? `${Math.round(s.median)}` : '—');
  const kb = (s) => (s ? `${(s.median / 1024).toFixed(1)}` : '—');
  console.log('| página | FCP ms | LCP ms | auth ms | dados ms | CLS | req. | KiB rede | CSS | RTDB get/listen | KiB RTDB |');
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const [page, s] of Object.entries(summary)) {
    console.log(`| ${page}${s.readyTimeouts ? ` (⚠ ${s.readyTimeouts} sem dados)` : ''} | ${ms(s.fcp)} | ${ms(s.lcp)} | ${ms(s.authAt)} | ${ms(s.readyAt)} | `
      + `${s.cls ? s.cls.median.toFixed(3) : '—'} | ${s.requests?.median ?? '—'} | ${kb(s.transferBytes)} | ${s.stylesheets?.median ?? '—'} | `
      + `${s.rtdbReads?.median ?? 0}/${s.rtdbListens?.median ?? 0} | ${kb(s.rtdbBytesIn)} |`);
  }
}

async function main() {
  // BENCH_ARGS permite passar opções por `npm run bench:pages` (o comando roda dentro do emulators:exec).
  const options = parseOptions([...process.argv.slice(2), ...(process.env.BENCH_ARGS || '').split(/\s+/).filter(Boolean)]);
  const target = {
    projectId: PROJECT_ID,
    authHost: process.env.FIREBASE_AUTH_EMULATOR_HOST || '',
    databaseHost: process.env.FIREBASE_DATABASE_EMULATOR_HOST || '',
  };
  assertSafeTarget(target);
  const ports = { authPort: Number(target.authHost.split(':').pop()), databasePort: Number(target.databaseHost.split(':').pop()) };

  console.log(`Alvo: Auth ${target.authHost}, RTDB ${target.databaseHost} (${PROJECT_ID}). Escala: ${options.scale}.`);
  let seedInfo = null;
  if (!options.skipSeed) {
    seedInfo = await seed(target, options.scale);
    console.log(`Carga sintética: ${JSON.stringify(seedInfo.volume)}`);
  }

  const server = await startStaticServer(options.protocol, ports);
  const browser = await chromium.launch({ headless: true });
  try {
    const states = await loginStates(browser, server.origin);
    const output = {
      label: options.label,
      date: new Date().toISOString(),
      options,
      environment: {
        node: process.version, chromium: browser.version(), platform: process.platform,
        server: options.protocol === 'h2' ? 'HTTP/2 + TLS + gzip (local)' : 'HTTP/1.1 + gzip (local)',
      },
      seed: seedInfo?.volume ?? null,
    };
    if (options.scenario === 'study-loop') {
      output.studyLoop = await studyLoop(browser, server.origin, states.studentA, options.runs);
      console.table(output.studyLoop.samples);
      console.log('Elementos desconectados ainda vivos (após GC):', JSON.stringify(output.studyLoop.detachedElements));
    } else {
      const selected = PAGES.filter((p) => !options.pages || options.pages.includes(p.id));
      const results = [];
      // Intercala as páginas a cada rodada para não concentrar efeitos de aquecimento numa só.
      for (let run = 0; run < options.runs; run++) {
        for (const pageDef of selected) {
          results.push(await measurePage(browser, server.origin, pageDef, pageDef.actor ? states[pageDef.actor] : null, options.network));
        }
      }
      output.results = results;
      output.summary = summarize(results);
      printTable(output.summary);
    }
    if (options.out) {
      writeFileSync(resolve(options.out), `${JSON.stringify(output, null, 2)}\n`);
      console.log(`Resultados gravados em ${options.out}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(`Falha na medição: ${error.message}`);
  process.exitCode = 1;
});
