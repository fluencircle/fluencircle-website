/**
 * @file Nomes dos nós do Realtime Database.
 *
 * Os nomes antigos foram mantidos (os dados de produção dependem deles).
 * Repare que `meetings` guarda os TEMAS e `meeting_sessions` as SESSÕES realizadas;
 * renomear exigiria migrar os dados — ver docs/ARQUITETURA.md.
 *
 * Só a camada `services/` deve conhecer estes caminhos.
 */
export const DB_PATHS = Object.freeze({
  /** users/{uid} → { firstName, lastName, email, role, planId?, createdAt, updatedAt } */
  users: 'users',
  /** deleted_users/{uid} → { deletedAt, deletedBy } (lista de bloqueio) */
  deletedUsers: 'deleted_users',
  /** meetings/{themeId} → { topic, questions[], createdAt, updatedAt } */
  themes: 'meetings',
  /** meeting_sessions/{sessionId} → { templateId, topic, startedAt, mediatorEmail, attendees/{uid} } */
  sessions: 'meeting_sessions',
  /** current_session → { sessionId, topic, startedAt } — lido pelo tradutor público */
  currentSession: 'current_session',
  liveRooms: 'live_rooms',
  liveRoomMembers: 'live_room_members',
  liveRoomChat: 'live_room_chat',
  /** flashcards/{sessionId}/{cardId} → { front, back, topic, sessionId, createdAt } */
  flashcards: 'flashcards',
  /** student_reviews/{uid}/{sessionId} → { stage, lastReviewedAt, stageNCompletedAt } */
  reviews: 'student_reviews',
  /** user_sessions/{uid}/{sessionId} → true (índice de presença por aluno) */
  userSessions: 'user_sessions',
  /** plans/{planId} → { name, price, description?, sessions[{ dayOfWeek, startTime, endTime }], createdAt, updatedAt } */
  plans: 'plans',
  /** weekly_sessions/{2026-W47}/{planId_dia_i} → { topicId, topicTitle, questions[], meetLink, updatedAt } */
  weeklySessions: 'weekly_sessions',
});

/**
 * Monta um caminho a partir de partes: `dbPath('meetings', id)` → `'meetings/<id>'`.
 * @param {...string} parts
 */
export const dbPath = (...parts) => parts.join('/');
