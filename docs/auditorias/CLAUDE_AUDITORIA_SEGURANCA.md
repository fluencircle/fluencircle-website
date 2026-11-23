# Auditoria de segurança — FluenCircle (Claude)

**Data:** 20/11/2026 · **Autor:** Claude (Claude Code, modelo Opus 5.5) · **Issue:** #41 · **Base:** `main` =
`0e27c9abd1518f3d9a3ad2f0910b6d68e0b29caa` · **Branch:** `audit/claude-security-performance-architecture`.
**Revisão humana:** pendente. Uma IA que implementou correções **não** se declara revisora independente delas.

## 0. Limites desta auditoria

- **Nada em produção foi acessado:** nenhum dado real, nenhuma requisição ao projeto `fluentech-1e18a`, nenhuma
  sondagem do backend Render. Regras ativas, configuração do Hosting e código do backend **não estão acessíveis**.
- Testes executados somente no Firebase Emulator local (projeto `demo-fluencircle-audit`), em portas separadas
  (19000/19099) das usadas pelo Codex na mesma máquina, com dados sintéticos (`example.test`).
- Níveis: **EXECUTADO** · **VERIFICADO NO CÓDIGO** · **RELATADO POR TERCEIRO** · **NÃO VERIFICADO**.
- Classificação de cada achado: **vulnerabilidade confirmada** (reproduzida ou inequívoca no código), **hipótese não
  reproduzida** (depende de algo inacessível) ou **endurecimento** (não há falha hoje; reduz risco futuro).

## 1. Resumo

