/**
 * @file Pilha 3D de flashcards: virar, avançar, voltar, reiniciar e cartão final.
 *
 * Extraído de `cards.js`. O estilo de cada posição da pilha era repetido em
 * três lugares; agora fica em `applyStackPosition`.
 *
 * Cada `.card` guarda sua posição em `data-position`:
 *   0 = cartão do topo (clicável); 1, 2… = cartões embaixo; negativo = já removido.
 */
import { h, icon } from './dom.js';

const REMOVE_ANIMATION_MS = 120;

/**
 * Aplica a aparência de uma posição: o topo fica reto; os de baixo, levemente
 * deslocados e girados (ímpares para um lado, pares para o outro).
 * @param {HTMLElement} card
 * @param {number} position
 */
function applyStackPosition(card, position) {
  if (position < 0) return;
  const offset = `${position * 2}px`;
  card.style.marginLeft = position === 0 ? '0px' : offset;
  card.style.marginBottom = position === 0 ? '0px' : offset;
  card.style.rotate = position === 0 ? '0deg' : `${position % 2 === 0 ? 2 : -2}deg`;
  card.style.pointerEvents = position === 0 ? 'all' : 'none';
}

const positionOf = (card) => Number.parseInt(card.dataset.position, 10);

export class CardStack {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container onde os cartões são desenhados
   * @param {HTMLElement} options.progressBar barra com um segmento por cartão
   * @param {() => void} options.onFinish chamado quando o último cartão sai da pilha
   * @param {() => void} options.onExit botão "Voltar" do cartão final
   */
  constructor({ container, progressBar, onFinish, onExit }) {
    this.container = container;
    this.progressBar = progressBar;
    this.onFinish = onFinish;
    this.onExit = onExit;
    this.cards = [];
    this.completionCard = null;
    this.dismissTimer = null;
  }

  /**
   * Monta a pilha.
   * @param {{ front: string, back: string }[]} flashcards
   */
  load(flashcards) {
    this.clear();
    const total = flashcards.length;

    this.cards = flashcards.map((flashcard, index) => {
      const card = this.renderCard(flashcard, index, total);
      card.style.zIndex = String(100 - index);
      applyStackPosition(card, index);
      this.container.append(card);
      this.progressBar.append(h('div', { class: 'progress-item', dataset: { question: index + 1 } }, h('div', { class: 'fill' })));
      return card;
    });

    this.completionCard = this.renderCompletionCard();
    this.container.append(this.completionCard);
    this.updateProgress();
  }

  /** Remove a pilha e cancela qualquer transição que ainda não terminou. */
  clear() {
    this.cancelDismiss();
    this.container.replaceChildren();
    this.progressBar.replaceChildren();
    this.cards = [];
    this.completionCard = null;
  }

  /** @private */
  renderCard(flashcard, index, total) {
    const nextButton = h('button', { type: 'button', class: 'btn-next', title: 'Acertei / Concluído', 'aria-label': 'Acertei, próximo cartão' }, icon('fa-circle-check'));
    const card = h('div', { class: 'card', id: `card-${index + 1}`, dataset: { position: index, questionnumber: index + 1 }, tabindex: '0', 'aria-label': `Cartão ${index + 1} de ${total}. Enter vira o cartão.` },
      h('div', { class: 'card-front' }, h('p', null, `Dúvida (${index + 1}/${total})`), h('span', null, flashcard.front)),
      h('div', { class: 'card-back' }, nextButton, h('p', null, `Tradução (${index + 1}/${total})`), h('span', null, flashcard.back)));

    card.addEventListener('click', (event) => {
      if (!event.target.closest('.btn-next')) card.classList.toggle('flipped');
    });
    card.addEventListener('keydown', (event) => {
      if (event.target === card && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        card.classList.toggle('flipped');
      }
    });
    nextButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.dismiss(card);
    });
    return card;
  }

  /** @private */
  renderCompletionCard() {
    const card = h('div', { id: 'completion-card', class: 'card completion-card hidden' },
      h('div', { class: 'completion-card__body' },
        h('i', { class: 'fa-solid fa-circle-check completion-card__icon', 'aria-hidden': 'true' }),
        h('h3', { class: 'completion-card__title' }, 'Fim dos Flashcards!'),
        h('div', { class: 'completion-card__actions' },
          h('button', { type: 'button', id: 'finish-restart-btn', class: 'completion-btn completion-btn--secondary', onclick: () => this.restart() },
            icon('fa-rotate-left'), ' Reiniciar'),
          h('button', { type: 'button', id: 'finish-back-btn', class: 'completion-btn completion-btn--primary', onclick: () => this.onExit() },
            'Voltar'))));
    card.style.zIndex = '1'; // abaixo de todos os cartões da pilha
    return card;
  }

  /** Tira o cartão do topo e sobe os demais. @private */
  dismiss(card) {
    if (this.dismissTimer !== null || positionOf(card) !== 0 || !this.cards.includes(card)) return;
    card.classList.add('removed-card');
    this.dismissTimer = setTimeout(() => {
      this.dismissTimer = null;
      this.shiftPositions(-1);
      if (this.cards.every((c) => positionOf(c) < 0)) this.showCompletion();
      else this.updateProgress();
    }, REMOVE_ANIMATION_MS);
  }

  /** @private */
  cancelDismiss() {
    clearTimeout(this.dismissTimer);
    this.dismissTimer = null;
  }

  /** @private */
  shiftPositions(delta) {
    for (const card of this.cards) {
      const position = positionOf(card) + delta;
      card.dataset.position = String(position);
      applyStackPosition(card, position);
    }
  }

  /** @private */
  showCompletion() {
    this.progressBar.querySelectorAll('.progress-item').forEach((bar) => bar.classList.add('check'));
    this.completionCard.classList.remove('hidden');
    this.completionCard.style.pointerEvents = 'all';
    this.completionCard.style.marginLeft = '0px';
    this.completionCard.style.rotate = '0deg';
    this.onFinish();
  }

  /** Marca na barra os cartões que ficaram para trás do cartão do topo. @private */
  updateProgress() {
    const top = this.cards.find((card) => positionOf(card) === 0);
    if (!top) return;
    const current = Number(top.dataset.questionnumber);
    this.progressBar.querySelectorAll('.progress-item').forEach((bar) => {
      bar.classList.toggle('check', Number(bar.dataset.question) < current);
    });
  }

  /** Volta todos os cartões para a pilha, na ordem original. */
  restart() {
    this.cancelDismiss();
    this.completionCard?.classList.add('hidden');
    this.cards.forEach((card, index) => {
      card.classList.remove('removed-card', 'flipped');
      card.dataset.position = String(index);
      applyStackPosition(card, index);
    });
    this.updateProgress();
  }

  /** Devolve à pilha o último cartão removido. */
  previous() {
    if (this.dismissTimer !== null) return;
    this.completionCard?.classList.add('hidden');
    const top = this.cards.find((card) => positionOf(card) === 0);
    if (top && top.dataset.questionnumber === '1') return;
    const lastRemoved = this.cards.filter((card) => positionOf(card) < 0).pop();
    if (!lastRemoved) return;
    lastRemoved.classList.remove('removed-card');
    this.shiftPositions(+1);
    this.updateProgress();
  }
}
