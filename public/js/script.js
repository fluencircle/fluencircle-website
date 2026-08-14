import { meetingsRef, updateMeetingsDatabase } from "./firebase.js";
import { get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import {
    meetingsObj,
    setMeetingsObj,
    callAlert,
    alertElement
} from "./app.js";

const homePage = document.getElementById('home-page');
const logo = document.getElementById('logo');

const openSetMeetingButton = document.getElementById('open-set-meeting-button');
const openSlideShowButton = document.getElementById('open-slide-show-button');
const openFlashCardsButton = document.getElementById('open-flash-cards-button');




document.getElementById('home-set-meeting')?.addEventListener('click', () => openSetMeetingButton.click());
document.getElementById('home-start-meeting')?.addEventListener('click', () => openSlideShowButton.click());
document.getElementById('home-flash-cards')?.addEventListener('click', () => openFlashCardsButton.click());

openSetMeetingButton.onclick = () => {
    
};

function renderQuestionCards(questionsArray) {
    questionListElement.innerHTML = '';
    questionsArray.forEach((question, count) => {
        const questionCard = document.createElement('div');
        questionCard.classList.add('question-card');
        questionCard.setAttribute('data-number', String(count));
        questionCard.innerHTML = `
            <span class="questionNumber">${count + 1}</span>
            <input type="text" class="new-question-input" placeholder="Digite sua pergunta aqui..." value="${question}">
            <button type="button" class="delete-question-btn"><i class="fa-solid fa-trash"></i></button>`;

        questionCard.querySelector('.delete-question-btn').onclick = () => {
            questionsArray.splice(Number(questionCard.dataset.number), 1);
            renderQuestionCards([...questionsArray]);
        };
        questionListElement.append(questionCard);
    });
}

openSlideShowButton.onclick = () => {
   window.location.href = 'presentation.html';
};

openFlashCardsButton.onclick = () => {
    window.location.href = 'flash-cards.html';
};





function backToHome() { window.location.href = 'index.html' }

function backToSelection() {
    slideShowPage.querySelector('.select-content').classList.remove('hidden');
    slideShowPage.querySelector('.slide-content').classList.add('hidden');
}

window.backToSelection = backToSelection;
window.backToHome = backToHome;
