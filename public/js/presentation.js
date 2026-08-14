import { get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { meetingsRef } from "./firebase.js";
import {
    meetingsObj,
    setMeetingsObj,
    callAlert, 
    toggleDropdown
} from "./app.js"; 


let topic = '';

const slideShowPage = document.getElementById('slide-show-page');
const slide = document.querySelector('.slide');
const slideContent = slideShowPage.querySelector('.slide-content');
const selectContent = slideShowPage.querySelector('.select-content');


slideShowPage.querySelector('.select-content').classList.remove('hidden');
slideShowPage.querySelector('.slide-content').classList.add('hidden');

const presentationSelect = document.getElementById('presentation-select');
const optionList = document.getElementById('option-list');

async function renderSelect() {
    presentationSelect.querySelector('.loading-gif').classList.remove('hidden')
    presentationSelect.querySelector('p').classList.add('hidden')
    presentationSelect.style.pointerEvents = 'none'
    presentationSelect.style.opacity = .7
    const snapshot = await get(meetingsRef);
    presentationSelect.style.opacity = 1
    presentationSelect.querySelector('.loading-gif').classList.add('hidden')
    presentationSelect.querySelector('p').classList.remove('hidden')
    presentationSelect.style.pointerEvents = 'all'
    const updatedMeetings = snapshot.val();
    setMeetingsObj(updatedMeetings);


    const keys = Object.keys(meetingsObj || {});

    if (keys.length === 0) {
        presentationSelect.innerHTML = '<option value="">Nenhuma reunião disponível</option>';
        return;
    }

    keys.forEach(key => {
        const option = document.createElement('div');
        option.classList.add('meeting-option')
        const topicText = meetingsObj[key].topic;
        option.innerHTML = `${Number(key) + 1} — ${topicText.length > 40 ? topicText.substring(0, 40) + '...' : topicText}`;
        option.dataset.value = key;
        optionList.append(option);
    });
}

renderSelect();



presentationSelect.addEventListener('click', e =>{
    toggleDropdownMeetings()

    if(e.target.classList.contains('meeting-option')){
        presentationSelect.querySelector('p').innerHTML = `${e.target.innerHTML}`.slice(3)
        presentationSelect.dataset.value = e.target.dataset.value
        document.getElementById('start-presentation-btn').classList.remove('unclickable')

        
    }
    console.log(e.target)
})


function toggleDropdownMeetings(){
    toggleDropdown(presentationSelect, optionList, 'bottom')
}









document.getElementById('start-presentation-btn').onclick = () => {


    
    slideShowPage.querySelector('.select-content').classList.add('hidden');
    slideContent.classList.remove('hidden');

    topic = meetingsObj[presentationSelect.dataset.value].topic;
    const questions = meetingsObj[presentationSelect.dataset.value].questions;
    let slideNumber = -1;
    const questionCount = Object.keys(questions).length;

    function updatedSlideContent() {
        if (slideNumber === -1) {
            slide.innerHTML = `<span class="title">${topic}</span>`;
        } else if (questions[slideNumber]) {
            slide.innerHTML = `<div class="questionItem"><span class="number">${slideNumber + 1}</span><span class="question">${questions[slideNumber]}</span></div>`;
        } else {}
    }

    updatedSlideContent()

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


const backToSelection = document.querySelector('.back-to-selection')

backToSelection.onclick = () =>{
    slideContent.classList.add('hidden')
    selectContent.classList.remove('hidden')

}








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
const closeTranslationBtn = document.querySelector('.close-translation-btn');
const translateBtn = document.getElementById('translate-btn');

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