/**
 * @file Funções PURAS usadas pela medição de páginas (page-performance.mjs).
 * Sem rede, sem navegador: cobertas por tests/unit/page-performance-lib.test.js.
 */

/**
 * Volumes sintéticos. `studentSessions` fica igual nas escalas média e grande de
 * propósito: o custo da tela do ALUNO deve depender só das sessões dele, e o da
 * EQUIPE do total — é isso que a medição precisa mostrar (ou desmentir).
 */
export const SCALES = Object.freeze({
  small: null,
  medium: Object.freeze({ sessions: 300, cardsPerSession: 15, students: 100, attendeesPerSession: 10, studentSessions: 40, themes: 40 }),
  large: Object.freeze({ sessions: 1500, cardsPerSession: 20, students: 400, attendeesPerSession: 12, studentSessions: 40, themes: 120 }),
});

/** Gerador congruente linear com semente fixa (mesma semente = mesmos dados). */
export function createRandom(seed = 20261120) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const pad = (n, size) => String(n).padStart(size, '0');

/**
 * Acrescenta volume sintético a uma árvore gerada por `buildSyntheticDatabase`.
 * Altera `database` no lugar e devolve um resumo do que foi criado.
 *
 * @param {object} database árvore do banco (fixture)
 * @param {{ scale: string, studentUid: string, mediatorEmail: string }} options
 */
export function buildSyntheticVolume(database, { scale, studentUid, mediatorEmail }) {
  const config = SCALES[scale];
  const count = (node) => Object.keys(database[node] || {}).length;
  if (!config) {
    return { scale, sessions: count('meeting_sessions'), users: count('users'), studentSessions: Object.keys(database.user_sessions?.[studentUid] || {}).length };
  }
  const random = createRandom();
  for (const node of ['users', 'meetings', 'meeting_sessions', 'flashcards', 'user_sessions', 'student_reviews']) database[node] ||= {};

  const students = [];
  for (let i = 1; i <= config.students; i++) {
    const uid = `sint-aluno-${pad(i, 4)}`;
    students.push(uid);
    database.users[uid] = {
      firstName: 'Aluno', lastName: `Sintético ${pad(i, 4)}`, email: `aluno.${pad(i, 4)}@example.test`,
      role: 'student', createdAt: '2026-01-01T12:00:00.000Z',
    };
  }

  const themes = [];
  for (let t = 1; t <= config.themes; t++) {
    const id = `sint-tema-${pad(t, 3)}`;
    const topic = `Tema sintético ${t}`;
    themes.push({ id, topic });
    database.meetings[id] = {
      topic,
      questions: Array.from({ length: 5 }, (_, q) => `Pergunta ${q + 1} do tema ${t}?`),
      createdAt: '2026-01-01T12:00:00.000Z', updatedAt: '2026-01-01T12:00:00.000Z',
    };
  }

  // Sessões com o aluno medido, espalhadas uniformemente pela linha do tempo.
  const step = Math.max(1, Math.floor(config.sessions / config.studentSessions));
  const withStudent = new Set(Array.from({ length: config.studentSessions }, (_, k) => k * step));
  const base = Date.UTC(2025, 0, 1, 19, 0, 0);
  let cards = 0;
  let studentSessions = 0;

  for (let s = 0; s < config.sessions; s++) {
    const id = `sint-sessao-${pad(s, 5)}`;
    const theme = themes[s % themes.length];
    const startedAt = new Date(base + s * 6 * 3600 * 1000).toISOString();
    const attendees = {};
    const picked = new Set();
    while (picked.size < Math.min(config.attendeesPerSession, students.length)) {
      picked.add(students[Math.floor(random() * students.length)]);
    }
    if (withStudent.has(s) && studentUid) {
      picked.add(studentUid);
      studentSessions++;
    }
    for (const uid of picked) {
      attendees[uid] = { addedAt: startedAt };
      (database.user_sessions[uid] ||= {})[id] = { topic: theme.topic, startedAt };
    }
    database.meeting_sessions[id] = { templateId: theme.id, topic: theme.topic, startedAt, mediatorEmail, attendees };
    const deck = {};
    for (let c = 0; c < config.cardsPerSession; c++) {
      deck[`c-${pad(c, 3)}`] = { front: `palavra ${c} da sessão ${s}`, back: `tradução ${c}`, topic: theme.topic, sessionId: id, createdAt: startedAt };
      cards++;
    }
    database.flashcards[id] = deck;
    if (withStudent.has(s) && studentUid && s % 2 === 0) {
      (database.student_reviews[studentUid] ||= {})[id] = { stage: 1, stage1CompletedAt: startedAt, lastReviewedAt: startedAt };
    }
  }
  return {
    scale,
    extraSessions: config.sessions,
    extraCards: cards,
    extraStudents: config.students,
    extraThemes: config.themes,
    sessions: count('meeting_sessions'),
    users: count('users'),
    studentSessions: Object.keys(database.user_sessions[studentUid] || {}).length,
    addedStudentSessions: studentSessions,
  };
}

/** Mediana de uma lista de números (média dos dois centrais quando par). */
export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Junta mensagens do protocolo do RTDB divididas em vários quadros ("N" seguido de N partes). */
function reassemble(frames) {
  const messages = [];
  let pending = 0;
  let buffer = '';
  for (const frame of frames) {
    if (pending > 0) {
      buffer += frame;
      pending--;
      if (pending === 0) messages.push(buffer);
      continue;
    }
    if (/^\d{1,6}$/.test(frame)) {
      pending = Number(frame);
      buffer = '';
      continue;
    }
    messages.push(frame);
  }
  return messages;
}

const ACTION_NAMES = Object.freeze({
  g: 'get', q: 'listen', n: 'unlisten', p: 'set', m: 'update',
  o: 'onDisconnect.set', om: 'onDisconnect.update', oc: 'onDisconnect.cancel',
});

/**
 * Resume o tráfego do Realtime Database a partir dos quadros WebSocket.
 * Conta as operações que o CLIENTE pediu (get, listen, escritas) e os bytes recebidos.
 *
 * @param {{ dir: 'in'|'out', data: string }[]} frames na ordem em que foram vistos
 */
export function summarizeRtdbFrames(frames) {
  const outgoing = reassemble(frames.filter((f) => f.dir === 'out').map((f) => f.data));
  const bytesIn = frames.filter((f) => f.dir === 'in').reduce((sum, f) => sum + Buffer.byteLength(f.data || ''), 0);
  const bytesOut = frames.filter((f) => f.dir === 'out').reduce((sum, f) => sum + Buffer.byteLength(f.data || ''), 0);
  const counts = { reads: 0, listens: 0, unlistens: 0, writes: 0, onDisconnect: 0 };
  const paths = {};
  for (const raw of outgoing) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      continue;
    }
    const action = message?.t === 'd' ? message.d?.a : null;
    if (!action || !ACTION_NAMES[action]) continue;
    const path = message.d.b?.p ?? '';
    const name = ACTION_NAMES[action];
    if (action === 'g') counts.reads++;
    else if (action === 'q') counts.listens++;
    else if (action === 'n') counts.unlistens++;
    else if (action === 'p' || action === 'm') counts.writes++;
    else counts.onDisconnect++;
    const key = `${name} ${path}`;
    paths[key] = (paths[key] || 0) + 1;
  }
  return { ...counts, bytesIn, bytesOut, frames: frames.length, paths };
}
