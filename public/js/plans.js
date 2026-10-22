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

// ==========================================================================
// 1. CONSTANTES E CONFIGURAÇÕES DE DIAS
// ==========================================================================
const DAYS_CONFIG = [
    { id: 1, short: "Seg", full: "Segunda-feira" },
    { id: 2, short: "Ter", full: "Terça-feira" },
    { id: 3, short: "Qua", full: "Quarta-feira" },
    { id: 4, short: "Qui", full: "Quinta-feira" },
    { id: 5, short: "Sex", full: "Sexta-feira" },
    { id: 6, short: "Sáb", full: "Sábado" },
    { id: 0, short: "Dom", full: "Domingo" }
];

// ELEMENTOS DE NAVEGAÇÃO ENTRE ABAS
const tabPlanBtn = document.getElementById('plans-options-plan');
const tabWeekBtn = document.getElementById('plans-options-week');
const plansGrid = document.getElementById('plans-grid');
const weekGrid = document.getElementById('week-grid');

// CACHE EM MEMÓRIA
let plansData = {};
let availableTopics = []; // Puxado de /meetings
let currentWeekSchedule = {}; // Puxado de /weekly_sessions/{weekKey}
let currentWeekKey = '';

// ==========================================================================
// 2. ALTERNÂNCIA DE ABAS (PLANOS x SEMANA)
// ==========================================================================
tabPlanBtn.addEventListener('click', () => {
    tabPlanBtn.classList.add('selected');
    tabWeekBtn.classList.remove('selected');
    plansGrid.classList.remove('hidden');
    weekGrid.classList.add('hidden');
});

tabWeekBtn.addEventListener('click', () => {
    tabWeekBtn.classList.add('selected');
    tabPlanBtn.classList.remove('selected');
    weekGrid.classList.remove('hidden');
    plansGrid.classList.add('hidden');
    renderWeekGrid();
});

// ==========================================================================
// 3. CÁLCULO DOS DIAS DA SEMANA ATUAL (SEGUNDA A DOMINGO)
// ==========================================================================
function getCurrentWeekDays() {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Dom, 1 = Seg...
    // Segunda-feira como início da semana
    const diffToMonday = now.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
    
    const monday = new Date(now.getFullYear(), now.getMonth(), diffToMonday);
    currentWeekKey = `${monday.getFullYear()}-W${String(Math.ceil((monday.getDate() + 6) / 7)).padStart(2, '0')}`;

    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
        const dayOfWeek = d.getDay();
        const config = DAYS_CONFIG.find(c => c.id === dayOfWeek);
        days.push({
            date: d,
            dayOfWeek: dayOfWeek,
            weekdayShort: config ? config.short : "Dia",
            weekdayFull: config ? config.full : "Dia",
            monthday: d.getDate(),
            dateFormatted: d.toLocaleDateString('pt-BR')
        });
    }
    return days;
}

// ==========================================================================
// 4. CARREGAR DADOS DO FIREBASE
// ==========================================================================
async function loadExistingTopics() {
    try {
        const snap = await get(ref(database, 'meetings'));
        if (snap.exists()) {
            const data = snap.val();
            availableTopics = Object.keys(data).map(key => ({
                id: key,
                topic: data[key].topic || 'Tema sem título'
            }));
        }
    } catch (err) {
        console.error('Erro ao buscar temas:', err);
    }
}

async function loadPlans() {
    try {
        const snap = await get(ref(database, 'plans'));
        plansData = snap.exists() ? snap.val() : {};
        renderPlansGrid();
        await loadWeeklySessionData();
    } catch (err) {
        console.error('Erro ao buscar planos:', err);
    }
}

async function loadWeeklySessionData() {
    try {
        getCurrentWeekDays();
        const snap = await get(ref(database, `weekly_sessions/${currentWeekKey}`));
        currentWeekSchedule = snap.exists() ? snap.val() : {};
        renderWeekGrid();
    } catch (err) {
        console.error('Erro ao buscar agenda da semana:', err);
    }
}

