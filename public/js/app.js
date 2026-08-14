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


export function toggleDropdown(reference, dropdown, position){

    //Alert: the dropdown element must have position absolute with and no relative parent (CSS)

    //Type check
    if (position!='top' && position!='bottom' && position!='left' && position!='right'){
        console.log('Invalid parameter! The position parameter only receives the arguments bottom, top, right or left');return
    }
    if (!reference instanceof HTMLElement){console.log('Invalid parameter! The referece must be an HTMLElement'); return}
    if (!dropdown instanceof HTMLElement){console.log('Invalid parameter! The dropdown must be an HTMLElement'); return}


    //Hides dropdown if unhidden 
    if (!dropdown.classList.contains('hidden')){
        dropdown.classList.add('hidden')
        return
     }

    //Gets elements position on screen
    const dropdownRect = dropdown.getBoundingClientRect()
    const referenceRect = reference.getBoundingClientRect()

    //Positions the dropdown relative to the reference
    switch (position){
        case 'bottom':
            {
                dropdown.style.left = referenceRect.left + 'px'
                dropdown.style.top = (referenceRect.bottom + 10) + 'px'
                break
            }

            
        case 'left'://Bug: the dropdown gets top-centered
            {
                dropdown.style.right = (referenceRect.left + 10) +'px'
                dropdown.style.top = referenceRect.top + 'px'
                break
            }
        case 'right':
            {
                dropdown.style.left = (referenceRect.right + 10) +'px'
                dropdown.style.top = referenceRect.top + 'px'
                break
            }
        case 'top':
            {
                dropdown.style.left = referenceRect.left + 'px'
                dropdown.style.bottom = (referenceRect.top + 10) + 'px'
                break
            }
    }

    //Unhide the dropdown element
    dropdown.classList.remove('hidden')

}
