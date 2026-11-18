import {
    ref,
    get,
    push,
    set,
    update,
    remove,
    onValue,
    onDisconnect
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { database, auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { showToast } from "./auth.js";
import { toggleDropdown } from "./app.js";
import { askGemini } from "./gemini.js";

// ==========================================================================
// 0. UTILITÁRIOS
// ==========================================================================
const DEBUG_VOICE = true; // logs de diagnóstico do áudio no console (pode desligar depois)
const vlog = (...args) => { if (DEBUG_VOICE) console.log(...args); };

// Cria um elemento sem usar innerHTML (evita injeção de HTML vinda de outros usuários)
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
}

function safePhotoUrl(url) {
    return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
}

// ==========================================================================
// 1. CONFIGURAÇÃO DO SOCKET.IO & WEBRTC (MALHA COMPLETA, ATÉ 6 PESSOAS)
// ==========================================================================
const BACKEND_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3001'
    : 'https://fluencircle-backend.onrender.com';

// Tentativas infinitas com backoff: sobrevive ao cold start / reinício do Render
const socket = io(BACKEND_URL, {
    transports: ['websocket'],
    upgrade: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000
});

let localStream = null;
let isMicMuted = false;

// STUN padrão; o TURN vem do backend (/api/ice-servers) ao entrar na sala
const FALLBACK_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
let iceServers = FALLBACK_ICE_SERVERS;

// { [remoteSocketId]: { pc, polite, makingOffer, ignoreOffer, queue, disconnectTimer, restarts } }
const peers = {};
const remoteAudioElements = {};
const MAX_ICE_RESTARTS = 3;

// ==========================================================================
// 2. ESTADOS GLOBAIS DA SESSÃO
// ==========================================================================
let baseTemplateId = '';
let activeSessionId = '';
let currentTopic = '';
let currentQuestions = [];
let slideNumber = -1; // -1 = Slide de Título / 0+ = Perguntas
let isSessionHost = false; // true apenas se for o criador da sessão ativa
let liveSessionSnapshot = null;
let joiningSession = false;
let attendeeDisconnectHandle = null; // onDisconnect do participante (remove presença se cair)

// Elementos da Página
const slideShowPage = document.getElementById('slide-show-page');
const slide = document.querySelector('.slide');
const slideContent = document.querySelector('.slide-content');
const selectContent = document.querySelector('.select-content');
const sidebar = document.querySelector('.sidebar');
const header = document.querySelector('header');

// Dropdown de Temas
const presentationSelect = document.getElementById('presentation-select');
const optionList = document.getElementById('option-list');
const selectedValueText = document.getElementById('value');
const startBtn = document.getElementById('start-presentation-btn');
const endMeetingBtn = document.getElementById('end-meeting-btn');

// Card Lateral de Sessão Ativa
const activeSideFlex = document.getElementById('active-sessions-flex');


// Barra de Participantes com Bolinhas & Voz
const voiceStrip = document.getElementById('voice-participants-strip') || document.getElementById('active-speakers-bar');
const voiceControlsBar = document.getElementById('voice-controls-bar');
const micToggleBtn = document.getElementById('mic-toggle-btn');
const voiceStatusText = document.getElementById('voice-status-text');

// Web Audio API para detecção de voz
let audioContext = null;
const audioAnalyzers = {};
const voiceParticipants = {};

// Modal de Tradutor
const translationModal = document.getElementById('translator-modal');
const openTranslatorBtn = document.getElementById('open-translator-btn');
const closeTranslatorBtn = document.getElementById('close-translator-btn');
const normalTextInput = document.getElementById('normal-text');
const translatedTextInput = document.getElementById('translated-text');
const translateBtn = document.getElementById('translate-btn');
const addFlashCardsBtn = document.getElementById('add-flashcards-btn');

// Modal de Encerramento
const endMeetingModal = document.getElementById('end-meeting-modal');
const closeEndMeetingBtn = document.getElementById('close-end-meeting-btn');
const cancelEndMeetingBtn = document.getElementById('cancel-end-meeting-btn');
const confirmEndMeetingBtn = document.getElementById('confirm-end-meeting-btn');

// Drawer de Presença
const openAttendanceBtn = document.getElementById('open-attendance-btn');
const attendanceDrawer = document.getElementById('attendance-drawer');
const closeAttendanceBtn = document.getElementById('close-attendance-btn');
const studentSelectTrigger = document.getElementById('student-select-trigger');
const studentOptionsList = document.getElementById('student-options-list');
const attendeesListContainer = document.getElementById('attendees-list');
const attendanceBadge = document.getElementById('attendance-count-badge');
const searchBar = document.getElementById('attendance-search-bar');

let allStudents = [];
let currentAttendees = {};

// Perfil do usuário logado, com fallbacks seguros
function getCurrentUserProfile() {
    const user = auth.currentUser;
    const cachedEmail = sessionStorage.getItem('fluentech_user_email') || user?.email || 'Participante';
    
    // Pega o nome do banco salvo no sessionStorage ou recorre ao displayName / email
    const cachedName = sessionStorage.getItem('fluentech_user_name') || user?.displayName || cachedEmail.split('@')[0];
    const cachedPhoto = sessionStorage.getItem('fluentech_user_photo') || user?.photoURL || null;

    return {
        uid: user?.uid || socket.id,
        name: cachedName,
        email: cachedEmail,
        photo: cachedPhoto
    };
}

// ==========================================================================
// 3. MONITORAMENTO DE SESSÃO ATIVA (/current_session) & SINCRONIZAÇÃO
// ==========================================================================
function applyRemoteSlide(remoteSlideNumber) {
    if (isSessionHost) return;
    if (typeof remoteSlideNumber !== 'number' || remoteSlideNumber === slideNumber) return;
    slideNumber = remoteSlideNumber;
    updateSlideContent();
}

// Um único listener cobre estado da sessão E troca de slide
onValue(ref(database, `current_session`), (snapshot) => {

    if (snapshot.exists()) {
        liveSessionSnapshot = snapshot.val();
        activeSideFlex.replaceChildren()

        Object.keys(liveSessionSnapshot).forEach((session)=>{
            
            const attendeesCount = liveSessionSnapshot[session].attendees ? Object.keys(liveSessionSnapshot[session].attendees).length : 1;
           const elemento = el('div', 'active-session-side-card', '');
    activeSideFlex.append(elemento);

    const statusTag = el('div', 'session-status-tag', '');



    const infoContainer = el('div', '', '');
    const h3Title = el('h3', 'side-session-title', liveSessionSnapshot[session].topic);
    infoContainer.append(h3Title);

    const metaDiv = el('div', 'side-session-meta', '');
    
    const spanMediatorWrapper = el('span', '', '');
    const iconMediator = el('i', 'fa-solid fa-user-tie', '');
    iconMediator.style.color = 'var(--third-color)';
    

    const spanUsersWrapper = el('span', 'spanUsers', '');
    const iconUsers = el('i', 'fa-solid fa-users', '');
    iconUsers.style.color = 'var(--accent-blue)';
    const strongCount = el('strong', '', attendeesCount);
    strongCount.id = 'side-active-count';
    
    
    spanUsersWrapper.append(iconUsers, strongCount);
    spanUsersWrapper.append(document.createTextNode(' participante (s)'));

    metaDiv.append(spanMediatorWrapper, spanUsersWrapper);
    infoContainer.append(metaDiv);
    elemento.append(infoContainer);

    const btnJoin = el('button', 'btn-join-active-session', '');
    btnJoin.id = 'join-side-active-session-btn';
    
    const iconDoor = el('i', 'fa-solid fa-door-open', '');
    btnJoin.append(iconDoor, document.createTextNode('Participar'));

    btnJoin.addEventListener('click', () => {
        console.log("Entrando na sala:");
    });

    elemento.append(btnJoin);


elemento.querySelector('.btn-join-active-session')?.addEventListener('click', async () => {
    if (!liveSessionSnapshot[session]) return;
    await joinActiveSession(liveSessionSnapshot[session]);
});
    
           
        })

    
    } 
});

// Sincronização complementar via WebSocket (latência baixa)
socket.on('slide-atualizado', (data) => {
    if (data) applyRemoteSlide(data.slideNumber);
});



// ==========================================================================
// 4. CARREGAR TEMAS E DROPDOWN
// ==========================================================================
async function loadMeetings() {
    const loadingGif = document.querySelector('.loading-gif');
    if (loadingGif) loadingGif.classList.remove('hidden');

    try {
        const snapshot = await get(ref(database, 'meetings'));
        if (loadingGif) loadingGif.classList.add('hidden');

        if (!snapshot.exists()) {
            if (selectedValueText) selectedValueText.textContent = "Nenhum tema cadastrado.";
            return;
        }

        const meetingsObj = snapshot.val();
        if (!optionList) return;
        optionList.innerHTML = '';

        Object.keys(meetingsObj).forEach((key, index) => {
            const meeting = meetingsObj[key];
            if (!meeting) return;

            const opt = document.createElement('div');
            opt.className = 'meeting-option';
            opt.dataset.value = key;
            const topicText = meeting.topic || `Sessão ${index + 1}`;
            opt.textContent = ` ${topicText.length > 40 ? topicText.substring(0, 40) + '...' : topicText}`;

            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                baseTemplateId = key;
                currentTopic = meeting.topic || 'Sem tema';

                if (Array.isArray(meeting.questions)) {
                    currentQuestions = meeting.questions;
                } else if (meeting.questions && typeof meeting.questions === 'object') {
                    currentQuestions = Object.values(meeting.questions);
                } else {
                    currentQuestions = [];
                }

                if (selectedValueText) selectedValueText.textContent = currentTopic;
                startBtn.classList.remove('unclickable');
                optionList.classList.add('hidden');
            });

            optionList.appendChild(opt);
        });

    } catch (err) {
        if (loadingGif) loadingGif.classList.add('hidden');
        console.error("Erro ao buscar temas:", err);
    }
}

