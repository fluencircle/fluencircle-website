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
