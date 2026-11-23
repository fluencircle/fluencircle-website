// Substituto de firebase-database.js (CDN) nos testes E2E.
// Cada operação vai, por RPC, ao banco simulado do processo de teste, que é
// compartilhado por todas as abas/contextos e aplica as REGRAS PROPOSTAS
// (tests/support/rtdb-rules-simulator.js). Não é o Firebase: serve para testar
// o fluxo do site com dados sintéticos e sem rede.
const rpc = (op, payload) => globalThis.__e2eRpc(op, payload);
const listeners = new Map();
const connectionListeners = new Set();
let listenerSeq = 0;
let connected = true;

function databaseError(error) {
  return Object.assign(new Error(error.message || 'Erro no banco simulado'), { code: error.code || 'UNKNOWN' });
}

async function call(op, payload) {
  // O banco simulado aplica as regras com o usuário logado na app padrão desta aba.
  const auth = globalThis.__e2eAuthState?.['[DEFAULT]'] ?? null;
  const result = await rpc(op, { ...payload, auth });
  if (result && result.error) throw databaseError(result.error);
  return result;
}

const parts = (path) => String(path || '').split('/').filter(Boolean);
const join = (...paths) => paths.flatMap(parts).join('/');

function sortKeys(value) {
  if (value === null || typeof value !== 'object') return value;
  const keys = Object.keys(value).sort((a, b) => {
    const na = /^-?\d+$/.test(a);
    const nb = /^-?\d+$/.test(b);
    if (na && nb) return Number(a) - Number(b);
    if (na) return -1;
    if (nb) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return Object.fromEntries(keys.map((key) => [key, sortKeys(value[key])]));
}

function makeRef(db, path) {
  const segments = parts(path);
  return { _db: db, _path: segments.join('/'), key: segments.length ? segments[segments.length - 1] : null };
}

function snapshot(reference, value) {
  const v = reference._limit && value
    ? Object.fromEntries(Object.entries(sortKeys(value)).slice(-reference._limit))
    : value ?? null;
  return {
    key: reference.key,
    ref: reference,
    exists: () => v !== null,
    val: () => (v === null ? null : sortKeys(JSON.parse(JSON.stringify(v)))),
    forEach(callback) {
      if (!v || typeof v !== 'object') return false;
      for (const key of Object.keys(sortKeys(v))) {
        if (callback(snapshot(makeRef(reference._db, join(reference._path, key)), v[key])) === true) return true;
      }
      return false;
    },
  };
}

export function getDatabase(app) {
  return { app: app || { name: '[DEFAULT]' } };
}

export function connectDatabaseEmulator(db, host, port) {
  globalThis.__e2eFirebase = globalThis.__e2eFirebase || { apps: {}, emulators: [] };
  globalThis.__e2eFirebase.emulators.push({ service: 'database', app: db.app.name, host, port });
}

export function ref(db, path = '') { return makeRef(db, path); }
export function child(parent, path) { return makeRef(parent._db, join(parent._path, path)); }
export const orderByKey = () => ({});
export const limitToLast = (count) => ({ _limit: count });
export const query = (reference, ...constraints) => Object.assign({}, reference, ...constraints);

export async function get(reference) {
  const { value } = await call('db.get', { path: reference._path });
  return snapshot(reference, value);
}

export async function set(reference, value) {
  await call('db.set', { path: reference._path, value: value === undefined ? null : value });
}

export async function update(reference, values) {
  await call('db.update', { path: reference._path, values });
}

export async function remove(reference) {
  await call('db.set', { path: reference._path, value: null });
}

// IDs no formato do Firebase: 8 caracteres de tempo + 12 aleatórios, ordenáveis.
const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
let lastPushTime = 0;
let lastRandom = [];
function nextPushId() {
  let now = Date.now();
  const duplicate = now === lastPushTime;
  lastPushTime = now;
  const time = new Array(8);
  for (let i = 7; i >= 0; i--) { time[i] = PUSH_CHARS.charAt(now % 64); now = Math.floor(now / 64); }
  if (!duplicate) {
    lastRandom = Array.from({ length: 12 }, () => Math.floor(Math.random() * 64));
  } else {
    let i = 11;
    for (; i >= 0 && lastRandom[i] === 63; i--) lastRandom[i] = 0;
    lastRandom[i]++;
  }
  return time.join('') + lastRandom.map((n) => PUSH_CHARS.charAt(n)).join('');
}

export function push(parent, value) {
  const reference = makeRef(parent._db, join(parent._path, nextPushId()));
  if (value === undefined) return reference;
  const promise = set(reference, value).then(() => reference);
  return Object.assign(reference, { then: promise.then.bind(promise), catch: promise.catch.bind(promise) });
}

export function onValue(reference, callback, cancelCallback) {
  if (reference._path === '.info/connected') {
    const entry = { callback };
    connectionListeners.add(entry);
    setTimeout(() => callback(snapshot(reference, connected)), 5);
    return () => connectionListeners.delete(entry);
  }
  const id = `l${++listenerSeq}`;
  listeners.set(id, { reference, callback });
  call('db.subscribe', { path: reference._path, listenerId: id })
    .then(({ value }) => { if (listeners.has(id)) callback(snapshot(reference, value)); })
    .catch((error) => {
      listeners.delete(id);
      if (cancelCallback) cancelCallback(error);
      else console.error('onValue cancelado:', error.message);
    });
  return () => {
    listeners.delete(id);
    rpc('db.unsubscribe', { listenerId: id });
  };
}

// Chamado pelo processo de teste quando um caminho observado muda.
globalThis.__e2eDbPush = (listenerId, value) => {
  const entry = listeners.get(listenerId);
  if (entry) entry.callback(snapshot(entry.reference, value));
};

// Chamado pelo processo de teste para simular queda/retorno da conexão.
globalThis.__e2eConnection = (isConnected) => {
  connected = Boolean(isConnected);
  for (const entry of connectionListeners) entry.callback(snapshot(makeRef(null, '.info/connected'), connected));
};

export function onDisconnect(reference) {
  const register = (op, value) => call('db.onDisconnect', { op, path: reference._path, value: value === undefined ? null : value });
  return {
    set: (value) => register('set', value),
    update: (values) => register('update', values),
    remove: () => register('remove'),
    cancel: () => call('db.onDisconnectCancel', { path: reference._path }),
  };
}

/**
 * Transação com comparação e troca, como o RTDB: lê o valor atual, aplica a
 * função e grava só se ninguém mudou o valor no meio; senão tenta de novo.
 */
export async function runTransaction(reference, transactionUpdate) {
  for (let attempt = 0; attempt < 25; attempt++) {
    const { value: current } = await call('db.get', { path: reference._path });
    const next = transactionUpdate(current === null ? null : JSON.parse(JSON.stringify(current)));
    if (next === undefined) return { committed: false, snapshot: snapshot(reference, current) };
    const result = await call('db.compareAndSet', { path: reference._path, expected: current, value: next });
    if (result.ok) return { committed: true, snapshot: snapshot(reference, result.value) };
  }
  throw Object.assign(new Error('maxretry'), { code: 'maxretry' });
}

export function serverTimestamp() {
  return { '.sv': 'timestamp' };
}