// Eventos de clique do Dropdown
if (presentationSelect) {
    presentationSelect.addEventListener('click', (e) => {
        if (e.target.closest('.meeting-option')) return;
        if (typeof toggleDropdown === 'function') {
            toggleDropdown(presentationSelect, optionList, 'bottom');
        } else {
            optionList.classList.toggle('hidden');
        }
    });
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (optionList && !optionList.classList.contains('hidden')) optionList.classList.add('hidden');
        if (attendanceDrawer && !attendanceDrawer.classList.contains('hidden')) attendanceDrawer.classList.add('hidden');
    }
});

document.addEventListener('click', (e) => {
    if (presentationSelect && optionList) {
        if (!presentationSelect.contains(e.target) && !optionList.contains(e.target)) {
            optionList.classList.add('hidden');
        }
    }
});

// ==========================================================================
// 5. INICIAR OU INGRESSAR NA SESSÃO
// ==========================================================================

// Iniciar como Mediador (Host)
startBtn.addEventListener('click', async () => {
    if (!baseTemplateId) return;
    createRoomModal?.classList.add('hidden');

    startBtn.classList.add('unclickable');
    startBtn.textContent = 'Iniciando...';

    try {
        const sessionRef = push(ref(database, 'meeting_sessions'));
        const newSessionId = sessionRef.key;
        activeSessionId = newSessionId;
        isSessionHost = true;
        currentAttendees = {};

        const userProfile = getCurrentUserProfile();

        console.log(userProfile)

        const sessionPayload = {
            sessionId: newSessionId,
            templateId: baseTemplateId,
            topic: currentTopic,
            questions: currentQuestions,
            slideNumber: -1,
            startedAt: new Date().toISOString(),
            mediatorEmail: userProfile.email,
            mediatorName: userProfile.name,
            attendees: {
                [userProfile.uid]: {
                    name: userProfile.name,
                    email: userProfile.email,
                    photo: userProfile.photo,
                    role: 'mediator'
                }
            }
        };

        // 1. Grava no histórico e no nó global ativo
        await set(sessionRef, sessionPayload);
        await set(ref(database, `current_session/${activeSessionId}`), sessionPayload);

        enterSessionView();
        slideNumber = -1;
        updateSlideContent();

        // 2. Conecta no áudio com o ID da sessão
        await setupVoiceChat(newSessionId);

        showToast('Sessão iniciada ao vivo!', 'success');
    } catch (err) {
        console.error("Erro ao iniciar sessão:", err);
        activeSessionId = '';
        isSessionHost = false;
        showToast('Falha ao iniciar sessão.', 'error');
    } finally {
        startBtn.classList.remove('unclickable');
        startBtn.textContent = 'Iniciar Nova Sessão';
    }
});

// Registro permanente da presença: current_session é efêmero (some ao sair/encerrar),
// então o aluno também é gravado no histórico da sessão e vinculado em user_sessions,
// que é o que associa os flashcards da sessão a ele.
async function persistAttendance(sessionId, userProfile) {
    if (!sessionId || !userProfile?.uid) return;

    const attendeeHistoryRef = ref(database, `meeting_sessions/${sessionId}/attendees/${userProfile.uid}`);
    try {
        const existing = await get(attendeeHistoryRef);
        await update(attendeeHistoryRef, {
            name: userProfile.name || '',
            email: userProfile.email || '',
            // mantém o horário da primeira entrada se o aluno reconectar
            ...(existing.exists() && existing.val().addedAt ? {} : { addedAt: new Date().toISOString() })
        });
    } catch (err) {
        console.error('Erro ao salvar presença no histórico da sessão:', err);
    }

    try {
        await set(ref(database, `user_sessions/${userProfile.uid}/${sessionId}`), true);
    } catch (err) {
        console.error('Erro ao vincular aluno à sessão:', err);
        showToast('Presença registrada, mas os flashcards não foram associados à sua conta.', 'warning');
    }
}

