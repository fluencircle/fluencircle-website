# Auditoria arquitetural — FluenCircle (Claude)

**Data:** 20/11/2026 · **Autor:** Claude (Claude Code, modelo Opus 5.5) · **Issue:** #41 · **Base:** `main` =
`0e27c9abd1518f3d9a3ad2f0910b6d68e0b29caa` · **Comparada com:** `dd8a9d8` (main original do aluno), `3c6e7f0` (branch
`plans` original) e o PR #40 do Codex (`b771a1b`, Draft). **Revisão humana:** pendente.

Níveis de evidência: **EXECUTADO** · **VERIFICADO NO CÓDIGO** · **RELATADO POR TERCEIRO** · **NÃO VERIFICADO**.

## 1. Resumo

A arquitetura atual (HTML/CSS/JS sem framework, módulos ES em camadas, Firebase por CDN) é **adequada ao tamanho do
produto** e foi preservada. Os problemas encontrados não pedem troca de tecnologia: pedem **fechar contratos** (ambiente,
backend, regras ativas), **escalar as leituras da equipe** e **remover custos medidos** no carregamento. Esta branch
corrigiu o que era demonstrável sem conflitar com o PR #40 e deixou o restante como TO-BE com desenho e custo.

| ID | Tema | Achado | Estado |
| --- | --- | --- | --- |
| ARQ-01 | Camadas | Separação boa, mas a matriz de camadas e ciclos **não eram verificados** pela CI | ✅ Verificação adicionada (`c3f825b`) |
| ARQ-02 | Ambiente | Seleção de ambiente falhava aberta para produção | ✅ Corrigido (`66c4c66`, SEC-01) |
| ARQ-03 | Carregamento | 21 folhas por cadeia de `@import` e Font Awesome inteiro do CDN | ✅ Folha única e ícones gerados (`76a0e23`, `2263bfb`) |
| ARQ-04 | Escala | Telas da equipe leem `meeting_sessions` e `flashcards` **inteiros** a cada visita | ⏳ TO-BE desenhado (§5), após o PR #40 |
| ARQ-05 | Contrato com o backend | O navegador monta o prompt do Gemini; não há versão nem autenticação de API | ⏳ Depende do backend (SEC-04) |
| ARQ-06 | Falhas parciais | Falha de rede ao verificar o acesso devolve a pessoa ao login sem explicação; tradução sem tempo limite | ✅ tempo limite (`1067adf`); ⏳ verificação de acesso |
| ARQ-07 | Estado "ao vivo" | `current_session` único (ADR-003) e salas `live_rooms` do PR #40 convivem sem ADR | ⏳ ADR necessário |
| ARQ-08 | Duplicação | Abrir/fechar modal e tecla Esc repetidos em 3 páginas, sem prender o foco | ⏳ Baixa prioridade |
| ARQ-09 | Observabilidade | Erros só vão ao `console` do navegador | ⏳ TO-BE |
| ARQ-10 | Dados antigos | Compatibilidade depende de rodar a migração antes do novo frontend | ⏳ Ver `CLAUDE_COMPATIBILIDADE_HISTORICA.md` |

## 2. Comparação com as versões originais

| Aspecto | `dd8a9d8` (aluno, main) | `3c6e7f0` (aluno, `plans`) | `main` atual |
| --- | --- | --- | --- |
| Organização do JS | 11 arquivos por página; `presentation.js` 681 linhas, `cards.js` 554 | `presentation.js` 1.668 linhas (salas, chat, voz, slides) | 52 módulos em 6 camadas (2.124 linhas em `pages/`, 955 em `services/`, 853 em `domain/`, 696 em `ui/`, 229 em `core/`, 194 em `config/`) |
| Acesso ao banco | `ref(database, '...')` espalhado pelas páginas | idem, + Socket.IO para sinalização | só `services/`; nomes dos nós em `services/db-paths.js` |
| Regras de negócio | misturadas ao DOM (`calculateSRSStatus` dentro de `cards.js`) | idem | `domain/` puro, sem imports, coberto por testes unitários |
| Exibição de dados | `innerHTML` com dados do banco em várias telas | idem + XSS no chat | `h()`/nós de texto; 0 sinks HTML (EXECUTADO) |
| Configuração Firebase | `js/firebase.js` **fora do Git**; cópia da configuração em `admin.js` | idem | `config/firebase.config.js` único; ambiente por endereço |
| Autorização na tela | papel em `sessionStorage`, conferido só se o cache existir | idem | papel lido do banco em toda página; regras propostas no Emulator |
| CSS | `style.css` com 3.505 linhas (1 requisição) | CSS global + páginas | partes por seção + **folha única gerada** (`css/app.css`, 1 requisição) |
| Testes | nenhum | nenhum | 153 unitários, 79 de regras (Emulator oficial), 60 E2E (Firebase simulado) — EXECUTADO |

