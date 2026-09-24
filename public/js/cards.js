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
const THIRTY_DAYS_MS = 30 * ONE_DAY_MS;        // 30 Dias (1 Mês)

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
 * 2. Avalia as revisões baseando-se no tempo real decorrido de cada etapa.
 *    - Estágio 0 -> 1: Espera 24h a partir da data de início da sessão (startedAt).
 *    - Estágio 1 -> 2: Espera 7 dias a partir de quando o aluno concluiu o Estágio 1 (stage1CompletedAt).
 *    - Estágio 2 -> 3: Espera 30 dias a partir de quando o aluno concluiu o Estágio 2 (stage2CompletedAt).
 */
function calculateSRSStatus(session, reviewData) {
    const sessionTime = new Date(session.startedAt || 0).getTime();
    const now = Date.now();

    const stage = reviewData?.stage || 0; // 0 = Novo, 1 = Fez 1d, 2 = Fez 7d, 3 = Fez 30d
    let isDue = false;
    let timeRemainingText = '';
    let targetStageName = '';
    let progressPercent = 0;

    if (stage === 0) {
        // Marco 1: 24h após o término da aula
        targetStageName = 'Revisão 1 Dia';
        progressPercent = 0;
        const elapsedSinceSession = now - sessionTime;

        if (elapsedSinceSession >= ONE_DAY_MS) {
            isDue = true;
            timeRemainingText = 'Pronto para revisar!';
        } else {
            isDue = false;
            const hoursLeft = Math.ceil((ONE_DAY_MS - elapsedSinceSession) / (60 * 60 * 1000));
            timeRemainingText = `${hoursLeft}h`;
        }
    } else if (stage === 1) {
        // Marco 2: 7 dias após a conclusão da etapa 1
        targetStageName = 'Revisão 7 Dias';
        progressPercent = 33;
        const stage1Time = reviewData?.stage1CompletedAt ? new Date(reviewData.stage1CompletedAt).getTime() : sessionTime;
        const elapsedSinceStage1 = now - stage1Time;

        if (elapsedSinceStage1 >= SEVEN_DAYS_MS) {
            isDue = true;
            timeRemainingText = 'Pronto para revisar!';
        } else {
            isDue = false;
            const daysLeft = Math.ceil((SEVEN_DAYS_MS - elapsedSinceStage1) / ONE_DAY_MS);
            timeRemainingText = `${daysLeft}d`;
        }
    } else if (stage === 2) {
        // Marco 3: 30 dias após a conclusão da etapa 2
        targetStageName = 'Revisão 30 Dias';
        progressPercent = 66;
        const stage2Time = reviewData?.stage2CompletedAt ? new Date(reviewData.stage2CompletedAt).getTime() : sessionTime;
        const elapsedSinceStage2 = now - stage2Time;

        if (elapsedSinceStage2 >= THIRTY_DAYS_MS) {
            isDue = true;
            timeRemainingText = 'Revisão final disponível!';
        } else {
            isDue = false;
            const daysLeft = Math.ceil((THIRTY_DAYS_MS - elapsedSinceStage2) / ONE_DAY_MS);
            timeRemainingText = `${daysLeft} dia(s)`;
        }
    } else {
        // Estágio 3: Todas as 3 etapas concluídas
        targetStageName = 'Concluído';
        isDue = false;
        timeRemainingText = 'Vocabulário Consolidado!';
        progressPercent = 100;
    }

    return {
        stage,
        targetStageName,
        isDue,
        timeRemainingText,
        progressPercent
    };
}

/**
 * 3. Carrega Sessões e o Histórico de Revisões do Aluno
 *    (FILTRO ATIVO: Ignora qualquer sessão que não tenha flashcards!)
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

            // 🚀 FILTRO ESTRITO: Pula se não houver cards cadastrados nesta sessão!
            const sessionCardsObj = allCards[sessionId];
            if (!sessionCardsObj) return;

            const cardsCount = Object.keys(sessionCardsObj).length;
            if (cardsCount === 0) return;

            const hasAttended = session.attendees && session.attendees[currentUser.uid];

            if (isStaff || hasAttended) {
                const srs = calculateSRSStatus(session, studentReviews[sessionId]);

                availableSessions[sessionId] = {
                    id: sessionId,
                    ...session,
                    cards: sessionCardsObj,
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
 * 4. Renderiza a Grade de Decks
 */