// Ingressar em Sessão já Ativa (Aluno / Participante)
async function joinActiveSession(sessionData) {
    if (!sessionData || joiningSession) return;
    joiningSession = true;

    console.log(activeSessionId)

    try {
        // O ID da sala precisa ser IDÊNTICO ao do mediador
        const targetRoomId = sessionData.sessionId || 'current_live_session';
        console.log(`targetRoomID: ${targetRoomId}`)
        activeSessionId = targetRoomId;
        currentTopic = sessionData.topic || 'Sessão de Conversação';
        currentQuestions = Array.isArray(sessionData.questions)
            ? sessionData.questions
            : Object.values(sessionData.questions || {});
        slideNumber = typeof sessionData.slideNumber === 'number' ? sessionData.slideNumber : -1;
        currentAttendees = {};

        const userProfile = getCurrentUserProfile();
        isSessionHost = Boolean(userProfile.email && sessionData.mediatorEmail && userProfile.email === sessionData.mediatorEmail);

        // Registra presença no Firebase na mesma sessão ativa
        const attendeeRef = ref(database, `current_session/${activeSessionId}/attendees/${userProfile.uid}`);
        await set(attendeeRef, {
            name: userProfile.name,
            email: userProfile.email,
            photo: userProfile.photo,
            joinedAt: new Date().toISOString(),
            ...(isSessionHost ? { role: 'mediator' } : {})
        });

        // Presença permanente (histórico + vínculo dos flashcards). O mediador já
        // está no histórico desde a criação da sessão e não precisa de vínculo de aluno.
        if (!isSessionHost) {
            await persistAttendance(targetRoomId, userProfile);
        }

        // Se o participante fechar a aba/perder a conexão, a presença some sozinha
        // (não aplicado ao mediador, para uma oscilação de rede não derrubar a lista dele)
        if (!isSessionHost) {
            attendeeDisconnectHandle = onDisconnect(attendeeRef);
            attendeeDisconnectHandle.remove().catch(err => console.warn('onDisconnect:', err));
        }

        enterSessionView();
        updateSlideContent();

        await setupVoiceChat(targetRoomId);

        showToast(`Conectado à sessão: ${currentTopic}`, 'success');
    } catch (err) {
        console.error("Erro ao entrar na sessão:", err);
        showToast('Falha ao entrar na sessão.', 'error');
        leaveSessionView();
    } finally {
        joiningSession = false;
    }
}

function enterSessionView() {
    selectContent.classList.add('hidden');
    activeSideFlex.classList.add('hidden');
    slideContent.classList.remove('hidden');

    sidebar?.classList.add('hidden');
    slideShowPage?.classList.add('no-sidebar-main');
    if (header) header.style.left = '0';

    openTranslatorBtn?.classList.remove('hidden');
    openAttendanceBtn?.classList.remove('hidden');
    voiceControlsBar?.classList.remove('hidden');

    updateAttendeesUI();
    setupChatListener(activeSessionId);
}

function leaveSessionView() {
    activeSessionId = '';
    isSessionHost = false;

    if (chatMessagesListenerUnsubscribe) {
        chatMessagesListenerUnsubscribe();
        chatMessagesListenerUnsubscribe = null;
    }
    if (messagesContainer) {
        messagesContainer.innerHTML = '';
    }


    if (attendeeDisconnectHandle) {
        attendeeDisconnectHandle.cancel().catch(() => {});
        attendeeDisconnectHandle = null;
    }

    slideContent.classList.add('hidden');
    selectContent.classList.remove('hidden');


    openTranslatorBtn?.classList.add('hidden');
    openAttendanceBtn?.classList.add('hidden');
    attendanceDrawer?.classList.add('hidden');
    translationModal?.classList.add('hidden');
    voiceControlsBar?.classList.add('hidden');

    sidebar?.classList.remove('hidden');
    slideShowPage?.classList.remove('no-sidebar-main');
    if (header) header.style.left = 'var(--sidebar-collapsed-width)';

    closeVoiceChat();
}

// ==========================================================================
// 6. RENDERIZAÇÃO E NAVEGAÇÃO DOS SLIDES
// ==========================================================================
function updateSlideContent() {
    if (!slide) return;

    if (slideNumber === -1) {
        slide.replaceChildren(el('span', 'title', currentTopic));
        return;
    }

    const item = el('div', 'questionItem');
    if (slideNumber < currentQuestions.length) {
        item.append(
            el('span', 'number', slideNumber + 1),
            el('span', 'question', currentQuestions[slideNumber])
        );
    } else {
        item.append(el('span', 'question', 'Fim da sessão'));
    }
    slide.replaceChildren(item);
}

async function broadcastSlideChange(newSlideNumber) {
    slideNumber = newSlideNumber;
    updateSlideContent();

    if (activeSessionId) {
        try {
            await update(ref(database, `current_session/${activeSessionId}`), { slideNumber });
            if (socket.connected) {
                socket.emit('trocar-slide', {
                    salaId: activeSessionId,
                    slideNumber: slideNumber
                });
            }
        } catch (e) {
            console.error("Erro ao sincronizar slide:", e);
        }
    }
}

function nextSlide() {
    if (!isSessionHost) return;
    if (slideNumber < currentQuestions.length) {
        broadcastSlideChange(slideNumber + 1);
    }
}

function prevSlide() {
    if (!isSessionHost) return;
    if (slideNumber > -1) {
        broadcastSlideChange(slideNumber - 1);
    }
}

window.addEventListener('keydown', (e) => {
    if (translationModal && !translationModal.classList.contains('hidden')) return;
    if (attendanceDrawer && !attendanceDrawer.classList.contains('hidden')) return;
    if (slideContent.classList.contains('hidden')) return;
    if (!isSessionHost) return;

    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
    if (tag === 'BUTTON' && e.key === ' ') return; // deixa o botão focado funcionar

    if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        nextSlide();
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevSlide();
    }
});

// Navegação por clique: vale SOMENTE dentro do quadro do slide (.slide).
// Fora dele (chat, controles, fundo etc.) o cursor e o clique são os normais.
const CURSOR_LEFT = "url('assets/cursor-left.png') 16 16, w-resize";
const CURSOR_RIGHT = "url('assets/cursor-right.png') 16 16, e-resize";

function isRightHalfOfSlide(e) {
    const rect = slide.getBoundingClientRect();
    return e.clientX > rect.left + rect.width / 2;
}

