/**
 * @file Planos e agenda (plans.html) — PR #2 reimplementado (ADR-005).
 *
 * Equipe: escolhe o tema e o link de cada encontro da semana.
 * Admin: além disso, cria, edita e apaga planos (as regras recusam o mediador).
 */
import { initProtectedPage } from './shared/page-setup.js';
import { listPlans, savePlan, deletePlan, getWeekSchedule, saveWeekSlot, clearWeekSlot } from '../services/plans.service.js';
import { listThemes } from '../services/themes.service.js';
import {
  WEEK_DAYS, buildWeekAgenda, isoWeekKey, addWeeks, weekRangeLabel, validatePlanInput,
  formatPlanPrice, planScheduleSummary, planSessions, preservePlanSessionIndices,
  changesExistingPlanSlots, isSafeMeetLink,
} from '../domain/plans.js';
import { toQuestionList } from '../domain/questions.js';
import { ROLES, STAFF_ROLES } from '../core/roles.js';
import { h, icon, byId, replaceContent, setBusy } from '../ui/dom.js';
import { renderWeekSlotCard } from '../ui/week-slot-card.js';
import { showToast } from '../ui/toast.js';
import { confirmDialog } from '../ui/confirm-dialog.js';

const weekAgenda = byId('week-agenda');
const weekLabel = byId('week-label');
const plansGrid = byId('plans-grid');
const tabs = { week: byId('tab-week'), plans: byId('tab-plans') };
const panels = { week: byId('week-panel'), plans: byId('plans-panel') };

const slotModal = byId('slot-modal');
const slotForm = byId('slot-form');
const slotInfo = byId('slot-modal-info');
const slotThemeSelect = byId('slot-theme-select');
const slotMeetLink = byId('slot-meet-link');
const clearSlotButton = byId('clear-slot-btn');
const saveSlotButton = byId('save-slot-btn');

const planModal = byId('plan-modal');
const planForm = byId('plan-form');
const planModalTitle = byId('plan-modal-title');
const planName = byId('plan-name');
const planPrice = byId('plan-price');
const planDescription = byId('plan-description');
const scheduleRows = byId('plan-schedule-rows');
const savePlanButton = byId('save-plan-btn');

let isAdmin = false;
let plans = {};
let themes = {};
let schedule = {};
/** Semanas a partir da atual (0 = esta semana). */
let weekOffset = 0;
/** Sequência das leituras para ignorar respostas de semanas antigas. */
let weekRequest = 0;
/** Semana capturada ao abrir o editor de encontro. */
let editingWeekKey = null;
/** Encontro aberto no modal. */
let editingSlot = null;
/** Plano em edição; null = novo. */
let editingPlanId = null;
let editingPlan = null;

const currentDate = () => addWeeks(new Date(), weekOffset);
const currentWeekKey = () => isoWeekKey(currentDate());

function emptyState(text, hint) {
  return h('div', { class: 'empty-state plans-empty' }, h('p', null, text), hint ? h('p', { class: 'plans-empty__hint' }, hint) : null);
}

// ---------------------------------------------------------------------------
// Abas
// ---------------------------------------------------------------------------

function showTab(name) {
  for (const key of Object.keys(tabs)) {
    const active = key === name;
    tabs[key].classList.toggle('active', active);
    tabs[key].setAttribute('aria-selected', String(active));
    panels[key].classList.toggle('hidden', !active);
  }
}

// ---------------------------------------------------------------------------
// Agenda da semana
// ---------------------------------------------------------------------------

async function loadWeek() {
  const request = ++weekRequest;
  const weekKey = currentWeekKey();
  weekLabel.textContent = `Semana ${weekRangeLabel(currentDate())}`;
  replaceContent(weekAgenda, emptyState('Carregando agenda...'));
  try {
    const nextSchedule = await getWeekSchedule(weekKey);
    // Respostas antigas não podem sobrescrever a semana já selecionada.
    if (request !== weekRequest) return;
    schedule = nextSchedule;
    renderWeek();
  } catch (error) {
    if (request !== weekRequest) return;
    console.error('Erro ao carregar a agenda:', error);
    replaceContent(weekAgenda, emptyState('Erro ao carregar a agenda da semana.'));
  }
}

function renderWeek() {
  const agenda = buildWeekAgenda({ plans, schedule, date: currentDate() });
  if (agenda.length === 0) {
    replaceContent(weekAgenda, emptyState('Nenhum encontro nesta semana.', 'Crie um plano com horários na aba "Planos".'));
    return;
  }
  replaceContent(weekAgenda, agenda.map((item) => renderWeekSlotCard(item, { onActivate: openSlotModal })));
}

function renderThemeOptions(selectedId) {
  const options = Object.entries(themes)
    .sort(([, a], [, b]) => String(a.topic).localeCompare(String(b.topic), 'pt-BR'))
    .map(([id, theme]) => h('option', { value: id }, theme.topic));
  replaceContent(slotThemeSelect, h('option', { value: '' }, 'Selecione um tema'), options);
  slotThemeSelect.value = themes[selectedId] ? selectedId : '';
}

