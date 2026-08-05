
import * as firebase from "./firebase.js"
import {get} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { user, meetingsObj, getUser } from "./app.js"


const flashCardsGrid = document.querySelector('.flash-cards-grid')
const flashCardsFull = document.querySelector('.flash-cards-full')
const classesGrid = document.querySelector('.classes-grid')
const loadingGif = document.querySelector('.loading-gif')
const meetingsContent = document.querySelector('#meetings-content')
const flashCardsContent = document.querySelector('#flash-cards-content')
const backToMeetings = document.querySelector('.back-to-meetings')
const logo = document.getElementById('logo')
const backToHomeBtn = document.querySelector('.back-to-home')




backToHomeBtn.onclick = () =>{
    backToHome()
}

     logo.onclick = () => {
backToHome()
    }

backToMeetings.onclick = () =>{
     meetingsContent.classList.remove('hidden')
    flashCardsContent.classList.add('hidden')
}


function backToHome(){
            if (localStorage.getItem('user') == 'studant'){
            console.log('studant')
            window.location.href = 'studant-home-page.html'
        }else{
            window.location.href = 'index.html'
        }
}


meetingsContent.classList.remove('hidden')
flashCardsContent.classList.add('hidden')
loadMeetingsFromDatabase()

async function loadMeetingsFromDatabase(){
    loadingGif.classList.remove('hidden')
    const snapshot = await get(firebase.meetingsRef)
    const meetingsObject = snapshot.val()
    loadingGif.classList.add('hidden')
    createMeetingCards(meetingsObject)
}


function createMeetingCards(meetingsObject){
        classesGrid.innerHTML = ''
        const objKeys = Object.keys(meetingsObject)

        objKeys.forEach(key =>{
        const meetingCard = document.createElement('div')
        meetingCard.classList.add('meeting-card')
        meetingCard.innerHTML = `  
        <span class="meeting-card-number">${Number(key)+1}</span>
        <span class="meeting-card-topic">${meetingsObject[key]['topic']}</span>`

        meetingCard.addEventListener('click', e =>{loadFlashCards(meetingsObject, key)})
        classesGrid.append(meetingCard)
    })
}


function loadFlashCards(meetingsObject, key){
    const flashCardsObj = meetingsObject[key]['cards']?meetingsObject[key]['cards']:{}
    const flashCardsKeys =  Object.keys(flashCardsObj)
    const cardsNumber = flashCardsKeys.length


    


    document.querySelector('.flash-cards-grid').innerHTML = ''
    document.querySelector('#meetings-content').classList.add('hidden')
    document.querySelector('#flash-cards-content').classList.remove('hidden')
    document.querySelector('#flash-cards-content').querySelector('h1').innerHTML = meetingsObject[key]['topic']

    if(cardsNumber == 0){
        const play = document.querySelector('#play-cards-btn')
        play.style.pointerEvents = 'none'
        play.style.opacity = '.5'
 document.querySelector('.flash-cards-grid').innerHTML = `<div class="emptyCardsMessage">No flash cards for this meeting :(</div>`

    }else{

            flashCardsKeys.forEach(key => {
    const currentCard = flashCardsObj[key]
    createFlashCard(currentCard)
})
    }
    


setPlay(meetingsObject, key)
        
}

function createFlashCard(currentCard){
    const flashCard = document.createElement('div')
    flashCard.classList.add('flash-card')
    flashCard.innerHTML = `<span class="flash-card-front"><p>${currentCard['front']}</p></span>
    <span class="flash-card-back"><p>${currentCard['back']}</p></span>`
    flashCard.onclick = () =>{      
        flashCard.classList.toggle('active')
    }
    flashCardsGrid.append(flashCard)  
}

function setPlay(meetingsObject, key){
    const leftArrow = document.getElementById('left-arrow')
    const rightArrow = document.getElementById('right-arrow')
    const fullCard = document.getElementById('full-card')
    const play = document.querySelector('#play-cards-btn')
    play.classList.remove('playOn')
    play.innerHTML = `<i class="fa-solid fa-circle-play"></i>`
    flashCardsGrid.classList.remove('hidden')
    flashCardsFull.classList.add('hidden')

     play.onclick = ()=>{

        console.log('click')

function updateCard(){
            if(fullCard.classList.contains('active')){
                fullCard.classList.remove('active')
                setTimeout(()=>{
                        fullCard.innerHTML  = `<span class="flash-card-front">${meetingsObj[key]['cards'][cardNumber]['front']}</span>
                        <span class="flash-card-back">${meetingsObj[key]['cards'][cardNumber]['back']}</span>`
                },200)
            }else{
                fullCard.innerHTML  = `<span class="flash-card-front">${meetingsObj[key]['cards'][cardNumber]['front']}</span>
                        <span class="flash-card-back">${meetingsObj[key]['cards'][cardNumber]['back']}</span>`
            }
            updateArrowState()
        }

        function updateArrowState(){
            rightArrow.style.opacity = 1
            leftArrow.style.opacity = 1

            if(!(cardNumber<cardMax-1)){rightArrow.style.opacity = .3}
            if(!(cardNumber>0)){leftArrow.style.opacity = .3}
        }

        function switchCard(direction){
            if(direction == 'left'){
                if(cardNumber>0){cardNumber-=1}
            }else if(direction == 'right'){
                if(cardNumber<cardMax-1){cardNumber+=1}
            }else{
                console.log('Invalid option!')
            }
            updateCard()
        }
                    const flashCardsObj = meetingsObject[key]['cards']
                    const flashCardsKeys =  Object.keys(flashCardsObj)
                    let cardNumber = 0
                    let cardMax = flashCardsKeys.length
                    if(!(meetingsObject[key]['cards'])){meetingsObject[key]['cards']={}}
                

        updateCard()
                play.classList.toggle('playOn')
                console.log(play.classList.contains('playOn'))

                if(play.classList.contains('playOn')){
                    play.innerHTML = `<i class="fa-solid fa-grip"></i>`
                    
                    flashCardsGrid.classList.add('hidden')
                    flashCardsFull.classList.remove('hidden')       
                    leftArrow.style.opacity = .3

                   
                    fullCard.onclick = () =>{      
                    fullCard.classList.toggle('active')
                }
                
                
                window.onkeydown = (event) =>{
                        if(event.key == 'ArrowRight'){
                        switchCard('right')
                    }else if (event.key == 'ArrowLeft'){
                        switchCard('left')
                    }
                }
        
                    leftArrow.onclick = (e)=>{switchCard('left')}
                    rightArrow.onclick = (e)=>{switchCard('right')}


            }else{
                play.innerHTML = `<i class="fa-solid fa-circle-play"></i>`
                flashCardsGrid.classList.remove('hidden')
                flashCardsFull.classList.add('hidden')

                const flashElements = Array.from(flashCardsGrid.children)
                flashElements.forEach(card=>{
                    card.classList.remove('active')
                })
                
            }}
        
        
}