function renderSessionsGrid() {
    sessionsGrid.innerHTML = '';
    const sessionKeys = Object.keys(availableSessions);

    if (sessionKeys.length === 0) {
        sessionsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; max-width: 500px; margin: 0 auto; text-align: center;">
                <i class="fa-solid fa-graduation-cap" style="font-size: 3rem; color: #8fa0b5; margin-bottom: 15px;"></i>
                <p>Nenhum deck de flashcards disponível no momento.</p>
                <span style="font-size: 0.8rem; color: rgba(255,255,255,0.4);">
                    Assim que novos vocabulários forem registrados durante as suas aulas, seus flashcards aparecerão aqui!
                </span>
            </div>
        `;
        return;
    }

    // Ordena priorizando decks pendentes de revisão
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
            ? 'Concluído' 
            : (srs.isDue ? 'Revisão pendente' : `<i class="fa-solid fa-clock-rotate-left"></i>&nbsp;${srs.timeRemainingText}`);

        const cardEl = document.createElement('div');
        cardEl.className = 'srs-meeting-card';
        cardEl.innerHTML = `
            <div class="srs-card-top">
                <span class="srs-card-topic">${session.topic || 'Sessão de Conversação'}</span>
                <span class="srs-mastery-badge ${badgeClass}">&nbsp;${badgeText}</span>
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

    currentMeetingTitle.textContent = `${session.topic || 'Sessão'}`;

    if (cardsArray.length === 0) {
        if (flashCardsStudyContent) flashCardsStudyContent.classList.add('hidden');
        cardsContainer.innerHTML = '<p class="empty-state" style="margin-top: 100px;">Nenhum flashcard cadastrado para esta aula.</p>';
        return;
    }

    if (flashCardsStudyContent) flashCardsStudyContent.classList.remove('hidden');
    loadCardStack(cardsArray);
}

/**
 * 6. Motor 3D de Cartões + Tela de Fim dos Flashcards
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
                const cardNodes = Array.from(cardsContainer.querySelectorAll('.card'));
                updateCardPositions(cardNodes, false);
                checkSessionCompletion(cards.length);
            }, 120);
        };

        cardCount++;
        cardsContainer.appendChild(cardElement);
    });

    // card final
    const completionCard = document.createElement('div');
    completionCard.id = 'completion-card';
    completionCard.className = 'card completion-card hidden';
    completionCard.style.zIndex = '1';
    completionCard.innerHTML = `
        <div style="padding: 40px 25px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 16px;">
            <i class="fa-solid fa-circle-check" style="font-size: 3.5rem; color: #2bfd78;"></i>
            <h3 style="font-size: 1.5rem; font-weight: 700; color: #fff; margin: 0;">Fim dos Flashcards!</h3>

            <div style="display: flex; gap: 12px; margin-top: 10px;">
                <button id="finish-restart-btn" style="background: #1e293b; color: #fff; border: 1px solid #334155; padding: 10px 18px; border-radius: 12px; cursor: pointer; font-size: 0.85rem; font-weight: 600;">
                    <i class="fa-solid fa-rotate-left"></i> Reiniciar
                </button>
                <button id="finish-back-btn" style="background: #2bfd78; color: #000; border: none; padding: 10px 22px; border-radius: 12px; cursor: pointer; font-size: 0.85rem; font-weight: 700;">
                    Voltar
                </button>
            </div>
        </div>
    `;
    cardsContainer.appendChild(completionCard);

    // Eventos do Card de Conclusão
    completionCard.querySelector('#finish-restart-btn').onclick = () => {
        if (restartCardsBtn) restartCardsBtn.click();
    };
    completionCard.querySelector('#finish-back-btn').onclick = () => {
        if (backToMeetings) backToMeetings.click();
    };

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
    const cardNodes = Array.from(cardsContainer.querySelectorAll('.card:not(.completion-card)'));

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
 * 7. Quando o Aluno Conclui a Pilha
 */
async function checkSessionCompletion(totalCards) {
    const regularCards = Array.from(cardsContainer.querySelectorAll('.card:not(.completion-card)'));
    const allRemoved = regularCards.every(c => parseInt(c.dataset.position) < 0);

    if (allRemoved) {
        const miniBars = Array.from(progressBar.children);
        miniBars.forEach(bar => bar.classList.add('check'));

        // 🚀 Revela o card de "Fim dos Flashcards"
        const completionCard = document.getElementById('completion-card');
        if (completionCard) {
            completionCard.classList.remove('hidden');
            completionCard.style.pointerEvents = 'all';
            completionCard.style.marginLeft = '0px';
            completionCard.style.rotate = '0deg';
        }

        if (!currentSessionBeingStudied || !currentUser) return;

        const srs = currentSessionBeingStudied.srs;

        // Só avança se a etapa atual estiver realmente VENCIDA (isDue) e não for a final
        if (srs.isDue && srs.stage < 3) {
            const nextStage = srs.stage + 1;
            const nowIso = new Date().toISOString();

            try {
                const reviewRef = ref(database, `student_reviews/${currentUser.uid}/${currentSessionBeingStudied.id}`);
                await update(reviewRef, {
                    stage: nextStage,
                    lastReviewedAt: nowIso,
                    [`stage${nextStage}CompletedAt`]: nowIso // Salva a data exata da conclusão do marco!
                });

                const feedback = {
                    1: '🎉 Etapa de 1 Dia concluída! Próximo marco de revisão: 7 dias.',
                    2: '🔥 Etapa de 7 Dias concluída! Retenção semanal garantida. Próximo marco: 30 dias!',
                    3: '🏆 Maestria Total (30 dias)! Este vocabulário agora faz parte da sua memória de longo prazo!'
                };

                showToast(feedback[nextStage] || 'Etapa concluída com sucesso!', 'success');
                currentSessionBeingStudied.srs.stage = nextStage;
                currentSessionBeingStudied.srs.isDue = false;

            } catch (err) {
                console.error("Erro ao registrar avanço na curva de esquecimento:", err);
            }
        } else if (srs.stage >= 3) {
            showToast('Revisão concluída! Vocabulário 100% consolidado.', 'success');
        } else {
            showToast(`Revisão concluída! Próximo marco em ${srs.timeRemainingText}.`, 'info');
        }
    } else {
        updateProgressBarVisuals();
    }
}

// Botão Reiniciar
if (restartCardsBtn) {
    restartCardsBtn.onclick = () => {
        const completionCard = document.getElementById('completion-card');
        if (completionCard) completionCard.classList.add('hidden');

        const cardNodes = Array.from(cardsContainer.querySelectorAll('.card:not(.completion-card)'));
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
        const completionCard = document.getElementById('completion-card');
        if (completionCard && !completionCard.classList.contains('hidden')) {
            completionCard.classList.add('hidden');
        }

        const cardNodes = Array.from(cardsContainer.querySelectorAll('.card:not(.completion-card)'));
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