**Métricas do grafo de imports (EXECUTADO, `scripts/architecture-rules.mjs`):** 52 módulos, 153 imports, **0 ciclos**,
0 violações de camada. Maior acoplamento de entrada: `ui/dom.js` (19), `core/roles.js` e `ui/toast.js` (10). Maior
saída: `presentation.page.js` (13), `admin.page.js` e `flashcards.page.js` (12) — orquestradores, o esperado.

## 3. Achados

### ARQ-01 — Camadas boas, mas sem verificação completa (corrigido)

`verify-architecture.mjs` conferia sinks HTML, imports em `domain/`, CDN fora de `core/` e caminhos do banco fora de
`services/`. A matriz descrita no README (quem pode importar quem), imports quebrados e ciclos **não** eram verificados.
Agora `scripts/architecture-rules.mjs` (puro, 10 testes com violações injetadas) impõe:

```text
domain → nada · config → config · core → core, config · services → services, core, domain, config
ui → ui, core, config · pages → todas · nada importa pages/ além de pages/ · sem DOM em domain/, services/, config/
```

A árvore do PR #40 (54 módulos) também passa — a regra não quebra o trabalho do Codex ao integrar.

### ARQ-02 — Isolamento de ambiente (corrigido)

Ver SEC-01. O desenho continua o mesmo (um ponto de decisão em `config/environment.js`), mas agora **fecha** por padrão:
produção só em `PRODUCTION_HOSTNAMES`. Staging continua inexistente (Issue #15); a lista de endereços é o lugar certo para
acrescentar um terceiro ambiente quando houver projeto separado.

### ARQ-03 — Carregamento (corrigido; detalhes no relatório de desempenho)

O padrão "artefato gerado + verificação na CI" que o projeto já usava para as regras (`rules:build`/`rules:check`) foi
estendido ao CSS (`css:build`/`css:check`) e aos ícones (`icons:build`/`icons:check`). Isso mantém "sem etapa de build"
para quem só quer servir `public/`, e evita o custo medido da cadeia de `@import` e das fontes de ícone. Decisão em
`docs/engenharia/ADR-006-ARTEFATOS-GERADOS.md`.

### ARQ-04 — Leituras da equipe crescem com o total de dados (TO-BE)

**Medido** (Emulator local, sem rede): `flash-cards.html` e `manage-meetings.html` da equipe baixam 966 KiB com 300
sessões e **6,2 MiB com 1.500 sessões**; no perfil móvel, ~50 s até mostrar dados. O aluno, ao contrário, lê só o
próprio índice (46 leituras pequenas, 107–141 KiB) — o ADR-004 funciona.

**Desenho proposto (não implementado nesta branch** para não editar os mesmos arquivos do PR #40 — `core/firebase.js`,
`flashcards.page.js` e o Firebase simulado dos E2E):

1. Regra: `meeting_sessions/.indexOn: ["startedAt"]`.
2. `services/sessions.service.js`: `listRecentSessions({ limit = 30, before })` com
   `query(ref, orderByChild('startedAt'), endBefore(before), limitToLast(limit))`.
3. Contagem de cards: ler `flashcards/{id}` só das sessões da página (30 leituras pequenas em paralelo), ou manter
   `meeting_sessions/{id}/flashcardCount` por transação (exige migração).
4. Interface: "Carregar sessões anteriores"; o número no selo passa a contar a partir da mais recente (o atual conta a
   partir da mais antiga, o que exige ler todas).
5. Teste de regressão: o benchmark em escala grande (`BENCH_ARGS="--scale=large"`) com teto de bytes por página.

Estimativa (não medida): ~120 KiB por página da equipe em qualquer escala, contra 966 KiB–6,2 MiB hoje.

### ARQ-05 — Contrato frontend ↔ backend

O backend recebe `{ prompt }` e devolve `{ text }`; o **prompt é montado no navegador** (`domain/translation.js`). Não há
versão de API, autenticação, App Check nem identificador de sessão. O contrato proposto em
`docs/backend/CONTRATO_BACKEND.md` (prompt no servidor, `POST /api/v1/...`, limites e teto de custo) é a solução; até lá o
frontend não consegue limitar abuso. Nesta branch o cliente ganhou tempo limite, validação de formato e limite de
tamanho (`1067adf`) — resiliência, não segurança.

### ARQ-06 — Falhas de rede e estados parciais

Pontos fortes (VERIFICADO NO CÓDIGO): escritas multicaminho atômicas (presença, exclusão de sessão, revogação);
`Promise.allSettled` nos decks do aluno; transações com posse/versão na sessão ativa; reconexão restaura a presença.

Lacunas:

- **Verificação de acesso com falha de rede:** `requireAuth()` trata `reason: 'error'` como "sem acesso" e redireciona
  ao login, que tenta de novo e fica parado sem mensagem. Proposta: mostrar "Não foi possível verificar seu acesso" com
  "Tentar de novo", sem deslogar (`services/auth.service.js`, `pages/shared/page-setup.js`).
- **Telas da equipe** usam `Promise.all`: uma leitura negada derruba a lista inteira com "Erro ao carregar".
- **Tradução sem tempo limite** — corrigido (30 s, `1067adf`).

### ARQ-07 — Dois conceitos de "ao vivo"

`current_session` (nó único, público, para o tradutor — ADR-003) e, no PR #40, `live_rooms/{sessionId}` (autenticado,
por sessão). Os dois fazem sentido separados (o tradutor público não deve ler dados de sala), mas a relação precisa de
ADR: quem publica no tradutor quando há várias salas, o que acontece com o QR code e como a presença da sala vira presença
acadêmica (hoje continua manual). Recomendado: **ADR-006b "Salas ao vivo"** antes de levar o PR #40 a produção.