slide?.addEventListener('click', (e) => {
    if (!isSessionHost) return;
    if (e.target.closest('button, a, input, textarea')) return;

    if (isRightHalfOfSlide(e)) nextSlide();
    else prevSlide();
});

slide?.addEventListener('mousemove', (e) => {
    // Só o mediador navega; para os demais o cursor permanece normal
    if (!isSessionHost) {
        slide.style.cursor = '';
        return;
    }
    slide.style.cursor = isRightHalfOfSlide(e) ? CURSOR_RIGHT : CURSOR_LEFT;
});

slide?.addEventListener('mouseleave', () => {
    slide.style.cursor = '';
});

// ==========================================================================
// 7. VOZ: WEBRTC MULTI-PEER (MALHA) COM "PERFECT NEGOTIATION"
// ==========================================================================

// ---- 7.1 Interface: bolinhas de participantes e medidor de volume -------------
function getAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    return audioContext;
}

function renderVoiceParticipant(id, user) {
    if (!voiceStrip) return;

    let bubble = document.getElementById(`voice-user-${id}`);
    if (!bubble) {
        bubble = document.createElement('div');
        bubble.className = 'voice-participant-bubble';
        bubble.id = `voice-user-${id}`;
        voiceStrip.appendChild(bubble);
    }

    const displayName = user.name || (user.email ? user.email.split('@')[0] : 'Usuário');

    const frame = el('div', 'voice-avatar-frame');
    const photo = safePhotoUrl(user.photo);
    if (photo) {
        const img = document.createElement('img');
        img.src = photo;
        img.alt = displayName;
        img.className = 'voice-avatar-img';
        img.referrerPolicy = 'no-referrer';
        frame.append(img);
    } else {
        frame.append(el('div', 'voice-avatar-initial', displayName.charAt(0).toUpperCase()));
    }

    const mutedBadge = el('div', `voice-muted-badge${user.isMuted ? '' : ' hidden'}`);
    mutedBadge.innerHTML = '<i class="fa-solid fa-microphone-slash"></i>';
    frame.append(mutedBadge);

    bubble.replaceChildren(frame, el('span', 'voice-participant-name', displayName));
    bubble.classList.toggle('speaking', Boolean(user.isSpeaking));
}

function detachAudioMeter(id) {
    const entry = audioAnalyzers[id];
    if (!entry) return;
    cancelAnimationFrame(entry.animationId);
    try { entry.source.disconnect(); } catch (e) { /* já desconectado */ }
    delete audioAnalyzers[id];
}

function removeVoiceParticipant(id) {
    document.getElementById(`voice-user-${id}`)?.remove();
    detachAudioMeter(id);
    delete voiceParticipants[id];
}

// Monitor de volume via AnalyserNode (acende a bolinha de quem está falando)
function attachAudioMeter(id, mediaStream) {
    detachAudioMeter(id);
    try {
        const ctx = getAudioContext();
        const source = ctx.createMediaStreamSource(mediaStream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.4;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const entry = { analyser, source, animationId: 0 };
        audioAnalyzers[id] = entry;

        const tick = () => {
            if (audioAnalyzers[id] !== entry) return; // medidor removido
            analyser.getByteFrequencyData(dataArray);

            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const isSpeaking = (sum / dataArray.length) > 14;

            const user = voiceParticipants[id];
            if (user && user.isSpeaking !== isSpeaking) {
                user.isSpeaking = isSpeaking;
                document.getElementById(`voice-user-${id}`)?.classList.toggle('speaking', isSpeaking);
            }
            entry.animationId = requestAnimationFrame(tick);
        };
        entry.animationId = requestAnimationFrame(tick);
    } catch (err) {
        console.error(`Erro ao anexar medidor de volume para ${id}:`, err);
    }
}

// ---- 7.2 Estado da conexão de voz ---------------------------------------------
let isVoiceConnected = false;   // o usuário quer estar na chamada
let voiceReady = false;         // microfone ok e tela pronta para sinalizar
let currentVoiceRoomId = null;

async function loadIceServers() {
    iceServers = FALLBACK_ICE_SERVERS;
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000); // tolera cold start do Render
        const res = await fetch(`${BACKEND_URL}/api/ice-servers`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const list = [].concat(data.iceServers || []).filter(s => s && s.urls);
        if (list.length) iceServers = list;
    } catch (err) {
        console.warn('Não foi possível buscar TURN, usando só STUN:', err.message);
    }

    const temTurn = iceServers.some(s => [].concat(s.urls).some(u => String(u).startsWith('turn')));
    vlog(`🧊 ICE carregado: ${iceServers.length} entrada(s), TURN ${temTurn ? 'SIM' : 'NÃO'}`);
}

function setVoiceStatus(text, connected = false) {
    if (!voiceStatusText) return;
    voiceStatusText.textContent = text;
    voiceStatusText.className = connected ? 'voice-status-text connected' : 'voice-status-text';
}

function joinVoiceRoom() {
    const profile = getCurrentUserProfile();
    socket.emit('entrar-sala', {
        salaId: currentVoiceRoomId,
        userInfo: {
            name: profile.name,
            photo: profile.photo,
            uid: profile.uid,
            isMuted: isMicMuted
        }
    });
}

async function setupVoiceChat(roomId) {
    if (!roomId || isVoiceConnected) return;
    isVoiceConnected = true;
    currentVoiceRoomId = roomId;

    vlog(`🔌 Conectando na sala de áudio: "${roomId}"`);
    setVoiceStatus('Conectando áudio...');

    try {
        await loadIceServers();

        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                video: false
            });
        }

        // O usuário pode ter saído enquanto o navegador pedia permissão
        if (!isVoiceConnected) {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
            return;
        }

        localStream.getAudioTracks().forEach(t => { t.enabled = !isMicMuted; });

        const profile = getCurrentUserProfile();
        voiceParticipants['local'] = {
            name: `${profile.name} (Você)`,
            photo: profile.photo,
            isSpeaking: false,
            isMuted: isMicMuted
        };
        renderVoiceParticipant('local', voiceParticipants['local']);
        attachAudioMeter('local', localStream);

        voiceReady = true;

        // Se o socket ainda estiver conectando, o handler de 'connect' entra na sala.
        if (socket.connected) {
            joinVoiceRoom();
            setVoiceStatus('Áudio Conectado', true);
        } else {
            setVoiceStatus('Conectando ao servidor...');
        }
    } catch (err) {
        isVoiceConnected = false;
        currentVoiceRoomId = null;
        console.error('Microfone não autorizado:', err);
        setVoiceStatus('Microfone Desativado');
        showToast('Permissão de microfone negada.', 'warning');
    }
}

