import {
    ref,
    get,
    set,
    update
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { database, auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { showToast } from "./auth.js";

// Elementos da Página
const meetingsContent = document.getElementById('meetings-content');
const flashCardsContent = document.getElementById('flash-cards-content');
const sessionsGrid = document.getElementById('sessions-grid');
const loadingGif = document.querySelector('.loading-gif');
const backToMeetings = document.getElementById('back-to-meetings-btn');
const currentMeetingTitle = document.getElementById('current-meeting-title');

const flashCardsSetupContent = document.querySelector('.flash-cards-setup-content');
const flashCardsStudyContent = document.querySelector('.flash-cards-study-content');
const cardsContainer = document.getElementById('flash-cards-container');
const previousCardBtn = document.getElementById('previousCard');
const restartCardsBtn = document.getElementById('restart-cards-btn');
const progressBar = document.getElementById('progress-bar');
const playBtn = document.getElementById('play-cards-btn');

let currentUser = null;
let userRole = 'student';
let availableSessions = {};
let currentSessionBeingStudied = null;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;         // 1 Dia (24h)
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;          // 7 Dias (1 Semana)
const THIRTY_DAYS_MS = 30 * ONE_DAY_MS; 

if (backToMeetings) {
    backToMeetings.onclick = () => {
        flashCardsContent.classList.add('hidden');
        meetingsContent.classList.remove('hidden');
        cardsContainer.innerHTML = '';
        progressBar.innerHTML = '';
        loadSessionsForUser(); // Atualiza os percentuais de maestria ao voltar
    };
}

const logo = document.getElementById('logo');
if (logo) {
    logo.onclick = () => { window.location.href = 'index.html'; };
}

/**
 * 1. Autenticação e Inicialização
 */
onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    currentUser = user;
    userRole = sessionStorage.getItem('fluentech_user_role') || 'student';

    await loadSessionsForUser();
});

/**
 * 2. Calcula o Estado da Curva do Esquecimento para uma Sessão
 */
/**
 * 2. Avalia as revisões baseando-se estritamente na data atual (Date.now()) 
 *    e no horário em que a sessão ocorreu (session.startedAt).
 */
function calculateSRSStatus(session, reviewData) {
    const sessionTime = new Date(session.startedAt || 0).getTime();
    const now = Date.now();
    const elapsed = now - sessionTime; // Tempo transcorrido desde a sessão

    const stage = reviewData?.stage || 0; // 0 = Nenhum, 1 = 1d, 2 = 7d, 3 = 30d

    let targetStage = stage + 1;
    let isDue = false;
    let timeRemainingText = '';
    let targetStageName = '';
    let progressPercent = 0;

    if (stage === 0) {
        // Marco 1: 1 Dia (24h após a sessão)
        targetStageName = 'Revisão 1 Dia';
        progressPercent = 0;

        if (elapsed >= ONE_DAY_MS) {
            isDue = true;
            timeRemainingText = 'Pronto para revisar!';
        } else {
            isDue = false;
            const hoursLeft = Math.ceil((ONE_DAY_MS - elapsed) / (60 * 60 * 1000));
            timeRemainingText = `${hoursLeft}h`;
        }
    } else if (stage === 1) {
        // Marco 2: 7 Dias a partir da data da sessão
        targetStageName = 'Revisão 7 Dias';
        progressPercent = 33;

        if (elapsed >= SEVEN_DAYS_MS) {
            isDue = true;
            timeRemainingText = 'Pronto para revisar!';
        } else {
            isDue = false;
            const daysLeft = Math.ceil((SEVEN_DAYS_MS - elapsed) / ONE_DAY_MS);
            timeRemainingText = `${daysLeft} dia(s)`;
        }
    } else if (stage === 2) {
        // Marco 3: 30 Dias a partir da data da sessão
        targetStageName = 'Revisão 30 Dias';
        progressPercent = 66;

        if (elapsed >= THIRTY_DAYS_MS) {
            isDue = true;
            timeRemainingText = 'Revisão final disponível!';
        } else {
            isDue = false;
            const daysLeft = Math.ceil((THIRTY_DAYS_MS - elapsed) / ONE_DAY_MS);
            timeRemainingText = `${daysLeft} dia(s)`;
        }
    } else {
        // Todas as 3 etapas concluídas
        targetStageName = 'Concluído';
        isDue = false;
        timeRemainingText = 'Vocabulário Consolidado!';
        progressPercent = 100;
    }

    return {
        stage,
        targetStage,
        targetStageName,
        isDue,
        timeRemainingText,
        progressPercent
    };
}

/**
 * 3. Carrega Sessões e o Histórico de Revisões do Aluno
 */
