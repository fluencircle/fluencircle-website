/**
 * @file Configurações web do Firebase: produção e Emulator local.
 *
 * Estes valores NÃO são segredos: o Firebase os entrega a qualquer navegador
 * que abra o site. O que protege os dados é:
 *   1. as regras do Realtime Database (proposta em `docs/firebase/database.rules.proposta.json`);
 *   2. o App Check;
 *   3. a restrição da chave por domínio no Google Cloud Console.
 *
 * Qual configuração vale em cada endereço é decidido em `environment.js`.
 * Nenhum outro arquivo repete estes valores.
 */

/**
 * Endereços em que o site publicado roda e que, SÓ ELES, usam o projeto real.
 * Qualquer outro endereço (localhost, 0.0.0.0, IP da rede, canal de pré-visualização
 * do Hosting, arquivo aberto do disco) usa o Emulator. Um domínio próprio precisa
 * ser incluído aqui ANTES do deploy (docs/operacao/SEGURANCA_E_DEPLOY.md).
 */
export const PRODUCTION_HOSTNAMES = Object.freeze([
  'fluentech-1e18a.web.app',
  'fluentech-1e18a.firebaseapp.com',
]);

/** Projeto REAL (`fluentech-1e18a`). Só é usado nos endereços de PRODUCTION_HOSTNAMES. */
export const PRODUCTION_FIREBASE_CONFIG = Object.freeze({
  apiKey: 'AIzaSyAG6PEwWQADPAs5RjwzqbrO0DRBXVIv7G0',
  authDomain: 'fluentech-1e18a.firebaseapp.com',
  databaseURL: 'https://fluentech-1e18a-default-rtdb.firebaseio.com',
  projectId: 'fluentech-1e18a',
  storageBucket: 'fluentech-1e18a.firebasestorage.app',
  messagingSenderId: '429228883820',
  appId: '1:429228883820:web:2c71b892fb57c23f05bd49',
});

/**
 * Projeto de DEMONSTRAÇÃO do Firebase Emulator. O prefixo `demo-` faz o
 * Firebase tratá-lo como projeto fictício: nada sai da máquina local.
 */
export const EMULATOR_PROJECT_ID = 'demo-fluencircle-audit';

/** Configuração usada com o Emulator (a chave é fictícia; o Emulator não a valida). */
export const EMULATOR_FIREBASE_CONFIG = Object.freeze({
  apiKey: 'demo-fluencircle-key',
  authDomain: `${EMULATOR_PROJECT_ID}.firebaseapp.com`,
  // O nome do banco define o "namespace" do Emulator, onde as regras de
  // firebase.emulator.json são carregadas: <projeto>-default-rtdb.
  databaseURL: `https://${EMULATOR_PROJECT_ID}-default-rtdb.firebaseio.com`,
  projectId: EMULATOR_PROJECT_ID,
  appId: 'demo-fluencircle-app',
});

/** Endereços do Emulator (mesmos de firebase.emulator.json). */
export const EMULATOR_HOSTS = Object.freeze({
  authUrl: 'http://127.0.0.1:9099',
  databaseHost: '127.0.0.1',
  databasePort: 9000,
});