// Reconexão do Socket.IO = socket.id NOVO e sala perdida no servidor: refaz a malha do zero
socket.on('connect', () => {
    if (!isVoiceConnected || !voiceReady || !currentVoiceRoomId) return;
    vlog('🔁 Socket (re)conectado, reentrando na sala de áudio.');
    Object.keys(peers).forEach(closePeer);
    joinVoiceRoom();
    setVoiceStatus(isMicMuted ? 'Mutado' : 'Áudio Conectado', true);
});

socket.on('disconnect', () => {
    if (isVoiceConnected) setVoiceStatus('Reconectando...');
});

// ---- 7.3 Conexões ponto a ponto ----------------------------------------------
async function debugPeer(remoteId, pc) {
    if (!DEBUG_VOICE) return;

    const snapshot = async (rotulo) => {
        try {
            const stats = await pc.getStats();
            let pair = null;
            stats.forEach(r => {
                if (r.type === 'transport' && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId);
            });
            if (pair) {
                const l = stats.get(pair.localCandidateId);
                const r = stats.get(pair.remoteCandidateId);
                console.log(`🛣️ [${rotulo}] ${remoteId}: local=${l?.candidateType} remoto=${r?.candidateType}`);
            }
            stats.forEach(r => {
                if (r.type === 'inbound-rtp' && r.kind === 'audio') {
                    console.log(`📥 [${rotulo}] ${remoteId}: bytesRecebidos=${r.bytesReceived} pacotes=${r.packetsReceived} energia=${(r.totalAudioEnergy || 0).toFixed(4)}`);
                }
                if (r.type === 'outbound-rtp' && r.kind === 'audio') {
                    console.log(`📤 [${rotulo}] ${remoteId}: bytesEnviados=${r.bytesSent} pacotes=${r.packetsSent}`);
                }
            });
        } catch (e) { /* conexão já fechada */ }
    };

    setTimeout(() => snapshot('5s'), 5000);
    setTimeout(() => snapshot('15s'), 15000);
}

function getOrCreatePeer(remoteId) {
    if (peers[remoteId]) return peers[remoteId];

    const pc = new RTCPeerConnection({ iceServers });
    const peer = {
        pc,
        polite: socket.id < remoteId, // um lado cede em caso de colisão de ofertas
        makingOffer: false,
        ignoreOffer: false,
        queue: Promise.resolve(),     // serializa o tratamento das mensagens deste peer
        disconnectTimer: null,
        restarts: 0
    };
    peers[remoteId] = peer;

    pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
            socket.emit('sinalizacao', {
                paraId: remoteId,
                payload: { candidate: candidate.toJSON() }
            });
        }
    };

    pc.onnegotiationneeded = async () => {
        try {
            peer.makingOffer = true;
            await pc.setLocalDescription();
            socket.emit('sinalizacao', {
                paraId: remoteId,
                payload: { description: pc.localDescription.toJSON() }
            });
        } catch (err) {
            console.error(`Erro ao negociar com ${remoteId}:`, err);
        } finally {
            peer.makingOffer = false;
        }
    };

    pc.ontrack = ({ streams: [remoteStream] }) => {
        if (!remoteStream) return;
        vlog(`🔊 Áudio recebido de ${remoteId}`);

        let audioEl = remoteAudioElements[remoteId];
        if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.autoplay = true;
            audioEl.playsInline = true;
            document.body.appendChild(audioEl);
            remoteAudioElements[remoteId] = audioEl;
        }
        audioEl.srcObject = remoteStream;
        audioEl.play().catch((e) => {
            // Autoplay bloqueado (Safari/iOS): libera no próximo toque
            console.warn('🔇 Autoplay bloqueado, aguardando toque na tela:', e.name);
            document.addEventListener('pointerdown', () => audioEl.play().catch(() => {}), { once: true });
        });

        if (!voiceParticipants[remoteId]) {
            voiceParticipants[remoteId] = { name: 'Participante', photo: null, isSpeaking: false, isMuted: false };
            renderVoiceParticipant(remoteId, voiceParticipants[remoteId]);
        }
        if (!audioAnalyzers[remoteId]) attachAudioMeter(remoteId, remoteStream);
    };

    pc.onconnectionstatechange = () => {
        clearTimeout(peer.disconnectTimer);
        const state = pc.connectionState;
        vlog(`📡 ${remoteId}: ${state}`);

        if (state === 'connected') {
            peer.restarts = 0;
            debugPeer(remoteId, pc);
        } else if (state === 'disconnected') {
            // "disconnected" costuma ser transitório: espera antes de agir
            peer.disconnectTimer = setTimeout(() => {
                if (peers[remoteId] === peer && pc.connectionState !== 'connected') pc.restartIce();
            }, 4000);
        } else if (state === 'failed') {
            if (peer.restarts < MAX_ICE_RESTARTS) {
                peer.restarts++;
                pc.restartIce(); // dispara nova negociação (onnegotiationneeded)
            } else {
                const name = voiceParticipants[remoteId]?.name || 'um participante';
                showToast(`Não foi possível conectar o áudio com ${name}. Verifique a rede.`, 'warning');
            }
        }
    };

    // Adicionar as tracks por último: dispara onnegotiationneeded
    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    return peer;
}

async function handleSignal(peer, remoteId, { description, candidate }) {
    const pc = peer.pc;
    try {
        if (description) {
            const offerCollision =
                description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');

            peer.ignoreOffer = !peer.polite && offerCollision;
            if (peer.ignoreOffer) return;

            await pc.setRemoteDescription(description); // o lado "polite" faz rollback implícito
            if (description.type === 'offer') {
                await pc.setLocalDescription();
                socket.emit('sinalizacao', {
                    paraId: remoteId,
                    payload: { description: pc.localDescription.toJSON() }
                });
            }
        } else if (candidate) {
            try {
                await pc.addIceCandidate(candidate);
            } catch (err) {
                if (!peer.ignoreOffer) throw err;
            }
        }
    } catch (err) {
        console.error(`Erro na sinalização com ${remoteId}:`, err);
    }
}

function closePeer(remoteId) {
    const peer = peers[remoteId];
    if (peer) {
        clearTimeout(peer.disconnectTimer);
        peer.pc.onconnectionstatechange = null;
        peer.pc.onnegotiationneeded = null;
        peer.pc.onicecandidate = null;
        peer.pc.ontrack = null;
        peer.pc.close();
        delete peers[remoteId];
    }
    if (remoteAudioElements[remoteId]) {
        remoteAudioElements[remoteId].srcObject = null;
        remoteAudioElements[remoteId].remove();
        delete remoteAudioElements[remoteId];
    }
    removeVoiceParticipant(remoteId);
}

// ---- 7.4 Eventos do servidor --------------------------------------------------

