import { initAuthGuard } from "./auth.js";

// Elementos da barra de navegação
const openSetMeetingButton = document.getElementById('open-set-meeting-button');
const openSlideShowButton = document.getElementById('open-slide-show-button');
const openFlashCardsButton = document.getElementById('open-flash-cards-button');

// Botões da Home
const homeSetMeeting = document.getElementById('home-set-meeting');
const homeStartMeeting = document.getElementById('home-start-meeting');
const homeFlashCards = document.getElementById('home-flash-cards');

// Redirecionamentos funcionais
if (openSetMeetingButton) {
    openSetMeetingButton.onclick = (e) => {
        e.preventDefault();
        window.location.href = 'set-meeting.html';
    };
}

if (openSlideShowButton) {
    openSlideShowButton.onclick = (e) => {
        e.preventDefault();
        window.location.href = 'presentation.html';
    };
}

if (openFlashCardsButton) {
    openFlashCardsButton.onclick = (e) => {
        e.preventDefault();
        window.location.href = 'flash-cards.html';
    };
}

// Conecta os botões da Home aos handlers correspondentes
homeSetMeeting?.addEventListener('click', () => openSetMeetingButton?.click());
homeStartMeeting?.addEventListener('click', () => openSlideShowButton?.click());
homeFlashCards?.addEventListener('click', () => openFlashCardsButton?.click());

// Funções globais de navegação
window.backToHome = function() {
    window.location.href = 'index.html';
};