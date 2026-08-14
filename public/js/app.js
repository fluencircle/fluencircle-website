export let meetingsObj = {};
export const currentQuestions = [];
export let currentTopic = '';

export async function returnArrayFromDatabase(path) {
    const finalArray = [];
    const snapshot = await path.once('value');
    snapshot.forEach((item) => {
        finalArray.push(item.val());
    });
    return finalArray;
}

export function setMeetingsObj(newObject) {
    meetingsObj = newObject || {};
}

export function setCurrentTopic(newTopic) {
    currentTopic = newTopic;
}

export function addNewCurrentQuestion(newQuestion) {
    currentQuestions.push(newQuestion);
}

export function getCurrentQuestions() {
    return currentQuestions;
}

export function clearCurrentQuestions() {
    currentQuestions.length = 0;
}


export const alertElement = document.querySelector('.alert');

export function callAlert(type, message) {
    alertElement.classList.toggle('danger', type === 'danger');
    alertElement.querySelector('.alert-icon').innerHTML = type === 'danger'
        ? '<i class="fa-solid fa-circle-exclamation"></i>'
        : '<i class="fa-solid fa-circle-check"></i>';
    alertElement.querySelector('p').textContent = message;
    alertElement.classList.remove('hidden');
    setTimeout(() => alertElement.classList.add('hidden'), 2500);
}
