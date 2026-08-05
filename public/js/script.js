import { meetingsRef, updateMeetingsDatabase } from "./firebase.js"
import {get} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { meetingsObj, setUser, currentTopic, setCurrentTopic, addNewCurrentQuestion, getCurrentQuestions, setMeetingsObj} from "./app.js";



   
   const homePage = document.getElementById('home-page')
        const setMeetingPage = document.getElementById('set-meeting-page')
        const slideShowPage = document.getElementById('slide-show-page')
        const logo = document.getElementById('logo')
        const questionListElement = document.querySelector('.questions-list')
        const addQuestionBtn = document.getElementById('add-question-button')
        const topicInput = document.getElementById('topic-input')
        const openSetMeetingButton = document.getElementById('open-set-meeting-button')
        const openSlideShowButton = document.getElementById('open-slide-show-button')
        const slide = document.querySelector('.slide')
        const translateBtn = document.getElementById('translate-btn')




    
        let topic = ''

        localStorage.setItem('user', 'admin')

        logo.onclick = () => {window.location.href = 'index.html'}

        openSetMeetingButton.onclick = () =>{

            openSetMeetingButton.classList.add('active')
            
            setMeetingPage.classList.remove('hidden')
            homePage.classList.add('hidden')

            topicInput.value = currentTopic

            topicInput.addEventListener('focusout', ()=>{
                setCurrentTopic(topic.value)
                if(topicInput.value == ''){
                    
                }else{
                    topic = topicInput.value
                    
                }
                
            })


            renderQuestionCards(getCurrentQuestions())
  

            addQuestionBtn.onclick = () =>{

                const currentQuestions = getCurrentQuestions()
                const questionsSize = currentQuestions.length
                const newQuestionCard = document.createElement('div')
                let questionNumber = questionsSize + 1
                
                
   

                
                newQuestionCard.innerHTML = `<span class='questionNumber'>${questionNumber}</span><input type="text" class="new-question-input" placeholder="Type your question here..."> <button class="delete-question-btn"><i class="fa-solid fa-trash"></i></button>`
                const input = newQuestionCard.querySelector('.new-question-input')
                newQuestionCard.classList.add('question-card')
                newQuestionCard.setAttribute('data-number', `${questionsSize}`)

                        const deleteQuestionBtn = newQuestionCard.querySelector('.delete-question-btn')
                deleteQuestionBtn.onclick = () =>{
                    currentQuestions.splice(newQuestionCard.getAttribute('data-number'), 1)
                    renderQuestionCards(currentQuestions)
                }
            
                      input.addEventListener('focusout',() =>{

                    if(input.value == ''){
                        console.log('empty')
                        questionListElement.removeChild(newQuestionCard)
                    }else{
                        const value = input.value
                        currentQuestions.push(`${value}`)
                    }
                }
                      ) 
                questionListElement.append(newQuestionCard)
                input.focus()
                
                

            }

            const setButton = document.getElementById('set-button')

            setButton.onclick = () =>{

                const currentQuestions = getCurrentQuestions()
                console.log(currentQuestions)

                 const questionsSize = currentQuestions.length
                 console.log(topicInput.value)
      if (topicInput.value == ''){

                        callAlert('danger', 'Add the topic!')
                        topicInput.classList.add('danger-input')
                        
                        setTimeout(() => {
                            topicInput.classList.remove('danger-input')
                        }, 2000);
                        return
                    }

                if(questionsSize == 0){
                    callAlert('danger', 'Add at least 1 question!')
                    return
                }  
           
                const meetingNumber = Object.keys(meetingsObj).length || 0
                const questionsArray = Array.from(questionListElement.children)
                

                meetingsObj[meetingNumber] = {}
                meetingsObj[meetingNumber]['questions'] = {}
                meetingsObj[meetingNumber]['cards'] = {}
                meetingsObj[meetingNumber][`topic`] = topicInput.value

                questionsArray.forEach(question =>{
                    const questionNumber = question.getAttribute('data-number')
                    meetingsObj[meetingNumber][`questions`][`${questionNumber}`] = question.querySelector('input').value

                    
                })
                
                
                updateMeetingsDatabase(meetingsObj)

                callAlert('normal', 'Meeting added succesfully')
                setMeetingPage.classList.add('hidden')
                homePage.classList.remove('hidden')
            }
           
        }

        function renderQuestionCards(questionsArray){
            questionListElement.innerHTML = ''
            let count = 0
            console.log(questionsArray)
            questionsArray.forEach((question) =>{
            
                
                const questionCard = document.createElement('div')
                questionCard.classList.add('question-card')
                questionCard.innerHTML = `<span class='questionNumber'>${count+1}</span><input type='text' class="new-question-input" placeholder="Type your question here...", value='${question}'><button class="delete-question-btn"><i class="fa-solid fa-trash"></i></button>`   
                const deleteQuestionBtn = questionCard.querySelector('.delete-question-btn')
                questionCard.setAttribute('data-number', `${count}`)
                deleteQuestionBtn.onclick = () =>{

                    console.log(count)

                    console.log(questionsArray)

                    console.log(questionsArray[count])
                    
                    questionsArray.splice(questionCard.getAttribute('data-number'), 1)
                    renderQuestionCards(questionsArray)
                }
                count+=1
                questionListElement.append(questionCard)
            }      
            )
           
        }


