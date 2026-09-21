import {
    ref,
    get,
    push,
    set,
    remove
  } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
  import { database, auth } from "./firebase.js";
  import { showToast } from "./auth.js";
  import { toggleDropdown } from "./app.js";
  
  // Estados Globais
  let baseTemplateId = '';
  let activeSessionId = '';
  let currentTopic = '';
  let currentQuestions = [];
  let slideNumber = -1; // -1 = Slide de Título / 0+ = Perguntas
  let meetingsObj = {};
  
  // Estados da Lista de Presença
  let allStudents = [];
  let currentAttendees = {}; // { uid: { name, email } }
  
  // Elementos da Página
  const slideShowPage = document.getElementById('slide-show-page');
  const slide = document.querySelector('.slide');
  const slideContent = document.querySelector('.slide-content');
  const selectContent = document.querySelector('.select-content');
  
  const presentationSelect = document.getElementById('presentation-select');
  const optionList = document.getElementById('option-list');
  const selectedValueText = document.getElementById('value');
  const startBtn = document.getElementById('start-presentation-btn');
  const endMeetingBtn = document.getElementById('end-meeting-btn');
  
  // Elementos do Tradutor & Modal
  const translationModal = document.getElementById('translator-modal');
  const openTranslatorBtn = document.getElementById('open-translator-btn');
  const closeTranslatorBtn = document.getElementById('close-translator-btn');
  const normalTextInput = document.getElementById('normal-text');
  const translatedTextInput = document.getElementById('translated-text');
  const translationOptions = document.getElementById('translation-options');
  const translateBtn = document.getElementById('translate-btn');
  const addFlashCardsBtn = document.getElementById('add-flashcards-btn');
  
  // Elementos do Modal de Encerramento
  const endMeetingModal = document.getElementById('end-meeting-modal');
  const closeEndMeetingBtn = document.getElementById('close-end-meeting-btn');
  const cancelEndMeetingBtn = document.getElementById('cancel-end-meeting-btn');
  const confirmEndMeetingBtn = document.getElementById('confirm-end-meeting-btn');

  // Elementos da Lista de Presença
  const openAttendanceBtn = document.getElementById('open-attendance-btn');
  const attendanceDrawer = document.getElementById('attendance-drawer');
  const closeAttendanceBtn = document.getElementById('close-attendance-btn');
  const studentSelectTrigger = document.getElementById('student-select-trigger');
  const studentOptionsList = document.getElementById('student-options-list');
  const attendeesListContainer = document.getElementById('attendees-list');
  const presentCounter = document.getElementById('present-counter');
  const attendanceBadge = document.getElementById('attendance-count-badge');

  /**
   * 1. GUARD: Proteção de acesso da página
   */
  const currentRole = sessionStorage.getItem('fluentech_user_role');
  if (currentRole && currentRole !== 'mediator' && currentRole !== 'admin') {
    showToast('Acesso restrito a Mediadores.', 'error');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1000);
  }
  
  /**
   * 2. Carrega Reuniões do Realtime Database e popula o dropdown
   */
  async function loadMeetings() {
    const loadingGif = document.querySelector('.loading-gif');
    if (loadingGif) loadingGif.classList.remove('hidden');

    try {
      const snapshot = await get(ref(database, 'meetings'));
      if (loadingGif) loadingGif.classList.add('hidden');
  
      if (!snapshot.exists()) {
        if (selectedValueText) selectedValueText.textContent = "Nenhum tema cadastrado.";
        return;
      }
  
      meetingsObj = snapshot.val();
      optionList.innerHTML = '';
  
      Object.keys(meetingsObj).forEach((key, index) => {
        const meeting = meetingsObj[key];
        if (!meeting) return;
  
        const opt = document.createElement('div');
        opt.className = 'meeting-option';
        opt.dataset.value = key;
        const topicText = meeting.topic || `Reunião ${index + 1}`;
        opt.textContent = `${index + 1} — ${topicText.length > 40 ? topicText.substring(0, 40) + '...' : topicText}`;
  
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          baseTemplateId = key;
          currentTopic = meeting.topic || 'Sem tema';
          
          if (Array.isArray(meeting.questions)) {
            currentQuestions = meeting.questions;
          } else if (meeting.questions && typeof meeting.questions === 'object') {
            currentQuestions = Object.values(meeting.questions);
          } else {
            currentQuestions = [];
          }
  
          if (selectedValueText) selectedValueText.textContent = currentTopic;
          startBtn.classList.remove('unclickable');
          optionList.classList.add('hidden');
        });
  
        optionList.appendChild(opt);
      });
  
    } catch (err) {
      console.error("Erro ao buscar reuniões:", err);
      if (selectedValueText) selectedValueText.textContent = "Erro ao carregar reuniões.";
    }
  }

  // Carrega alunos cadastrados para a Lista de Presença
  async function loadStudentsList() {
    try {
      const snapshot = await get(ref(database, 'users'));
      if (!snapshot.exists()) return;

      const usersObj = snapshot.val();
      allStudents = Object.keys(usersObj)
        .map(uid => ({ uid, ...usersObj[uid] }))
        .filter(u => u.role === 'student' || !u.role); // Apenas alunos

      renderStudentDropdownOptions();
    } catch (err) {
      console.error("Erro ao buscar alunos para presença:", err);
    }
  }

  function renderStudentDropdownOptions() {
    studentOptionsList.innerHTML = '';
    
    if (allStudents.length === 0) {
      studentOptionsList.innerHTML = '<div class="custom-select-option" style="color: #8fa0b5;">Nenhum aluno cadastrado.</div>';
      return;
    }

    allStudents.forEach(student => {
      const isAlreadyAdded = !!currentAttendees[student.uid];
      const opt = document.createElement('div');
      opt.className = `custom-select-option ${isAlreadyAdded ? 'already-added' : ''}`;
      
      const displayName = (student.firstName && student.lastName)
        ? `${student.firstName} ${student.lastName}`
        : (student.email || 'Aluno');

      opt.innerHTML = `
        <span>${displayName}</span>
        ${isAlreadyAdded ? '<i class="fa-solid fa-check" style="color: var(--third-color);"></i>' : ''}
      `;

      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!isAlreadyAdded) {
          addStudentAttendance(student.uid, displayName, student.email || '');
          studentOptionsList.classList.add('hidden');
        }
      });

      studentOptionsList.appendChild(opt);
    });
  }

  // Adiciona presença no banco e na interface
  async function addStudentAttendance(uid, name, email) {
    if (!activeSessionId) return;
  
    try {
      // 1. Marca na sessão
      const sessionAttendeeRef = ref(database, `meeting_sessions/${activeSessionId}/attendees/${uid}`);
      await set(sessionAttendeeRef, {
        name,
        email,
        addedAt: new Date().toISOString()
      });
  
      // 2. Marca também no nó do aluno para consulta direta
      const userSessionRef = ref(database, `user_sessions/${uid}/${activeSessionId}`);
      await set(userSessionRef, true);
  
      currentAttendees[uid] = { name, email };
      updateAttendeesUI();
      renderStudentDropdownOptions();
      showToast(`${name} adicionado à lista de presença!`, 'success');
    } catch (err) {
      console.error("Erro ao registrar presença:", err);
      showToast('Falha ao salvar presença.', 'error');
    }
  }

  // Remove presença
  async function removeStudentAttendance(uid, name) {
    if (!activeSessionId) return;

    try {
      await remove(ref(database, `meeting_sessions/${activeSessionId}/attendees/${uid}`));
      delete currentAttendees[uid];
      updateAttendeesUI();
      renderStudentDropdownOptions();
      showToast(`${name} removido da presença.`, 'success');
    } catch (err) {
      console.error("Erro ao remover presença:", err);
    }
  }

  // Atualiza lista na tela e contadores
  function updateAttendeesUI() {
    attendeesListContainer.innerHTML = '';
    const uids = Object.keys(currentAttendees);

    const count = uids.length;
    if (presentCounter) presentCounter.textContent = count;
    if (attendanceBadge) attendanceBadge.textContent = count;

    if (count === 0) {
      attendeesListContainer.innerHTML = '<p class="empty-state" style="padding: 20px 0; font-size: 0.85rem;">Nenhum aluno adicionado ainda.</p>';
      return;
    }

    uids.forEach(uid => {
      const student = currentAttendees[uid];
      const item = document.createElement('div');
      item.className = 'attendee-item';
      item.innerHTML = `
        <div class="attendee-info">
          <span class="attendee-name">${student.name}</span>
          <span class="attendee-email">${student.email}</span>
        </div>
        <button class="remove-attendee-btn" title="Remover presença"><i class="fa-solid fa-xmark"></i></button>
      `;

      item.querySelector('.remove-attendee-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        removeStudentAttendance(uid, student.name);
      });

      attendeesListContainer.appendChild(item);
    });
  }

  // Eventos do Drawer de Presença
  openAttendanceBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    attendanceDrawer.classList.toggle('hidden');
  });

  closeAttendanceBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    attendanceDrawer.classList.add('hidden');
    studentOptionsList.classList.add('hidden');
  });

  studentSelectTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    studentOptionsList.classList.toggle('hidden');
  });

  // Fecha dropdown e drawer se clicar fora
  document.addEventListener('click', (e) => {
    if (studentOptionsList && !studentOptionsList.contains(e.target) && !studentSelectTrigger.contains(e.target)) {
      studentOptionsList.classList.add('hidden');
    }
    if (attendanceDrawer && !attendanceDrawer.classList.contains('hidden')) {
      if (!attendanceDrawer.contains(e.target) && !openAttendanceBtn.contains(e.target)) {
        attendanceDrawer.classList.add('hidden');
      }
    }
  });

  // Abrir/Fechar Dropdown de Seleção de Reunião
  presentationSelect.addEventListener('click', (e) => {
    if (e.target.closest('.meeting-option')) return;
    
    if (typeof toggleDropdown === 'function') {
      toggleDropdown(presentationSelect, optionList, 'bottom');
    } else {
      optionList.classList.toggle('hidden');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!optionList.classList.contains('hidden')) optionList.classList.add('hidden');
      if (attendanceDrawer && !attendanceDrawer.classList.contains('hidden')) attendanceDrawer.classList.add('hidden');
    }
  });

  document.addEventListener('click', (e) => {
    if (!presentationSelect.contains(e.target) && !optionList.contains(e.target)) {
      if (!optionList.classList.contains('hidden')) {
        optionList.classList.add('hidden');
      }
    }
  });
  
  loadMeetings();
  loadStudentsList();
  
  /**
   * 3. Renderização do Slide Atual
   */
  function updateSlideContent() {
    if (slideNumber === -1) {
      slide.innerHTML = `<span class="title">${currentTopic}</span>`;
    } else if (slideNumber < currentQuestions.length) {
      slide.innerHTML = `
        <div class="questionItem">
          <span class="number">${slideNumber + 1}</span>
          <span class="question">${currentQuestions[slideNumber]}</span>
        </div>
      `;
    } else {
      slide.innerHTML = `
        <div class="questionItem">
          <span class="question">🎉 Fim das perguntas do tema!</span>
        </div>
      `;
    }
  }
  
  function nextSlide() {
    if (slideNumber < currentQuestions.length) {
      slideNumber++;
      updateSlideContent();
    }
  }
  
  function prevSlide() {
    if (slideNumber > -1) {
      slideNumber--;
      updateSlideContent();
    }
  }
  
  /**
   * 4. Iniciar a Reunião (Cria o Evento Único no Banco)
   */
  startBtn.addEventListener('click', async () => {
    if (!baseTemplateId) return;
  
    startBtn.classList.add('unclickable');
    startBtn.textContent = 'Iniciando...';
  
    try {
      const sessionRef = push(ref(database, 'meeting_sessions'));
      activeSessionId = sessionRef.key;
      currentAttendees = {};
  
      await set(sessionRef, {
        templateId: baseTemplateId,
        topic: currentTopic,
        startedAt: new Date().toISOString(),
        mediatorEmail: auth.currentUser?.email || 'mediador',
        attendees: {}
      });
  
      selectContent.classList.add('hidden');
      slideContent.classList.remove('hidden');
      
      // Exibe botões flutuantes durante a sessão
      if (openTranslatorBtn) openTranslatorBtn.classList.remove('hidden');
      if (openAttendanceBtn) openAttendanceBtn.classList.remove('hidden');
      updateAttendeesUI();
      renderStudentDropdownOptions();
  
      slideNumber = -1;
      updateSlideContent();
      showToast('Reunião iniciada! Você já pode marcar a presença.', 'success');
  
    } catch (err) {
      console.error("Erro ao registrar sessão:", err);
      showToast('Falha ao iniciar evento no banco.', 'error');
    } finally {
      startBtn.classList.remove('unclickable');
      startBtn.textContent = 'Iniciar Reunião Oficial';
    }
  });
  
  /**
   * 5. Navegação dos Slides
   */
  window.addEventListener('keydown', (e) => {
    if (!translationModal.classList.contains('hidden')) return;
    if (attendanceDrawer && !attendanceDrawer.classList.contains('hidden')) return;
    if (slideContent.classList.contains('hidden')) return;
  
    if (e.key === 'ArrowRight' || e.key === ' ') {
      nextSlide();
    } else if (e.key === 'ArrowLeft') {
      prevSlide();
    }
  });
  
  slideContent.addEventListener('click', (e) => {
    if (e.target.closest('.back-button') || e.target.closest('.translation-button') || e.target.closest('.attendance-toggle-btn') || e.target.closest('.attendance-drawer')) return;
  
    const isRight = e.clientX > (window.innerWidth / 2);
    if (isRight) {
      nextSlide();
    } else {
      prevSlide();
    }
  });
  
  slideContent.addEventListener('mousemove', (e) => {
    const isLeft = e.clientX < (window.innerWidth / 2);
    slideContent.classList.toggle('cursor-left', isLeft);
    slideContent.classList.toggle('cursor-right', !isLeft);
  });
  
  // Encerrar reunião
  function openEndMeetingModal() {
    if (endMeetingModal) endMeetingModal.classList.remove('hidden');
  }
  
  function closeEndMeetingModal() {
    if (endMeetingModal) endMeetingModal.classList.add('hidden');
  }
  
  if (endMeetingBtn) {
    endMeetingBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEndMeetingModal();
    });
  }
  
  closeEndMeetingBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeEndMeetingModal();
  });
  
  cancelEndMeetingBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeEndMeetingModal();
  });
  
  endMeetingModal?.addEventListener('click', (e) => {
    if (!e.target.closest('.modal')) closeEndMeetingModal();
  });
  
  confirmEndMeetingBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeEndMeetingModal();
  
    slideContent.classList.add('hidden');
    selectContent.classList.remove('hidden');
    
    if (openTranslatorBtn) openTranslatorBtn.classList.add('hidden');
    if (openAttendanceBtn) openAttendanceBtn.classList.add('hidden');
    if (attendanceDrawer) attendanceDrawer.classList.add('hidden');
    if (translationModal) translationModal.classList.add('hidden');
  
    showToast('Sessão encerrada com sucesso. Presenças e flashcards gravados!', 'success');
  });
  
  /**
   * 6. Tradutor Síncrono e Criação de Flashcards
   */
  if (openTranslatorBtn) {
    openTranslatorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      translationModal.classList.remove('hidden');
      normalTextInput.value = '';
      translatedTextInput.value = '';
      addFlashCardsBtn.classList.add('unactive');
      normalTextInput.focus();
    });
  }
  
  if (closeTranslatorBtn) {
    closeTranslatorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      translationModal.classList.add('hidden');
    });
  }
  
  translationModal.addEventListener('click', (e) => {
    if (!e.target.closest('.modal')) translationModal.classList.add('hidden');
  });
  
  async function fetchTranslation(text, direction) {
    const langPair = direction === 'pt' ? 'pt|en' : 'en|pt';
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`;
  
    const res = await fetch(url);
    if (!res.ok) throw new Error('Falha de conexão');
    const json = await res.json();
    return json.responseData?.translatedText || 'Erro na tradução';
  }
  
  translateBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const text = normalTextInput.value.trim();
    if (!text) {
      normalTextInput.focus();
      return;
    }
  
    translatedTextInput.value = 'Traduzindo...';
    translateBtn.disabled = true;
  
    try {
      const result = await fetchTranslation(text, translationOptions.value);
      translatedTextInput.value = result;
      addFlashCardsBtn.classList.remove('unactive');
    } catch (err) {
      console.error("Erro no tradutor:", err);
      translatedTextInput.value = 'Erro ao traduzir';
      showToast('Falha na conexão do tradutor.', 'error');
    } finally {
      translateBtn.disabled = false;
    }
  });
  
  normalTextInput.addEventListener('keyup', (e) => {
    addFlashCardsBtn.classList.add('unactive');
    if (e.key === 'Enter') translateBtn.click();
  });
  
  addFlashCardsBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!activeSessionId) {
      showToast('Nenhuma reunião ativa.', 'error');
      return;
    }
  
    const original = normalTextInput.value.trim();
    const translated = translatedTextInput.value.trim();
    if (!original || !translated || addFlashCardsBtn.classList.contains('unactive')) return;
  
    const isPT = translationOptions.value === 'pt';
    const frontWord = isPT ? translated : original;
    const backWord = isPT ? original : translated;
  
    addFlashCardsBtn.disabled = true;
    addFlashCardsBtn.textContent = 'Salvando...';
  
    try {
      const cardRef = push(ref(database, `flashcards/${activeSessionId}`));
      await set(cardRef, {
        front: frontWord,
        back: backWord,
        topic: currentTopic,
        sessionId: activeSessionId,
        createdAt: new Date().toISOString()
      });
  
      showToast(`Card "${frontWord}" adicionado aos Flashcards!`, 'success');
      translationModal.classList.add('hidden');
  
    } catch (err) {
      console.error("Erro ao salvar card:", err);
      showToast('Erro ao salvar no banco.', 'error');
    } finally {
      addFlashCardsBtn.disabled = false;
      addFlashCardsBtn.textContent = 'Adicionar ao Flash Card';
    }
  });