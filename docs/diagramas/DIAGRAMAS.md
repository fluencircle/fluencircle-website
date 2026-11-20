# Diagramas técnicos — FluenCircle

**Revisão:** 20/11/2026, Claude (Issue #41), sobre `main` `0e27c9a` + branch `audit/claude-security-performance-architecture`.
Cada ligação foi conferida no código citado abaixo de cada diagrama. Sintaxe validada com o parser oficial do Mermaid
(ver "Validação" no fim).

- **AS-IS** = comportamento implementado e verificado no código desta branch.
- **TO-BE** = proposta, **não implementada**. Nenhum TO-BE descreve algo que já exista.
- **PR #40** = trabalho do Codex ainda **não integrado** (salas ao vivo só no Emulator); aparece marcado como tal.
- Nada aqui descreve as regras **ativas** em produção (desconhecidas — SEC-02).

Índice: [1 Contexto](#1--contexto-c4-nível-1-as-is) · [2 Contêineres](#2--contêineres-c4-nível-2-as-is) ·
[3 Componentes](#3--componentes-do-frontend-as-is) · [4 Autenticação](#4--autenticação-e-autorização-as-is) ·
[5 Sessão](#5--início-e-encerramento-de-sessão-as-is) · [6 Concorrência](#6--concorrência-entre-mediadores-as-is-adr-003) ·
[7 Tradutor](#7--tradutor-e-flashcards-as-is-e-to-be) · [8 Planos](#8--criação-e-gestão-de-planos-as-is) ·
[9 Agenda](#9--agendamento-semanal-as-is) · [10 Dados](#10--modelo-de-dados-do-realtime-database-as-is) ·
[11 Erros](#11--estados-de-erro-e-reconexão-as-is) · [12 Implantação](#12--implantação-e-ambientes-as-is-e-to-be) ·
[13 Dependências](#13--dependências-externas-as-is) · [14 Recuperação](#14--recuperação-backup-e-rollback-to-be)

## 1 — Contexto (C4 nível 1, AS-IS)

```mermaid
flowchart LR
    V(["Visitante<br/>(sessão presencial, QR code)"])
    A(["Aluno"])
    M(["Mediador"])
    AD(["Administrador"])
    FC["FluenCircle<br/>site estático: 9 páginas"]
    FB[("Firebase<br/>Auth + Realtime Database + Hosting")]
    BE["Backend de tradução no Render<br/>(código não acessível)"]
    GEM["Google Gemini"]
    V -->|"traduz sem login"| FC
    A -->|"revisa flashcards, vê a agenda"| FC
    M -->|"conduz sessões, temas, presença"| FC
    AD -->|"contas, papéis, planos"| FC
    FC -->|"login e dados (SDK web)"| FB
    FC -->|"POST {prompt}"| BE
    BE --> GEM
```

**Código:** `public/*.html`, `public/js/core/firebase*.js`, `public/js/services/translate.service.js`.

## 2 — Contêineres (C4 nível 2, AS-IS)

```mermaid
flowchart TB
    subgraph NAV["Navegador"]
        PAGES["9 páginas HTML + módulos ES<br/>(public/, sem framework)"]
        IDB[("IndexedDB<br/>sessão do Firebase Auth")]
        SS[("sessionStorage<br/>papel e e-mail para a moldura")]
    end
    subgraph GOOGLE["Google / Firebase — projeto fluentech-1e18a"]
        HOST["Firebase Hosting<br/>(serve public/)"]
        AUTH["Firebase Authentication<br/>e-mail e senha"]
        RTDB[("Realtime Database<br/>regras ativas desconhecidas")]
        GSTATIC["www.gstatic.com<br/>SDK web 10.8.0"]
        GFONTS["Google Fonts<br/>Montserrat"]
    end
    RENDER["Render<br/>fluencircle-backend"]
    GEMINI["Gemini API"]
    HOST -->|"HTML, CSS, JS, ícones"| PAGES
    GSTATIC -->|"módulos do SDK"| PAGES
    GFONTS -->|"CSS + woff2"| PAGES
    PAGES -->|"signIn / onAuthStateChanged"| AUTH
    PAGES --- IDB
    PAGES --- SS
    PAGES -->|"WebSocket: get, listen, set, update, transação"| RTDB
    PAGES -->|"HTTPS POST /api/gemini/generate (30 s)"| RENDER
    RENDER --> GEMINI
```

**Código:** `public/js/config/firebase.config.js`, `core/firebase.js`, `core/firebase-auth.js`, `core/session-cache.js`,
`config/app.config.js` (`TRANSLATE_TIMEOUT_MS`). Ícones e CSS são servidos pelo próprio site desde `2263bfb`/`76a0e23`.

## 3 — Componentes do frontend (AS-IS)

```mermaid
flowchart TB
    HTML["HTML: app-shell.js + um script de página"] --> PAGES
    subgraph PAGES["pages/ — um orquestrador por tela"]
        P1["login · home · flashcards"]
        P2["presentation/ (slides, presença, tradutor, temas)"]
        P3["themes · sessions · admin · plans · circle-translator"]
        P4["shared/page-setup.js (initProtectedPage)"]
    end
    subgraph UI["ui/ — componentes"]
        U1["dom.js h() seguro · app-shell · confirm-dialog"]
        U2["card-stack · week-slot-card · toast · loader · dropdown · selo de ambiente"]
    end
    subgraph SERVICES["services/ — único acesso a banco e backend"]
        S1["auth · users · account-creation"]
        S2["sessions · session-updates · flashcards · reviews · themes · plans"]
        S3["translate (fetch com tempo limite) · db-paths"]
    end
    subgraph DOMAIN["domain/ — funções puras"]
        D1["srs · presentation-lock · user-sessions · plans · users · questions · format · errors · translation"]
    end
    subgraph CORE["core/"]
        C1["firebase.js · firebase-auth.js (únicos imports do CDN)"]
        C2["roles · navigation · session-cache"]
    end
    subgraph CONFIG["config/"]
        G1["environment.js (produção só em PRODUCTION_HOSTNAMES)"]
        G2["firebase.config.js · app.config.js"]
    end
    PAGES --> UI
    PAGES --> SERVICES
    PAGES --> DOMAIN
    PAGES --> CORE
    PAGES --> CONFIG
    SERVICES --> DOMAIN
    SERVICES --> CORE
    SERVICES --> CONFIG
    UI --> CORE
    UI --> CONFIG
    CORE --> CONFIG
```

**Verificado pela CI:** `scripts/architecture-rules.mjs` impõe exatamente estas setas (e nenhuma outra), ausência de
ciclos e de DOM em `domain/`, `services/` e `config/` — 52 módulos e 153 imports na `main` (EXECUTADO).

## 4 — Autenticação e autorização (AS-IS)

```mermaid
sequenceDiagram
    actor U as Pessoa
    participant L as login.page.js
    participant AS as auth.service.js
    participant AU as Firebase Auth
    participant DB as RTDB (regras)
    participant P as page-setup.js (página interna)
    U->>L: e-mail e senha
    L->>AS: signIn()
    AS->>AU: signInWithEmailAndPassword
    AU-->>AS: credencial (ID token)
    par perfil e lista de bloqueio
        AS->>DB: get users/{uid}
    and
        AS->>DB: get deleted_users/{uid}
    end
    alt revogada ou sem perfil
        AS->>AU: signOut
        AS-->>L: SignInError (mensagem por motivo)
    else perfil válido
        AS-->>L: papel normalizado (cache visual em sessionStorage)
        L->>P: navega para index.html
        P->>AS: requireAuth() — confirma de novo no banco
        alt papel não permitido na página
            P-->>U: aviso e volta à home (só interface)
        end
        Note over P,DB: cada leitura/escrita é decidida pelas REGRAS (isStaff, isAdmin, hasProfile, isSelf)
    end
```

**Código:** `services/auth.service.js` 49–133, `pages/shared/page-setup.js`, `firebase/rules/database.rules.source.mjs` 29–52.
Esconder botões por papel é conveniência; a barreira real são as regras (proposta testada; ativas desconhecidas).

## 5 — Início e encerramento de sessão (AS-IS)

```mermaid
sequenceDiagram
    actor M as Mediador
    participant P as presentation.page.js
    participant S as sessions.service.js
    participant DB as RTDB (regras)
    M->>P: escolhe tema e clica Iniciar
    P->>S: getCurrentSession()
    alt outra tela no ar
        P->>M: "Já existe uma sessão no tradutor" (Cancelar / Assumir)
    end
    P->>S: createSession(tema, mediatorEmail)
    S->>DB: set meeting_sessions/{id}
    P->>S: publishCurrentSession(presenterId, takeover)
    S->>DB: runTransaction(current_session)
    alt conflito (outra tela entrou no meio)
        P->>S: deleteSession(id)
        P-->>M: "Tente novamente"
    else publicada
        S->>DB: onDisconnect(current_session/live/{aba}).remove()
        P-->>M: slides em tela cheia, presença e tradutor
    end
    M->>P: Encerrar (confirmação)
    P->>S: presentation.stop()
    S->>DB: runTransaction — remove só se esta aba for a dona
    S->>DB: cancela o onDisconnect
    P-->>M: "Sessão encerrada" (ou "a outra tela segue no tradutor")
```

**Código:** `pages/presentation/presentation.page.js` 115–192, `services/sessions.service.js` 77–157,
`domain/presentation-lock.js`. Falha ao encerrar mantém a sessão na tela (não vira sucesso falso).

## 6 — Concorrência entre mediadores (AS-IS, ADR-003)

```mermaid
sequenceDiagram
    participant A as Aba do mediador A
    participant B as Aba do mediador B
    participant DB as current_session (regras)
    A->>DB: transação: versão 1, presenterId = A, live/A = true
    B->>DB: lê: A está no ar
    B->>B: pessoa confirma "Assumir o tradutor"
    B->>DB: transação: versão 2, presenterId = B, takeoverOf = A, live/B = true
    DB-->>DB: regra exige versão + 1 e takeoverOf = dono anterior
    DB-->>A: onValue: dono mudou
    A->>A: status "Outra tela assumiu" — continua salvando presença e cards na PRÓPRIA sessão
    Note over A,DB: se a aba A cair, o onDisconnect apaga só live/A — nunca o nó de B
    A->>DB: Encerrar: transação vê que não é dona e não apaga nada
```

**Código e testes:** `domain/presentation-lock.js` (`planPublish`, `planUnpublish`, `planReconnect`),
`tests/rules/sessao-ativa.rules.test.mjs` (Emulator oficial, EXECUTADO), `tests/e2e/concorrencia.e2e.test.mjs`.

## 7 — Tradutor e flashcards (AS-IS e TO-BE)

### 7a — AS-IS

```mermaid
sequenceDiagram
    actor V as Visitante ou mediador
    participant T as circle-translator.page.js ou translator-modal.js
    participant TS as translate.service.js
    participant BE as Backend Render
    participant DB as RTDB (regras)
    V->>T: texto (até 300 caracteres)
    T->>TS: translateText(texto)
    TS->>BE: POST {prompt montado no navegador} — tempo limite 30 s
    alt erro, tempo esgotado ou resposta sem {text}
        TS-->>T: TranslationError
        T-->>V: "Não foi possível traduzir" (nada é gravado)
    else tradução
        TS-->>T: texto
        alt modal do mediador (logado)
            V->>T: Adicionar ao Flash Card
            T->>DB: push flashcards/{sessão}/{card} — regra: equipe e sessão existente
        else tradutor público, ambiente Emulator
            T-->>V: "não salva flashcards automaticamente"
        else tradutor público, produção (compatibilidade)
            T->>DB: push sem login — a proposta NEGA, regras ativas desconhecidas
        end
    end
```

### 7b — TO-BE: backend controlado (não implementado)

```mermaid
sequenceDiagram
    actor V as Visitante
    participant WEB as Tradutor público
    participant BE as Backend controlado
    participant DB as RTDB (Admin SDK)
    participant AI as Gemini
    V->>WEB: texto
    WEB->>BE: POST /api/v1/public-translations {text, sessionId} + App Check
    BE->>BE: limites por IP e sessão, teto de custo, validação
    BE->>AI: prompt FIXO no servidor + texto
    AI-->>BE: tradução
    BE->>DB: confere sessão no ar e grava o card
    BE-->>WEB: {translation, saved}
```

**Código:** `services/translate.service.js`, `pages/circle-translator.page.js`, `pages/presentation/translator-modal.js`,
`config/environment.js` (`publicTranslatorSavesFlashcards`). Contrato TO-BE: `docs/backend/CONTRATO_BACKEND.md`.

## 8 — Criação e gestão de planos (AS-IS)

```mermaid
sequenceDiagram
    actor AD as Admin
    participant PL as plans.page.js
    participant DOM as domain/plans.js
    participant SV as plans.service.js
    participant DB as RTDB (regras)
    AD->>PL: Novo plano / Editar (nome, preço, horários)
    PL->>DOM: validatePlanInput()
    alt inválido
        DOM-->>PL: erros → aviso na tela
    else válido
        opt edição
            PL->>DOM: preservePlanSessionIndices() — índice de horário nunca é reutilizado
            PL->>AD: confirmar se horários existentes mudam
        end
        PL->>SV: savePlan(id?, plano)
        SV->>DB: set/update plans/{id} — regra: só admin, HH:MM, preço 0–100000
    end
    AD->>PL: vincular plano a um aluno (tela Acessos)
    PL->>DB: users/{uid}/planId — regra: o plano precisa existir
    Note over PL,DB: mediador vê o catálogo, só o admin cria, edita e apaga
```

**Código:** `pages/plans.page.js` 238–310, `pages/admin.page.js`, `domain/plans.js` 147–258,
`services/plans.service.js`, regras `plans` e `users/$uid/planId`. Excluir um plano não apaga vínculos nem encontros (a
tela de Acessos mostra "Plano removido").

## 9 — Agendamento semanal (AS-IS)

```mermaid
flowchart LR
    subgraph EQUIPE["Equipe — plans.html, aba Agenda da semana"]
        W["Semana ISO 2026-W47<br/>(isoWeekKey, fuso local)"] --> SLOT["Encontro = planId_dia_índice"]
        SLOT --> SAVE["Tema + perguntas copiadas + link https"]
    end
    subgraph BANCO["RTDB"]
        WS[("weekly_sessions/{semana}/{planId_dia_i}")]
        PL[("plans/{planId}")]
        US[("users/{uid}/planId")]
    end
    subgraph ALUNO["Aluno — index.html, Sua semana"]
        HOME["home.page.js"] --> AG["buildWeekAgenda()"]
        AG --> CARD["card: tema, perguntas, Entrar (só https)"]
    end
    SAVE -->|"set — só equipe"| WS
    HOME -->|"get o próprio plano"| PL
    HOME -->|"get um a um, só encontros do próprio plano"| WS
    US -.->|"regra compara o prefixo da chave"| WS
```

**Código:** `domain/plans.js` (`isoWeekKey`, `slotKey`, `buildWeekAgenda`, `isSafeMeetLink`), `pages/plans.page.js`
84–173, `pages/home.page.js`, `services/plans.service.js` 57–92, regra `weekly_sessions/$week/$slot/.read`.

## 10 — Modelo de dados do Realtime Database (AS-IS)

```mermaid
erDiagram
    USER ||--o{ ATTENDANCE : "presente em"
    SESSION ||--o{ ATTENDANCE : registra
    USER ||--o{ USER_SESSION : "índice próprio"
    SESSION ||--o{ USER_SESSION : resume
    THEME ||--o{ SESSION : inspira
    SESSION ||--o{ FLASHCARD : contem
    USER ||--o{ REVIEW : acompanha
    SESSION ||--o| CURRENT_SESSION : "publicada como"
    PLAN ||--o{ USER : "vinculado a"
    PLAN ||--o{ WEEKLY_SLOT : "horários da semana"
    THEME ||--o{ WEEKLY_SLOT : "copiado para"
    USER ||--o| DELETED_USER : "revogado em"
    USER {
      string uid PK "users/{uid}"
      string firstName
      string lastName
      string email
      string role "student | mediator | admin"
      string planId FK "opcional"
    }
    DELETED_USER {
      string uid PK "deleted_users/{uid}"
      string deletedAt
      string deletedBy
    }
    THEME {
      string themeId PK "meetings/{id} (nome histórico)"
      string topic
      array questions
    }
    SESSION {
      string sessionId PK "meeting_sessions/{id}"
      string templateId FK
      string topic
      string startedAt
      string mediatorEmail
    }
    ATTENDANCE {
      string sessionId FK "meeting_sessions/{id}/attendees/{uid}"
      string uid FK
      string addedAt "dados antigos: nome e e-mail"
    }
    USER_SESSION {
      string uid FK "user_sessions/{uid}/{sessionId}"
      string sessionId FK
      string topic "antigo: true"
      string startedAt
    }
    FLASHCARD {
      string cardId PK "flashcards/{sessionId}/{cardId}"
      string sessionId FK
      string front
      string back
      string topic
    }
    REVIEW {
      string uid FK "student_reviews/{uid}/{sessionId}"
      string sessionId FK
      number stage "0 a 3, só +1"
      string stageNCompletedAt
    }
    CURRENT_SESSION {
      string sessionId FK "current_session (leitura pública)"
      string topic
      string presenterId
      number version
      string takeoverOf
    }
    PLAN {
      string planId PK "plans/{id}"
      string name
      number price
      array sessions "dayOfWeek, startTime, endTime"
    }
    WEEKLY_SLOT {
      string key PK "weekly_sessions/{2026-W47}/{planId_dia_i}"
      string topicId FK
      string topicTitle
      array questions
      string meetLink "só https"
    }
```

**Observações:** o RTDB é uma árvore JSON, não relacional. `CURRENT_SESSION` também guarda `startedAt` e
`live/{presenterId}`. O PR #40 (não integrado) acrescenta `live_rooms/{sessionId}`, `live_room_members/{sessionId}/{uid}`
e `live_room_chat/{sessionId}/{msg}` — ver `CLAUDE_AUDITORIA_SEGURANCA.md` §4. **Fonte:** `services/db-paths.js` e
`firebase/rules/database.rules.source.mjs`.

## 11 — Estados de erro e reconexão (AS-IS)

```mermaid
stateDiagram-v2
    [*] --> Carregando
    Carregando --> SemSessao : Auth sem usuário
    SemSessao --> Login
    Carregando --> VerificandoAcesso : usuário do Auth
    VerificandoAcesso --> Login : revogado ou sem perfil (signOut)
    VerificandoAcesso --> Login : erro de rede (redireciona, sem mensagem — ARQ-06)
    VerificandoAcesso --> Pagina : perfil válido
    Pagina --> Negado : papel não permitido
    Negado --> Home
    Pagina --> ErroDeDados : leitura negada ou falha
    ErroDeDados --> Pagina : recarregar
    state Apresentacao {
        [*] --> NoAr
        NoAr --> Reconectando : .info/connected = false
        Reconectando --> NoAr : rede volta e ainda é a dona (transação)
        Reconectando --> Assumida : outra tela publicou
        NoAr --> Assumida : outra tela assumiu
        NoAr --> Encerrada : outra tela encerrou
    }
    Pagina --> Apresentacao : mediador inicia
    state Traducao {
        [*] --> Traduzindo
        Traduzindo --> Traduzido
        Traduzindo --> FalhaTraducao : HTTP, formato ou 30 s
    }
    Pagina --> Traducao
```

**Código:** `services/auth.service.js` `requireAuth`/`resolveAccess`, `pages/shared/page-setup.js`,
`services/sessions.service.js` `watchPresentation` 97–157, `services/translate.service.js`.

## 12 — Implantação e ambientes (AS-IS e TO-BE)

```mermaid
flowchart TB
    DEV["Clone + npm ci"] --> CHOICE{"location.hostname está em<br/>PRODUCTION_HOSTNAMES?"}
    CHOICE -->|"não: localhost, 0.0.0.0, IP da rede,<br/>pré-visualização, arquivo"| EMU["Firebase Emulator<br/>demo-fluencircle-audit<br/>Auth 9099 · RTDB 9000 · Hosting 5050"]
    CHOICE -->|"sim: fluentech-1e18a.web.app<br/>ou .firebaseapp.com"| PROD["Produção fluentech-1e18a<br/>(publicação BLOQUEADA — NO-GO)"]
    EMU --> SEED["npm run emulators:seed → SEED_OK<br/>npm run emulators:verify → SEED_VERIFY_OK"]
    subgraph CI["GitHub Actions (sem segredos, sem deploy)"]
        OFF["offline: unitários, sintaxe, estáticos + SRI + ícones,<br/>arquitetura, rules:check, css:check, simulador"]
        RULES["rules-emulator: Java 21 + Emulator + seed real"]
        E2E["e2e: Playwright + Firebase simulado + icons:check"]
    end
    DEV --> CI
    STG["Staging: projeto Firebase separado<br/>(TO-BE — não existe, Issue #15)"]
    CI -.->|"TO-BE: aprovação humana"| STG
    STG -.->|"TO-BE: gates de SEGURANCA_E_DEPLOY.md"| PROD
```

**Código:** `config/environment.js`, `config/firebase.config.js`, `firebase.emulator.json`, `.github/workflows/ci.yml`.
Não existe `firebase.json` na raiz de propósito (deploy acidental impossível); o do Hosting real nunca foi versionado.

## 13 — Dependências externas (AS-IS)

```mermaid
flowchart LR
    subgraph RUNTIME["Carregado pelo navegador"]
        SDK["Firebase JS SDK 10.8.0<br/>www.gstatic.com (sem SRI possível em import)"]
        FONTS["Google Fonts — Montserrat<br/>(CSS dinâmico, exceção de SRI)"]
        ICONS["Font Awesome Free 6.5.0 — 42 ícones<br/>SERVIDOS PELO SITE (css/components/icons.css)"]
    end
    subgraph SERVICES["Serviços"]
        FAUTH["Firebase Auth"]
        FRTDB["Realtime Database"]
        FHOST["Firebase Hosting"]
        REND["Render: fluencircle-backend"]
        GEM["Gemini (via Render)"]
    end
    subgraph DEVTOOLS["Só desenvolvimento e CI (devDependencies fixadas)"]
        FT["firebase-tools 15.37.0 + Java 21"]
        RUT["@firebase/rules-unit-testing 5.0.1 + firebase 12"]
        PW["playwright 1.63.0"]
        FAF["@fortawesome/fontawesome-free 6.5.0"]
    end
    SITE["FluenCircle"] --> SDK
    SITE --> FONTS
    SITE --> ICONS
    SITE --> FAUTH
    SITE --> FRTDB
    FHOST --> SITE
    SITE --> REND
    REND --> GEM
    FAF -.->|"npm run icons:build"| ICONS
```

**Fonte:** `docs/operacao/DEPENDENCIAS.md`. `npm audit` (20/11/2026): 19 avisos, todos em dependências de teste (SEC-16).

## 14 — Recuperação, backup e rollback (TO-BE)

```mermaid
flowchart TB
    START["Decisão humana de publicar"] --> EXP["Exportar dados (RTDB) e regras ATIVAS<br/>e versionar as regras exportadas"]
    EXP --> VERIFY["Restaurar o backup num projeto de staging<br/>e conferir contagens"]
    VERIFY --> MIG["privacy-migration.mjs em modo plano sobre o backup<br/>revisar índices criados e órfãos (D-01)"]
    MIG --> STG["Staging: regras propostas + migração + frontend novo<br/>rules-emulator, E2E e roteiro manual"]
    STG --> GATE{"Gates de SEGURANCA_E_DEPLOY.md<br/>todos aprovados?"}
    GATE -->|"não"| STOP["NO-GO: corrigir e repetir"]
    GATE -->|"sim"| DEPLOY["Publicar: regras, depois Hosting"]
    DEPLOY --> WATCH{"Monitorar erros e acessos negados"}
    WATCH -->|"ok"| DONE["Concluído"]
    WATCH -->|"falha de regra"| RB1["Rollback: republicar as regras exportadas"]
    WATCH -->|"falha de frontend"| RB2["Rollback: firebase hosting:rollback (versão anterior)"]
    WATCH -->|"dado corrompido"| RB3["Restaurar do backup, com aprovação"]
```

**Fonte:** `docs/operacao/BACKUP_E_ROLLBACK.md`, `docs/operacao/SEGURANCA_E_DEPLOY.md`. **Nada disso foi executado**: não há
staging nem acesso a produção nesta auditoria.

## Diagramas complementares

### C1 — Revisão espaçada (AS-IS)

```mermaid
flowchart LR
    S["Sessão iniciada"] --> W1["24 h"]
    W1 --> R1["Etapa 1"]
    R1 --> W7["7 dias após a etapa 1"]
    W7 --> R2["Etapa 2"]
    R2 --> W30["30 dias após a etapa 2"]
    W30 --> R3["Etapa 3 — concluído"]
```

`domain/srs.js`. A regra aceita só +1 etapa por vez com carimbo ISO; o prazo não é verificável nas regras (SEC-15).

### C2 — Leitura mínima do aluno (AS-IS, ADR-004)

```mermaid
sequenceDiagram
    participant F as flashcards.page.js
    participant DB as RTDB (regras)
    F->>DB: get user_sessions/{uid}
    DB-->>F: {sessão: {topic, startedAt} | true}
    par para cada sessão do índice
        F->>DB: get flashcards/{sessão}
    and só para entradas antigas (true)
        F->>DB: get meeting_sessions/{sessão}/topic e /startedAt
    end
    F->>DB: get student_reviews/{uid}
    Note over F,DB: medido: 46 leituras e 107–141 KiB para 42 sessões, igual com 300 ou 1.500 sessões no total
```

### C3 — Leitura da equipe hoje × paginada (AS-IS e TO-BE)

```mermaid
flowchart LR
    subgraph ASIS["AS-IS — sessions.page.js e flashcards (equipe)"]
        A1["get meeting_sessions (TUDO)"] --> A3["966 KiB com 300 sessões<br/>6,2 MiB com 1.500 (medido)"]
        A2["get flashcards (TUDO)"] --> A3
    end
    subgraph TOBE["TO-BE — não implementado (ARQ-04)"]
        B1["query startedAt, limitToLast(30)<br/>.indexOn startedAt"] --> B3["~120 KiB por página (estimado)"]
        B2["get flashcards/{id} só das 30 sessões"] --> B3
        B3 --> B4["Carregar anteriores: endBefore(startedAt)"]
    end
```

### C4 — Salas ao vivo (PR #40, NÃO integrado; só no Emulator)

```mermaid
flowchart LR
    MED["Mediador inicia sessão"] --> ROOM[("live_rooms/{sessionId}<br/>topic, hostUid, slide, online")]
    MED -.->|"opcional"| CUR[("current_session<br/>tradutor público")]
    ALUNO["Aluno na home"] -->|"Entrar (próprio uid)"| MEM[("live_room_members/{id}/{uid}")]
    MEM --> CHAT[("live_room_chat/{id}<br/>só membros; senderUid = auth.uid")]
    ROOM -->|"slide atual (texto)"| ALUNO
```

Voz (WebRTC), "Fluêncio" e entrada com presença acadêmica, que existiam em `3c6e7f0`, **não** fazem parte do PR #40.

## Validação

- [x] Sintaxe de todos os blocos conferida com `mermaid.parse()` e `mermaid.render()` (Mermaid 11.17.2) no Chromium do Playwright, em 20/11/2026: 19/19 blocos.
- [x] Cada diagrama AS-IS cita os arquivos de onde as ligações foram conferidas.
- [ ] Atores, permissões e fluxos confirmados pelo responsável humano.
- [ ] Atualizar sempre que mudar esquema, endpoint, fluxo, papel ou ambiente.