// Quem ENTRA cria a conexão com cada pessoa que já estava (a oferta sai do onnegotiationneeded)
socket.on('usuarios-existentes', (usuariosJaNaSala) => {
    if (!voiceReady) return;
    vlog(`👥 Já na sala (${usuariosJaNaSala.length}):`, usuariosJaNaSala);

    for (const item of usuariosJaNaSala) {
        const outroId = item.id || item;
        const info = item.userInfo || { name: 'Participante', photo: null };

        voiceParticipants[outroId] = {
            name: info.name,
            photo: info.photo,
            isSpeaking: false,
            isMuted: Boolean(info.isMuted)
        };
        renderVoiceParticipant(outroId, voiceParticipants[outroId]);

        getOrCreatePeer(outroId);
    }
});

// Quem JÁ ESTAVA só registra a bolinha; a oferta chega do novato
socket.on('novo-usuario-entrou', (data) => {
    if (!voiceReady) return;
    const novoId = data.id || data;
    const info = data.userInfo || { name: 'Participante', photo: null };

    // Se havia uma conexão velha com esse id, descarta
    if (peers[novoId]) closePeer(novoId);

    voiceParticipants[novoId] = {
        name: info.name,
        photo: info.photo,
        isSpeaking: false,
        isMuted: Boolean(info.isMuted)
    };
    renderVoiceParticipant(novoId, voiceParticipants[novoId]);
});

socket.on('sinalizacao', ({ deId, payload }) => {
    if (!voiceReady || !deId) return;
    const peer = getOrCreatePeer(deId);
    peer.queue = peer.queue.then(() => handleSignal(peer, deId, payload || {}));
});

socket.on('usuario-desconectado', (id) => closePeer(id));

socket.on('usuario-mudou-mudo', ({ id, isMuted }) => {
    const user = voiceParticipants[id];
    if (!user) return;
    user.isMuted = isMuted;
    if (isMuted) user.isSpeaking = false;
    renderVoiceParticipant(id, user);
});

socket.on('sala-cheia', ({ max }) => {
    showToast(`A sala de áudio está cheia (máx. ${max}).`, 'error');
    closeVoiceChat();
    setVoiceStatus('Sala cheia');
});

function closeVoiceChat() {
    if (socket.connected && currentVoiceRoomId) socket.emit('sair-sala');

    voiceReady = false;
    isVoiceConnected = false;
    currentVoiceRoomId = null;

    Object.keys(peers).forEach(closePeer);
    Object.keys(audioAnalyzers).forEach(detachAudioMeter);
    Object.keys(voiceParticipants).forEach(k => delete voiceParticipants[k]);

    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    if (voiceStrip) voiceStrip.innerHTML = '';

    isMicMuted = false;
    if (micToggleBtn) {
        micToggleBtn.classList.remove('muted');
        micToggleBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    }
    if (activeSideFlex) activeSideFlex.classList.remove('hidden');
}

// Botão de Mutar / Desmutar
micToggleBtn?.addEventListener('click', () => {
    if (!localStream) return;
    isMicMuted = !isMicMuted;
    localStream.getAudioTracks().forEach(t => { t.enabled = !isMicMuted; });

    micToggleBtn.classList.toggle('muted', isMicMuted);
    micToggleBtn.innerHTML = isMicMuted
        ? '<i class="fa-solid fa-microphone-slash"></i>'
        : '<i class="fa-solid fa-microphone"></i>';
    if (voiceStatusText) voiceStatusText.textContent = isMicMuted ? 'Mutado' : 'Microfone Aberto';

    if (voiceParticipants['local']) {
        voiceParticipants['local'].isMuted = isMicMuted;
        if (isMicMuted) voiceParticipants['local'].isSpeaking = false;
        renderVoiceParticipant('local', voiceParticipants['local']);
    }

    if (currentVoiceRoomId) {
        socket.emit('toggle-mute', { isMuted: isMicMuted });
    }
});

// ==========================================================================
// 8. ENCERRAMENTO DA SESSÃO
// ==========================================================================
endMeetingBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    endMeetingModal?.classList.remove('hidden');
});

closeEndMeetingBtn?.addEventListener('click', () => endMeetingModal?.classList.add('hidden'));
cancelEndMeetingBtn?.addEventListener('click', () => endMeetingModal?.classList.add('hidden'));

confirmEndMeetingBtn?.addEventListener('click', async () => {
    endMeetingModal?.classList.add('hidden');

    try {
        if (isSessionHost) {
            await remove(ref(database, `current_session/${activeSessionId}`));
            showToast('Sessão finalizada com sucesso.', 'success');
        } else if (auth.currentUser) {
            await remove(ref(database, `current_session/${activeSessionId}/attendees/${auth.currentUser.uid}`));
            showToast('Você saiu da sessão.', 'success');
        }
    } catch (err) {
        console.error(err);
    }

    leaveSessionView();
});

// ==========================================================================
// 9. TRADUTOR RÁPIDO & FLASHCARDS
// ==========================================================================
openTranslatorBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    translationModal.classList.remove('hidden');
    normalTextInput.value = '';
    translatedTextInput.value = '';
    addFlashCardsBtn.classList.add('unactive');
    normalTextInput.focus();
});

closeTranslatorBtn?.addEventListener('click', () => translationModal.classList.add('hidden'));

async function fetchTranslation(text) {
    const prompt = `Você é um tradutor bidirecional estrito (Inglês ⇄ Português). 
Detecte o idioma do texto de entrada e traduza para o outro idioma. Retorne SOMENTE a tradução direta sem adições.
Texto: ${text}`;
    return askGemini(prompt);
}

translateBtn?.addEventListener('click', async () => {
    const text = normalTextInput.value.trim();
    if (!text) return;

    translatedTextInput.value = 'Traduzindo...';
    translateBtn.disabled = true;
    addFlashCardsBtn.classList.add('unactive');

    try {
        const res = await fetchTranslation(text);
        translatedTextInput.value = res;
        addFlashCardsBtn.classList.remove('unactive');
    } catch (err) {
        translatedTextInput.value = 'Erro ao traduzir';
    } finally {
        translateBtn.disabled = false;
    }
});

// Salva um flashcard na sessão ativa (usado pelo tradutor rápido e pelo comando "fc:" do chat)
async function saveFlashcard(front, back, source) {
    const sessionId = activeSessionId;
    if (!sessionId) throw new Error('Sem sessão ativa');

    const card = {
        front,
        back,
        topic: currentTopic,
        sessionId,
        source, // 'tradutor' | 'chat'
        createdBy: getCurrentUserProfile().uid || null,
        createdAt: new Date().toISOString()
    };

    // Mesmo caminho que o banco já usa: flashcards/{sessionId}/{cardId}
    await push(ref(database, `flashcards/${sessionId}`), card);
}

