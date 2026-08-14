const setMeetingPage = document.getElementById('set-meeting-page');
const questionListElement = document.querySelector('.questions-list');
const addQuestionBtn = document.getElementById('add-question-button');
const topicInput = document.getElementById('topic-input');
import {
    meetingsObj,
    setCurrentTopic,
    getCurrentQuestions,
    setMeetingsObj,
    clearCurrentQuestions,
    callAlert
} from "./app.js";
import { meetingsRef, updateMeetingsDatabase } from "./firebase.js";

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
    };