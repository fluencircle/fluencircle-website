/**
 * @file Página inicial (index.html).
 *
 * Os atalhos são links comuns (`<a>`); por papel, o app-shell esconde os que
 * o usuário não pode usar. Para quem tem plano, mostra a agenda da semana
 * (PR #2 / ADR-005): horários do plano com o tema, as perguntas de preparação
 * e o link da chamada definidos pela equipe.
 */
import { initProtectedPage } from './shared/page-setup.js';
import { getUserProfile } from '../services/users.service.js';
import { getPlan, getPlanWeekSchedule } from '../services/plans.service.js';
import { buildWeekAgenda, isoWeekKey, weekRangeLabel, profilePlanId } from '../domain/plans.js';
import { h, byId, replaceContent } from '../ui/dom.js';
import { renderWeekSlotCard } from '../ui/week-slot-card.js';
import { currentEnvironment } from '../config/environment.js';
import { initRoomLobby } from './room-lobby.js';

const section = byId('student-week');
const subtitle = byId('student-week-subtitle');
const agendaGrid = byId('student-agenda');

function message(text) {
  replaceContent(agendaGrid, h('div', { class: 'empty-state plans-empty' }, h('p', null, text)));
}

/**
 * Carrega e desenha a agenda. Sem plano, a seção fica oculta (equipe e alunos
 * sem assinatura veem a home como antes).
 * @param {string} uid
 */
async function loadStudentWeek(uid) {
  const profile = await getUserProfile(uid);
  const planId = profilePlanId(profile);
  if (!planId) return;

  section.classList.remove('hidden');
  const today = new Date();
  subtitle.textContent = `Semana ${weekRangeLabel(today)}`;
  message('Carregando sua agenda...');

  const plan = await getPlan(planId);
  if (!plan) {
    message('Seu plano não foi encontrado. Fale com a equipe para revisar seu cadastro.');
    return;
  }
  const schedule = await getPlanWeekSchedule(isoWeekKey(today), planId, plan);
  const agenda = buildWeekAgenda({ plans: { [planId]: plan }, schedule, date: today });
  if (agenda.length === 0) {
    message('Nenhum encontro do seu plano nesta semana.');
    return;
  }
  replaceContent(agendaGrid, agenda.map((item) => renderWeekSlotCard(item, { forStudent: true })));
}

const session = await initProtectedPage();
if (session) {
  if (currentEnvironment.liveRooms) initRoomLobby(session.user.uid);
  try {
    await loadStudentWeek(session.user.uid);
  } catch (error) {
    console.error('Erro ao carregar a agenda semanal:', error);
    message('Erro ao carregar sua agenda semanal.');
  }
}