// ==========================================================================
// 5. RENDERIZAÇÃO DA GRADE DE PLANOS (#plans-grid)
// ==========================================================================
function renderPlansGrid() {
    if (!plansGrid) return;
    
    // Mantém o botão de adicionar como o primeiro card
    plansGrid.innerHTML = `
        <div class="plan-card" id="add-plan-btn" style="cursor: pointer;">
            <i class="fa-solid fa-circle-plus"></i>
        </div>
    `;

    document.getElementById('add-plan-btn').addEventListener('click', () => {
        openPlanModal();
    });

    const planIds = Object.keys(plansData);
    planIds.forEach(id => {
        const plan = plansData[id];
        const card = document.createElement('div');
        card.className = 'plan-card';

        const formattedPrice = parseFloat(plan.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 });

        card.innerHTML = `
            <div class="hover-circle"></div>
            <div class="open-plan-options" title="Opções do plano">
                <i class="fa-solid fa-ellipsis-vertical"></i>
            </div>
            <div class="plan-card-content">
                <h3 class="plan-card-title">${plan.name}</h3>
                <div class="plan-card-price">R$ ${formattedPrice} <span>\\mês</span></div>
                <p class="plan-card-description">${plan.description || `${(plan.sessions || []).length} sessões semanais.`}</p>
            </div>
        `;

        // Clique no conteúdo do card abre edição
        card.querySelector('.plan-card-content').addEventListener('click', () => {
            openPlanModal(id, plan);
        });

        // Clique no botão de 3 pontos
        const optionsBtn = card.querySelector('.open-plan-options');
        optionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showPlanActionMenu(e, id, plan);
        });

        plansGrid.appendChild(card);
    });
}

// ==========================================================================
// 6. RENDERIZAÇÃO DA SEMANA (#week-grid)
// ==========================================================================
function renderWeekGrid() {
    if (!weekGrid) return;
    weekGrid.innerHTML = '';

    const weekDays = getCurrentWeekDays();
    const sessionsList = [];

    // Mapeia todas as sessões cadastradas nos planos ativos
    Object.keys(plansData).forEach(planId => {
        const plan = plansData[planId];
        if (plan.sessions && Array.isArray(plan.sessions)) {
            plan.sessions.forEach((sess, sIdx) => {
                // Encontra a data dessa semana correspondente ao dia da semana da sessão
                const matchingDay = weekDays.find(w => w.dayOfWeek === Number(sess.dayOfWeek));
                if (matchingDay) {
                    const sessionKey = `${planId}_${sess.dayOfWeek}_${sIdx}`;
                    const savedState = currentWeekSchedule[sessionKey] || {};

                    sessionsList.push({
                        sessionKey: sessionKey,
                        planId: planId,
                        planName: plan.name,
                        weekdayShort: matchingDay.weekdayShort,
                        monthday: matchingDay.monthday,
                        dayOfWeekOrder: matchingDay.dayOfWeek === 0 ? 7 : matchingDay.dayOfWeek,
                        startTime: sess.startTime || "18:00",
                        endTime: sess.endTime || "18:50",
                        topicId: savedState.topicId || '',
                        topicTitle: savedState.topicTitle || 'Nenhum tópico selecionado',
                        meetLink: savedState.meetLink || ''
                    });
                }
            });
        }
    });

    // Ordenação cronológica (Segunda a Domingo, depois por horário)
    sessionsList.sort((a, b) => {
        if (a.dayOfWeekOrder !== b.dayOfWeekOrder) {
            return a.dayOfWeekOrder - b.dayOfWeekOrder;
        }
        return a.startTime.localeCompare(b.startTime);
    });

    if (sessionsList.length === 0) {
        weekGrid.innerHTML = `
            <div style="color: var(--text-secondary); text-align: center; padding: 40px;">
                <p>Nenhuma sessão configurada para esta semana.</p>
                <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 6px;">
                    Crie um plano com horários na aba "Planos" para gerenciar as sessões da semana.
                </p>
            </div>
        `;
        return;
    }

    sessionsList.forEach(session => {
        const card = document.createElement('div');
        card.className = 'weekdayCard';
        card.id = `session-${session.sessionKey}`;

        card.innerHTML = `
            <div class="outside">
                <p class="weekday">${session.weekdayShort}</p>
                <p class="monthday">${session.monthday}</p>
            </div>
            <div class="weekdayCard content" style="cursor: pointer;">
                <div class="weekcard-hover"></div>
                <p class="topic">${session.topicTitle}</p>
                <p class="showOnHover">Clique para alterar</p>
                <p class="time">
                    ${session.startTime} - ${session.endTime} 
                    <span class="plan-badge">${session.planName}</span>
                </p>
            </div>
        `;

        // Ao clicar no card, abre modal para selecionar tema de /meetings
        card.querySelector('.weekdayCard.content').addEventListener('click', () => {
            openTopicSelectModal(session);
        });

        weekGrid.appendChild(card);
    });
}

