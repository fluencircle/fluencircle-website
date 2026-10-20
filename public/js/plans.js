import {
    ref,
    get,
    set,
    push,
    update,
    remove
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { database } from "./firebase.js";
import { showToast } from "./auth.js";

// DIAS DA SEMANA PADRÃO
const DAYS_OF_WEEK = [
    { id: 1, name: "Segunda-feira" },
    { id: 2, name: "Terça-feira" },
    { id: 3, name: "Quarta-feira" },
    { id: 4, name: "Quinta-feira" },
    { id: 5, name: "Sexta-feira" },
    { id: 6, name: "Sábado" },
    { id: 0, name: "Domingo" }
];

// ELEMENTOS DA TELA
const tabPlansBtn = document.getElementById('tab-plans-btn');
const tabWeekBtn = document.getElementById('tab-week-btn');
const sectionPlans = document.getElementById('section-plans');
const sectionWeek = document.getElementById('section-week');
const plansGrid = document.getElementById('plans-grid');
const weeklySessionsList = document.getElementById('weekly-sessions-list');
const weekDatesRange = document.getElementById('week-dates-range');
const weekCounterBadge = document.getElementById('week-counter-badge');

// ELEMENTOS DO MODAL DE PLANO
const openCreatePlanBtn = document.getElementById('open-create-plan-modal-btn');
const planModal = document.getElementById('plan-modal');
const planModalBackdrop = document.getElementById('plan-modal-backdrop');
const closePlanModalBtn = document.getElementById('close-plan-modal-btn');
const cancelPlanBtn = document.getElementById('cancel-plan-btn');
const planForm = document.getElementById('plan-form');
const planModalTitle = document.getElementById('plan-modal-title');
const editingPlanId = document.getElementById('editing-plan-id');
const planNameInput = document.getElementById('plan-name-input');
const planPriceInput = document.getElementById('plan-price-input');
const planSessionsCountInput = document.getElementById('plan-sessions-count-input');
const schedulesContainer = document.getElementById('schedules-container');
const addScheduleRowBtn = document.getElementById('add-schedule-row-btn');

// ELEMENTOS DO MODAL DE SESSÃO DA SEMANA
const sessionEditModal = document.getElementById('session-edit-modal');
const sessionModalBackdrop = document.getElementById('session-modal-backdrop');
const closeSessionModalBtn = document.getElementById('close-session-modal-btn');
const cancelSessionBtn = document.getElementById('cancel-session-btn');
const sessionForm = document.getElementById('session-form');
const sessionThemeSelect = document.getElementById('session-theme-select');
const sessionVideoLinkInput = document.getElementById('session-videolink-input');
const sessionSummaryBox = document.getElementById('session-summary-box');
const sessionPlanId = document.getElementById('session-plan-id');
const sessionScheduleId = document.getElementById('session-schedule-id');
const sessionDayName = document.getElementById('session-day-name');
const sessionTime = document.getElementById('session-time');

// MODAL DE CONFIRMAÇÃO DE EXCLUSÃO
const deleteModal = document.getElementById('delete-confirm-modal');
const deleteModalBackdrop = document.getElementById('delete-modal-backdrop');
const closeDeleteModalBtn = document.getElementById('close-delete-modal-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const deleteModalMsg = document.getElementById('delete-modal-msg');

let plansCache = {};
let availableThemes = [];
let planToDeleteId = null;

// ==========================================
// 1. GUARD: APENAS MEDIADORES OU ADMINS
// ==========================================
const currentRole = sessionStorage.getItem('fluentech_user_role');
if (currentRole && currentRole !== 'mediator' && currentRole !== 'admin') {
    showToast('Acesso restrito a Mediadores.', 'error');
    setTimeout(() => { window.location.href = 'index.html'; }, 800);
}

// ==========================================
// 2. FUNÇÕES DE DATA & CÁLCULO DA SEMANA
// ==========================================
function getWeekIdentifier(date = new Date()) {
    const tempDate = new Date(date.getTime());
    tempDate.setHours(0, 0, 0, 0);
    tempDate.setDate(tempDate.getDate() + 3 - (tempDate.getDay() + 6) % 7);
    const week1 = new Date(tempDate.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((tempDate.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    return `${tempDate.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function getWeekDates() {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diffToMonday));
    const sunday = new Date(now.setDate(diffToMonday + 6));

    const options = { day: '2-digit', month: '2-digit' };
    return {
        formatted: `${monday.toLocaleDateString('pt-BR', options)} a ${sunday.toLocaleDateString('pt-BR', options)}`,
        currentWeekKey: getWeekIdentifier(monday)
    };
}

// ==========================================
// 3. ALTERNÂNCIA DE ABAS (PLANOS x SEMANA)
// ==========================================
tabPlansBtn.addEventListener('click', () => {
    tabPlansBtn.classList.add('active');
    tabWeekBtn.classList.remove('active');
    sectionPlans.classList.remove('hidden');
    sectionWeek.classList.add('hidden');
    openCreatePlanBtn.style.display = 'inline-flex';
});

tabWeekBtn.addEventListener('click', () => {
    tabWeekBtn.classList.add('active');
    tabPlansBtn.classList.remove('active');
    sectionWeek.classList.remove('hidden');
    sectionPlans.classList.add('hidden');
    openCreatePlanBtn.style.display = 'none';
    loadWeeklySessions();
});

// Fechar dropdowns de 3 pontos se clicar fora
document.addEventListener('click', (e) => {
    if (!e.target.closest('.plan-menu-container')) {
        document.querySelectorAll('.dots-dropdown').forEach(el => el.classList.add('hidden'));
    }
});

// ==========================================
// 4. CARREGAR TEMAS DO FIREBASE (/meetings)
// ==========================================
async function loadThemesList() {
    try {
        const snap = await get(ref(database, 'meetings'));
        if (snap.exists()) {
            const data = snap.val();
            availableThemes = Object.keys(data).map(key => ({
                id: key,
                topic: data[key].topic || 'Tema sem título'
            }));
        } else {
            availableThemes = [];
        }
    } catch (err) {
        console.error('Erro ao carregar temas:', err);
    }
}

// ==========================================
// 5. CARREGAR E RENDERIZAR PLANOS
// ==========================================
async function loadPlans() {
    plansGrid.innerHTML = '<p class="loading-state"><i class="fa-solid fa-circle-notch fa-spin"></i> Carregando planos...</p>';
    try {
        const snap = await get(ref(database, 'plans'));
        if (!snap.exists()) {
            plansCache = {};
            plansGrid.innerHTML = '<p class="empty-state">Nenhum plano cadastrado ainda. Clique em "+ Criar plano" para começar!</p>';
            weekCounterBadge.textContent = '0';
            return;
        }

        plansCache = snap.val();
        renderPlansGrid();
    } catch (err) {
        console.error('Erro ao carregar planos:', err);
        plansGrid.innerHTML = '<p class="empty-state">Erro ao carregar planos. Verifique sua conexão.</p>';
    }
}

function renderPlansGrid() {
    plansGrid.innerHTML = '';
    const keys = Object.keys(plansCache);
    let totalSessions = 0;

    keys.forEach(planId => {
        const plan = plansCache[planId];
        const schedules = plan.schedules || [];
        totalSessions += schedules.length;

        const card = document.createElement('div');
        card.className = 'plan-card';

        const schedulesHtml = schedules.map(s => `
            <div class="plan-schedule-item">
                <span><i class="fa-regular fa-clock"></i> ${s.dayName}</span>
                <strong>${s.time}</strong>
            </div>
        `).join('');

        card.innerHTML = `
            <div class="plan-card-header">
                <h3 class="plan-card-title">${plan.name}</h3>
                <div class="plan-menu-container">
                    <button class="three-dots-btn" title="Opções"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                    <div class="dots-dropdown hidden">
                        <button class="dropdown-item edit-plan-action">
                            <i class="fa-solid fa-pen-to-square"></i> Alterar plano
                        </button>
                        <button class="dropdown-item danger delete-plan-action">
                            <i class="fa-solid fa-trash-can"></i> Excluir plano
                        </button>
                    </div>
                </div>
            </div>

            <div class="plan-price-row">
                <span class="plan-price-val">R$ ${parseFloat(plan.price || 0).toFixed(2).replace('.', ',')}</span>
                <span class="plan-price-unit">/mês</span>
            </div>

            <div class="plan-metrics-badge">
                <i class="fa-solid fa-calendar-check"></i> ${plan.sessionsPerWeek || schedules.length} sessões por semana
            </div>

            <div class="plan-schedules-list">
                <span style="font-size: 0.78rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Horários fixos:</span>
                ${schedulesHtml || '<span style="color: var(--text-muted); font-size: 0.85rem;">Nenhum horário definido</span>'}
            </div>
        `;

        // Eventos do menu de 3 pontos
        const dotsBtn = card.querySelector('.three-dots-btn');
        const dropdown = card.querySelector('.dots-dropdown');
        const editBtn = card.querySelector('.edit-plan-action');
        const deleteBtn = card.querySelector('.delete-plan-action');

        dotsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.dots-dropdown').forEach(d => {
                if (d !== dropdown) d.classList.add('hidden');
            });
            dropdown.classList.toggle('hidden');
        });

        editBtn.addEventListener('click', () => {
            dropdown.classList.add('hidden');
            openEditPlanModal(planId, plan);
        });

        deleteBtn.addEventListener('click', () => {
            dropdown.classList.add('hidden');
            openDeletePlanModal(planId, plan.name);
        });

        plansGrid.appendChild(card);
    });

    weekCounterBadge.textContent = totalSessions.toString();
}

// ==========================================
// 6. LINHAS DE HORÁRIO DINÂMICAS NO MODAL
// ==========================================
function createScheduleRow(dayOfWeek = 1, time = "19:00") {
    const row = document.createElement('div');
    row.className = 'schedule-row';

    const daySelect = document.createElement('select');
    daySelect.className = 'schedule-day-select';
    DAYS_OF_WEEK.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.name;
        if (d.id === Number(dayOfWeek)) opt.selected = true;
        daySelect.appendChild(opt);
    });

    const timeInput = document.createElement('input');
    timeInput.type = 'time';
    timeInput.className = 'schedule-time-input';
    timeInput.value = time;
    timeInput.required = true;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-schedule-btn';
    removeBtn.title = 'Remover este horário';
    removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    removeBtn.addEventListener('click', () => row.remove());

    row.appendChild(daySelect);
    row.appendChild(timeInput);
    row.appendChild(removeBtn);
    schedulesContainer.appendChild(row);
}

addScheduleRowBtn.addEventListener('click', () => createScheduleRow());

// ==========================================
// 7. CRIAR / EDITAR / EXCLUIR PLANO
// ==========================================
openCreatePlanBtn.addEventListener('click', () => {
    planModalTitle.textContent = 'Novo Plano';
    editingPlanId.value = '';
    planNameInput.value = '';
    planPriceInput.value = '';
    planSessionsCountInput.value = '2';
    schedulesContainer.innerHTML = '';
    createScheduleRow(1, '19:00');
    createScheduleRow(3, '19:00');
    planModal.classList.remove('hidden');
});

function openEditPlanModal(id, plan) {
    planModalTitle.textContent = 'Alterar Plano';
    editingPlanId.value = id;
    planNameInput.value = plan.name || '';
    planPriceInput.value = plan.price || '';
    planSessionsCountInput.value = plan.sessionsPerWeek || '2';
    schedulesContainer.innerHTML = '';

    if (plan.schedules && plan.schedules.length > 0) {
        plan.schedules.forEach(s => createScheduleRow(s.dayOfWeek, s.time));
    } else {
        createScheduleRow(1, '19:00');
    }

    planModal.classList.remove('hidden');
}

function closePlanModal() {
    planModal.classList.add('hidden');
}

closePlanModalBtn.addEventListener('click', closePlanModal);
planModalBackdrop.addEventListener('click', closePlanModal);
cancelPlanBtn.addEventListener('click', closePlanModal);

planForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = planNameInput.value.trim();
    const price = parseFloat(planPriceInput.value) || 0;
    const sessionsPerWeek = parseInt(planSessionsCountInput.value, 10) || 1;

    // Coletar horários
    const rows = schedulesContainer.querySelectorAll('.schedule-row');
    const schedules = [];
    rows.forEach(r => {
        const daySelect = r.querySelector('.schedule-day-select');
        const timeInput = r.querySelector('.schedule-time-input');
        const dayId = parseInt(daySelect.value, 10);
        const dayObj = DAYS_OF_WEEK.find(d => d.id === dayId);

        schedules.push({
            dayOfWeek: dayId,
            dayName: dayObj ? dayObj.name : 'Dia',
            time: timeInput.value
        });
    });

    const planData = {
        name,
        price,
        sessionsPerWeek,
        schedules,
        updatedAt: new Date().toISOString()
    };

    try {
        const id = editingPlanId.value;
        if (id) {
            await update(ref(database, `plans/${id}`), planData);
            showToast('Plano atualizado com sucesso!');
        } else {
            planData.createdAt = new Date().toISOString();
            await push(ref(database, 'plans'), planData);
            showToast('Plano criado com sucesso!');
        }

        closePlanModal();
        await loadPlans();
    } catch (err) {
        console.error('Erro ao salvar plano:', err);
        showToast('Erro ao salvar plano no Firebase.', 'error');
    }
});

function openDeletePlanModal(id, name) {
    planToDeleteId = id;
    deleteModalMsg.innerHTML = `Tem certeza que deseja excluir o plano <strong>"${name}"</strong>?`;
    deleteModal.classList.remove('hidden');
}

function closeDeleteModal() {
    deleteModal.classList.add('hidden');
    planToDeleteId = null;
}

closeDeleteModalBtn.addEventListener('click', closeDeleteModal);
deleteModalBackdrop.addEventListener('click', closeDeleteModal);
cancelDeleteBtn.addEventListener('click', closeDeleteModal);

confirmDeleteBtn.addEventListener('click', async () => {
    if (!planToDeleteId) return;
    try {
        await remove(ref(database, `plans/${planToDeleteId}`));
        showToast('Plano excluído com sucesso.');
        closeDeleteModal();
        await loadPlans();
    } catch (err) {
        console.error('Erro ao excluir plano:', err);
        showToast('Erro ao excluir plano.', 'error');
    }
});

// ==========================================
// 8. SESSÕES DA SEMANA (ORDEM & TEMAS)
// ==========================================
async function loadWeeklySessions() {
    const { formatted, currentWeekKey } = getWeekDates();
    weekDatesRange.innerHTML = `<i class="fa-regular fa-calendar"></i> ${formatted}`;
    weeklySessionsList.innerHTML = '<p class="loading-state"><i class="fa-solid fa-circle-notch fa-spin"></i> Carregando sessões da semana...</p>';

    try {
        // Buscar sessões já configuradas nesta semana
        const weekSnap = await get(ref(database, `weekly_sessions/${currentWeekKey}`));
        const savedWeekData = weekSnap.exists() ? weekSnap.val() : {};

        // Extrair todas as sessões baseadas em todos os planos ativos
        const sessionItems = [];
        const planKeys = Object.keys(plansCache);

        planKeys.forEach(pId => {
            const plan = plansCache[pId];
            if (plan.schedules && Array.isArray(plan.schedules)) {
                plan.schedules.forEach((sch, idx) => {
                    const sessionKey = `${pId}_sch_${idx}`;
                    const saved = savedWeekData[sessionKey] || {};

                    sessionItems.push({
                        sessionKey,
                        planId: pId,
                        planName: plan.name,
                        dayOfWeek: sch.dayOfWeek,
                        dayName: sch.dayName,
                        time: sch.time,
                        themeId: saved.themeId || '',
                        themeTopic: saved.themeTopic || '',
                        videoLink: saved.videoLink || ''
                    });
                });
            }
        });

        // Ordenar cronologicamente na semana (Segunda a Domingo, depois por hora)
        sessionItems.sort((a, b) => {
            const dayA = a.dayOfWeek === 0 ? 7 : a.dayOfWeek;
            const dayB = b.dayOfWeek === 0 ? 7 : b.dayOfWeek;
            if (dayA !== dayB) return dayA - dayB;
            return a.time.localeCompare(b.time);
        });

        if (sessionItems.length === 0) {
            weeklySessionsList.innerHTML = `
                <p class="empty-state">
                    Nenhuma sessão programada para esta semana.<br>
                    Crie um plano com horários na aba "Planos" para gerenciar as sessões aqui!
                </p>
            `;
            return;
        }

        renderWeeklySessions(sessionItems, currentWeekKey);
    } catch (err) {
        console.error('Erro ao carregar sessões da semana:', err);
        weeklySessionsList.innerHTML = '<p class="empty-state">Erro ao processar a semana.</p>';
    }
}

function renderWeeklySessions(sessions, currentWeekKey) {
    weeklySessionsList.innerHTML = '';

    sessions.forEach(item => {
        const row = document.createElement('div');
        row.className = 'session-row-card';

        const hasTheme = Boolean(item.themeTopic);
        const hasVideo = Boolean(item.videoLink);

        row.innerHTML = `
            <div class="session-time-block">
                <div class="session-day-icon">
                    <i class="fa-solid fa-comments"></i>
                </div>
                <div>
                    <h4 class="session-day-name">${item.dayName}</h4>
                    <p class="session-hour"><i class="fa-regular fa-clock"></i> ${item.time}</p>
                    <span class="session-plan-tag">${item.planName}</span>
                </div>
            </div>

            <div class="session-theme-block">
                <div class="theme-label">Tema anexado</div>
                <div class="theme-title-display ${hasTheme ? '' : 'no-theme'}">
                    <i class="fa-solid fa-book-open"></i>
                    ${hasTheme ? item.themeTopic : 'Sem tema definido nesta sessão'}
                </div>
            </div>

            <div class="session-actions-block">
                ${hasVideo ? `
                    <a href="${item.videoLink}" target="_blank" rel="noopener noreferrer" class="btn-video-link" title="Abrir videoconferência">
                        <i class="fa-solid fa-video"></i> Entrar na sala
                    </a>
                ` : ''}
                <button class="btn-edit-session" data-key="${item.sessionKey}">
                    <i class="fa-solid fa-sliders"></i> ${hasTheme || hasVideo ? 'Editar Sessão' : 'Configurar Tema / Link'}
                </button>
            </div>
        `;

        const editBtn = row.querySelector('.btn-edit-session');
        editBtn.addEventListener('click', () => {
            openEditSessionModal(item, currentWeekKey);
        });

        weeklySessionsList.appendChild(row);
    });
}

// ==========================================
// 9. CONFIGURAR SESSÃO (TEMA & LINK MEET/ZOOM)
// ==========================================
function openEditSessionModal(item, currentWeekKey) {
    sessionPlanId.value = item.planId;
    sessionScheduleId.value = item.sessionKey;
    sessionDayName.value = item.dayName;
    sessionTime.value = item.time;
    sessionVideoLinkInput.value = item.videoLink || '';

    sessionSummaryBox.innerHTML = `
        <strong style="color: #ffffff; font-size: 1rem;">${item.dayName} às ${item.time}</strong><br>
        <span style="color: var(--text-secondary); font-size: 0.85rem;">Plano: ${item.planName}</span>
    `;

    // Preencher Select com temas reais do Firebase
    sessionThemeSelect.innerHTML = '<option value="">-- Sem tema definido --</option>';
    availableThemes.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.topic;
        if (t.id === item.themeId || t.topic === item.themeTopic) {
            opt.selected = true;
        }
        sessionThemeSelect.appendChild(opt);
    });

    sessionEditModal.dataset.weekKey = currentWeekKey;
    sessionEditModal.classList.remove('hidden');
}

function closeSessionModal() {
    sessionEditModal.classList.add('hidden');
}

closeSessionModalBtn.addEventListener('click', closeSessionModal);
sessionModalBackdrop.addEventListener('click', closeSessionModal);
cancelSessionBtn.addEventListener('click', closeSessionModal);

sessionForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const weekKey = sessionEditModal.dataset.weekKey;
    const sessionKey = sessionScheduleId.value;
    const themeId = sessionThemeSelect.value;
    const selectedThemeObj = availableThemes.find(t => t.id === themeId);
    const themeTopic = selectedThemeObj ? selectedThemeObj.topic : '';
    const videoLink = sessionVideoLinkInput.value.trim();

    try {
        const updatePath = `weekly_sessions/${weekKey}/${sessionKey}`;
        await update(ref(database, updatePath), {
            themeId,
            themeTopic,
            videoLink,
            updatedAt: new Date().toISOString()
        });

        showToast('Sessão configurada com sucesso!');
        closeSessionModal();
        await loadWeeklySessions();
    } catch (err) {
        console.error('Erro ao salvar sessão da semana:', err);
        showToast('Erro ao atualizar a sessão.', 'error');
    }
});

// ==========================================
// 10. INICIALIZAÇÃO
// ==========================================
(async function init() {
    await loadThemesList();
    await loadPlans();
})();