openSlideShowButton.onclick = () =>{
    homePage.classList.add('hidden')
    translationButton.classList.remove('hidden')




    slideShowPage.querySelector('.select-content').classList.remove('hidden')
    slideShowPage.querySelector('.slide-content').classList.add('hidden')
    slideShowPage.classList.remove('hidden')


    const presentationSelect = document.getElementById('presentation-select')


    async function renderSelect(){
        const snapshot = await get(meetingsRef)
        const updatedMeetings = snapshot.val()

        setMeetingsObj(updatedMeetings)


    
const keys = Object.keys(meetingsObj)

    presentationSelect.innerHTML = ''

    keys.forEach(key =>{
        const option = document.createElement('option')
        const name = `${Number(key)+1} - ${meetingsObj[key]['topic'].substring(0, 40)}...`
        option.innerHTML = `${name}`
        option.value = key

        presentationSelect.append(option)
    })

    }

    renderSelect()

    

    const startPresentationBtn = document.getElementById('start-presentation-btn')


    

    startPresentationBtn.onclick = () =>{
        const slideContent = slideShowPage.querySelector('.slide-content')




    slideShowPage.querySelector('.select-content').classList.add('hidden')
    slideShowPage.querySelector('.slide-content').classList.remove('hidden')

    topic = meetingsObj[presentationSelect.value]['topic']
    slide.innerHTML = `<span class="title">${topic}</span>`

    const questions = meetingsObj[presentationSelect.value]['questions']
    

    let slideNumber = -1
    const questionNumber =  Object.keys(questions).length

    console.log(meetingsObj)


   
    function nextSlide(){
        if(slideNumber<questionNumber){ slideNumber+=1}
         updatedSlideContent()
    }

    function updatedSlideContent(){
             if(slideNumber == -1){
                slide.innerHTML = `<span class="title">${topic}</span>`

            }else{

                if(questions[slideNumber]){
                    slide.innerHTML = `<div class='questionItem'><span class="number">${slideNumber+1}</span><span class="question">${questions[slideNumber]}</span></div>`
                }else{
                    slide.innerHTML = `<span class="endSlideMessage">End of Presentation</span>`

                }
            }
    }

    function previousSlide(){
        console.log('previous')
    if(slideNumber>=0){slideNumber-=1}
    updatedSlideContent()
    }
    


    window.onkeydown = (event) =>{
        const key = event.key
        console.log(event.key)
        if (key == 'ArrowRight' || key == 'ArrowLeft'){

            if(key == 'ArrowRight'){nextSlide()}else if (key == 'ArrowLeft'){previousSlide()}
   
        }}



            slideContent.onclick = e =>{
        const screenSize = window.innerWidth
        const clickPosition = e.clientX

      
            const screenHalf = clickPosition < (screenSize/2) ? 'left' : 'right' 
            if (screenHalf == 'left'){previousSlide()}else if(screenHalf == 'right'){nextSlide()}
    }

    slideContent.onmousemove = e =>{
         const screenSize = window.innerWidth
        const mousePosition = e.clientX
        const screenHalf = mousePosition < (screenSize/2) ? 'left' : 'right' 
        console.log(screenHalf)
        if (screenHalf == 'left'){slideContent.classList.add('cursor-left');slideContent.classList.remove('cursor-right')}else if(screenHalf == 'right'){slideContent.classList.add('cursor-right');slideContent.classList.remove('cursor-left')}


    }



    
    }



}



        const openFlashCardsButton = document.getElementById('open-flash-cards-button')
        openFlashCardsButton.onclick = () =>{window.location.href = 'flash-cards.html'; setUser('admin')}




