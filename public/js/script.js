import { initAuthGuard } from "./auth.js";
import { database, auth } from "./firebase.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Inicializa a proteção de autenticação
if (typeof initAuthGuard === 'function') {
    initAuthGuard();
}

// 1. Botões da Barra Lateral / Home
const homeSetMeeting = document.getElementById('home-set-meeting');
const homeStartMeeting = document.getElementById('home-start-meeting');
const homeFlashCards = document.getElementById('home-flash-cards');

homeSetMeeting?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'set-meeting.html';
});

homeStartMeeting?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'presentation.html';
});

homeFlashCards?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'flash-cards.html';
});

// ==========================================================================
// 2. LÓGICA DA SEÇÃO "ESSA SEMANA" DO PARTICIPANTE
// ==========================================================================
const weekGrid = document.getElementById('week-grid');

// Elementos do Modal de Preparação
const prepModal = document.getElementById('topic-preparation-modal');
const closePrepModalBtn = document.getElementById('close-prep-modal-btn');
const prepTopicTitle = document.getElementById('prep-topic-title');
const prepSessionTime = document.getElementById('prep-session-time');
const prepSessionPlan = document.getElementById('prep-session-plan');
const prepMeetBanner = document.getElementById('prep-meet-banner');
const prepMeetLinkBtn = document.getElementById('prep-meet-link-btn');
const prepQuestionsList = document.getElementById('prep-questions-list');

const DAYS_CONFIG = [
    { id: 1, short: "Seg", full: "Segunda-feira" },
    { id: 2, short: "Ter", full: "Terça-feira" },
    { id: 3, short: "Qua", full: "Quarta-feira" },
    { id: 4, short: "Qui", full: "Quinta-feira" },
    { id: 5, short: "Sex", full: "Sexta-feira" },
    { id: 6, short: "Sáb", full: "Sábado" },
    { id: 0, short: "Dom", full: "Domingo" }
];

// Calcula dias e chave da semana atual (Segunda a Domingo)
function getCurrentWeekDays() {
    const now = new Date();
    const currentDay = now.getDay();
    const diffToMonday = now.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
    
    const monday = new Date(now.getFullYear(), now.getMonth(), diffToMonday);
    const weekKey = `${monday.getFullYear()}-W${String(Math.ceil((monday.getDate() + 6) / 7)).padStart(2, '0')}`;

    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
        const dayOfWeek = d.getDay();
        const config = DAYS_CONFIG.find(c => c.id === dayOfWeek);
        days.push({
            date: d,
            dayOfWeek: dayOfWeek,
            weekdayShort: config ? config.short : "Dia",
            monthday: d.getDate()
        });
    }
    return { days, weekKey };
}

// Carrega as sessões do participante logado
async function loadStudentWeekSessions(user) {
    if (!weekGrid) return;

    try {
        // 1. Busca os dados do usuário para verificar o plano
        const userSnap = await get(ref(database, `users/${user.uid}`));
        if (!userSnap.exists()) {
            renderNoPlanMessage("Perfil de usuário não encontrado.");
            return;
        }

        const userData = userSnap.val();
        const planId = userData.planId || userData.plan;

        if (!planId) {
            renderNoPlanMessage("Você ainda não possui um plano de assinatura ativo. Entre em contato com a equipe para liberar sua agenda semanal!");
            return;
        }

        // 2. Busca o plano do usuário, os temas (/meetings) e a agenda da semana (/weekly_sessions)
        const { days: weekDays, weekKey } = getCurrentWeekDays();

        const [planSnap, weekSnap, meetingsSnap] = await Promise.all([
            get(ref(database, `plans/${planId}`)),
            get(ref(database, `weekly_sessions/${weekKey}`)),
            get(ref(database, 'meetings'))
        ]);

        if (!planSnap.exists()) {
            renderNoPlanMessage("O seu plano configurado não foi encontrado no sistema.");
            return;
        }

        const plan = planSnap.val();
        const weeklySessionsData = weekSnap.exists() ? weekSnap.val() : {};
        const allMeetings = meetingsSnap.exists() ? meetingsSnap.val() : {};

        // 3. Monta as sessões do plano nesta semana
        const userSessions = [];
        if (plan.sessions && Array.isArray(plan.sessions)) {
            plan.sessions.forEach((sess, sIdx) => {
                const matchingDay = weekDays.find(w => w.dayOfWeek === Number(sess.dayOfWeek));
                if (matchingDay) {
                    const sessionKey = `${planId}_${sess.dayOfWeek}_${sIdx}`;
                    const savedState = weeklySessionsData[sessionKey] || {};

                    // Encontra o tema e suas perguntas
                    const topicId = savedState.themeId || savedState.topicId;
                    const topicObj = topicId ? allMeetings[topicId] : null;

                    userSessions.push({
                        sessionKey,
                        planName: plan.name,
                        weekdayShort: matchingDay.weekdayShort,
                        monthday: matchingDay.monthday,
                        dayOfWeekOrder: matchingDay.dayOfWeek === 0 ? 7 : matchingDay.dayOfWeek,
                        startTime: sess.startTime || "18:00",
                        endTime: sess.endTime || "18:50",
                        topicTitle: savedState.themeTopic || savedState.topicTitle || (topicObj ? topicObj.topic : 'Nenhum tópico selecionado'),
                        topicQuestions: topicObj ? (topicObj.questions || []) : [],
                        meetLink: savedState.videoLink || savedState.meetLink || ''
                    });
                }
            });
        }

        // Ordena cronologicamente
        userSessions.sort((a, b) => {
            if (a.dayOfWeekOrder !== b.dayOfWeekOrder) {
                return a.dayOfWeekOrder - b.dayOfWeekOrder;
            }
            return a.startTime.localeCompare(b.startTime);
        });

        renderWeekSessions(userSessions);

    } catch (err) {
        console.error("Erro ao carregar sessões do participante:", err);
        weekGrid.innerHTML = `<p style="color: #ff5252; text-align: center; padding: 20px;">Erro ao carregar agenda semanal.</p>`;
    }
}