async function loadSessionsForUser() {
    if (loadingGif) loadingGif.classList.remove('hidden');
    sessionsGrid.innerHTML = '';

    try {
        const [sessionsSnap, cardsSnap, reviewsSnap] = await Promise.all([
            get(ref(database, 'meeting_sessions')),
            get(ref(database, 'flashcards')),
            get(ref(database, `student_reviews/${currentUser.uid}`))
        ]);

        if (!sessionsSnap.exists()) {
            sessionsGrid.innerHTML = '<p class="empty-state">Nenhuma sessão de conversação foi realizada ainda.</p>';
            return;
        }

        const allSessions = sessionsSnap.val();
        const allCards = cardsSnap.exists() ? cardsSnap.val() : {};
        const studentReviews = reviewsSnap.exists() ? reviewsSnap.val() : {};

        availableSessions = {};
        const isStaff = (userRole === 'admin' || userRole === 'mediator');

        Object.keys(allSessions).forEach(sessionId => {
            const session = allSessions[sessionId];
            if (!session) return;

            const hasAttended = session.attendees && session.attendees[currentUser.uid];

            if (isStaff || hasAttended) {
                const srs = calculateSRSStatus(session, studentReviews[sessionId]);

                availableSessions[sessionId] = {
                    id: sessionId,
                    ...session,
                    cards: allCards[sessionId] || {},
                    srs
                };
            }
        });

        renderSessionsGrid();

    } catch (err) {
        console.error("Erro ao carregar sessões de flashcards:", err);
        sessionsGrid.innerHTML = '<p class="empty-state">Erro ao conectar com o banco de dados.</p>';
    } finally {
        if (loadingGif) loadingGif.classList.add('hidden');
    }
}

/**
 * 4. Renderiza a Grade de Decks com Gamificação Visual
 */
