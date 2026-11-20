/**
 * @file Dados SINTÉTICOS compartilhados pelos testes de regras, pelos testes
 * E2E e pela carga do Emulator (`npm run emulators:seed`).
 *
 * Nenhum dado real: nomes inventados e e-mails no domínio reservado
 * `example.test` (RFC 2606), que não existe na internet. A senha de demonstração
 * só serve para as contas criadas no Auth Emulator local.
 */

/** Senha das contas de demonstração no Auth Emulator (não é segredo: só existe localmente). */
export const DEMO_PASSWORD = 'fluencircle-demo';

/**
 * Atores da matriz de acesso. `uid` padrão é fixo para os testes de regras;
 * a carga do Emulator substitui pelos uids que o Auth Emulator gerar.
 */
export const ACTORS = Object.freeze({
  studentA: Object.freeze({ uid: 'student-ana', email: 'ana.aluna@example.test', firstName: 'Ana', lastName: 'Aluna', role: 'student' }),
  studentB: Object.freeze({ uid: 'student-bruno', email: 'bruno.aluno@example.test', firstName: 'Bruno', lastName: 'Aluno', role: 'student' }),
  mediatorA: Object.freeze({ uid: 'mediator-carla', email: 'carla.mediadora@example.test', firstName: 'Carla', lastName: 'Mediadora', role: 'mediator' }),
  mediatorB: Object.freeze({ uid: 'mediator-diego', email: 'diego.mediador@example.test', firstName: 'Diego', lastName: 'Mediador', role: 'mediator' }),
  admin: Object.freeze({ uid: 'admin-elisa', email: 'elisa.admin@example.test', firstName: 'Elisa', lastName: 'Admin', role: 'admin' }),
  /** Conta no Auth sem perfil em `users` (ex.: criada fora do painel). */
  noProfile: Object.freeze({ uid: 'no-profile-fabio', email: 'fabio.semperfil@example.test' }),
  /** Conta revogada: sem perfil e com entrada em `deleted_users`. */
  revoked: Object.freeze({ uid: 'revoked-gabi', email: 'gabi.revogada@example.test' }),
});

/** Atores com perfil gravado em `users`. */
export const PROFILE_ACTORS = Object.freeze(['studentA', 'studentB', 'mediatorA', 'mediatorB', 'admin']);

/** Sessões da carga sintética (ids fixos). */
export const SESSIONS = Object.freeze({
  anaOnly: 'sess-ana',
  both: 'sess-ambos',
  brunoOnly: 'sess-bruno',
});

/** Planos da carga sintética (PR #2 / ADR-005). Ana tem o Essencial; Bruno, nenhum. */
export const PLANS = Object.freeze({
  essencial: 'plano-essencial',
  intensivo: 'plano-intensivo',
});

/** Semana fixa usada pelos testes de regras da agenda. */
export const AGENDA_WEEK = '2026-W47';

/**
 * Monta a árvore do banco sintético.
 * @param {{ uids?: Partial<Record<keyof typeof ACTORS, string>> }} [options]
 *        uids reais quando o Auth Emulator gerar outros identificadores
 */
