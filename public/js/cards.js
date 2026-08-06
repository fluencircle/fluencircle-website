import { meetingsRef } from "./firebase.js";
import { get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const flashCardsGrid = document.querySelector('.flash-cards-grid');
const flashCardsFull = document.querySelector('.flash-cards-full');
const classesGrid = document.querySelector('.classes-grid');
const loadingGif = document.querySelector('.loading-gif');
const meetingsContent = document.querySelector('#meetings-content');
const flashCardsContent = document.querySelector('#flash-cards-content');
const backToMeetings = document.querySelector('.back-to-meetings');
const logo = document.getElementById('logo');

let currentMeetings = {};

logo.onclick = () => { window.location.href = 'index.html'; };

backToMeetings.onclick = () => {
    meetingsContent.classList.remove('hidden');
    flashCardsContent.classList.add('hidden');
};

loadMeetingsFromDatabase();

async function loadMeetingsFromDatabase() {
    loadingGif.classList.remove('hidden');
    try {
        const snapshot = await get(meetingsRef);
        currentMeetings = snapshot.val() || {};
        createMeetingCards(currentMeetings);
    } catch (err) {
        classesGrid.innerHTML = '<p class="empty-state">Erro ao carregar reuniões.</p>';
        console.error(err);
    } finally {
        loadingGif.classList.add('hidden');
    }
}

function createMeetingCards(meetingsObject) {
    classesGrid.innerHTML = '';
    const keys = Object.keys(meetingsObject);

    if (keys.length === 0) {
        classesGrid.innerHTML = '<p class="empty-state">Nenhuma reunião criada ainda. Crie uma na página inicial.</p>';
        return;
    }

    keys.forEach(key => {
        const meetingCard = document.createElement('div');
        meetingCard.classList.add('meeting-card');
        const cardCount = Object.keys(meetingsObject[key].cards || {}).length;
        meetingCard.innerHTML = `
            <span class="meeting-card-number">${Number(key) + 1}</span>
            <span class="meeting-card-topic">${meetingsObject[key].topic}</span>
            <span class="meeting-card-count">${cardCount} cards</span>`;
        meetingCard.addEventListener('click', () => loadFlashCards(meetingsObject, key));
        classesGrid.append(meetingCard);
    });
}

function loadFlashCards(meetingsObject, key) {
    const flashCardsObj = meetingsObject[key].cards || {};
    const flashCardsKeys = Object.keys(flashCardsObj);

    flashCardsGrid.innerHTML = '';
    meetingsContent.classList.add('hidden');
    flashCardsContent.classList.remove('hidden');
    flashCardsContent.querySelector('h1').textContent = meetingsObject[key].topic;

    const play = document.querySelector('#play-cards-btn');
    play.style.pointerEvents = flashCardsKeys.length === 0 ? 'none' : '';
    play.style.opacity = flashCardsKeys.length === 0 ? '0.5' : '1';

    if (flashCardsKeys.length === 0) {
        flashCardsGrid.innerHTML = '<div class="emptyCardsMessage">Nenhum flash card nesta reunião ainda.</div>';
    } else {
        flashCardsKeys.forEach(cardKey => createFlashCard(flashCardsObj[cardKey]));
    }

    setPlay(meetingsObject, key);
}

function createFlashCard(currentCard) {
    const flashCard = document.createElement('div');
    flashCard.classList.add('flash-card');
    flashCard.innerHTML = `
        <span class="flash-card-front"><p>${currentCard.front}</p></span>
        <span class="flash-card-back"><p>${currentCard.back}</p></span>`;
    flashCard.onclick = () => flashCard.classList.toggle('active');
    flashCardsGrid.append(flashCard);
}

function setPlay(meetingsObject, key) {
    const leftArrow = document.getElementById('left-arrow');
    const rightArrow = document.getElementById('right-arrow');
    const fullCard = document.getElementById('full-card');
    const play = document.querySelector('#play-cards-btn');

    play.classList.remove('playOn');
    play.innerHTML = '<i class="fa-solid fa-circle-play"></i>';
    flashCardsGrid.classList.remove('hidden');
    flashCardsFull.classList.add('hidden');

    play.onclick = () => {
        const flashCardsObj = meetingsObject[key].cards || {};
        const cardMax = Object.keys(flashCardsObj).length;
        let cardNumber = 0;

        function updateCard() {
            if (fullCard.classList.contains('active')) {
                fullCard.classList.remove('active');
                setTimeout(() => {
                    fullCard.innerHTML = `
                        <span class="flash-card-front">${flashCardsObj[cardNumber].front}</span>
                        <span class="flash-card-back">${flashCardsObj[cardNumber].back}</span>`;
                }, 200);
            } else {
                fullCard.innerHTML = `
                    <span class="flash-card-front">${flashCardsObj[cardNumber].front}</span>
                    <span class="flash-card-back">${flashCardsObj[cardNumber].back}</span>`;
            }
            updateArrowState();
        }

        function updateArrowState() {
            rightArrow.style.opacity = cardNumber < cardMax - 1 ? '1' : '0.3';
            leftArrow.style.opacity = cardNumber > 0 ? '1' : '0.3';
        }

        function switchCard(direction) {
            if (direction === 'left' && cardNumber > 0) cardNumber -= 1;
            else if (direction === 'right' && cardNumber < cardMax - 1) cardNumber += 1;
            updateCard();
        }

        updateCard();
        play.classList.toggle('playOn');

        if (play.classList.contains('playOn')) {
            play.innerHTML = '<i class="fa-solid fa-grip"></i>';
            flashCardsGrid.classList.add('hidden');
            flashCardsFull.classList.remove('hidden');
            leftArrow.style.opacity = '0.3';

            fullCard.onclick = () => fullCard.classList.toggle('active');
            window.onkeydown = (event) => {
                if (event.key === 'ArrowRight') switchCard('right');
                else if (event.key === 'ArrowLeft') switchCard('left');
            };
            leftArrow.onclick = () => switchCard('left');
            rightArrow.onclick = () => switchCard('right');
        } else {
            play.innerHTML = '<i class="fa-solid fa-circle-play"></i>';
            flashCardsGrid.classList.remove('hidden');
            flashCardsFull.classList.add('hidden');
            Array.from(flashCardsGrid.children).forEach(card => card.classList.remove('active'));
        }
    };
}
