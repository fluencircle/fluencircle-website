export let meetingsObj = {}
export const currentQuestions = [];
export let currentTopic = ''

export async function returnArrayFromDatabase(path) {
    let finalArray = [];
    let snapshot = await path.once('value');
    snapshot.forEach((item) => {
        finalArray.push(item.val());
    });
    return finalArray;
}




export let user = 'studant'

export function setUser(newValue){
    user = value
}

export function getUser(){
    return user
}

export function setMeetingsObj(newObject){
    meetingsObj = newObject
}  


export function setCurrentTopic(newTopic){
    currentTopic = newTopic
}

export function addNewCurrentQuestion(newQuestion){
    currentQuestions.push(newQuestion)
}

export function getCurrentQuestions(){
    return currentQuestions
}