// ==========================================================================
// 7. MODAIS DINÂMICOS (INJETADOS AUTOMATICAMENTE SE NÃO EXISTIREM)
// ==========================================================================

// Injeta estrutura de modais no DOM
function ensureModalsExist() {
    if (document.getElementById('fc-plans-modal')) return;

    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = `
        <!-- MODAL DE CRIAR / EDITAR PLANO -->
        <div id="fc-plans-modal" class="fc-modal-backdrop hidden">
            <div class="fc-modal-box">
                <div class="fc-modal-header">
                    <h3 id="fc-plan-modal-title">Configurar Plano</h3>
                    <button class="fc-close-btn" id="fc-close-plan-modal">&times;</button>
                </div>
                <form id="fc-plan-form">
                    <input type="hidden" id="fc-plan-id" value="">
                    
                    <div class="fc-form-group">
                        <label>Nome do Plano</label>
                        <input type="text" id="fc-plan-name" placeholder="Ex: Double Circle" required>
                    </div>

                    <div class="fc-form-row">
                        <div class="fc-form-group">
                            <label>Preço Mensal (R$)</label>
                            <input type="number" id="fc-plan-price" min="0" step="0.01" placeholder="Ex: 59.90" required>
                        </div>
                        <div class="fc-form-group">
                            <label>Descrição Curta</label>
                            <input type="text" id="fc-plan-desc" placeholder="Ex: 2 sessões semanais.">
                        </div>
                    </div>

                    <div class="fc-form-group">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <label>Sessões Oferecidas (Dia e Horário)</label>
                            <button type="button" id="fc-add-session-time-btn" class="fc-link-btn">+ Adicionar Horário</button>
                        </div>
                        <div id="fc-sessions-schedule-list"></div>
                    </div>

                    <div class="fc-modal-footer">
                        <button type="button" class="fc-btn-secondary" id="fc-cancel-plan-btn">Cancelar</button>
                        <button type="submit" class="fc-btn-primary">Salvar Plano</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- MODAL DE SELEÇÃO DE TEMA PARA A SESSÃO DA SEMANA -->
        <div id="fc-topic-modal" class="fc-modal-backdrop hidden">
            <div class="fc-modal-box">
                <div class="fc-modal-header">
                    <h3>Vincular Tema à Sessão</h3>
                    <button class="fc-close-btn" id="fc-close-topic-modal">&times;</button>
                </div>
                <form id="fc-topic-form">
                    <input type="hidden" id="fc-topic-session-key">
                    
                    <div id="fc-topic-session-info" style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 16px; padding: 10px 14px; background: rgba(255,255,255,0.04); border-radius: 8px; border-left: 3px solid var(--third-color);"></div>

                    <div class="fc-form-group">
                        <label>Selecione um Tema Cadastrado</label>
                        <select id="fc-topic-select" required>
                            <option value="">-- Selecione o tema da conversa --</option>
                        </select>
                    </div>

                    <div class="fc-form-group">
                        <label>Link da Chamada (Google Meet / Zoom)</label>
                        <input type="url" id="fc-topic-meet-link" placeholder="https://meet.google.com/...">
                    </div>

                    <div class="fc-modal-footer">
                        <button type="button" class="fc-btn-secondary" id="fc-clear-topic-btn">Desvincular Tema</button>
                        <button type="submit" class="fc-btn-primary">Confirmar</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- MENU FLUTUANTE DE AÇÕES DO PLANO -->
        <div id="fc-plan-actions-dropdown" class="fc-dropdown hidden">
            <button class="fc-dropdown-item" id="fc-action-edit"><i class="fa-solid fa-pen-to-square"></i> Editar</button>
            <button class="fc-dropdown-item danger" id="fc-action-delete"><i class="fa-solid fa-trash-can"></i> Excluir</button>
        </div>
    `;

    document.body.appendChild(modalContainer);

    // Eventos de Fechamento
    document.getElementById('fc-close-plan-modal').onclick = closePlanModal;
    document.getElementById('fc-cancel-plan-btn').onclick = closePlanModal;
    document.getElementById('fc-close-topic-modal').onclick = closeTopicModal;

    // Submissão do Plano
    document.getElementById('fc-plan-form').onsubmit = handleSavePlan;

    // Submissão do Tema na Semana
    document.getElementById('fc-topic-form').onsubmit = handleSaveTopicToSession;
    document.getElementById('fc-clear-topic-btn').onclick = handleClearTopicFromSession;

    // Adicionar linha de horário
    document.getElementById('fc-add-session-time-btn').onclick = () => addScheduleRow();

    // Fechar dropdown de opções se clicar fora
    document.addEventListener('click', () => {
        const drop = document.getElementById('fc-plan-actions-dropdown');
        if (drop) drop.classList.add('hidden');
    });
}