| ID | Severidade | Classe | Achado | Estado |
| --- | --- | --- | --- | --- |
| SEC-01 | **Alta** | Confirmada (EXECUTADO) | Seleção de ambiente falhava aberta: `0.0.0.0`, IP da rede, pré-visualização do Hosting e `file://` usavam o banco **real** | ✅ **Corrigida** (`66c4c66`) |
| SEC-02 | **Crítica** | Hipótese forte (regras ativas NÃO VERIFICADAS) | O cliente original só funciona se as regras ativas permitirem escrita anônima em `flashcards` e leitura ampla de sessões com PII | ⛔ Aberta — exige operador (Issues #5, #7) |
| SEC-03 | **Alta** | Confirmada no histórico | Credencial em `public/js/env.js` (`6c8f017`…`d680b33`), ainda acessível no histórico público | ⛔ Aberta — só o operador pode revogar (Issue #6) |
| SEC-04 | **Alta** | Confirmada no cliente; backend NÃO VERIFICADO | Backend de tradução recebe o **prompt inteiro** do navegador, sem autenticação nem limite verificável: relé aberto para o Gemini | ⛔ Aberta (Issue #8) |
| SEC-05 | Média | Confirmada | CSS do Font Awesome carregado do cdnjs **sem SRI** em 8 páginas | ✅ **Corrigida** (`2263bfb`): ícones servidos pelo site; CI exige SRI para terceiros |
| SEC-06 | Média | Confirmada no código | Contas criadas no navegador exigem **cadastro público** habilitado no Firebase Auth | ⛔ Aberta (Issue #8) — mitigada pelas regras propostas |
| SEC-07 | Média | Confirmada no código | Tradutor público continua tentando gravar card sem login em produção (`publicTranslatorSavesFlashcards: true`) | ⛔ Decisão humana (Issue #5) |
| SEC-08 | Média | Confirmada (histórico upstream) | PR upstream #2 (aberto) traz XSS armazenado e PII em nó público | ⚠️ Não mesclar como está (recomendação) |
| SEC-09 | Baixa | Endurecimento | `h()` aceitava `on*` como texto e URLs `javascript:` em atributos | ✅ **Endurecido** (`ui/dom.js`, ver §8) |
| SEC-10 | Baixa | Confirmada no código | Cabeçalhos de segurança/CSP só existem em `firebase.json.exemplo`; o Hosting real não é versionado | ⛔ Aberta (deploy) |
| SEC-11 | Baixa | Confirmada | Mensagens de erro exibem `error.message` cru (admin) | ⏳ Recomendação |
| SEC-12 | Baixa | Confirmada (proposta) | Mediador lê todos os perfis (e-mails de todos, inclusive admins) | ⏳ Minimização futura |
| SEC-13 | Baixa | Confirmada (proposta) | Admin pode rebaixar o próprio papel (perde acesso) | ⏳ Recomendação |
| SEC-14 | Baixa | Hipótese teórica | Leitura de encontro por `replace()` permite plano `x` ler plano `x_x` | ⏳ Teórico (IDs de 20 caracteres) |
| SEC-15 | Baixa | Aceita | SRS com datas em texto: a regra não impede avançar etapas sem esperar | Risco aceito (só afeta o próprio aluno) |
| SEC-16 | Info | EXECUTADO | `npm audit`: 19 avisos, **todos em dependências de teste** | Monitorar; nada é entregue ao navegador |

## 2. Modelo de ameaças

**Ativos:** dados pessoais (nome, e-mail, presença por sessão), vocabulário e progresso dos alunos, papéis
(quem é mediador/admin), integridade das sessões ao vivo, cota/custo do Gemini, credenciais de serviço.

**Atores:** visitante anônimo (tradutor público, QR code), aluno, mediador, administrador, conta Auth **sem perfil**
(qualquer pessoa pode criá-la — SEC-06), atacante remoto com a configuração web pública (não é segredo), operador do
Firebase/GCP (confiável, fora do código).

**Fronteiras de confiança:** navegador ↔ Firebase Auth; navegador ↔ Realtime Database (**as regras são a única
barreira**); navegador ↔ backend Render ↔ Gemini; CDNs (`www.gstatic.com` para o SDK, Google Fonts).

| STRIDE | Ameaça principal | Controle atual (main) | Lacuna |
| --- | --- | --- | --- |
| Spoofing | Conta sem perfil ou revogada usar o app | `resolveAccess` + regras com `hasProfile` | Regras ativas desconhecidas (SEC-02) |
| Tampering | Aluno trocar o próprio papel; anônimo gravar cards | `users/$uid` só admin grava; proposta nega escrita anônima | Produção pode permitir (SEC-02/07) |
| Repudiation | Quem encerrou/assumiu a sessão | `presenterId`, `version`, `takeoverOf` | Sem log de auditoria no servidor |
| Information disclosure | PII de presenças e perfis | Presença só com data; índice próprio do aluno (ADR-004) | Dados antigos com nome/e-mail até a migração; mediador lê todos os perfis (SEC-12) |
| Denial of service / custo | Abuso do tradutor e do cadastro | Limite de 300 caracteres **no cliente** | Sem limite no servidor verificável (SEC-04, SEC-06) |
| Elevation of privilege | Interface escondida tratada como autorização | Regras por operação; `initProtectedPage` só redireciona | Correto por desenho; depende de publicar as regras |

## 3. Achados

### SEC-01 — Seleção de ambiente falhava aberta (Alta, **corrigida**)

- **Evidência (EXECUTADO):** `resolveEnvironment()` de `main` devolvia `production` para `0.0.0.0`, `127.0.0.2`,
  `192.168.0.10`, `meu-pc.local`, `fluentech-1e18a--pr12-abc.web.app` e hostname vazio. `npm run serve` (Python 3.12)
  imprime `Serving HTTP on 0.0.0.0 port 5501 (http://0.0.0.0:5501/)`; abrir esse link conectava ao projeto real.
- **Impacto:** testes manuais, a semente ou o roteiro do aluno podiam ler e gravar dados reais — contrariando o README
  ("não há como apontar a máquina local para a produção") e o `AGENTS.md`.
- **Correção:** produção **só** para `PRODUCTION_HOSTNAMES` (`fluentech-1e18a.web.app`, `fluentech-1e18a.firebaseapp.com`);
  todo o resto usa o Emulator, com selo "Endereço não reconhecido" fora desta máquina; `npm run serve` escuta em
  `127.0.0.1`. ADR-002 revisado; gate de deploy para domínio próprio em `SEGURANCA_E_DEPLOY.md`.
- **Testes:** `tests/unit/environment.test.js` (11) e 2 E2E em `tests/e2e/ambiente.e2e.test.mjs` que **falham no
  código anterior** (EXECUTADO: 2 falhas com o `environment.js` de `0e27c9a`, 0 com a correção).
- **Risco residual:** um domínio próprio não listado faz o site publicado apontar para o Emulator (falha segura).

### SEC-02 — Regras ativas desconhecidas e cliente original dependente de regras abertas (Crítica, aberta)

- **Fato (VERIFICADO NO CÓDIGO):** `firebase.json` e `public/js/firebase.js` estavam no `.gitignore` do aluno
  (`dd8a9d8:.gitignore` linhas 10 e 14); as regras publicadas nunca foram versionadas.
- **Inferência a partir do cliente original** (se a versão do aluno funciona em produção, as regras ativas precisam
  permitir): (a) **gravação anônima** em `flashcards/{id}` — o tradutor público faz `POST` REST sem token
  (`dd8a9d8:circle-translator.html` ~237); (b) leitura de `meeting_sessions` **inteiro**, com nome e e-mail de todos os
  presentes, por **qualquer aluno** (`dd8a9d8:js/cards.js` 148); (c) leitura de `flashcards` inteiro por aluno (149);
  (d) no `3c6e7f0`, gravação de presença pelo próprio aluno e de chat.
- **Agravante (SEC-06):** como contas são criadas no navegador, o cadastro por e-mail precisa estar aberto; se as
  regras ativas forem do tipo `auth != null`, **qualquer pessoa cria uma conta e lê a PII de todas as presenças**.
- **Classe:** hipótese **não reproduzida** — confirmar exige exportar as regras (operador). Não foi sondado.
- **Resolução proposta:** exportar regras ativas → comparar com `docs/firebase/database.rules.proposta.json` (79/79
  testes no Emulator oficial, EXECUTADO) → staging → rodar a migração de privacidade → publicar com aprovação humana.

### SEC-03 — Credencial histórica (Alta, aberta)

- **Evidência (EXECUTADO, sem exibir o valor):** `public/js/env.js` com `export const apiKey = "…"` foi adicionado em
  `6c8f017` e apagado em `d680b33`; o commit é ancestral de `main`, `upstream/main` e `upstream/plans`. O valor tem
  53 caracteres e **não** é a chave web pública do Firebase (comparação por igualdade, sem impressão).
- **Incidente de processo desta auditoria:** um filtro de mascaramento local não reconheceu o formato do valor e ele
  apareceu na saída de um comando no terminal desta sessão. Nada foi gravado em arquivo, commit, PR, Issue ou relatório;
  `grep` confirmou ausência em todos os arquivos da worktree e do diretório temporário. O valor já é público no
  histórico do GitHub; o incidente **reforça** a rotação.
- **Resolução:** só o operador do Google Cloud pode identificar o serviço, revogar e registrar evidência sanitizada
  (Issue #6). Reescrever o histórico não substitui a revogação.

### SEC-04 — Tradução: relé aberto para o Gemini (Alta, aberta)

- **Evidência (VERIFICADO NO CÓDIGO):** `services/translate.service.js` envia `POST {prompt}` a
  `https://fluencircle-backend.onrender.com/api/gemini/generate` sem token, App Check ou identificador; o prompt é
  montado no navegador (`domain/translation.js`). O limite de 300 caracteres é só do campo HTML.
- **Impacto (hipótese — backend NÃO VERIFICADO):** qualquer pessoa pode enviar prompts arbitrários usando a cota do
  projeto (custo, abuso, conteúdo impróprio) e contornar as instruções do prompt (injeção).
- **Resolução:** contrato já proposto em `docs/backend/CONTRATO_BACKEND.md` (prompt fixo no servidor, App Check, limite
  por IP/sessão, teto de custo, CORS restrito). Não é corrigível só no frontend.

### SEC-05 — Terceiro sem SRI (Média, **corrigida**)

- **Evidência:** `<link href="https://cdnjs.cloudflare.com/.../font-awesome/6.5.0/css/all.min.css">` sem `integrity`
  em 8 páginas; um CDN comprometido injetaria CSS (exfiltração por seletores, interface falsa).
- **Correção:** ícones usados servidos pelo próprio site (`css/components/icons.css`, gerado); `verify-static.mjs`
  passa a **reprovar** qualquer script/folha de estilo de outra origem sem `integrity` + `crossorigin` (exceção
  justificada: CSS do Google Fonts, gerado por navegador). Prova de que a checagem pega a regressão: EXECUTADO.
- **Pendente (TO-BE):** o SDK do Firebase vem de `www.gstatic.com` por `import` de módulo, que não aceita SRI direto;
  opções: *import map* com `integrity` (suporte recente dos navegadores — NÃO VERIFICADO aqui) ou empacotar o SDK.

### SEC-06 — Cadastro público obrigatório pelo desenho (Média, aberta)

- **Evidência:** `core/firebase-auth.js` cria contas com `createUserWithEmailAndPassword` numa instância secundária.
- **Impacto:** a configuração do projeto precisa permitir cadastro por e-mail a **qualquer** cliente. Com as regras
  propostas, conta sem perfil não lê nem grava nada (EXECUTADO: ator `noProfile` em `tests/rules/rbac.rules.test.mjs`
  no Emulator), mas o cadastro aberto permite abuso de cota e enumeração de e-mails (`email-already-in-use`).
- **Resolução:** criação de contas no backend com Admin SDK e cadastro público desativado (contrato do backend).

### SEC-07 — Gravação anônima do tradutor ligada em produção (Média, decisão humana)

`config/environment.js` mantém `publicTranslatorSavesFlashcards: true` em produção "por compatibilidade". Se as regras
ativas permitirem (SEC-02), qualquer visitante grava em `flashcards/{qualquer sessão}` — spam ou conteúdo ofensivo nos
decks dos alunos. Desligar muda o produto: decisão do responsável (Issue #5), registrada no checklist.

### SEC-08 — PR upstream #2 aberto com XSS armazenado e PII pública (Média, recomendação)

Confirmado em `3c6e7f0` (detalhes em `CLAUDE_COMPATIBILIDADE_HISTORICA.md` §3): mensagens do "Fluêncio" montadas com
`innerHTML` a partir de texto de outros participantes e da resposta do Gemini; nome, e-mail e foto em `current_session`
(leitura pública). O PR continua **aberto** no upstream. Recomenda-se que o mantenedor não o mescle como está e que a
recuperação siga o caminho do PR #40 (regras por sala, texto via DOM). Nenhum comentário foi feito no upstream.

### SEC-09 — `h()` aceitava handlers em texto e URLs perigosas (Baixa, **endurecido**)

`h('a', { onclick: 'alert(1)' })` criava um atributo de evento inline e `h('a', { href: 'javascript:...' })` era aceito.
Nenhum chamador atual passa valores externos nesses atributos (VERIFICADO NO CÓDIGO: links vêm de constantes ou passam
por `isSafeMeetLink`). Endurecimento: `h()` recusa `on*` que não seja função e esquemas `javascript:`, `vbscript:` e
`data:` (exceto imagem) em `href`, `src`, `action`, `formaction`, `xlink:href`. Testes em
`tests/unit/dom-safety.test.js`.

### SEC-10 — Cabeçalhos de segurança só no exemplo (Baixa, aberta)

CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy` e `Permissions-Policy` existem em `docs/firebase/firebase.json.exemplo`
(atualizado: sem cdnjs). O Hosting de produção não é versionado — NÃO VERIFICADO quais cabeçalhos estão ativos.
Ao publicar, versionar o `firebase.json` real seguindo os gates.

### SEC-11 a SEC-15 — Baixas

- **SEC-11:** `admin.page.js` mostra `Erro ao processar requisição: ${error.message}` — pode expor detalhes do SDK.
  Preferir mensagem genérica e registrar o detalhe no console. (Arquivo alterado pelo PR #40; recomendação deixada lá.)
- **SEC-12:** `users/.read: isStaff` dá a qualquer mediador os e-mails de todos (inclusive admins). Necessário hoje para
  a busca da presença; futuro: nó `student_directory` só com nome, ou consulta por papel com índice.
- **SEC-13:** regras e interface permitem que um admin rebaixe o próprio papel (o último admin perderia o acesso;
  recuperação só pelo console). Sugestão: `role` com `$uid !== auth.uid || newData.val() === data.val()`.
- **SEC-14:** a leitura de `weekly_sessions/$week/$slot` pelo aluno usa `$slotKey.replace(planId + '_', '')`, que troca
  **todas** as ocorrências: o plano `x` leria o encontro do plano `x_x`. Teórico: os IDs do `push()` têm 20 caracteres.
  Se IDs manuais forem permitidos, gravar `planId` dentro do encontro e comparar na regra.
- **SEC-15:** datas do SRS em texto ISO impedem a regra de conferir o prazo; o aluno pode avançar etapas sem esperar,
  enganando só o próprio estudo (risco aceito no LEIA-ME).

### SEC-16 — Dependências (Info, EXECUTADO)

`npm audit` (20/11/2026): 19 avisos (5 altos, 14 moderados, 0 críticos), **todos em `devDependencies`** de teste
(`firebase-tools`, SDK `firebase` para Node usado pelos testes de regras, `@firebase/rules-unit-testing`, via
`@grpc/grpc-js`, `glob`, `uuid` etc.). As "correções" sugeridas são **rebaixamentos** de versão maior — não aplicar.
Nada do npm é entregue ao navegador: o site carrega o SDK 10.8.0 do `gstatic` (fev/2024; atualizar com E2E e Emulator).

## 4. Regras do Realtime Database (proposta) — análise por nó

EXECUTADO: 79/79 testes no **Firebase Emulator oficial** (portas isoladas) e 79/79 no simulador. A tabela resume a
leitura do código das regras (`firebase/rules/database.rules.source.mjs`).

| Nó | Leitura | Escrita | Validação relevante | Observação |
| --- | --- | --- | --- | --- |
| `users` | equipe; cada um o próprio | só admin | papel em lista fechada; `planId` existente | SEC-12, SEC-13 |
| `deleted_users` | admin; a própria conta | admin | `deletedAt` ISO | ok |
| `plans` | equipe; aluno só o próprio | admin | nome, preço, horários `HH:MM` | ok |
| `weekly_sessions` | equipe; aluno só encontros do próprio plano | equipe | link só `https://` sem aspas | SEC-14 |
| `meetings` (temas) | equipe | equipe | perguntas 1–500 caracteres | ok |
| `meeting_sessions` | equipe; aluno só `topic`/`startedAt` da própria | equipe | `mediatorEmail` = token e imutável; presença só com índice na mesma escrita | ok |
| `current_session` | **pública** | equipe | posse/versão/`takeoverOf`; só id, tema e posse | qualquer mediador pode apagar (risco aceito, ADR-003) |
| `flashcards` | equipe; aluno das sessões em que esteve | equipe | sessão precisa existir; sem campos extras | nega gravação anônima |
| `student_reviews` | o próprio | o próprio, só +1 etapa | carimbo da etapa obrigatório | SEC-15 |
| `user_sessions` | o próprio | equipe | só junto com a presença | ok |
| (raiz) | negada | negada | — | negação padrão |

**Revisão cruzada das regras novas do PR #40 (Codex, não integradas):** `live_rooms`, `live_room_members` e
`live_room_chat` excluem contas revogadas (`deleted_users`), exigem `senderUid === auth.uid`, chat só de membros e só
inclusão (sem edição), criação de sala só pelo mediador que abriu a sessão. Nenhuma vulnerabilidade confirmada.
Observações deixadas no PR: sem limite de taxa no chat; salas cujo anfitrião caiu ficam no banco (`online` removido) até
alguém limpar; membro não consegue sair; a lista de membros não é legível nem pelo anfitrião.

## 5. Frontend

| Verificação | Resultado |
| --- | --- |
| Sinks HTML (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`) em `public/js` | 0 (EXECUTADO, `verify-architecture.mjs`) |
| Dados exibidos via `textContent`/nós de texto (`h()`) | VERIFICADO NO CÓDIGO em todas as páginas |
| URLs dinâmicas em `href` | só o link de reunião, filtrado por `isSafeMeetLink` (https, sem aspas/espaços) e aberto com `noopener noreferrer` |
| `localStorage`/`sessionStorage` | só papel e e-mail para a moldura (`core/session-cache.js`); o papel é reconfirmado no banco a cada página |
| Variáveis globais | nenhuma escrita intencional em `window` (módulos ES) |
| Mensagens de erro | genéricas, exceto SEC-11 |
| Terceiros | Google Fonts (CSS dinâmico) e SDK do Firebase (`gstatic`); cdnjs removido (SEC-05) |

## 6. Integrações

- **Render/Gemini:** ver SEC-04. CORS, limite de taxa, custo e autenticação do backend: **NÃO VERIFICADOS** (código
  inacessível). O cliente não tem tempo limite na requisição: um *cold start* do Render deixa o botão "Traduzindo…"
  até o navegador desistir — melhoria de resiliência registrada no relatório de arquitetura.
- **Firebase Auth:** sessão persistida pelo SDK (IndexedDB); revogação efetiva pelas regras (perfil apagado), não pelo
  Auth (a conta continua existindo — exige Admin SDK).

## 7. Correções implementadas nesta branch

| Commit | Achado | Testes |
| --- | --- | --- |
| `66c4c66` fix(env) | SEC-01 | 11 unitários + 2 E2E (falham no código anterior) |
| `2263bfb` perf(icons) | SEC-05 (+ desempenho) | 6 unitários + 8 E2E; `verify-static` com checagem de SRI |
| `a5fe69c` fix(ui) | SEC-09 | 4 unitários (`tests/unit/dom-safety.test.js`); os 60 E2E exercitam todos os `h()` |
| `1067adf` fix(translation) | resiliência ligada a SEC-04 (tempo limite, formato, limite de tamanho) | 6 unitários com `fetch` falso |

## 8. Pendências que exigem pessoa ou infraestrutura

| Item | Quem | Bloqueia produção? |
| --- | --- | --- |
| Exportar regras ativas e comparar (SEC-02) | operador Firebase | **Sim** |
| Revogar/rotacionar a credencial histórica (SEC-03) | operador GCP | **Sim** |
| Backend controlado: tradução e contas (SEC-04, SEC-06) | mantenedor do backend | **Sim** |
| Decidir a gravação anônima do tradutor (SEC-07) | responsável pelo produto | **Sim** |
| Versionar `firebase.json` do Hosting com cabeçalhos (SEC-10) | mantenedor | Sim |
| Domínio próprio em `PRODUCTION_HOSTNAMES` antes do deploy (SEC-01) | mantenedor | Sim, se houver domínio |
| Não mesclar o PR upstream #2 como está (SEC-08) | mantenedor upstream | — |