async function traduzirTexto(texto, config) {
    console.log(config)

    let deIdioma = 'pt'
    let paraIdioma  = 'en'

    if(config == 'pt'){
     deIdioma = 'pt'
     paraIdioma  = 'en'
    }else{
        paraIdioma = 'pt'
     deIdioma  = 'en' 
    }
    

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${deIdioma}&tl=${paraIdioma}&dt=t&q=${encodeURIComponent(texto)}`;

    try {
        const resposta = await fetch(url);
        
        if (!resposta.ok) {
            throw new Error('Erro na rede ao tentar traduzir');
        }

        const dados = await resposta.json();
        
   
        return dados[0][0][0]; 
    } catch (erro) {
        console.error("Falha na tradução:", erro);
        return "Erro ao traduzir"; 
    }
}





const normalTextInput = document.getElementById('normal-text')
const translatedTextInput = document.getElementById('translated-text')
const translationOptions = document.getElementById('translation-options')
const addFlashCardsBtn = document.getElementById('add-flashcards-btn')
const addFlashCardContent = document.getElementById('add-flashcard-content')
const translationContent = document.getElementById('translation-content')
const selectMeeting = document.getElementById('select-meeting')
const saveFlashcardBtn = document.getElementById('save-flashcard-btn')
const translationModal = document.getElementById('translator-modal')
const translationButton = document.querySelector('.translation-button')
const alertElement = document.querySelector('.alert')
const closeTranslationBtn = document.querySelector('.close-translation-btn')





translateBtn.onclick = () =>{
    const result = translate()
}


closeTranslationBtn.onclick = () =>{
    closeTranslation()
}

function closeTranslation(){
    translationModal.classList.add('hidden')
}


async function translate () {

    if(normalTextInput.value != ''){
        const result = await traduzirTexto(normalTextInput.value, translationOptions.value )
        translatedTextInput.value = result
        addFlashCardsBtn.classList.remove('unactive')
    }else{
        normalTextInput.style.border = '1px solid red'
        normalTextInput.setAttribute('placeholder', 'TYPE A FUCKING TEXT')
        setTimeout(() => {
         normalTextInput.style.border = '1px solid transparent'
         normalTextInput.setAttribute('placeholder', 'Type a text')
}, 2000);
    }

}

    addFlashCardsBtn.onclick = () =>{
        translationContent.classList.add('hidden')
        addFlashCardContent.classList.remove('hidden')
        selectMeeting.innerHTML = ''

        const meetingsKeys = Object.keys(meetingsObj)
        
        meetingsKeys.forEach(key =>{
            const option = document.createElement('option')
            const formatedText = `${Number(key)+1} - ${meetingsObj[key]['topic'].substring(0,40)}...`
        
            option.innerHTML = `${formatedText}`
            option.setAttribute('value', `${key}`)

            selectMeeting.append(option)
        })
    }

    saveFlashcardBtn.addEventListener('click', e=>{
        if(!( meetingsObj[selectMeeting.value]['cards'])){ meetingsObj[selectMeeting.value]['cards'] = {}}

        console.log(meetingsObj)

        const cardsNumber = Object.keys(meetingsObj[selectMeeting.value]['cards'] || {}).length
        meetingsObj[selectMeeting.value]['cards'][`${cardsNumber}`] = {front:`${normalTextInput.value}`, back: `${translatedTextInput.value}`}
        updateMeetingsDatabase(meetingsObj)
        translatedTextInput.value

        callAlert('Confirm', 'Flashcard added successfully!')
        translationModal.classList.add('hidden')
        

    })


    translationModal.onclick = (e) =>{
        if(!e.target.closest('.modal')){
            translationModal.classList.add('hidden')
        }
    }


    normalTextInput.addEventListener('keyup', e=>{
        addFlashCardsBtn.classList.add('unactive')
    })
    

    translationButton.onclick = () =>{
        translationModal.classList.remove('hidden')
        normalTextInput.value = ''
        translatedTextInput.value = ''
        addFlashCardsBtn.classList.add('unactive')
        translationContent.classList.remove('hidden')
        addFlashCardContent.classList.add('hidden')
    }

function callAlert(type, message){
    if(type == 'danger'){
        alertElement.classList.add('danger')
        alertElement.querySelector('.alert-icon').innerHTML = '<i class="fa-solid fa-circle-exclamation"></i>'
    }else{
        alertElement.classList.remove('danger')
        alertElement.querySelector('.alert-icon').innerHTML = '<i class="fa-solid fa-circle-check"></i>'
    }

    alertElement.querySelector('p').innerHTML = `${message}`

    alertElement.classList.remove('hidden')
    setTimeout(()=>{
        alertElement.classList.add('hidden')
    },2000)
}


function backToHome(){
    window.location.href = 'index.html'
}

function backToSelection(){
        slideShowPage.querySelector('.select-content').classList.remove('hidden')
    slideShowPage.querySelector('.slide-content').classList.add('hidden')
}


window.backToSelection = backToSelection
window.backToHome = backToHome



const sidebar = document.querySelector('.sidebar')
const activeOption = sidebar.querySelector('.active')




function clearSelection(){
    const sidebar = document.querySelector('.sidebar')
    const liArray = Array.from(sidebar.querySelectorAll('li')).children

    liArray.forEach(li=>{
        console.log(li   )
    })
}