addFlashCardsBtn?.addEventListener('click', async () => {
    if (!activeSessionId) return;
    if (addFlashCardsBtn.classList.contains('unactive') || translateBtn?.disabled) return;

    const original = normalTextInput.value.trim();
    const translated = translatedTextInput.value.trim();
    if (!original || !translated) return;

    try {
        await saveFlashcard(original, translated, 'tradutor');
        showToast('Flashcard registrado!', 'success');
        translationModal.classList.add('hidden');
    } catch (err) {
        showToast('Erro ao salvar flashcard.', 'error');
    }
});

// ==========================================================================
// 10. LISTA DE PRESENÇA (DRAWER LATERAL)
// ==========================================================================
openAttendanceBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    attendanceDrawer?.classList.toggle('hidden');
});

closeAttendanceBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    attendanceDrawer?.classList.add('hidden');
});

studentSelectTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    studentOptionsList?.classList.toggle('hidden');
});

searchBar?.addEventListener('input', (e) => {
    renderStudentDropdownOptions(e.target.value);
    if (studentOptionsList?.classList.contains('hidden')) {
        studentOptionsList.classList.remove('hidden');
    }
});

async function loadStudentsList() {
    try {
        const snapshot = await get(ref(database, 'users'));
        if (!snapshot.exists()) return;
        const usersObj = snapshot.val();
        allStudents = Object.keys(usersObj)
            .map(uid => ({ uid, ...usersObj[uid] }))
            .filter(u => u.role === 'student' || !u.role);
        renderStudentDropdownOptions();
    } catch (err) {
        console.error("Erro ao buscar alunos para presença:", err);
    }
}