### ARQ-08 — Duplicação e responsabilidades

`admin.page.js`, `plans.page.js` e `presentation.page.js` repetem abrir/fechar modal por classe e a tecla Esc, sem prender
o foco (o `confirmDialog` já é central). Um `ui/modal.js` com foco preso e retorno do foco reduziria código e melhoraria a
acessibilidade. Os maiores módulos (`plans.page.js` 345 linhas, `domain/plans.js` 272) estão dentro do razoável.

### ARQ-09 — Observabilidade

Erros vão só ao `console` do navegador; não há registro central, métricas nem rastreio de falhas do backend. Para
produção: um endpoint de erros no backend controlado (sem PII, com amostragem) ou Firebase Performance/Crashlytics web,
e logs estruturados no Render. **TO-BE**, depende do backend.

### ARQ-10 — Compatibilidade com dados históricos

Os nós e nomes antigos foram mantidos (`meetings` = temas, `meeting_sessions` = sessões). A leitura do aluno depende de
`user_sessions`, que precisa ser reconciliado pela migração **antes** do deploy (D-01 em
`CLAUDE_COMPATIBILIDADE_HISTORICA.md`). As regras propostas recusam campos extras em escritas novas; registros antigos
com campos extras continuam legíveis.

## 4. Framework: migrar ou não?

A missão pede benefício mensurável antes de recomendar mudança estrutural. Dados (EXECUTADO, `page-performance.mjs`):

| Componente do peso por página (após as correções) | Medido |
| --- | --- |
| Total transferido (páginas internas) | ~194–220 KiB |
| JavaScript total | 88–148 KiB em 19–38 requisições |
| SDK do Firebase (gstatic, app + auth + database) | ~80–85% do JavaScript (estimado pela diferença entre bytes de terceiros e locais) |
| JavaScript do próprio site | ~18–40 KiB |

| Opção | Benefício esperado | Custo | Recomendação |
| --- | --- | --- | --- |
| Manter módulos ES sem framework (+ geradores) | já medido: −45–59% de bytes e −300 ms de FCP móvel | baixo (feito) | ✅ **Adotar** |
| `<link rel="modulepreload">` gerado (sem bundler) | **estimado**, não medido: as páginas internas têm **8 níveis** de import local antes do SDK (EXECUTADO: ex. `admin.page.js → page-setup → auth.service → users.service → firebase-auth → firebase → environment → firebase.config`); sem pré-carga cada nível é uma ida e volta | gerador + checagem na CI, como CSS e ícones | ⏳ Medir com uma variante (`BENCH_PUBLIC_DIR`) antes de adotar |
| Vite (sem framework) para empacotar SDK e módulos | **estimado**, não medido: reduzir o SDK por *tree-shaking* e eliminar a cascata de módulos; possivelmente centenas de ms no móvel | etapa de build, CI e fluxo do aluno; regras e E2E continuam | ⏳ Prototipar e **medir** antes de decidir |
| React/Vue | nenhum ganho medido para 9 páginas de formulários e listas; o custo de runtime aumentaria o JavaScript | reescrever 52 módulos e os 60 E2E | ❌ Não recomendado |

## 5. Recomendações priorizadas

| Prioridade | Ação | Benefício | Custo | Dependência |
| --- | --- | --- | --- | --- |
| P0 | Exportar e comparar as regras ativas; publicar a proposta via staging | segurança real | médio | operador (SEC-02) |
| P0 | Backend controlado para tradução e contas | custo e abuso | alto | backend (SEC-04/06) |
| P1 | Paginação das telas da equipe (ARQ-04) | 966 KiB–6,2 MiB → ~120 KiB por visita (estimado) | médio | integrar o PR #40 antes |
| P1 | ADR das salas ao vivo (ARQ-07) | coerência do produto | baixo | decisão de produto |
| P1 | Verificação de acesso com "tentar de novo" (ARQ-06) | menos expulsões por rede instável | baixo | — |
| P2 | `ui/modal.js` com foco preso (ARQ-08) | acessibilidade, menos código | baixo | — |
| P2 | Protótipo com Vite medido pelo benchmark (§4) | decisão baseada em dados | médio | — |
| P2 | Observabilidade mínima (ARQ-09) | diagnóstico em produção | médio | backend |
