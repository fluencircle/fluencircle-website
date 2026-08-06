import { meetingsRef, updateMeetingsDatabase } from "./firebase.js";
import { get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import {
    meetingsObj,
    setCurrentTopic,
    getCurrentQuestions,
    setMeetingsObj,
    clearCurrentQuestions
} from "./app.js";

const homePage = document.getElementById('home-page');
const setMeetingPage = document.getElementById('set-meeting-page');
const slideShowPage = document.getElementById('slide-show-page');
const logo = document.getElementById('logo');
const questionListElement = document.querySelector('.questions-list');
const addQuestionBtn = document.getElementById('add-question-button');
const topicInput = document.getElementById('topic-input');
const openSetMeetingButton = document.getElementById('open-set-meeting-button');
const openSlideShowButton = document.getElementById('open-slide-show-button');
const openFlashCardsButton = document.getElementById('open-flash-cards-button');
const slide = document.querySelector('.slide');
const translateBtn = document.getElementById('translate-btn');
const sidebar = document.querySelector('.sidebar');

let topic = '';

function setActivePage(pageName) {
    sidebar.querySelectorAll('li').forEach(li => {
        li.classList.toggle('active', li.dataset.page === pageName);
    });
}

function showPage(page) {
    homePage.classList.add('hidden');
    setMeetingPage.classList.add('hidden');
    slideShowPage.classList.add('hidden');
    page.classList.remove('hidden');
}

function goHome() {
    showPage(homePage);
    setActivePage('home');
    document.querySelector('.translation-button')?.classList.add('hidden');
}

logo.onclick = () => goHome();

document.getElementById('home-set-meeting')?.addEventListener('click', () => openSetMeetingButton.click());
document.getElementById('home-start-meeting')?.addEventListener('click', () => openSlideShowButton.click());
document.getElementById('home-flash-cards')?.addEventListener('click', () => openFlashCardsButton.click());

openSetMeetingButton.onclick = () => {
    setActivePage('set-meeting');
    showPage(setMeetingPage);
    topicInput.value = '';
    clearCurrentQuestions();
    questionListElement.innerHTML = '';

    topicInput.oninput = () => setCurrentTopic(topicInput.value);

    addQuestionBtn.onclick = () => {
        const questionNumber = questionListElement.children.length + 1;
        const newQuestionCard = document.createElement('div');
        newQuestionCard.classList.add('question-card');
        newQuestionCard.innerHTML = `
            <span class="questionNumber">${questionNumber}</span>
            <input type="text" class="new-question-input" placeholder="Digite sua pergunta aqui...">
            <button type="button" class="delete-question-btn"><i class="fa-solid fa-trash"></i></button>`;

        const input = newQuestionCard.querySelector('.new-question-input');
        const deleteBtn = newQuestionCard.querySelector('.delete-question-btn');

        deleteBtn.onclick = () => {
            newQuestionCard.remove();
            renumberQuestions();
        };

        input.addEventListener('focusout', () => {
            if (!input.value.trim()) newQuestionCard.remove();
            renumberQuestions();
        });

        questionListElement.append(newQuestionCard);
        input.focus();
    };

    function renumberQuestions() {
        questionListElement.querySelectorAll('.question-card').forEach((card, i) => {
            card.querySelector('.questionNumber').textContent = i + 1;
        });
    }

    document.getElementById('set-button').onclick = () => {
        const inputs = questionListElement.querySelectorAll('.new-question-input');
        const questions = Array.from(inputs)
            .map(input => input.value.trim())
            .filter(Boolean);

        if (!topicInput.value.trim()) {
            callAlert('danger', 'Adicione o tema da reunião!');
            topicInput.classList.add('danger-input');
            setTimeout(() => topicInput.classList.remove('danger-input'), 2000);
            return;
        }

        if (questions.length === 0) {
            callAlert('danger', 'Adicione pelo menos 1 pergunta!');
            return;
        }

        const meetingNumber = Object.keys(meetingsObj || {}).length;
        meetingsObj[meetingNumber] = {
            topic: topicInput.value.trim(),
            questions: {},
            cards: {}
        };

        questions.forEach((q, i) => {
            meetingsObj[meetingNumber].questions[i] = q;
        });

        updateMeetingsDatabase(meetingsObj);
        callAlert('normal', 'Reunião salva com sucesso!');
        clearCurrentQuestions();
        goHome();
    };
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
    setActivePage('slide-show');
    showPage(slideShowPage);
    document.querySelector('.translation-button').classList.remove('hidden');

    slideShowPage.querySelector('.select-content').classList.remove('hidden');
    slideShowPage.querySelector('.slide-content').classList.add('hidden');

    const presentationSelect = document.getElementById('presentation-select');

    async function renderSelect() {
        const snapshot = await get(meetingsRef);
        const updatedMeetings = snapshot.val();
        setMeetingsObj(updatedMeetings);

        presentationSelect.innerHTML = '';
        const keys = Object.keys(meetingsObj || {});

        if (keys.length === 0) {
            presentationSelect.innerHTML = '<option value="">Nenhuma reunião disponível</option>';
            return;
        }

        keys.forEach(key => {
            const option = document.createElement('option');
            const topicText = meetingsObj[key].topic;
            option.textContent = `${Number(key) + 1} — ${topicText.length > 40 ? topicText.substring(0, 40) + '...' : topicText}`;
            option.value = key;
            presentationSelect.append(option);
        });
    }

    renderSelect();

    document.getElementById('start-presentation-btn').onclick = () => {
        if (!presentationSelect.value) {
            callAlert('danger', 'Selecione uma reunião!');
            return;
        }

        const slideContent = slideShowPage.querySelector('.slide-content');
        slideShowPage.querySelector('.select-content').classList.add('hidden');
        slideContent.classList.remove('hidden');

        topic = meetingsObj[presentationSelect.value].topic;
        const questions = meetingsObj[presentationSelect.value].questions;
        let slideNumber = -1;
        const questionCount = Object.keys(questions).length;

        function updatedSlideContent() {
            if (slideNumber === -1) {
                slide.innerHTML = `<span class="title">${topic}</span>`;
            } else if (questions[slideNumber]) {
                slide.innerHTML = `<div class="questionItem"><span class="number">${slideNumber + 1}</span><span class="question">${questions[slideNumber]}</span></div>`;
            } else {
                slide.innerHTML = `<span class="endSlideMessage">Fim da apresentação</span>`;
            }
        }

        function nextSlide() {
            if (slideNumber < questionCount) slideNumber += 1;
            updatedSlideContent();
        }

        function previousSlide() {
            if (slideNumber >= 0) slideNumber -= 1;
            updatedSlideContent();
        }

        window.onkeydown = (event) => {
            if (event.key === 'ArrowRight') nextSlide();
            else if (event.key === 'ArrowLeft') previousSlide();
        };

        slideContent.onclick = (e) => {
            const screenHalf = e.clientX < window.innerWidth / 2 ? 'left' : 'right';
            if (screenHalf === 'left') previousSlide();
            else nextSlide();
        };

        slideContent.onmousemove = (e) => {
            const isLeft = e.clientX < window.innerWidth / 2;
            slideContent.classList.toggle('cursor-left', isLeft);
            slideContent.classList.toggle('cursor-right', !isLeft);
        };
    };
};

openFlashCardsButton.onclick = () => {
    window.location.href = 'flash-cards.html';
};

async function traduzirTexto(texto, config) {
    const deIdioma = config === 'pt' ? 'pt' : 'en';
    const paraIdioma = config === 'pt' ? 'en' : 'pt';
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${deIdioma}&tl=${paraIdioma}&dt=t&q=${encodeURIComponent(texto)}`;

    try {
        const resposta = await fetch(url);
        if (!resposta.ok) throw new Error('Erro na tradução');
        const dados = await resposta.json();
        return dados[0][0][0];
    } catch {
        return 'Erro ao traduzir';
    }
}

const normalTextInput = document.getElementById('normal-text');
const translatedTextInput = document.getElementById('translated-text');
const translationOptions = document.getElementById('translation-options');
const addFlashCardsBtn = document.getElementById('add-flashcards-btn');
const addFlashCardContent = document.getElementById('add-flashcard-content');
const translationContent = document.getElementById('translation-content');
const selectMeeting = document.getElementById('select-meeting');
const saveFlashcardBtn = document.getElementById('save-flashcard-btn');
const translationModal = document.getElementById('translator-modal');
const translationButton = document.querySelector('.translation-button');
const alertElement = document.querySelector('.alert');
const closeTranslationBtn = document.querySelector('.close-translation-btn');

translateBtn.onclick = () => translate();
closeTranslationBtn.onclick = () => translationModal.classList.add('hidden');

async function translate() {
    if (!normalTextInput.value.trim()) {
        normalTextInput.classList.add('danger-input');
        normalTextInput.setAttribute('placeholder', 'Digite um texto para traduzir');
        setTimeout(() => {
            normalTextInput.classList.remove('danger-input');
            normalTextInput.setAttribute('placeholder', 'Digite um texto');
        }, 2000);
        return;
    }
    const result = await traduzirTexto(normalTextInput.value, translationOptions.value);
    translatedTextInput.value = result;
    addFlashCardsBtn.classList.remove('unactive');
}

addFlashCardsBtn.onclick = () => {
    translationContent.classList.add('hidden');
    addFlashCardContent.classList.remove('hidden');
    selectMeeting.innerHTML = '';
    Object.keys(meetingsObj || {}).forEach(key => {
        const option = document.createElement('option');
        const topicText = meetingsObj[key].topic;
        option.textContent = `${Number(key) + 1} — ${topicText.substring(0, 40)}${topicText.length > 40 ? '...' : ''}`;
        option.value = key;
        selectMeeting.append(option);
    });
};

saveFlashcardBtn.addEventListener('click', () => {
    if (!selectMeeting.value) return;
    if (!meetingsObj[selectMeeting.value].cards) {
        meetingsObj[selectMeeting.value].cards = {};
    }
    const cardsNumber = Object.keys(meetingsObj[selectMeeting.value].cards).length;
    meetingsObj[selectMeeting.value].cards[cardsNumber] = {
        front: normalTextInput.value,
        back: translatedTextInput.value
    };
    updateMeetingsDatabase(meetingsObj);
    callAlert('normal', 'Flash card adicionado!');
    translationModal.classList.add('hidden');
});

translationModal.onclick = (e) => {
    if (!e.target.closest('.modal')) translationModal.classList.add('hidden');
};

normalTextInput.addEventListener('keyup', () => addFlashCardsBtn.classList.add('unactive'));

translationButton.onclick = () => {
    translationModal.classList.remove('hidden');
    normalTextInput.value = '';
    translatedTextInput.value = '';
    addFlashCardsBtn.classList.add('unactive');
    translationContent.classList.remove('hidden');
    addFlashCardContent.classList.add('hidden');
};

function callAlert(type, message) {
    alertElement.classList.toggle('danger', type === 'danger');
    alertElement.querySelector('.alert-icon').innerHTML = type === 'danger'
        ? '<i class="fa-solid fa-circle-exclamation"></i>'
        : '<i class="fa-solid fa-circle-check"></i>';
    alertElement.querySelector('p').textContent = message;
    alertElement.classList.remove('hidden');
    setTimeout(() => alertElement.classList.add('hidden'), 2500);
}

function backToHome() { goHome(); }

function backToSelection() {
    slideShowPage.querySelector('.select-content').classList.remove('hidden');
    slideShowPage.querySelector('.slide-content').classList.add('hidden');
}

window.backToSelection = backToSelection;
window.backToHome = backToHome;