function openSlotModal(item) {
  editingSlot = item;
  editingWeekKey = currentWeekKey();
  slotInfo.textContent = `${item.weekdayShort} ${item.monthDay} · ${item.startTime} – ${item.endTime} · ${item.planName}`;
  renderThemeOptions(item.topicId);
  slotMeetLink.value = item.meetLink;
  clearSlotButton.classList.toggle('hidden', !item.topic);
  slotModal.classList.remove('hidden');
  slotThemeSelect.focus();
}

const closeSlotModal = () => slotModal.classList.add('hidden');

async function saveSlot(event) {
  event.preventDefault();
  const theme = themes[slotThemeSelect.value];
  const meetLink = slotMeetLink.value.trim();
  if (!theme) {
    showToast('Selecione um tema.', 'error');
    return;
  }
  if (meetLink && !isSafeMeetLink(meetLink)) {
    showToast('Use um link https:// válido, sem espaços nem aspas.', 'error');
    return;
  }
  const restore = setBusy(saveSlotButton, 'Salvando...');
  try {
    await saveWeekSlot(editingWeekKey, editingSlot.slotKey, {
      topicId: slotThemeSelect.value,
      topicTitle: theme.topic,
      questions: toQuestionList(theme.questions),
      meetLink,
    });
    showToast('Tema vinculado ao encontro!', 'success');
    closeSlotModal();
    await loadWeek();
  } catch (error) {
    console.error('Erro ao salvar encontro:', error);
    showToast('Erro ao salvar o encontro.', 'error');
  } finally {
    restore();
  }
}

async function clearSlot() {
  try {
    await clearWeekSlot(editingWeekKey, editingSlot.slotKey);
    showToast('Tema removido do encontro.', 'success');
    closeSlotModal();
    await loadWeek();
  } catch (error) {
    console.error('Erro ao limpar encontro:', error);
    showToast('Erro ao remover o tema.', 'error');
  }
}

// ---------------------------------------------------------------------------
// Planos
// ---------------------------------------------------------------------------

function renderPlans() {
  const entries = Object.entries(plans).sort(([, a], [, b]) => String(a.name).localeCompare(String(b.name), 'pt-BR'));
  if (entries.length === 0) {
    replaceContent(plansGrid, emptyState('Nenhum plano cadastrado.', isAdmin ? 'Use "Novo plano" para criar o primeiro.' : null));
    return;
  }
  replaceContent(plansGrid, entries.map(([id, plan]) => renderPlanCard(id, plan)));
}

function renderPlanCard(id, plan) {
  const actions = isAdmin
    ? h('div', { class: 'plan-card__actions' },
      planActionButton('fa-pen', `Editar plano ${plan.name}`, () => openPlanModal(id, plan)),
      planActionButton('fa-trash', `Excluir plano ${plan.name}`, () => removePlan(id, plan)))
    : null;
  return h('article', { class: 'plan-card', 'data-plan': id },
    h('div', { class: 'plan-card__header' }, h('h3', null, plan.name), actions),
    h('p', { class: 'plan-card__price' }, formatPlanPrice(plan.price), h('span', null, '/mês')),
    plan.description ? h('p', { class: 'plan-card__description' }, plan.description) : null,
    h('p', { class: 'plan-card__schedule' }, icon('fa-calendar-days', 'regular'), ' ', planScheduleSummary(plan) || 'Sem horários'));
}

function planActionButton(iconName, label, onClick) {
  const button = h('button', { type: 'button', class: 'action-table-btn', title: label, 'aria-label': label }, icon(iconName));
  button.addEventListener('click', onClick);
  return button;
}

function addScheduleRow({ index = null, dayOfWeek = 1, startTime = '18:00', endTime = '18:50' } = {}) {
  const position = scheduleRows.children.length + 1;
  const day = h('select', { class: 'plans-select schedule-row__day', 'aria-label': `Dia do horário ${position}` },
    WEEK_DAYS.map((d) => h('option', { value: String(d.id) }, d.full)));
  day.value = String(dayOfWeek);
  const start = h('input', { type: 'time', class: 'schedule-row__start', value: startTime, required: '', 'aria-label': `Início do horário ${position}` });
  const end = h('input', { type: 'time', class: 'schedule-row__end', value: endTime, required: '', 'aria-label': `Fim do horário ${position}` });
  const removeButton = h('button', { type: 'button', class: 'action-table-btn', 'aria-label': `Remover horário ${position}` }, icon('fa-trash'));
  const row = h('div', { class: 'schedule-row' }, day, start, end, removeButton);
  // Índice salvo: a posição visual da linha não identifica um horário.
  if (Number.isInteger(index) && index >= 0) row.dataset.slotIndex = String(index);
  removeButton.addEventListener('click', () => row.remove());
  scheduleRows.append(row);
}

