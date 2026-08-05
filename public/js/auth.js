 import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, deleteUser } from"https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

 export const auth = getAuth()
 const loadingGif = document.querySelector('.loading-gif')
const logoutBtn = document.getElementById('logout-btn')

        export function authErrorTreatment(error){
                     switch (error.code){
            case 'auth/invalid-email':
            
                alert('E-mail inválido!')
                break
            case 'auth/missing-password':
                alert('Insira uma senha')
                break
            case 'auth/weak-password':
                alert('Senha muito fraca')
                break
            case 'auth/email-already-in-use':
                alert('Esse e-mail já está em uso!')
                break
            case 'auth/invalid-credential':
                alert('Senha Incorreta!')
                break
        }
        }

      export function signIn(email, password){
        loadingGif.classList.remove('hidden')
      signInWithEmailAndPassword(auth, email, password).then((user)=>{window.location.href = 'index.html'; loadingGif.classList.add('hidden')
      }).catch(error =>{
        loadingGif.classList.add('hidden')
        authErrorTreatment(error)
      })
    }

  export function createAccount(email, password){
    loadingGif.classList.remove('hidden')
      createUserWithEmailAndPassword(auth, email, password).then((user)=>{
        loadingGif.classList.add('hidden')
      }).catch(error =>{
         authErrorTreatment(error)
         loadingGif.classList.add('hidden')
      })
    }


            onAuthStateChanged(auth, user =>{
            const page = document.querySelector('#authHTML')
            if(!user && !page){
                window.location.href='auth.html'
            }
        })


        if(logoutBtn){
            logoutBtn.onclick = e =>{
                const auth = getAuth()
                loadingGif.classList.remove('hidden')
                signOut(auth).then(()=>{
                    loadingGif.classList.remove('hidden')
                }).catch((error) => {
      console.error("Erro ao deslogar:", error);
    });
                
            }
        }else{
            console.log('Sem botão de logout!')
        }
        