export function buildSyntheticDatabase({ uids = {} } = {}) {
  const uid = (key) => uids[key] || ACTORS[key].uid;
  // Presença no formato atual: só a data (sem PII).
  const attendee = (addedAt) => ({ addedAt });
  // Formato ANTIGO (antes da Issue #10), mantido de propósito para testar compatibilidade.
  const legacyAttendee = (key, addedAt) => {
    const actor = ACTORS[key];
    return { name: `${actor.firstName} ${actor.lastName}`, email: actor.email, addedAt };
  };
  const summary = (topic, startedAt) => ({ topic, startedAt });
  const card = (sessionId, topic, front, back, createdAt) => ({ front, back, topic, sessionId, createdAt });

  const users = {};
  for (const key of PROFILE_ACTORS) {
    const { email, firstName, lastName, role } = ACTORS[key];
    users[uid(key)] = { firstName, lastName, email, role, createdAt: '2026-09-01T12:00:00.000Z' };
  }
  // Cadastro anterior ao plano canônico, como lido pelo PR #2 histórico.
  users[uid('studentA')].plan = PLANS.essencial;
  users[uid('studentA')].planName = 'Essencial';

  return {
    users,
    plans: {
      [PLANS.essencial]: {
        name: 'Essencial', price: 120, description: 'Dois encontros por semana.',
        sessions: [{ dayOfWeek: 1, startTime: '18:00', endTime: '18:50' }, { dayOfWeek: 3, startTime: '18:00', endTime: '18:50' }],
        createdAt: '2026-09-02T12:00:00.000Z', updatedAt: '2026-09-02T12:00:00.000Z',
      },
      [PLANS.intensivo]: {
        name: 'Intensivo', price: 89.9,
        sessions: [{ dayOfWeek: 2, startTime: '19:00', endTime: '19:50' }],
        createdAt: '2026-09-02T12:00:00.000Z', updatedAt: '2026-09-02T12:00:00.000Z',
      },
    },
    weekly_sessions: {
      [AGENDA_WEEK]: {
        [`${PLANS.essencial}_3_1`]: {
          topicId: 'tema-viagem', topicTitle: 'Travel', questions: ['Where did you go last?', 'Beach or mountains?'],
          meetLink: 'https://meet.example.test/essencial-quarta', updatedAt: '2026-11-15T12:00:00.000Z',
        },
        [`${PLANS.intensivo}_2_0`]: {
          topicId: 'tema-tecnologia', topicTitle: 'Technology & Daily Life', updatedAt: '2026-11-15T12:00:00.000Z',
        },
      },
    },
    deleted_users: {
      [uid('revoked')]: { deletedAt: '2026-10-01T12:00:00.000Z', deletedBy: ACTORS.admin.email },
    },
    meetings: {
      'tema-tecnologia': {
        topic: 'Technology & Daily Life',
        questions: ['How often do you use your phone?', 'Would you live in a "smart" home?'],
        createdAt: '2026-09-05T12:00:00.000Z',
        updatedAt: '2026-09-05T12:00:00.000Z',
      },
      'tema-viagem': {
        topic: 'Travel',
        questions: ['Where did you go last?', 'Beach or mountains?'],
        createdAt: '2026-09-06T12:00:00.000Z',
        updatedAt: '2026-09-06T12:00:00.000Z',
      },
    },
    meeting_sessions: {
      [SESSIONS.anaOnly]: {
        templateId: 'tema-tecnologia', topic: 'Technology & Daily Life', startedAt: '2026-11-10T19:00:00.000Z',
        mediatorEmail: ACTORS.mediatorA.email,
        attendees: { [uid('studentA')]: attendee('2026-11-10T19:05:00.000Z') },
      },
      [SESSIONS.both]: {
        templateId: 'tema-viagem', topic: 'Travel', startedAt: '2026-11-16T19:00:00.000Z',
        mediatorEmail: ACTORS.mediatorB.email,
        attendees: {
          [uid('studentA')]: attendee('2026-11-16T19:05:00.000Z'),
          [uid('studentB')]: legacyAttendee('studentB', '2026-11-16T19:06:00.000Z'),
        },
      },
      [SESSIONS.brunoOnly]: {
        templateId: 'tema-viagem', topic: 'Travel II', startedAt: '2026-11-17T19:00:00.000Z',
        mediatorEmail: ACTORS.mediatorA.email,
        attendees: { [uid('studentB')]: attendee('2026-11-17T19:05:00.000Z') },
      },
    },
    flashcards: {
      [SESSIONS.anaOnly]: {
        'card-ana-1': card(SESSIONS.anaOnly, 'Technology & Daily Life', 'smartphone', 'celular', '2026-11-10T19:10:00.000Z'),
        'card-ana-2': card(SESSIONS.anaOnly, 'Technology & Daily Life', 'to charge', 'carregar', '2026-11-10T19:12:00.000Z'),
      },
      [SESSIONS.both]: {
        'card-ambos-1': card(SESSIONS.both, 'Travel', 'beach', 'praia', '2026-11-16T19:10:00.000Z'),
        'card-ambos-2': card(SESSIONS.both, 'Travel', 'carry-on "luggage"', 'bagagem de mão', '2026-11-16T19:11:00.000Z'),
      },
      [SESSIONS.brunoOnly]: {
        'card-bruno-1': card(SESSIONS.brunoOnly, 'Travel II', 'mountain', 'montanha', '2026-11-17T19:10:00.000Z'),
      },
    },
    student_reviews: {
      [uid('studentA')]: {
        [SESSIONS.anaOnly]: { stage: 1, stage1CompletedAt: '2026-11-12T10:00:00.000Z', lastReviewedAt: '2026-11-12T10:00:00.000Z' },
      },
    },
    user_sessions: {
      [uid('studentA')]: {
        [SESSIONS.anaOnly]: summary('Technology & Daily Life', '2026-11-10T19:00:00.000Z'),
        [SESSIONS.both]: summary('Travel', '2026-11-16T19:00:00.000Z'),
      },
      // Bruno tem uma entrada no formato antigo (`true`) para testar compatibilidade.
      [uid('studentB')]: {
        [SESSIONS.both]: true,
        [SESSIONS.brunoOnly]: summary('Travel II', '2026-11-17T19:00:00.000Z'),
      },
    },
  };
}
