/**
 * @file Tradução Inglês ⇄ Português pelo backend (que repassa ao Gemini).
 *
 * Única implementação do cliente HTTP do tradutor; antes havia uma cópia em
 * `gemini.js` e outra dentro de `circle-translator.html`.
 *
 * Resiliência: a requisição tem tempo limite (`TRANSLATE_TIMEOUT_MS`), a
 * resposta precisa ter o formato `{ text: string }` e o texto respeita
 * `TRANSLATOR_MAX_LENGTH` também aqui (não só no campo da tela). O limite REAL
 * contra abuso e custo precisa estar no backend (docs/backend/CONTRATO_BACKEND.md).
 */
import { TRANSLATE_ENDPOINT, TRANSLATOR_MAX_LENGTH, TRANSLATE_TIMEOUT_MS } from '../config/app.config.js';
import { buildTranslationPrompt } from '../domain/translation.js';

/** Falha de tradução com motivo: 'empty' | 'too-long' | 'http' | 'invalid-response' | 'timeout'. */
export class TranslationError extends Error {
  /** @param {string} message @param {string} code @param {{ cause?: unknown, status?: number }} [details] */
  constructor(message, code, { cause, status } = {}) {
    super(message, { cause });
    this.name = 'TranslationError';
    this.code = code;
    this.status = status;
  }
}

/**
 * @param {string} text palavra ou frase
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options] injetáveis para teste
 * @returns {Promise<string>} tradução
 * @throws {TranslationError|Error} quando o texto é inválido, o backend falha, demora ou responde fora do formato
 */
export async function translateText(text, { fetchImpl = globalThis.fetch, timeoutMs = TRANSLATE_TIMEOUT_MS } = {}) {
  const value = String(text ?? '').trim();
  if (!value) throw new TranslationError('Texto vazio.', 'empty');
  if (value.length > TRANSLATOR_MAX_LENGTH) {
    throw new TranslationError(`Texto acima de ${TRANSLATOR_MAX_LENGTH} caracteres.`, 'too-long');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(TRANSLATE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: buildTranslationPrompt(value) }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new TranslationError(`Erro no servidor de tradução: HTTP ${response.status}.`, 'http', { status: response.status });
    }
    let data;
    try {
      data = await response.json();
    } catch (cause) {
      if (controller.signal.aborted) throw cause;
      throw new TranslationError('Resposta do tradutor não é JSON.', 'invalid-response', { cause });
    }
    if (!data || typeof data.text !== 'string') {
      throw new TranslationError('Resposta do tradutor sem o campo "text".', 'invalid-response');
    }
    return data.text.trim();
  } catch (error) {
    if (controller.signal.aborted) {
      throw new TranslationError(`O tradutor não respondeu em ${Math.round(timeoutMs / 1000)} s.`, 'timeout', { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
