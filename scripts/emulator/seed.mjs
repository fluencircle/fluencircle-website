/**
 * @file Carrega dados SINTÉTICOS no Firebase Emulator local (Auth + Realtime Database).
 *
 *   npm run emulators        # terminal 1: sobe Auth, RTDB, Hosting e UI locais
 *   npm run emulators:seed   # terminal 2: cria as contas e o banco de demonstração
 *
 * Segurança: recusa qualquer alvo que não seja 127.0.0.1/localhost e projeto
 * `demo-*`. O token "owner" só existe no Emulator (ignora regras para semear).
 * Os dados vêm de tests/fixtures/synthetic-data.mjs (nada real).
 */
import { ACTORS, PROFILE_ACTORS, DEMO_PASSWORD, buildSyntheticDatabase } from '../../tests/fixtures/synthetic-data.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PROJECT_ID = 'demo-fluencircle-audit';
export const DATABASE_NAMESPACE = `${PROJECT_ID}-default-rtdb`;
const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\]):\d{2,5}$/;

/**
 * Detecta invocação direta de forma portátil. Concatenar `file://` com
 * `process.argv[1]` falha no Windows (C:\\...) e com espaços em caminhos.
 * `pathToFileURL` faz a conversão e o escape adequados ao sistema operacional.
 */
export function isDirectExecution(moduleUrl, entryPath) {
  return Boolean(entryPath) && moduleUrl === pathToFileURL(resolve(entryPath)).href;
}

/** Resumo e validação do conteúdo efetivamente retornado pelo RTDB Emulator. */
export function verifySeedSnapshot(snapshot) {
  const required = ['users', 'plans', 'weekly_sessions', 'meetings', 'meeting_sessions',
    'flashcards', 'student_reviews', 'user_sessions', 'deleted_users'];
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('O banco de demonstração está vazio. Execute npm run emulators:seed.');
  }
  for (const key of required) {
    if (!snapshot[key] || typeof snapshot[key] !== 'object' || !Object.keys(snapshot[key]).length) {
      throw new Error(`A coleção sintética "${key}" está ausente ou vazia no Emulator.`);
    }
  }
  const users = Object.keys(snapshot.users).length;
  const sessions = Object.keys(snapshot.meeting_sessions).length;
  const plans = Object.keys(snapshot.plans).length;
  if (users < PROFILE_ACTORS.length || sessions < 3 || plans < 2) {
    throw new Error('A carga sintética está incompleta: quantidade insuficiente de perfis, sessões ou planos.');
  }
  return { users, sessions, plans, flashcardDecks: Object.keys(snapshot.flashcards).length };
}

/**
 * Garante que a carga só atinja o Emulator local de um projeto de demonstração.
 * @throws {Error} quando o alvo não é seguro
 */
export function assertSafeTarget({ projectId, authHost, databaseHost }) {
  if (!/^demo-[a-z0-9-]+$/.test(projectId)) throw new Error(`Projeto "${projectId}" não é demo-*: carga recusada.`);
  for (const [name, host] of [['Auth', authHost], ['Realtime Database', databaseHost]]) {
    if (!LOCAL_HOST.test(host)) throw new Error(`${name} Emulator "${host}" não é local: carga recusada.`);
  }
}

async function request(url, options) {
  const response = await fetch(url, options);
  const body = await response.text();
  if (!response.ok) throw new Error(`${options.method} ${url} → ${response.status}: ${body.slice(0, 200)}`);
  return body ? JSON.parse(body) : null;
}

async function main() {
  const target = {
    projectId: PROJECT_ID,
    authHost: process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099',
    databaseHost: process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000',
  };
  assertSafeTarget(target);

  // Um teste de instalação não deve gravar nada nem exigir emuladores ativos.
  const options = process.argv.slice(2);
  if (options.some((arg) => !['--check', '--verify'].includes(arg))
      || (options.includes('--check') && options.includes('--verify'))) {
    throw new Error('Opções válidas: --check (sem conexão) ou --verify (somente leitura).');
  }
  if (options.includes('--check')) {
    console.log(`SEED_CLI_CHECK_OK: ${target.projectId}; nenhum dado foi gravado.`);
    return;
  }

  const databaseUrl = `http://${target.databaseHost}/.json?ns=${DATABASE_NAMESPACE}`;
  const ownerHeaders = { Authorization: 'Bearer owner' };
  if (options.includes('--verify')) {
    const current = await request(databaseUrl, { method: 'GET', headers: ownerHeaders });
    console.log('SEED_VERIFY_OK:', JSON.stringify(verifySeedSnapshot(current)));
    return;
  }

  // 1. Zera as contas do Auth Emulator (endpoint exclusivo do Emulator).
  await request(`http://${target.authHost}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' });

  // 2. Cria uma conta por ator; o Emulator devolve o uid gerado.
  const uids = {};
  for (const [key, actor] of Object.entries(ACTORS)) {
    const created = await request(`http://${target.authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-fluencircle-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: actor.email, password: DEMO_PASSWORD, returnSecureToken: true }),
    });
    uids[key] = created.localId;
  }

  // 3. Substitui o banco inteiro pela carga sintética, com os uids reais do Auth Emulator.
  await request(databaseUrl, {
    method: 'PUT',
    headers: { ...ownerHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSyntheticDatabase({ uids })),
  });

  // O PUT pode aparentemente terminar sem que o usuário veja a coleção certa
  // na interface. Ler a MESMA namespace e verificar o conteúdo previne falso
  // sucesso e ajuda a diagnosticar projeto/porta incorretos.
  const actual = await request(databaseUrl, { method: 'GET', headers: ownerHeaders });
  const summary = verifySeedSnapshot(actual);
  for (const actorKey of PROFILE_ACTORS) {
    if (actual.users?.[uids[actorKey]]?.email !== ACTORS[actorKey].email) {
      throw new Error(`O perfil de demonstração ${actorKey} não corresponde ao Auth Emulator.`);
    }
  }
  console.log(`SEED_OK: ${PROJECT_ID} / ${DATABASE_NAMESPACE} — ${JSON.stringify(summary)}`);
  console.log(`Senha das contas de demonstração: ${DEMO_PASSWORD}`);
  console.table(Object.entries(ACTORS).map(([key, actor]) => ({ papel: actor.role || '(sem perfil ou revogada)', ator: key, email: actor.email })));
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(`Falha ao carregar o Emulator: ${error.message}`);
    console.error('O Emulator está rodando? Use `npm run emulators` em outro terminal.');
    process.exitCode = 1;
  });
}
