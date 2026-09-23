import { initAuthGuard } from "./auth.js";

// Inicializa a proteção de autenticação
if (typeof initAuthGuard === 'function') {
    initAuthGuard();
}

// 1. Botões da Barra Lateral (se existirem na página)
const openSetMeetingButton = document.getElementById('open-set-meeting-button');
const openSlideShowButton = document.getElementById('open-slide-show-button');
const openFlashCardsButton = document.getElementById('open-flash-cards-button');

openSetMeetingButton?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'set-meeting.html'; // ou 'manage-meetings.html'
});

openSlideShowButton?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'presentation.html';
});

openFlashCardsButton?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'flash-cards.html';
});

// 2. Botões da Tela Inicial (Home) - Redirecionamento Direto
const homeSetMeeting = document.getElementById('home-set-meeting');
const homeStartMeeting = document.getElementById('home-start-meeting');
const homeFlashCards = document.getElementById('home-flash-cards');

// Redirecionam diretamente sem depender de botões auxiliares
homeSetMeeting?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'set-meeting.html'; // ajuste para 'manage-meetings.html' se usar a lista gerenciável
});

homeStartMeeting?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'presentation.html';
});

homeFlashCards?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'flash-cards.html';
});

// 3. Função Global de Retorno
window.backToHome = function() {
    window.location.href = 'index.html';
};