function renderSessionsGrid() {
    sessionsGrid.innerHTML = '';
    const sessionKeys = Object.keys(availableSessions);

    if (sessionKeys.length === 0) {
        sessionsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; max-width: 500px; margin: 0 auto; text-align: center;">
                <i class="fa-solid fa-graduation-cap" style="font-size: 3rem; color: #8fa0b5; margin-bottom: 15px;"></i>
                <p>Nenhum deck de vocabulário liberado no momento.</p>
                <span style="font-size: 0.8rem; color: rgba(255,255,255,0.4);">
                    Participe das reuniões de conversação para ter sua presença confirmada e receber os flashcards!
                </span>
            </div>
        `;
        return;
    }

    // Ordena priorizando decks que estão com REVISÃO PENDENTE (Gamificação / Urgência Cognitiva)
    sessionKeys.sort((a, b) => {
        const srsA = availableSessions[a].srs;
        const srsB = availableSessions[b].srs;
        if (srsA.isDue && !srsB.isDue) return -1;
        if (!srsA.isDue && srsB.isDue) return 1;
        return new Date(availableSessions[b].startedAt || 0) - new Date(availableSessions[a].startedAt || 0);
    });

    sessionKeys.forEach(sessionId => {
        const session = availableSessions[sessionId];
        const cardCount = Object.keys(session.cards || {}).length;
        const srs = session.srs;

        const badgeClass = srs.progressPercent === 100 
            ? 'srs-badge-mastered' 
            : (srs.isDue ? 'srs-badge-due' : 'srs-badge-waiting');

        const badgeText = srs.progressPercent === 100 
            ? '🏆 Memorizado' 
            : (srs.isDue ? '🔥 Revisão Pronta' : srs.timeRemainingText);

        const cardEl = document.createElement('div');
        cardEl.className = 'srs-meeting-card';
        cardEl.innerHTML = `
            <div class="srs-card-top">
                <span class="srs-card-topic">${session.topic || 'Sessão de Conversação'}</span>
                <span class="srs-mastery-badge ${badgeClass}"><i class="fa-solid fa-clock-rotate-left"></i>&nbsp;${badgeText}</span>
            </div>

            <!-- TIMELINE DOS ESTÁGIOS DA CURVA -->
<div class="srs-stages-timeline">
    <div class="srs-stage-step ${srs.stage >= 1 ? 'completed' : (srs.stage === 0 && srs.isDue ? 'active-due' : '')}">
        <div class="srs-stage-circle">${srs.stage >= 1 ? '✓' : '1'}</div>
        <span>1 Dia</span>
    </div>
    <div class="srs-stage-step ${srs.stage >= 2 ? 'completed' : (srs.stage === 1 && srs.isDue ? 'active-due' : '')}">
        <div class="srs-stage-circle">${srs.stage >= 2 ? '✓' : '2'}</div>
        <span>7 Dias</span>
    </div>
    <div class="srs-stage-step ${srs.stage >= 3 ? 'completed' : (srs.stage === 2 && srs.isDue ? 'active-due' : '')}">
        <div class="srs-stage-circle">${srs.stage >= 3 ? '✓' : '3'}</div>
        <span>30 Dias</span>
    </div>
</div>

            <!-- BARRA DE PROGRESSO DE MAESTRIA -->


            <div class="srs-card-footer">
                <span><i class="fa-solid fa-layer-group"></i> ${cardCount}</span>
                <span><i class="fa-regular fa-clock"></i> ${formatDate(session.startedAt)}</span>
            </div>
        `;

        cardEl.addEventListener('click', () => {
            openMeetingStudyMode(session);
        });

        sessionsGrid.appendChild(cardEl);
    });
}

function formatDate(isoDate) {
    if (!isoDate) return '';
    const d = new Date(isoDate);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * 5. Abre a tela de Estudo
 */
function openMeetingStudyMode(session) {
    currentSessionBeingStudied = session;
    const cardsArray = Array.isArray(session.cards) ? session.cards : Object.values(session.cards || {});

    meetingsContent.classList.add('hidden');
    flashCardsContent.classList.remove('hidden');

    currentMeetingTitle.textContent = `${session.topic || 'Sessão'}         `;

    if (cardsArray.length === 0) {
        flashCardsSetupContent.classList.add('hidden');
        flashCardsStudyContent.classList.add('hidden');
        cardsContainer.innerHTML = '<p class="empty-state" style="margin-top: 100px;">Nenhum flashcard cadastrado para esta aula.</p>';
        return;
    }

    flashCardsSetupContent.classList.remove('hidden');
    flashCardsStudyContent.classList.add('hidden');

    playBtn.onclick = () => {
        flashCardsSetupContent.classList.add('hidden');
        flashCardsStudyContent.classList.remove('hidden');
        loadCardStack(cardsArray);
    };

    playBtn.click();
}

/**
 * 6. Motor 3D de Cartões
 */
function loadCardStack(cards) {
    cardsContainer.innerHTML = '';
    progressBar.innerHTML = '';

    let cardCount = 0;

    cards.forEach(card => {
        const number = cardCount;
        const cardElement = document.createElement('div');
        cardElement.id = `card-${cardCount + 1}`;
        cardElement.dataset.position = cardCount;
        cardElement.dataset.questionnumber = cardCount + 1;
        cardElement.classList.add('card');

        cardElement.innerHTML = `
            <div class="card-shadow"></div>
            <div class="card-front">
                <p>Dúvida (${cardCount + 1}/${cards.length})</p>
                <span>${card.front}</span>
            </div>
            <div class="card-back">
                <button class="btn-next" title="Acertei / Concluído"><i class="fa-solid fa-circle-check"></i></button>
                <p>Tradução (${cardCount + 1}/${cards.length})</p>
                <span>${card.back}</span>
            </div>
        `;

        progressBar.innerHTML += `<div class="progress-item" data-question="${cardCount + 1}"><div class="fill"></div></div>`;

        if (cardCount !== 0) {
            cardElement.style.marginLeft = number * 2 + 'px';
            cardElement.style.rotate = (number % 2 === 0 ? 2 : -2) + 'deg';
            cardElement.style.marginBottom = number * 2 + 'px';
            cardElement.querySelector('.card-shadow').style.opacity = '0.4';
            cardElement.style.pointerEvents = 'none';
        } else {
            cardElement.style.pointerEvents = 'all';
        }

        cardElement.style.zIndex = 100 - number;

        cardElement.onclick = (e) => {
            if (e.target.closest('.btn-next')) return;
            cardElement.classList.toggle('flipped');
        };

        cardElement.querySelector('.btn-next').onclick = (e) => {
            e.stopPropagation();
            cardElement.classList.add('removed-card');

            setTimeout(() => {
                const cardNodes = Array.from(cardsContainer.children);
                updateCardPositions(cardNodes, false);
                checkSessionCompletion(cards.length);
            }, 120);
        };

        cardCount++;
        cardsContainer.appendChild(cardElement);
    });

    updateProgressBarVisuals();
}

function updateCardPositions(cardNodes, backward) {
    cardNodes.forEach(card => {
        let currentPos = parseInt(card.dataset.position);
        currentPos = backward ? currentPos + 1 : currentPos - 1;
        card.dataset.position = currentPos;

        if (currentPos === 0) {
            card.style.marginLeft = '0px';
            card.style.rotate = '0deg';
            card.style.marginBottom = '0px';
            card.style.pointerEvents = 'all';
            card.querySelector('.card-shadow').style.opacity = '0';
        } else if (currentPos > 0) {
            card.style.marginLeft = currentPos * 2 + 'px';
            card.style.rotate = (currentPos % 2 === 0 ? 2 : -2) + 'deg';
            card.style.marginBottom = currentPos * 2 + 'px';
            card.style.pointerEvents = 'none';
            card.querySelector('.card-shadow').style.opacity = '0.4';
        }
    });
}

function updateProgressBarVisuals() {
    const miniBars = Array.from(progressBar.children);
    const cardNodes = Array.from(cardsContainer.children);

    cardNodes.forEach(card => {
        const position = parseInt(card.dataset.position);
        const questionNum = parseInt(card.dataset.questionnumber);

        if (position === 0) {
            miniBars.forEach(bar => {
                const barNum = parseInt(bar.dataset.question);
                if (barNum < questionNum) {
                    bar.classList.add('check');
                } else {
                    bar.classList.remove('check');
                }
            });
        }
    });
}

/**
 * 7. Quando o Aluno Conclui a Pilha -> Avança o Estágio na Curva de Ebbinghaus!
 */
/**
 * 7. Quando o Aluno Conclui a Pilha -> Avança o Estágio SOMENTE se a data atual
 *    já atingiu o marco da sessão, respeitando a sequência.
 */
async function checkSessionCompletion(totalCards) {
    const cardNodes = Array.from(cardsContainer.children);
    const allRemoved = cardNodes.every(c => parseInt(c.dataset.position) < 0);

    if (allRemoved) {
        const miniBars = Array.from(progressBar.children);
        miniBars.forEach(bar => bar.classList.add('check'));

        if (!currentSessionBeingStudied || !currentUser) return;

        const srs = currentSessionBeingStudied.srs;

        if (srs.isDue && srs.stage < 3) {
            const nextStage = srs.stage + 1;

            try {
                const reviewRef = ref(database, `student_reviews/${currentUser.uid}/${currentSessionBeingStudied.id}`);
                await update(reviewRef, {
                    stage: nextStage,
                    lastReviewedAt: new Date().toISOString(),
                    [`stage${nextStage}CompletedAt`]: new Date().toISOString()
                });

                const feedback = {
                    1: '🎉 Etapa de 1 Dia concluída! O vocabulário resistiu à maior queda da curva inicial.',
                    2: '🔥 Etapa de 7 Dias concluída! A retenção semanal está consolidada. Próximo marco: 30 dias!',
                    3: '🏆 Maestria Total (30 dias)! Este vocabulário agora faz parte da sua memória de longo prazo!'
                };

                showToast(feedback[nextStage] || 'Etapa concluída com sucesso!', 'success');
                currentSessionBeingStudied.srs.stage = nextStage;

            } catch (err) {
                console.error("Erro ao registrar avanço na curva de esquecimento:", err);
            }
        } else if (srs.stage >= 3) {
            showToast('Revisão finalizada!', 'success');
        } else {
            showToast(`Revisão finalizada! Volte em ${srs.timeRemainingText} para memorizar! `, 'info');
        }
    } else {
        updateProgressBarVisuals();
    }
}

// Botão Reiniciar
if (restartCardsBtn) {
    restartCardsBtn.onclick = () => {
        const cardNodes = Array.from(cardsContainer.children);
        cardNodes.forEach((card, idx) => {
            card.classList.remove('removed-card', 'flipped');
            card.dataset.position = idx;
            if (idx === 0) {
                card.style.marginLeft = '0px';
                card.style.rotate = '0deg';
                card.style.marginBottom = '0px';
                card.style.pointerEvents = 'all';
                card.querySelector('.card-shadow').style.opacity = '0';
            } else {
                card.style.marginLeft = idx * 2 + 'px';
                card.style.rotate = (idx % 2 === 0 ? 2 : -2) + 'deg';
                card.style.marginBottom = idx * 2 + 'px';
                card.style.pointerEvents = 'none';
                card.querySelector('.card-shadow').style.opacity = '0.4';
            }
        });
        updateProgressBarVisuals();
    };
}

// Botão Voltar Anterior
if (previousCardBtn) {
    previousCardBtn.onclick = () => {
        const cardNodes = Array.from(cardsContainer.children);
        const firstActive = cardNodes.find(c => parseInt(c.dataset.position) === 0);
        if (firstActive && firstActive.dataset.questionnumber === '1') return;

        const lastRemoved = cardNodes.filter(c => parseInt(c.dataset.position) < 0).pop();
        if (lastRemoved) {
            lastRemoved.classList.remove('removed-card');
            updateCardPositions(cardNodes, true);
            updateProgressBarVisuals();
        }
    };
}