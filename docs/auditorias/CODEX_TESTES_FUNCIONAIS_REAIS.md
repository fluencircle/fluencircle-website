# Testes funcionais no Firebase Emulator

Execução em 20/11/2026 sobre a branch `audit/codex-recuperacao-funcional`, a partir de [`0e27c9a`](https://github.com/Lucas-Sperotto/fluencircle-website/commit/0e27c9abd1518f3d9a3ad2f0910b6d68e0b29caa). O roteiro usa dados sintéticos e a proposta de regras versionada.

## Pré-condições

- Node.js 22.22.3, npm 10.9.8, Java 21.0.13.1, Firebase CLI 15.37.0 e RTDB Emulator 4.11.2 na execução local.
- Playwright 1.63.0 com Chrome Headless Shell 153.0.8010.12, obtido com `npx playwright install chromium`.
- Projeto `demo-fluencircle-audit` e namespace `demo-fluencircle-audit-default-rtdb`. Hosting, Auth e RTDB usaram `127.0.0.1` nas portas `5050`, `9099` e `9000`, respectivamente.
- Chromium com fuso `America/Sao_Paulo` e relógio fixo em `2026-11-19T15:00:00.000Z` para agenda e revisão espaçada. Contas e dados vêm de `tests/fixtures/synthetic-data.mjs`.

## EXECUTADO

### Reprodução a partir de clones limpos

O clone do fork em `0e27c9a` recebeu as dependências do lockfile com `npm ci`. A auditoria automática do npm registrou 19 ocorrências na árvore de dependências de desenvolvimento. A base passou em 108 testes unitários (`npm test`), 79 casos de regras no RTDB Emulator oficial (`npm run test:rules`) e 50 cenários Playwright com Firebase simulado (`npm run test:e2e`).

No clone do fork, `npm run emulators` foi iniciado em processo próprio num namespace Linux de loopback. Após a inicialização de Auth e RTDB, `npm run emulators:seed` emitiu `SEED_OK` e `npm run emulators:verify` emitiu `SEED_VERIFY_OK`, com 5 perfis, 3 sessões, 2 planos e 3 decks. Uma leitura REST de `meeting_sessions` no namespace demo retornou 3 registros.

O clone do upstream em `67e7922` também gravou as 3 sessões no RTDB demo em Linux com `npm run emulators` e `npm run emulators:seed`. Esse snapshot usa a comparação antiga de caminho no ponto de entrada do script. A correção de invocação Windows, o marcador `SEED_OK` e `npm run emulators:verify` estão na linha do fork e foram propostos separadamente ao upstream. [Main do upstream em `67e7922`](https://github.com/fluencircle/fluencircle-website/tree/67e79220a3356bb6100afde2e8aaba66653b13eb) · [Correção no fork em `0e27c9a`](https://github.com/Lucas-Sperotto/fluencircle-website/commit/0e27c9abd1518f3d9a3ad2f0910b6d68e0b29caa) · [Draft upstream #4](https://github.com/fluencircle/fluencircle-website/pull/4)

### Navegador conectado ao Emulator

O comando abaixo inicia três emuladores, grava e verifica a carga demo, executa as especificações de `tests/e2e-emulator/` e encerra os processos. Use portas livres ou um ambiente isolado. A carga substitui os dados e contas do projeto demo na instância usada pelo teste.

```bash
npm ci
npx playwright install chromium
npm run test:e2e:emulator
```

Para isolar fisicamente a execução no Linux, baixei os três módulos da versão do SDK que o site importa e rodei a suíte num namespace com apenas a interface de loopback. Uma cópia temporária do código separou os logs e `TMPDIR` dedicado separou o localizador do Emulator de demais instâncias da máquina.

```bash
sdk_dir=$(mktemp -d)
for part in app auth database; do
  curl --fail --silent --show-error \
    "https://www.gstatic.com/firebasejs/10.8.0/firebase-${part}.js" \
    --output "$sdk_dir/firebase-${part}.js" || exit 1
done
run_tmp=$(mktemp -d)
TMPDIR="$run_tmp" E2E_FIREBASE_SDK_DIR="$sdk_dir" \
  unshare -Urn bash -c 'ip link set lo up && npm run test:e2e:emulator'
```

O seed releu o banco e imprimiu `SEED_OK` e `SEED_VERIFY_OK`. Ambas as verificações registraram 5 perfis, 3 sessões, 2 planos e 3 decks no namespace demo. A execução conjunta de `browser.test.mjs`, `plans.test.mjs` e `rooms.test.mjs` passou em **10 de 10 cenários**, em 33,5 segundos no runner de testes. O Chromium abriu arquivos HTML e módulos servidos pelo Hosting Emulator. O login pelo formulário atingiu `accounts:signInWithPassword` no Auth Emulator. Escritas bem-sucedidas na interface foram conferidas por leituras REST no RTDB local. A negação de leitura foi observada com o SDK e a identidade do navegador, sem acesso privilegiado.

| Cenário | Pré-condição e ação | Evidência observada |
| --- | --- | --- |
| Visitante | Contexto sem conta, acesso direto à home e ao tradutor | Home redireciona ao login. Tradutor informa ausência de sessão. Usuário anônimo recebe `PERMISSION_DENIED` ao ler perfis. |
| Administrador | Formulário com senha incorreta, conta sem perfil, conta revogada, conta admin e criação de aluno | As três recusas retornam mensagens específicas. Admin entra, vê dados em Acessos e permanece autenticado após criar a conta. A nova conta faz login em outro contexto. |
| Alunos e dados históricos | Ana e Bruno autenticados com índices e presenças sintéticas atuais e históricas | Ana vê `Technology & Daily Life`, `Travel` e a agenda Essencial. Bruno vê `Travel` por meio do índice booleano e a sessão `Travel II`. Ana recebe negação no deck alheio e na lista de sessões. A rota de mediação redireciona a aluna. |
| Agenda semanal | Mediador vincula tema e link a um horário do plano Essencial | O RTDB contém o encontro. A aluna vinculada vê tema, perguntas e link. Bruno recebe negação no registro. O mediador remove a associação e o RTDB confirma a remoção. |
| Edição concorrente de plano | Dois modais do mesmo plano abertos em abas do admin. Primeira aba exclui e depois adiciona horário | A gravação desatualizada da segunda aba é recusada. O novo horário recebe outra chave e o encontro da chave histórica permanece no RTDB. |
| Vínculo de plano legado | Aluna tem `plan` e `planName` no perfil. Administrador abre e salva o perfil | A aluna abre a agenda antes e depois da edição. O RTDB confirma o vínculo em `planId` e a remoção dos dois campos históricos. |
| Sessão, presença e estudo | Mediador publica, registra Ana, traduz e cria card. Aluna estuda o deck Travel | Visitante acompanha publicação e encerramento. Sua tradução mantém o deck intacto. RTDB confirma sessão, presença com `addedAt`, índice da aluna, card do mediador e avanço da revisão para a etapa 1. |
| Concorrência | Dois mediadores em contextos distintos e duas abas com a mesma conta | Cancelar preserva a sessão inicial. A troca exige confirmação, avança a versão e avisa a aba anterior. Encerrar ou fechar a apresentação anterior preserva a publicação mais recente. |
| Queda de conexão | Navegador do mediador conectado pelo WebSocket ao RTDB | A interrupção do transporte dispara `onDisconnect` no servidor. O tradutor observa a ausência de sessão viva. Ao restabelecer a conexão, o mesmo ID e a mesma versão reaparecem. |
| Círculos, slides e chat | Dois mediadores abrem salas, dois alunos escolhem salas diferentes e um usa largura móvel de 390 px | O slide chega à sala correta. A mensagem chega à aba do anfitrião. RTDB nega leitura do chat antes do ingresso. Queda de conexão desabilita envio e reconexão restaura a sala. Encerrar um círculo remove chat e vínculos temporários, preserva histórico e mantém o outro círculo em funcionamento. |

## VERIFICADO NO CÓDIGO

- `tests/e2e-emulator/support/browser.mjs` entrega os módulos oficiais do SDK Web `10.8.0` sem reescrita. O conjunto de rotas do teste limita requisições HTTP e WebSockets de aplicação e rejeita destinos inesperados. Fontes e ícones externos recebem CSS vazio.
- As respostas de tradução usam texto sintético no Playwright. A validação de presença, sessão, flashcard e revisão usa requisições reais entre o SDK Firebase no navegador e o Emulator.
- O job de CI `rules-emulator` executa a matriz de permissões oficial e, depois, o roteiro de browser com carga em uma nova instância demo. O job `e2e` mantém os cenários rápidos com Firebase simulado.

## RELATADO POR TERCEIRO

O aluno relatou que a carga não chegou ao banco durante a demonstração. O PR do fork documenta a falha de detecção da invocação direta em caminhos Windows e a inclusão de verificação pós-gravação. [PR #38 do fork](https://github.com/Lucas-Sperotto/fluencircle-website/pull/38)

## NÃO VERIFICADO

- A estação Windows do aluno e os logs da execução original. O teste Windows da CI verifica a invocação da CLI com `--check`.
- Regras Firebase ativas, dados reais, disponibilidade do Render e Gemini, abertura de links de reunião externos e dispositivos de áudio.
- Desempenho com carga de produção e comportamento de outros navegadores ou dispositivos físicos.