// ==========================================================================
// 8. LÓGICA DO MODAL DE PLANOS
// ==========================================================================
function openPlanModal(id = '', plan = null) {
    ensureModalsExist();
    const modal = document.getElementById('fc-plans-modal');
    const title = document.getElementById('fc-plan-modal-title');
    const idInput = document.getElementById('fc-plan-id');
    const nameInput = document.getElementById('fc-plan-name');
    const priceInput = document.getElementById('fc-plan-price');
    const descInput = document.getElementById('fc-plan-desc');
    const list = document.getElementById('fc-sessions-schedule-list');

    list.innerHTML = '';

    if (id && plan) {
        title.textContent = 'Editar Plano';
        idInput.value = id;
        nameInput.value = plan.name || '';
        priceInput.value = plan.price || '';
        descInput.value = plan.description || '';
        if (plan.sessions && plan.sessions.length > 0) {
            plan.sessions.forEach(s => addScheduleRow(s.dayOfWeek, s.startTime, s.endTime));
        } else {
            addScheduleRow(1, '18:00', '18:50');
        }
    } else {
        title.textContent = 'Novo Plano';
        idInput.value = '';
        nameInput.value = '';
        priceInput.value = '';
        descInput.value = '';
        addScheduleRow(1, '18:00', '18:50');
        addScheduleRow(3, '18:00', '18:50');
    }

    modal.classList.remove('hidden');
}

function closePlanModal() {
    const modal = document.getElementById('fc-plans-modal');
    if (modal) modal.classList.add('hidden');
}

function addScheduleRow(dayOfWeek = 1, startTime = '18:00', endTime = '18:50') {
    const list = document.getElementById('fc-sessions-schedule-list');
    const row = document.createElement('div');
    row.className = 'fc-schedule-row';

    const daySelect = document.createElement('select');
    daySelect.className = 'fc-schedule-day';
    DAYS_CONFIG.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.full;
        if (d.id === Number(dayOfWeek)) opt.selected = true;
        daySelect.appendChild(opt);
    });

    const startInput = document.createElement('input');
    startInput.type = 'time';
    startInput.className = 'fc-schedule-start';
    startInput.value = startTime;

    const endInput = document.createElement('input');
    endInput.type = 'time';
    endInput.className = 'fc-schedule-end';
    endInput.value = endTime;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'fc-remove-row-btn';
    removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    removeBtn.onclick = () => row.remove();

    row.appendChild(daySelect);
    row.appendChild(startInput);
    row.appendChild(endInput);
    row.appendChild(removeBtn);
    list.appendChild(row);
}

async function handleSavePlan(e) {
    e.preventDefault();
    const id = document.getElementById('fc-plan-id').value;
    const name = document.getElementById('fc-plan-name').value.trim();
    const price = parseFloat(document.getElementById('fc-plan-price').value) || 0;
    const description = document.getElementById('fc-plan-desc').value.trim();

    const rows = document.querySelectorAll('.fc-schedule-row');
    const sessions = [];
    rows.forEach(r => {
        sessions.push({
            dayOfWeek: parseInt(r.querySelector('.fc-schedule-day').value, 10),
            startTime: r.querySelector('.fc-schedule-start').value || '18:00',
            endTime: r.querySelector('.fc-schedule-end').value || '18:50'
        });
    });

    const planPayload = {
        name,
        price,
        description: description || `${sessions.length} sessões semanais.`,
        sessions,
        updatedAt: new Date().toISOString()
    };

    try {
        if (id) {
            await update(ref(database, `plans/${id}`), planPayload);
            if (typeof showToast === 'function') showToast('Plano atualizado com sucesso!');
        } else {
            planPayload.createdAt = new Date().toISOString();
            await push(ref(database, 'plans'), planPayload);
            if (typeof showToast === 'function') showToast('Plano criado com sucesso!');
        }
        closePlanModal();
        await loadPlans();
    } catch (err) {
        console.error('Erro ao salvar plano:', err);
        alert('Erro ao salvar plano.');
    }
}

