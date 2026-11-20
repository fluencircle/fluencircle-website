/**
 * @file Seleção VERIFICÁVEL de ambiente (Issue #15), FECHADA por padrão.
 *
 * Regra única e sem exceções: SÓ os endereços publicados listados em
 * `PRODUCTION_HOSTNAMES` (firebase.config.js) usam produção. Qualquer outro
 * endereço usa o Firebase Emulator com o projeto de demonstração.
 *
 * Antes, a regra era a inversa ("endereço local → Emulator; o resto →
 * produção") e falhava ABERTA: `npm run serve` anuncia http://0.0.0.0:5501/, e
 * abrir esse link — ou um IP da rede local, um canal de pré-visualização do
 * Hosting, outro 127.x ou um arquivo do disco — conectava ao banco REAL.
 *
 * Consequências deliberadas:
 * - `npm run serve`, Live Server ou `npm run emulators` NUNCA tocam dados reais,
 *   qualquer que seja o endereço usado para abrir a página.
 * - Não existe parâmetro de URL para forçar produção: testar contra produção
 *   exige decisão humana fora do código.
 * - O ambiente de teste mostra um selo na tela (ui/environment-badge.js), que os
 *   testes E2E conferem; endereço que não é desta máquina ganha um aviso próprio.
 * - Domínio próprio de produção precisa entrar em `PRODUCTION_HOSTNAMES` antes
 *   do deploy; senão o site publicado aponta para o Emulator e não funciona (falha segura).
 */
import {
  PRODUCTION_FIREBASE_CONFIG, PRODUCTION_HOSTNAMES, EMULATOR_FIREBASE_CONFIG, EMULATOR_HOSTS, EMULATOR_PROJECT_ID,
} from './firebase.config.js';

export const ENVIRONMENTS = Object.freeze({
  PRODUCTION: 'production',
  EMULATOR: 'emulator',
});

/** Nomes desta máquina. `0.0.0.0` é o que servidores de desenvolvimento anunciam. */
const LOCAL_HOSTNAMES = new Set(['localhost', '::1', '[::1]', '0.0.0.0']);

/** Minúsculas, sem espaços e sem o ponto final de FQDN (`exemplo.com.`). */
export function normalizeHostname(hostname) {
  return String(hostname ?? '').trim().toLowerCase().replace(/\.$/, '');
}

/** Endereço desta máquina: localhost, *.localhost, 127.0.0.0/8, [::1] ou 0.0.0.0. */
export function isLocalHostname(hostname) {
  const name = normalizeHostname(hostname);
  return LOCAL_HOSTNAMES.has(name) || name.endsWith('.localhost') || /^127(?:\.\d{1,3}){3}$/.test(name);
}

/**
 * @param {string|undefined|null} hostname valor de `location.hostname`
 * @returns {'production'|'emulator'}
 */
export function resolveEnvironment(hostname) {
  return PRODUCTION_HOSTNAMES.includes(normalizeHostname(hostname)) ? ENVIRONMENTS.PRODUCTION : ENVIRONMENTS.EMULATOR;
}

/**
 * Configuração de cada ambiente.
 * - `badge`: texto do selo exibido na tela (null em produção).
 * - `publicTranslatorSavesFlashcards`: o tradutor público tenta gravar o card
 *   direto no banco, sem login (comportamento herdado). Em produção fica LIGADO
 *   só por compatibilidade com as regras ativas, que não conhecemos; as regras
 *   propostas negam essa escrita e a página trata a negação. No Emulator fica
 *   DESLIGADO: o caminho correto é o backend controlado (Issues #5 e #8,
 *   docs/backend/CONTRATO_BACKEND.md). Desligar em produção é decisão humana
 *   registrada em docs/entrega/CHECKLIST_FINAL.md.
 */
export const ENVIRONMENT_SETTINGS = Object.freeze({
  [ENVIRONMENTS.PRODUCTION]: Object.freeze({
    name: ENVIRONMENTS.PRODUCTION,
    firebase: PRODUCTION_FIREBASE_CONFIG,
    emulators: null,
    badge: null,
    publicTranslatorSavesFlashcards: true,
    liveRooms: false,
  }),
  [ENVIRONMENTS.EMULATOR]: Object.freeze({
    name: ENVIRONMENTS.EMULATOR,
    firebase: EMULATOR_FIREBASE_CONFIG,
    emulators: EMULATOR_HOSTS,
    badge: `Ambiente de teste local — Firebase Emulator (${EMULATOR_PROJECT_ID}). Dados sintéticos; nada aqui chega à produção.`,
    publicTranslatorSavesFlashcards: false,
    liveRooms: true,
  }),
});

/**
 * Configuração para um endereço. Fora de produção e fora desta máquina (IP da
 * rede, `*.local`, pré-visualização do Hosting, arquivo do disco) o ambiente
 * continua sendo o Emulator, mas o selo avisa que o endereço não é reconhecido.
 * @param {string|undefined|null} hostname
 */
export function settingsForHostname(hostname) {
  const settings = ENVIRONMENT_SETTINGS[resolveEnvironment(hostname)];
  if (settings.name !== ENVIRONMENTS.EMULATOR || isLocalHostname(hostname)) return settings;
  const shown = normalizeHostname(hostname) || 'arquivo local';
  return Object.freeze({
    ...settings,
    badge: `Endereço não reconhecido (${shown}): usando o Firebase Emulator local (${EMULATOR_PROJECT_ID}), nunca a produção.`,
  });
}

/** Ambiente desta página (calculado uma vez, no carregamento). */
export const CURRENT_ENVIRONMENT = resolveEnvironment(globalThis.location?.hostname);

/** Configuração do ambiente desta página. */
export const currentEnvironment = settingsForHostname(globalThis.location?.hostname);
