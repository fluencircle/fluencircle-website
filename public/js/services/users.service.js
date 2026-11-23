/**
 * @file Perfis de usuário (`users`), lista de bloqueio (`deleted_users`) e criação de contas.
 */
import { database, ref, get, set, update } from '../core/firebase.js';
import { getSecondaryAuth, createUserWithEmailAndPassword, signOut, deleteUser } from '../core/firebase-auth.js';
import { createAccountWithRollback } from './account-creation.js';
import { ROLES } from '../core/roles.js';
import { nowIso } from '../domain/format.js';
import { DB_PATHS, dbPath } from './db-paths.js';

/**
 * @param {string} uid
 * @returns {Promise<object|null>} perfil ou null se não existir
 */
export async function getUserProfile(uid) {
  const snapshot = await get(ref(database, dbPath(DB_PATHS.users, uid)));
  return snapshot.exists() ? snapshot.val() : null;
}

/**
 * @param {string} uid
 * @returns {Promise<boolean>} true se a conta foi excluída pelo administrador
 */
export async function isUserBlocked(uid) {
  const snapshot = await get(ref(database, dbPath(DB_PATHS.deletedUsers, uid)));
  return snapshot.exists();
}

/**
 * Todos os perfis, como lista, com o `uid` dentro de cada item.
 * @returns {Promise<import('../domain/users.js').UserProfile[]>}
 */
export async function listUsers() {
  const snapshot = await get(ref(database, DB_PATHS.users));
  if (!snapshot.exists()) return [];
  const byUid = snapshot.val();
  return Object.keys(byUid).map((uid) => ({ uid, ...byUid[uid] }));
}

/** Perfis de alunos (inclui quem não tem papel definido). */
export async function listStudents() {
  const users = await listUsers();
  return users.filter((user) => user.role === ROLES.STUDENT || !user.role);
}

/**
 * Cria a conta no Firebase Auth e o perfil no banco, desfazendo a conta se o
 * perfil não puder ser gravado (services/account-creation.js).
 *
 * Usa a instância secundária de Auth para não deslogar o administrador; o
 * perfil é gravado pela sessão do ADMIN (instância principal), que as regras
 * autorizam. Enquanto a secundária está logada como a conta nova, ela pode
 * excluir a si mesma — é isso que permite desfazer.
 * Limitação conhecida: por rodar no navegador, exige o cadastro público por
 * e-mail habilitado no projeto. Solução definitiva: backend com Admin SDK.
 *
 * @param {{ firstName: string, lastName: string, email: string, password: string, role: string, planId?: string }} data
 * @returns {Promise<string>} uid da nova conta
 */
export async function createUserAccount({ firstName, lastName, email, password, role, planId = '' }) {
  const secondaryAuth = getSecondaryAuth();
  return createAccountWithRollback({
    createAuthUser: async () => (await createUserWithEmailAndPassword(secondaryAuth, email, password)).user,
    writeProfile: (uid) => set(ref(database, dbPath(DB_PATHS.users, uid)), {
      firstName,
      lastName,
      email,
      role,
      ...(planId ? { planId } : {}),
      createdAt: nowIso(),
    }),
    deleteAuthUser: (user) => deleteUser(user),
    signOutSecondary: () => signOut(secondaryAuth),
  });
}

/**
 * Atualiza nome, papel e plano. O e-mail não muda aqui: no Firebase Auth isso exige reautenticação.
 * @param {string} uid
 * @param {{ firstName: string, lastName: string, role: string, planId?: string }} data
 *        `planId` vazio desvincula o plano
 */
export function updateUserProfile(uid, { firstName, lastName, role, planId = '' }) {
  return update(ref(database, dbPath(DB_PATHS.users, uid)), {
    firstName,
    lastName,
    role,
    planId: planId || null,
    plan: null,
    planName: null,
    updatedAt: nowIso(),
  });
}

/**
 * Revoga o acesso: apaga o perfil e põe o uid na lista de bloqueio, numa única
 * escrita atômica. A conta continua existindo no Firebase Auth — excluí-la de
 * fato exige o Admin SDK no backend.
 *
 * @param {string} uid
 * @param {string} deletedBy e-mail de quem excluiu
 */
export function revokeUser(uid, deletedBy) {
  return update(ref(database), {
    [dbPath(DB_PATHS.users, uid)]: null,
    [dbPath(DB_PATHS.deletedUsers, uid)]: { deletedAt: nowIso(), deletedBy },
  });
}