// Menu de 3 Pontos (Editar / Excluir)
let activePlanOptionId = null;
let activePlanOptionData = null;

function showPlanActionMenu(e, id, plan) {
    ensureModalsExist();
    activePlanOptionId = id;
    activePlanOptionData = plan;

    const dropdown = document.getElementById('fc-plan-actions-dropdown');
    dropdown.style.top = `${e.clientY + 10}px`;
    dropdown.style.left = `${e.clientX - 100}px`;
    dropdown.classList.remove('hidden');

    document.getElementById('fc-action-edit').onclick = () => {
        dropdown.classList.add('hidden');
        openPlanModal(activePlanOptionId, activePlanOptionData);
    };

    document.getElementById('fc-action-delete').onclick = async () => {
        dropdown.classList.add('hidden');
        if (confirm(`Tem certeza que deseja excluir o plano "${plan.name}"?`)) {
            await remove(ref(database, `plans/${id}`));
            if (typeof showToast === 'function') showToast('Plano excluído.');
            await loadPlans();
        }
    };
}

// ==========================================================================
// 9. LÓGICA DE SELEÇÃO DE TEMAS PARA A SEMANA
// ==========================================================================
function openTopicSelectModal(session) {
    ensureModalsExist();
    const modal = document.getElementById('fc-topic-modal');
    const sessionKeyInput = document.getElementById('fc-topic-session-key');
    const infoBox = document.getElementById('fc-topic-session-info');
    const select = document.getElementById('fc-topic-select');
    const meetInput = document.getElementById('fc-topic-meet-link');

    sessionKeyInput.value = session.sessionKey;
    infoBox.innerHTML = `
        <strong>${session.weekdayShort} (${session.monthday}) às ${session.startTime}</strong><br>
        Plano: <span style="color: var(--third-color);">${session.planName}</span>
    `;

    // Popula o select com os temas reais de /meetings
    select.innerHTML = '<option value="">-- Selecione o tema da conversa --</option>';
    availableTopics.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.topic;
        if (t.id === session.topicId || t.topic === session.topicTitle) {
            opt.selected = true;
        }
        select.appendChild(opt);
    });

    meetInput.value = session.meetLink || '';
    modal.classList.remove('hidden');
}

function closeTopicModal() {
    const modal = document.getElementById('fc-topic-modal');
    if (modal) modal.classList.add('hidden');
}

async function handleSaveTopicToSession(e) {
    e.preventDefault();
    const sessionKey = document.getElementById('fc-topic-session-key').value;
    const select = document.getElementById('fc-topic-select');
    const meetLink = document.getElementById('fc-topic-meet-link').value.trim();

    const topicId = select.value;
    const selectedOption = select.options[select.selectedIndex];
    const topicTitle = topicId ? selectedOption.textContent : 'Nenhum tópico selecionado';

    try {
        await update(ref(database, `weekly_sessions/${currentWeekKey}/${sessionKey}`), {
            topicId,
            topicTitle,
            meetLink,
            updatedAt: new Date().toISOString()
        });

        if (typeof showToast === 'function') showToast('Tema vinculado à sessão!');
        closeTopicModal();
        await loadWeeklySessionData();
    } catch (err) {
        console.error('Erro ao salvar tema da semana:', err);
    }
}

async function handleClearTopicFromSession() {
    const sessionKey = document.getElementById('fc-topic-session-key').value;
    try {
        await remove(ref(database, `weekly_sessions/${currentWeekKey}/${sessionKey}`));
        if (typeof showToast === 'function') showToast('Tema desvinculado.');
        closeTopicModal();
        await loadWeeklySessionData();
    } catch (err) {
        console.error('Erro ao desvincular tema:', err);
    }
}

// ==========================================================================
// 10. INICIALIZAÇÃO
// ==========================================================================
(async function init() {
    ensureModalsExist();
    await loadExistingTopics();
    await loadPlans();
})();