function renderStudentDropdownOptions(searchTerm = '') {
    if (!studentOptionsList) return;
    studentOptionsList.replaceChildren();

    if (allStudents.length === 0) {
        const empty = el('div', 'custom-select-option', 'Nenhum aluno cadastrado.');
        empty.style.color = '#8fa0b5';
        studentOptionsList.append(empty);
        return;
    }

    const term = searchTerm.toLowerCase().trim();
    const filtered = allStudents.filter(s => {
        const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.email || '';
        return name.toLowerCase().includes(term);
    });

    filtered.forEach(student => {
        const isAlreadyAdded = !!currentAttendees[student.uid];
        const name = `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.email || 'Aluno';

        const opt = el('div', `custom-select-option${isAlreadyAdded ? ' already-added' : ''}`);
        opt.append(el('span', '', name));
        if (isAlreadyAdded) {
            const check = el('i', 'fa-solid fa-check');
            check.style.color = 'var(--third-color)';
            opt.append(check);
        }

        opt.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (isAlreadyAdded || !activeSessionId) return;
            try {
                await set(ref(database, `meeting_sessions/${activeSessionId}/attendees/${student.uid}`), {
                    name,
                    email: student.email || '',
                    addedAt: new Date().toISOString()
                });
                // É este vínculo que faz os flashcards da sessão aparecerem para o aluno
                try {
                    await set(ref(database, `user_sessions/${student.uid}/${activeSessionId}`), true);
                } catch (linkErr) {
                    console.error('Erro ao vincular aluno à sessão:', linkErr);
                    showToast('Presença registrada, mas os flashcards não foram associados ao aluno.', 'warning');
                }
                currentAttendees[student.uid] = { name, email: student.email || '' };
                updateAttendeesUI();
                studentOptionsList.classList.add('hidden');
            } catch (err) {
                console.error('Erro ao adicionar presença:', err);
                showToast('Erro ao registrar presença.', 'error');
            }
        });

        studentOptionsList.append(opt);
    });
}

function updateAttendeesUI() {
    if (!attendeesListContainer) return;
    attendeesListContainer.replaceChildren();
    const uids = Object.keys(currentAttendees);

    if (attendanceBadge) attendanceBadge.textContent = uids.length;

    if (uids.length === 0) {
        const empty = el('p', 'empty-state', 'Ninguém foi adicionado.');
        empty.style.padding = '20px 0';
        empty.style.fontSize = '0.85rem';
        attendeesListContainer.append(empty);
        return;
    }

    uids.forEach(uid => {
        const s = currentAttendees[uid];

        const item = el('div', 'attendee-item');
        const info = el('div', 'attendee-info');
        info.append(
            el('span', 'attendee-name', s.name),
            el('span', 'attendee-email', s.email)
        );

        const removeBtn = el('button', 'remove-attendee-btn');
        removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        removeBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!activeSessionId) return;
            try {
                await remove(ref(database, `meeting_sessions/${activeSessionId}/attendees/${uid}`));
                await remove(ref(database, `user_sessions/${uid}/${activeSessionId}`))
                    .catch((linkErr) => console.error('Erro ao desvincular aluno da sessão:', linkErr));
                delete currentAttendees[uid];
                updateAttendeesUI();
            } catch (err) {
                console.error('Erro ao remover presença:', err);
                showToast('Erro ao remover presença.', 'error');
            }
        });

        item.append(info, removeBtn);
        attendeesListContainer.append(item);
    });
}

// ==========================================================================
// 11. INICIALIZAÇÃO
// ==========================================================================
loadMeetings();
loadStudentsList();

onAuthStateChanged(auth, async (user) => {
    if (user) {
        sessionStorage.setItem('fluentech_user_email', user.email);

        try {
            // Busca os dados completos do usuário no nó 'users/{uid}' do banco
            const userSnap = await get(ref(database, `users/${user.uid}`));
            if (userSnap.exists()) {
                const userData = userSnap.val();
                
                // Monta o nome completo (firstName + lastName) ou apenas firstName
                const fullName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();
                const displayName = fullName || userData.displayName || user.displayName || user.email.split('@')[0];

                // Salva no sessionStorage para acesso instantâneo em qualquer parte da página
                sessionStorage.setItem('fluentech_user_name', displayName);
                if (userData.photoURL || userData.photo) {
                    sessionStorage.setItem('fluentech_user_photo', userData.photoURL || userData.photo);
                }
            }
        } catch (err) {
            console.warn("Não foi possível carregar o perfil do usuário do banco:", err);
        }
    } else {
        sessionStorage.removeItem('fluentech_user_name');
        sessionStorage.removeItem('fluentech_user_email');
        sessionStorage.removeItem('fluentech_user_photo');
    }
});




// ==========================================================================
// SEÇÃO DO CHAT DA SESSÃO & MASCOTE FLUÊNCIO (fc: comando)
// ==========================================================================

// Elementos da interface do chat
const chatInput = document.getElementById('chat-input');
const sendMessageBtn = document.getElementById('send-message-btn');
const messagesContainer = document.querySelector('.messages-container');

let chatMessagesListenerUnsubscribe = null;

/**
 * Rola a caixa de mensagens para o final
 */
function scrollChatToBottom() {
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

/**
 * Renderiza uma mensagem no container do chat
 */
function renderChatMessage(msgId, msgData, currentUserId) {
    if (!messagesContainer) return;

    // Evita duplicatas visuais
    if (document.getElementById(`msg-${msgId}`)) return;

    const isMine = msgData.senderUid === currentUserId;
    const isFluencio = msgData.isBot || msgData.senderUid === 'fluencio-bot';

    const msgElement = document.createElement('div');
    msgElement.id = `msg-${msgId}`;

    if (isFluencio) {
        msgElement.className = 'fluencioMessage';

        // Cabeçalho do Fluêncio
        const botHeader = document.createElement('div');
        botHeader.className = 'fluencio-header';
        botHeader.innerHTML = `
            <span class="fluencio-badge">
                <i class="fa-solid fa-wand-magic-sparkles"></i> Fluêncio
            </span>
            ${msgData.replyToName ? `<span class="reply-target">para<strong>@${msgData.replyToName}</strong></span>` : ''}
        `;

        // Card com citação da palavra original
        const quoteBox = document.createElement('div');
        quoteBox.className = 'fluencio-quote';
        quoteBox.innerHTML = `<span>Comando:</span> <em>"${msgData.originalWord || ''}"</em>`;

        // Conteúdo da tradução / explicação
        const textContent = document.createElement('div');
        textContent.className = 'fluencio-text';
        textContent.innerHTML = `<span>Tradução:</span> <em>"${msgData.text.replace(/\n/g, '<br>') || ''}"</em>`;

        msgElement.append(botHeader, quoteBox, textContent);
    } else {
        msgElement.className = isMine ? 'myMessage' : 'othersMessage';

        const senderSpan = document.createElement('span');
        senderSpan.className = 'message-author';
        senderSpan.textContent = isMine ? 'Você' : `${msgData.senderName}: `;

        const textSpan = document.createElement('span');
        textSpan.className = 'message-body';
        textSpan.textContent = msgData.text;

        msgElement.append(senderSpan, textSpan);
    }

    messagesContainer.appendChild(msgElement);
    scrollChatToBottom();
}

/**
 * Inicia o listener de mensagens em tempo real da sessão atual
 */
function setupChatListener(sessionId) {
    if (!sessionId) return;

    if (messagesContainer) {
        messagesContainer.innerHTML = ''; // Limpa mensagens mock
    }

    const messagesRef = ref(database, `meeting_sessions/${sessionId}/chat`);
    
    // Escuta novas mensagens em tempo real
    chatMessagesListenerUnsubscribe = onValue(messagesRef, (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.val();
        const currentUid = getCurrentUserProfile().uid;

        // Renderiza cada mensagem na ordem
        Object.entries(data).forEach(([msgKey, msg]) => {
            renderChatMessage(msgKey, msg, currentUid);
        });
    });
}

/**
 * Dispara a resposta do mascote Fluêncio via Gemini API
 */
async function processFluencioCommand(query, targetMessageId, authorName) {
    const cleanedQuery = query.trim();
    if (!cleanedQuery || !activeSessionId) return;

    // Prompt especializado para o mascote
    const prompt = `
retorne a tradução de "${cleanedQuery}".

Instruções:
1. Forneça a tradução direta (Inglês ⇄ Português ou vice versa).
3. NUNCA retorne o mesmo idioma, sempre traduza`;

    try {
        const botResponse = await askGemini(prompt);

        // Grava a resposta do mascote no banco da sessão
        await push(ref(database, `meeting_sessions/${activeSessionId}/chat`), {
            senderUid: 'fluencio-bot',
            senderName: 'Fluêncio',
            isBot: true,
            originalWord: cleanedQuery,
            replyToId: targetMessageId,
            replyToName: authorName,
            text: botResponse || `Não consegui encontrar a tradução de "${cleanedQuery}" agora, tente novamente!`,
            createdAt: new Date().toISOString()
        });

        // Toda tradução bem-sucedida do "fc:" também vira flashcard da sessão
        if (botResponse && botResponse.trim()) {
            saveFlashcard(cleanedQuery, botResponse.trim(), 'chat')
                .catch((err) => console.error('Erro ao salvar flashcard do chat:', err));
        }
    } catch (err) {
        console.error("Erro no mascote Fluêncio:", err);
        await push(ref(database, `meeting_sessions/${activeSessionId}/chat`), {
            senderUid: 'fluencio-bot',
            senderName: 'Fluêncio',
            isBot: true,
            originalWord: cleanedQuery,
            replyToId: targetMessageId,
            replyToName: authorName,
            text: `Falha na tradução de"${cleanedQuery}". Meia-noite eu irei levá-la na sua casa.`,
            createdAt: new Date().toISOString()
        });
    }
}

/**
 * Envia uma mensagem no chat
 */
async function handleSendChatMessage() {
    if (!activeSessionId) {
        showToast('Você precisa estar em uma sessão ativa para enviar mensagens.', 'warning');
        return;
    }

    const text = chatInput?.value?.trim();
    if (!text) return;

    chatInput.value = '';
    const userProfile = getCurrentUserProfile();

    try {
        // 1. Salva a mensagem no Firebase
        const newMsgRef = push(ref(database, `meeting_sessions/${activeSessionId}/chat`));
        const messageId = newMsgRef.key;

        await set(newMsgRef, {
            senderUid: userProfile.uid,
            senderName: userProfile.name,
            text: text,
            createdAt: new Date().toISOString()
        });

        // 2. Verifica se contém o comando "fc: palavra"
        // Aceita formatos como: "fc: apple", "fc:take it easy", "FC: car"
        const fcMatch = text.match(/^\s*fc\s*:\s*(.+)$/i);
        if (fcMatch) {
            const queryToTranslate = fcMatch[1];
            // Disparado localmente por quem digitou para evitar chamadas duplicadas ao Gemini
            processFluencioCommand(queryToTranslate, messageId, userProfile.name);
        }
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        showToast('Erro ao enviar mensagem.', 'error');
    }
}

// Event Listeners de Envio
sendMessageBtn?.addEventListener('click', handleSendChatMessage);

chatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        handleSendChatMessage();
    }
});



// CONTROLE DO MODAL FULLSCREEN DE CRIAR SALA
// ==========================================================================
const openCreateRoomBtn = document.getElementById('open-create-room-btn');
const closeCreateRoomBtn = document.getElementById('close-create-room-btn');
const createRoomModal = document.getElementById('create-room-modal');

// Abrir modal em tela cheia
openCreateRoomBtn?.addEventListener('click', () => {
    createRoomModal?.classList.remove('hidden');
});

// Fechar modal no X
closeCreateRoomBtn?.addEventListener('click', () => {
    createRoomModal?.classList.add('hidden');
});

// Fechar com a tecla Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && createRoomModal && !createRoomModal.classList.contains('hidden')) {
        createRoomModal.classList.add('hidden');
    }
});