function openPlanModal(id = null, plan = null) {
  planForm.reset();
  editingPlanId = id;
  editingPlan = plan;
  planModalTitle.textContent = id ? 'Editar plano' : 'Novo plano';
  planName.value = plan?.name ?? '';
  planPrice.value = plan ? String(plan.price).replace('.', ',') : '';
  planDescription.value = plan?.description ?? '';
  scheduleRows.replaceChildren();
  const sessions = plan ? planSessions(plan) : [];
  (sessions.length ? sessions : [{}]).forEach(addScheduleRow);
  planModal.classList.remove('hidden');
  planName.focus();
}

const closePlanModal = () => planModal.classList.add('hidden');

async function submitPlan(event) {
  event.preventDefault();
  if (savePlanButton.disabled) return;
  const result = validatePlanInput({
    name: planName.value,
    price: planPrice.value,
    description: planDescription.value,
    sessions: [...scheduleRows.children].map((row) => ({
      dayOfWeek: row.querySelector('.schedule-row__day').value,
      startTime: row.querySelector('.schedule-row__start').value,
      endTime: row.querySelector('.schedule-row__end').value,
    })),
  });
  if (!result.ok) {
    showToast(result.errors[0], 'error');
    return;
  }
  const planId = editingPlanId;
  const previousPlan = editingPlan;
  let scheduleForSave = { sessions: result.value.sessions, nextSessionIndex: result.value.sessions.length };
  if (previousPlan) {
    try {
      scheduleForSave = preservePlanSessionIndices(
        previousPlan, result.value.sessions,
        [...scheduleRows.children].map((row) => row.dataset.slotIndex ?? ''),
      );
    } catch (error) {
      showToast(error.message, 'error');
      return;
    }
    if (changesExistingPlanSlots(previousPlan, scheduleForSave.sessions)) {
      const proceed = await confirmDialog({
        title: 'Alterar horários existentes',
        message: 'Remover um horário ou mudar seu dia desvincula temas já programados. Os demais horários manterão seus encontros. Continuar?',
        confirmText: 'Continuar',
      });
      if (!proceed) return;
    }
  }
  const restore = setBusy(savePlanButton, 'Salvando...');
  try {
    const saved = await savePlan(planId, { ...result.value, ...scheduleForSave }, previousPlan);
    if (!saved) {
      showToast('Este plano mudou em outra tela. Abra a versão atual e tente novamente.', 'error');
      closePlanModal();
      await loadPlans();
      return;
    }
    showToast(planId ? 'Plano atualizado!' : 'Plano criado!', 'success');
    closePlanModal();
    await loadPlans();
  } catch (error) {
    console.error('Erro ao salvar plano:', error);
    showToast('Erro ao salvar o plano.', 'error');
  } finally {
    restore();
  }
}

async function removePlan(id, plan) {
  const confirmed = await confirmDialog({
    title: 'Excluir plano',
    message: `Excluir o plano ${plan.name}? Quem estiver vinculado a ele ficará sem agenda até receber outro plano em Acessos.`,
    confirmText: 'Sim, excluir',
  });
  if (!confirmed) return;
  try {
    await deletePlan(id);
    showToast('Plano excluído.', 'success');
    await loadPlans();
  } catch (error) {
    console.error('Erro ao excluir plano:', error);
    showToast('Erro ao excluir o plano.', 'error');
  }
}

async function loadPlans() {
  plans = await listPlans();
  renderPlans();
  renderWeek();
}

// ---------------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------------

tabs.week.addEventListener('click', () => showTab('week'));
tabs.plans.addEventListener('click', () => showTab('plans'));
byId('prev-week-btn').addEventListener('click', () => { weekOffset -= 1; loadWeek(); });
byId('next-week-btn').addEventListener('click', () => { weekOffset += 1; loadWeek(); });
byId('close-slot-modal-btn').addEventListener('click', closeSlotModal);
slotForm.addEventListener('submit', saveSlot);
clearSlotButton.addEventListener('click', clearSlot);
byId('open-create-plan-btn').addEventListener('click', () => openPlanModal());
byId('add-schedule-row-btn').addEventListener('click', () => addScheduleRow());
byId('close-plan-modal-btn').addEventListener('click', closePlanModal);
byId('cancel-plan-btn').addEventListener('click', closePlanModal);
planForm.addEventListener('submit', submitPlan);
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  closeSlotModal();
  closePlanModal();
});

const session = await initProtectedPage({ allowedRoles: STAFF_ROLES, deniedMessage: 'Acesso negado. Página restrita à equipe.' });
if (session) {
  isAdmin = session.role === ROLES.ADMIN;
  try {
    [plans, themes] = await Promise.all([listPlans(), listThemes()]);
  } catch (error) {
    console.error('Erro ao carregar planos e temas:', error);
    showToast('Erro ao carregar planos e temas.', 'error');
  }
  renderPlans();
  await loadWeek();
}
