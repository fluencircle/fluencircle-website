/**
 * @file Planos de assinatura e agenda semanal (funções puras).
 *
 * Origem: PR #2 (planos como atributo do usuário e agenda do participante),
 * reimplementada sobre a arquitetura em camadas. Nada aqui acessa o banco.
 *
 * Modelo (detalhes em docs/engenharia/ADR-005-PLANOS-E-AGENDA.md):
 * - um plano tem horários fixos na semana: `sessions[i] = { dayOfWeek, startTime, endTime }`;
 * - cada horário, numa semana concreta, vira um "encontro" identificado por
 *   `slotKey = <planId>_<dayOfWeek>_<i>` (mesmo formato do PR #2);
 * - a semana é identificada pela semana ISO 8601 (`2026-W47`), calculada na
 *   data LOCAL de quem usa a tela (os horários do plano também são locais).
 */

/** Dias na ordem de exibição (segunda a domingo). `id` segue `Date#getDay()`. */
export const WEEK_DAYS = Object.freeze([
  Object.freeze({ id: 1, short: 'Seg', full: 'Segunda-feira' }),
  Object.freeze({ id: 2, short: 'Ter', full: 'Terça-feira' }),
  Object.freeze({ id: 3, short: 'Qua', full: 'Quarta-feira' }),
  Object.freeze({ id: 4, short: 'Qui', full: 'Quinta-feira' }),
  Object.freeze({ id: 5, short: 'Sex', full: 'Sexta-feira' }),
  Object.freeze({ id: 6, short: 'Sáb', full: 'Sábado' }),
  Object.freeze({ id: 0, short: 'Dom', full: 'Domingo' }),
]);

/** Limites usados pela validação (e repetidos nas regras do banco). */
export const PLAN_LIMITS = Object.freeze({
  nameMax: 80,
  descriptionMax: 300,
  priceMax: 100000,
  sessionsMax: 14,
  meetLinkMax: 500,
});

const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const PLAN_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const SESSION_INDEX_PATTERN = /^(0|[1-9][0-9]{0,5})$/;
const FIRST_UNUSED_LEGACY_INDEX = 100;
const MAX_SESSION_INDEX = 999999;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Posição do dia na semana que começa na segunda (seg = 1 … dom = 7). */
const mondayFirstOrder = (dayOfWeek) => (dayOfWeek === 0 ? 7 : dayOfWeek);

/** Lista do RTDB (array ou objeto `{ "0": …, "1": … }`) como array de textos, na ordem dos índices. */
function textList(value) {
  if (!value || typeof value !== 'object') return [];
  const entries = Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value).map(([k, v]) => [Number(k), v]);
  return entries.sort((a, b) => a[0] - b[0]).map(([, v]) => v).filter((v) => typeof v === 'string');
}

/**
 * Identificador ISO 8601 da semana da data (no fuso local), ex.: `2026-W47`.
 * A semana começa na segunda e a semana 1 é a que contém a primeira quinta-feira.
 * @param {Date} date
 * @returns {string}
 */
export function isoWeekKey(date) {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday); // quinta-feira da mesma semana
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((day.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Data local deslocada em semanas inteiras (usada para navegar entre semanas).
 * @param {Date} date
 * @param {number} weeks positivo = futuro
 */
export function addWeeks(date, weeks) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7 * weeks);
}

/**
 * Os sete dias (segunda a domingo) da semana da data, em hora local.
 * @param {Date} date
 * @returns {{ date: Date, dayOfWeek: number, short: string, full: string, monthDay: number }[]}
 */
export function weekDays(date) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - (mondayFirstOrder(date.getDay()) - 1));
  return WEEK_DAYS.map((day, offset) => {
    const current = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset);
    return { date: current, dayOfWeek: day.id, short: day.short, full: day.full, monthDay: current.getDate() };
  });
}

