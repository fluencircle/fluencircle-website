/**
 * @file Constantes de configuração da aplicação (endereços e limites).
 *
 * Tudo o que pode mudar entre ambientes ou que é um "número mágico" de regra
 * de negócio fica aqui, para não se espalhar pelo código das páginas.
 */

/** Endereço do backend (Render) que repassa os pedidos de tradução ao Gemini. */
export const BACKEND_URL = 'https://fluencircle-backend.onrender.com';

/** Rota do backend que recebe `{ prompt }` e devolve `{ text }`. */
export const TRANSLATE_ENDPOINT = `${BACKEND_URL}/api/gemini/generate`;

/** Tamanho máximo do texto enviado ao tradutor (limita abuso e custo). */
export const TRANSLATOR_MAX_LENGTH = 300;

/**
 * Tempo máximo de espera pela tradução. O plano gratuito do Render "dorme" e a
 * primeira chamada pode levar dezenas de segundos; sem limite, o botão ficava
 * em "Traduzindo..." até o navegador desistir.
 */
export const TRANSLATE_TIMEOUT_MS = 30000;

/** Tamanho mínimo de senha aceito pelo Firebase Auth. */
export const MIN_PASSWORD_LENGTH = 6;

/** Tempo, em milissegundos, que um aviso (toast) fica visível. */
export const TOAST_DURATION_MS = 3500;

/** Espera antes de redirecionar quem abre uma página sem permissão. */
export const ACCESS_DENIED_REDIRECT_MS = 1000;