// Renderiza a lista de cards
function renderWeekSessions(sessions) {
    weekGrid.innerHTML = '';

    if (sessions.length === 0) {
        weekGrid.innerHTML = `
            <div style="color: var(--text-secondary); text-align: center; padding: 30px; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px solid var(--border-color);">
                <p>Nenhuma sessão cadastrada para seu plano nesta semana.</p>
            </div>
        `;
        return;
    }

    sessions.forEach(session => {
        const card = document.createElement('div');
        card.className = 'weekdayCard';

        const hasMeetLink = Boolean(session.meetLink);

        card.innerHTML = `
            <div class="outside">
                <p class="weekday">${session.weekdayShort}</p>
                <p class="monthday">${session.monthday}</p>
            </div>
            <div class="weekdayCard content">
                <div class="weekcard-hover"></div>
                <p class="topic">${session.topicTitle}</p>
                <p class="showOnHover"><i class="fa-solid fa-book-open"></i> Ver perguntas de preparação</p>
                <p class="time">
                    ${hasMeetLink ? `
                        <a href="${session.meetLink}" target="_blank" rel="noopener noreferrer" class="direct-meet-btn" title="Entrar na sala">
                            <i class="fa-solid fa-video"></i> Entrar
                        </a>
                    ` : ''}
                    <span>${session.startTime} - ${session.endTime}</span>
                    <span class="plan-badge">${session.planName}</span>
                </p>
            </div>
        `;

        // Previne abrir o modal ao clicar diretamente no link da chamada
        const meetBtn = card.querySelector('.direct-meet-btn');
        if (meetBtn) {
            meetBtn.addEventListener('click', (e) => e.stopPropagation());
        }

        // Clique no card abre o modal com as perguntas de preparação
        card.querySelector('.weekdayCard.content').addEventListener('click', () => {
            openPreparationModal(session);
        });

        weekGrid.appendChild(card);
    });
}

function renderNoPlanMessage(message) {
    weekGrid.innerHTML = `
        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 14px; padding: 26px; text-align: center;">
            <i class="fa-solid fa-gem" style="font-size: 2rem; color: var(--third-color); margin-bottom: 12px;"></i>
            <p style="color: var(--text-secondary); font-size: 0.95rem; margin: 0;">${message}</p>
        </div>
    `;
}

// ==========================================================================
// 3. MODAL DE PREPARAÇÃO DO TEMA (PERGUNTAS)
// ==========================================================================
function openPreparationModal(session) {
    prepTopicTitle.textContent = session.topicTitle;
    prepSessionTime.innerHTML = `<i class="fa-regular fa-clock"></i> ${session.weekdayShort} às ${session.startTime} - ${session.endTime}`;
    prepSessionPlan.textContent = session.planName;

    // Configura o botão do Meet
    if (session.meetLink) {
        prepMeetBanner.classList.remove('hidden');
        prepMeetLinkBtn.href = session.meetLink;
    } else {
        prepMeetBanner.classList.add('hidden');
    }

    // Renderiza as perguntas cadastradas
    prepQuestionsList.innerHTML = '';
    const questions = session.topicQuestions || [];

    if (questions.length > 0) {
        questions.forEach((q, index) => {
            const qCard = document.createElement('div');
            qCard.className = 'prep-question-card';
            qCard.innerHTML = `
                <div class="prep-question-num">${index + 1}</div>
                <p class="prep-question-text">${q}</p>
            `;
            prepQuestionsList.appendChild(qCard);
        });
    } else {
        prepQuestionsList.innerHTML = `
            <div class="prep-empty-msg">
                <i class="fa-regular fa-comment-dots" style="font-size: 1.8rem; margin-bottom: 10px; display: block; color: var(--text-muted);"></i>
                O mediador ainda está preparando as perguntas para este tema. Volte em breve para conferir!
            </div>
        `;
    }

    prepModal.classList.remove('hidden');
}

function closePreparationModal() {
    prepModal.classList.add('hidden');
}

closePrepModalBtn?.addEventListener('click', closePreparationModal);
prepModal?.addEventListener('click', (e) => {
    if (e.target === prepModal) closePreparationModal();
});

// ==========================================================================
// 4. INICIALIZAÇÃO
// ==========================================================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        loadStudentWeekSessions(user);
    }
});