const sidebar = document.querySelector('.sidebar');
const htmlTag = document.querySelector('html');
const pageName = htmlTag ? htmlTag.getAttribute('id') : '';



function setActivePage(currentPage) {
    if (!sidebar) return;
    
    sidebar.querySelectorAll('li').forEach(li => {
        const itemPage = li.dataset.page;
        
        // Trata correspondência exata ou equivalências (ex: set-meeting / manage-meetings)
        const isMatch = (itemPage === currentPage) || 
                        (itemPage === 'meetings' && (currentPage === 'manage-meetings' || currentPage === 'set-meeting')) ||
                        (itemPage === 'manage-meetings' && currentPage === 'set-meeting');

        li.classList.toggle('active', Boolean(isMatch));
    });
}


if (sidebar) {
    sidebar.querySelectorAll('li').forEach(li => {
        li.addEventListener('click', (event) => {
            const targetFile = li.dataset.file;
            if (targetFile) {
                window.location.href = targetFile;
            }
        });
    });

    // 3. Sincronização inicial do estado retrátil (sem delay de movimento de mouse)
    const initialHover = sidebar.matches(':hover');
    if (initialHover) {
        sidebar.classList.remove('retratil');
    } else {
        sidebar.classList.add('retratil');
    }

    // 4. Alternância instantânea via mouseenter / mouseleave direto na barra
    sidebar.addEventListener('mouseenter', () => {
        sidebar.classList.remove('retratil');
    });

    sidebar.addEventListener('mouseleave', () => {
        sidebar.classList.add('retratil');
    });
}

// Executa a definição da página ativa
setActivePage(pageName);


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




