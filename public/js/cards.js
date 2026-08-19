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
    const play = document.querySelector('#play-cards-btn');

    play.classList.remove('playOn');
    play.innerHTML = '<i class="fa-solid fa-circle-play"></i>';
    flashCardsGrid.classList.remove('hidden');
    flashCardsFull.classList.add('hidden');

    const cards = meetingsObject[key].cards
    const cardsContainer = document.getElementById('flash-cards-container')
    const previousCardBtn = document.getElementById('previousCard')


    
  


    function updateCardPositions(cardNodes, backward){

        cardNodes.forEach(card =>{
            
                    if(backward == true){
            card.dataset.position = parseInt(card.dataset.position) + 1
        }else{
card.dataset.position = parseInt(card.dataset.position) - 1
        }

        adjustCardStyle(card, card.dataset.position)


        })

    }

    function adjustCardStyle(card, number){
        const questionnumber = card.dataset.questionnumber

        if (number == 0){
            console.log('card 0: ', card)
            card.style.marginLeft = '0px';
         card.style.rotate = '0deg'
        card.style.opacity = 1
        }else{card.style.opacity = 1 - number/10}
        

        if(number != 0){card.style.pointerEvents = 'none'}else{card.style.pointerEvents = 'all'}
    }

    play.onclick = () => {

        play.classList.toggle('playOn');

        if (play.classList.contains('playOn')) {
            cardsContainer.innerHTML = ''
            play.innerHTML = '<i class="fa-solid fa-grip"></i>';
            flashCardsGrid.classList.add('hidden');
            flashCardsFull.classList.remove('hidden');

            

            let cardCount = 0
            cards.forEach(card =>{

                const number = cardCount

                const backContent = card.back
                const frontContent = card.front
                const cardElement = document.createElement('div')
                cardElement.id = cardCount+1 ; cardElement.dataset.position = cardCount ; cardElement.dataset.questionnumber = cardCount+1
                cardElement.classList.add('card')
                cardElement.innerHTML = `<div class="card-shadow"></div> <div class="card-front">
                ${card.front}
            </div>
            <div class="card-back">
                <button class="btn-next">Próximo</button>
                ${card.back}
            </div>`
            
            const signal = Math.random() < 0.5 ? 1 : -1;
            const value = Math.floor(Math.random() * 12)

            if(cardCount !='0'){cardElement.style.marginLeft = (value * signal) + 'px';cardElement.style.rotate = value*signal +'deg';cardElement.style.marginBottom = (value * signal) + 'px'}

                cardElement.style.opacity = (1 - cardCount/10)
                cardElement.style.zIndex = 100-number
            
                if(number != 0){cardElement.style.pointerEvents = 'none'}else{cardElement.style.pointerEvents = 'all'}

                

                cardElement.onclick = () =>{
                    cardElement.classList.toggle('flipped')
                }

                cardCount++
                cardsContainer.append(cardElement)
            })

            const cardNodes = Array.from(cardsContainer.children)
            
            cardNodes.forEach(cardElement =>{
                cardElement.querySelector('.btn-next').onclick = () =>{

                    cardElement.classList.add('removed-card')
                    setTimeout(()=>{
                        updateCardPositions(cardNodes, false)
                    adjustCardStyle(cardElement, cardCount )
                    }, 800)
                    

                }
            })


            previousCardBtn.onclick = () =>{
                const isFirst =  cardNodes.reduce((acc, cardElement) =>{
                     const position = cardElement.dataset.position;
                     const questionNumber = cardElement.dataset.questionnumber;
             
             
             if (position === '0' && questionNumber === '1') {
                         return true;
                     }
                     return acc; 
                 }, false);
                
                 if (isFirst){return}

                 cardNodes.forEach(cardElement=>{

                    const position = cardElement.dataset.position;
                    const questionNumber = cardElement.dataset.questionnumber;
                    
                const signal = Math.random() < 0.5 ? 1 : -1;
                const value = Math.floor(Math.random() * 12)

                         if(position == '0' ){    
                            cardElement.style.marginLeft = (value * signal) + 'px';cardElement.style.rotate = value*signal +'deg';cardElement.style.marginBottom = (value * signal) + 'px'
                         }

                     if (cardElement.dataset.position == '-1'){
                         cardElement.classList.remove('removed-card')
                         cardElement.style.opacity = 1
                         cardElement.style.marginLeft = '0px';cardElement.style.rotate = '0deg';cardElement.style.marginBottom ='0px'
                        cardElement.style.pointerEvents = 'all'
                     }

                 })
                 updateCardPositions(cardNodes, true)
             
             }

        } else {
            play.innerHTML = '<i class="fa-solid fa-circle-play"></i>';
            flashCardsGrid.classList.remove('hidden');
            flashCardsFull.classList.add('hidden');
            Array.from(flashCardsGrid.children).forEach(card => card.classList.remove('active'));
        }
    };
}