/** Rótulo curto da semana para a interface, ex.: "17/11 a 23/11". */
export function weekRangeLabel(date) {
  const days = weekDays(date);
  const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${fmt(days[0].date)} a ${fmt(days[6].date)}`;
}

/**
 * Chave do encontro de um horário do plano (formato herdado do PR #2).
 * @param {string} planId
 * @param {number} dayOfWeek
 * @param {number|string} index posição do horário em `plan.sessions`
 */
export function slotKey(planId, dayOfWeek, index) {
  return `${planId}_${dayOfWeek}_${index}`;
}

/** Id de plano aceitável (formato dos ids do `push()` do Firebase). */
export function isValidPlanId(planId) {
  return typeof planId === 'string' && PLAN_ID_PATTERN.test(planId);
}

/** Perfis antigos usavam `plan`; um `planId` explícito tem precedência. */
export function profilePlanId(profile) {
  const id = profile?.planId ?? profile?.plan;
  return isValidPlanId(id) ? id : '';
}

/**
 * Horários do plano como lista `{ index, dayOfWeek, startTime, endTime }`.
 * O RTDB devolve listas como array OU objeto `{ "0": …, "2": … }`; o índice
 * original é preservado porque faz parte da `slotKey`.
 * @param {object} plan
 */
export function planSessions(plan) {
  const raw = plan?.sessions;
  if (!raw || typeof raw !== 'object') return [];
  return Object.entries(raw)
    .filter(([index, s]) => SESSION_INDEX_PATTERN.test(index) && s && Number.isInteger(Number(s.dayOfWeek)))
    .map(([index, s]) => ({
      index: Number(index),
      dayOfWeek: Number(s.dayOfWeek),
      startTime: s.startTime || '',
      endTime: s.endTime || '',
    }));
}

/**
 * Link de chamada que pode virar `<a href>`: só https e só caracteres de URL
 * sem aspas nem espaços (o mesmo padrão das regras do banco).
 */
export function isSafeMeetLink(url) {
  return typeof url === 'string' && url.length <= PLAN_LIMITS.meetLinkMax && /^https:\/\/[A-Za-z0-9._~:/?#@!$&()*+,;=%-]+$/.test(url);
}

/**
 * Preserva os índices dos horários existentes ao editar um plano.
 *
 * A agenda semanal usa `<planId>_<dayOfWeek>_<index>` como chave persistente.
 * Reindexar um array após apagar a primeira linha poderia reutilizar a chave
 * de outro horário e exibir o tema de uma aula na aula errada.
 *
 * O contador persistido mantém índices removidos fora de uso. Planos sem
 * contador reservam 0–99 porque uma edição anterior pode ter removido um
 * horário nesse intervalo com encontros ainda gravados em alguma semana.
 * Mudar o dia cria outra identidade, pois o dia faz parte da chave do encontro.
 */
export function preservePlanSessionIndices(previousPlan, sessions, sourceIndices = []) {
  if (!Array.isArray(sessions) || !Array.isArray(sourceIndices) || sessions.length !== sourceIndices.length) {
    throw new TypeError('Horários e índices de origem devem possuir o mesmo tamanho.');
  }
  const existing = new Map(planSessions(previousPlan).map((slot) => [slot.index, slot]));
  const used = new Set();
  const savedIndex = Number.isInteger(previousPlan?.nextSessionIndex) ? previousPlan.nextSessionIndex : FIRST_UNUSED_LEGACY_INDEX;
  let nextIndex = Math.max(savedIndex, Math.max(-1, ...existing.keys()) + 1);
  const result = {};

  sessions.forEach((session, position) => {
    const raw = sourceIndices[position];
    const candidate = typeof raw === 'string' && SESSION_INDEX_PATTERN.test(raw) ? Number(raw) : null;
    let index;
    if (candidate !== null && existing.get(candidate)?.dayOfWeek === session.dayOfWeek && !used.has(candidate)) {
      index = candidate;
    } else {
      index = nextIndex++;
    }
    if (index > MAX_SESSION_INDEX) throw new RangeError('Limite de índices da agenda atingido; é necessária migração.');
    used.add(index);
    result[index] = { ...session };
  });
  return { sessions: result, nextSessionIndex: nextIndex };
}

/** Mudanças que podem desvincular temas de encontros já programados. */
export function changesExistingPlanSlots(previousPlan, updatedSessions) {
  return planSessions(previousPlan).some((oldSlot) => {
    const updated = updatedSessions?.[oldSlot.index];
    return !updated || updated.dayOfWeek !== oldSlot.dayOfWeek
      || updated.startTime !== oldSlot.startTime || updated.endTime !== oldSlot.endTime;
  });
}

/**
 * Agenda de uma semana: um item por horário de cada plano, com o tema e o
 * link gravados para aquela semana (se houver), em ordem cronológica.
 *
 * @param {Object} params
 * @param {Record<string, object>} params.plans planos por id
 * @param {Record<string, object|null>} [params.schedule] encontros gravados da semana, por slotKey
 * @param {Date} params.date qualquer dia da semana desejada
 */
export function buildWeekAgenda({ plans, schedule = {}, date }) {
  const days = weekDays(date);
  const agenda = [];
  for (const [planId, plan] of Object.entries(plans || {})) {
    if (!plan) continue;
    for (const session of planSessions(plan)) {
      const day = days.find((d) => d.dayOfWeek === session.dayOfWeek);
      if (!day) continue;
      const key = slotKey(planId, session.dayOfWeek, session.index);
      const saved = schedule?.[key] || {};
      const meetLink = saved.meetLink || saved.videoLink || '';
      agenda.push({
        slotKey: key,
        planId,
        planName: plan.name || 'Plano',
        dayOfWeek: session.dayOfWeek,
        weekdayShort: day.short,
        monthDay: day.monthDay,
        startTime: session.startTime,
        endTime: session.endTime,
        topicId: saved.topicId || saved.themeId || '',
        // nomes alternativos: gravações do PR #2 usaram as duas formas
        topic: saved.topicTitle || saved.themeTopic || '',
        questions: textList(saved.questions),
        meetLink: isSafeMeetLink(meetLink) ? meetLink : '',
      });
    }
  }
  return agenda.sort((a, b) =>
    mondayFirstOrder(a.dayOfWeek) - mondayFirstOrder(b.dayOfWeek)
    || a.startTime.localeCompare(b.startTime)
    || a.planName.localeCompare(b.planName, 'pt-BR'));
}

/**
 * Confere e normaliza os dados do formulário de plano.
 * @param {{ name?: string, price?: string|number, description?: string, sessions?: object[] }} input
 * @returns {{ ok: true, value: object } | { ok: false, errors: string[] }}
 */
export function validatePlanInput(input) {
  const errors = [];
  const name = String(input?.name ?? '').trim();
  const description = String(input?.description ?? '').trim();
  const price = Number(String(input?.price ?? '').replace(',', '.'));
  const sessions = Array.isArray(input?.sessions) ? input.sessions : [];

  if (!name) errors.push('Informe o nome do plano.');
  if (name.length > PLAN_LIMITS.nameMax) errors.push(`O nome pode ter até ${PLAN_LIMITS.nameMax} caracteres.`);
  if (description.length > PLAN_LIMITS.descriptionMax) errors.push(`A descrição pode ter até ${PLAN_LIMITS.descriptionMax} caracteres.`);
  if (String(input?.price ?? '').trim() === '' || !Number.isFinite(price) || price < 0 || price > PLAN_LIMITS.priceMax) {
    errors.push('Informe um preço válido (zero ou mais).');
  }
  if (sessions.length === 0) errors.push('Adicione ao menos um horário semanal.');
  if (sessions.length > PLAN_LIMITS.sessionsMax) errors.push(`Um plano pode ter até ${PLAN_LIMITS.sessionsMax} horários.`);

  const normalized = sessions.map((s, i) => {
    const dayOfWeek = Number(s?.dayOfWeek);
    const startTime = String(s?.startTime ?? '');
    const endTime = String(s?.endTime ?? '');
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) errors.push(`Horário ${i + 1}: dia da semana inválido.`);
    if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) errors.push(`Horário ${i + 1}: use o formato HH:MM.`);
    else if (endTime <= startTime) errors.push(`Horário ${i + 1}: o fim deve ser depois do início.`);
    return { dayOfWeek, startTime, endTime };
  });

  if (errors.length) return { ok: false, errors };
  const value = { name, price: Math.round(price * 100) / 100, sessions: normalized };
  if (description) value.description = description;
  return { ok: true, value };
}

/** Preço mensal para exibição: "R$ 120" ou "R$ 89,90". */
export function formatPlanPrice(price) {
  const value = Number(price) || 0;
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** Resumo dos horários: "Seg 18:00–18:50 · Qua 18:00–18:50". */
export function planScheduleSummary(plan) {
  return planSessions(plan)
    .sort((a, b) => mondayFirstOrder(a.dayOfWeek) - mondayFirstOrder(b.dayOfWeek) || a.startTime.localeCompare(b.startTime))
    .map((s) => `${WEEK_DAYS.find((d) => d.id === s.dayOfWeek)?.short ?? '?'} ${s.startTime}–${s.endTime}`)
    .join(' · ');
}
