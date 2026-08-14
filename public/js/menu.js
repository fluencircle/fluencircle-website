const sidebar = document.querySelector('.sidebar');
const pageName = document.querySelector('html').getAttribute('id')



function setActivePage(pageName) {
    sidebar.querySelectorAll('li').forEach(li => {
        li.classList.toggle('active', li.dataset.page === pageName);
    });
}


sidebar.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', (event) => {
        const targetFile = li.dataset.file;
        if (targetFile) {
            window.location.href = targetFile;
        }
    });
});


setActivePage(pageName)


const isMouseOverSidebar = sidebar.matches(':hover')

console.log(isMouseOverSidebar)




window.addEventListener('mousemove', e =>{
    const isMouseOverSidebar = sidebar.matches(':hover')

    console.log(isMouseOverSidebar)
    
    if(isMouseOverSidebar){
        sidebar.classList.remove('retratil')
    }else{
        sidebar.classList.add('retratil')
    }
})




