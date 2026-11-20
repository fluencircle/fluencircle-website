# Especificação inicial de requisitos e casos de uso

**Estado:** reconstruído a partir do código reorganizado e dos reparos da main, PR #16; confirmar regras de negócio com responsáveis pelo FluenCircle. Requisitos futuros estão marcados **PROPOSTO** e não representam funcionalidades já implementadas.

## 1. Visão e fronteiras

O FluenCircle oferece suporte a sessões de conversação, com temas e perguntas guiadas, registro de participação, tradução PT⇄EN e criação/revisão de flashcards por marcos de 1, 7 e 30 dias. A versão inspecionada é uma aplicação multipágina HTML/CSS/JavaScript com Firebase Authentication, Realtime Database e backend de tradução no Render.

**Não está demonstrado pelo repositório:** gestão financeira, emissão de certificados, notificações, gestão de agenda/calendário ou aplicativo móvel nativo. Não incluir estes recursos como requisitos existentes sem validação.

## 2. Atores e níveis de acesso (observados)

| Ação | Visitante | Aluno (`student`) | Mediador (`mediator`) | Administrador (`admin`) |
|---|---:|---:|---:|---:|
| Acessar tradutor público | Sim | Sim | Sim | Sim |
| Entrar na área interna | Não | Sim | Sim | Sim |
| Estudar flashcards | Não | Sim | Sim | Sim |
| Criar/editar temas | Não | Não | Sim | Sim |
| Iniciar sessão e conduzir slides | Não | Não | Sim | Sim |
| Registrar presença e criar flashcards de sessão | Não | Não | Sim | Sim |
| Consultar/editar histórico de sessões | Não | Não | Sim | Sim |
| Criar e administrar contas | Não | Não | Não | Sim |

**Cuidado:** esta matriz descreve o comportamento pretendido da UI. Somente testes das regras efetivas e do backend provam autorização real.

## 3. Vocabulário do domínio

- **Tema**: plano de conversação e lista de perguntas (`meetings/{temaId}`).
- **Sessão**: ocorrência real de conversação iniciada a partir de um tema (`meeting_sessions/{sessaoId}`).
- **Sessão ativa**: referência usada pelo tradutor público (`current_session`); hoje há um único nó.
- **Presença**: vínculo estudante–sessão, registrado em `attendees` e indexado em `user_sessions`.
- **Flashcard**: par frente/verso relacionado a uma sessão.
- **Deck**: coleção de flashcards de uma sessão.
- **Revisão espaçada**: marcos baseados em início da sessão e conclusão das etapas anteriores.
- **Papel**: nível de acesso armazenado em `users/{uid}/role` (conforme implementação atual).

## 4. Requisitos funcionais identificados (AS-IS)

| ID | Requisito | Ator | Evidência principal |
|---|---|---|---|
| RF-01 | Autenticar por e-mail e senha e recusar conta sem perfil | Internos | `auth.service.js` |
| RF-02 | Exibir menu e funcionalidades conforme papel | Internos | `app-shell.js`, `page-setup.js` |
| RF-03 | Criar, editar e excluir temas e perguntas | Mediador, admin | `themes.page.js`, `themes.service.js` |
| RF-04 | Iniciar e encerrar sessão a partir de tema | Mediador, admin | `presentation.page.js`, `sessions.service.js` |
| RF-05 | Apresentar perguntas em slides e navegar por controles | Mediador, admin | `slides.js`, `presentation.page.js` |
| RF-06 | Registrar/retirar presença com atualização atômica | Mediador, admin | `attendance.js`, `sessions.service.js`, `session-updates.js` |
| RF-07 | Traduzir texto e gerar flashcard na sessão ativa | Público, mediador | `circle-translator.page.js`, `translate.service.js` |
| RF-08 | Visualizar decks e estudar flashcards | Internos | `flashcards.page.js`, `card-stack.js` |
| RF-09 | Registrar avanço de 1/7/30 dias | Internos | `srs.js`, `reviews.service.js` |
| RF-10 | Consultar e editar flashcards/histórico de sessões | Mediador, admin | `sessions.page.js` |
| RF-11 | Criar, editar e revogar perfis | Admin | `admin.page.js`, `users.service.js` |

## 5. Critérios de aceite prioritários

**CA-01 — Autorização:** dado um aluno autenticado, tentativa direta de criar tema, alterar papel ou apagar sessão deve falhar no Firebase Rules Emulator, mesmo sem a interface. Dado um visitante, leituras privadas devem falhar.

**CA-02 — Tradutor público:** visitante pode traduzir conteúdo permitido sem obter acesso à lista de alunos, ao histórico de sessões ou a qualquer nó privado. Gravações de flashcards só ocorrem por fluxo autorizado, com validação, contenção de abuso e associação comprovada à sessão.

**CA-03 — Sessões concorrentes:** sessão A não pode substituir nem apagar a sessão B por reconexão, fechamento de aba ou ação atrasada. Fluxos simultâneos devem preservar identidade da sessão e mediador.

**CA-04 — Presença:** ao marcar/remover presença, `meeting_sessions/{id}/attendees/{uid}` e `user_sessions/{uid}/{id}` devem permanecer coerentes, inclusive quando há falhas de conexão.

**CA-05 — Revisões:** etapa 1 fica disponível 24 h depois da sessão; etapa 2, 7 dias após concluir etapa 1; etapa 3, 30 dias após concluir etapa 2. Finalizar a pilha antes do prazo não antecipa o marco. Horários devem ser avaliados com UTC/ISO e em viradas de dia/fuso.

**CA-06 — Dados pessoais:** um aluno não deve obter nome, e-mail ou frequência de outros alunos por consultas diretas ou retorno indireto de lista.

**CA-07 — Administração de contas:** falha na gravação do perfil não deixa conta órfã sem compensação; revogação impede autenticação/aplicação conforme política acordada.

## 6. Requisitos não funcionais (metas propostas, a aprovar)

| ID | Área | Critério proposto | Status |
|---|---|---|---|
| RNF-01 | Segurança | Regras de menor privilégio, padrão deny-by-default, sem segredos em Git | Necessário |
| RNF-02 | Privacidade | Minimização de PII e matriz de leitura por participação | Necessário |
| RNF-03 | Desempenho | Consultas de flashcards escalarem com decks do aluno, não com toda a base | Proposto |
| RNF-04 | Acessibilidade | Testes de teclado, foco, rótulos e WCAG 2.2 AA para fluxos críticos | Proposto |
| RNF-05 | Confiabilidade | Escritas relacionadas consistentes; reconexão e rollback documentados | Necessário |
| RNF-06 | Qualidade | CI cobrindo testes unitários, regras de banco, E2E, lint e HTML/CSS | Proposto |
| RNF-07 | Operação | Ambientes isolados, backup/restore e procedimento de publicação reversível | Necessário |
| RNF-08 | Observabilidade | Erros com correlação, métricas de backend, sem vazar PII | Proposto |
| RNF-09 | Evolução | Modularidade sem dependência reversa e decisões arquiteturais documentadas (ADR) | Proposto |

## 7. Casos de uso

### UC-01 — Conduzir sessão

**Ator:** mediador ou administrador. **Pré-condição:** conta ativa, papel autorizado, tema com perguntas. **Fluxo:** escolher tema → iniciar sessão → publicar vínculo de sessão ativa → apresentar slides → incluir participantes → traduzir e registrar flashcards → encerrar sessão. **Exceções:** perda de rede, sessão já ativa, conflito de concorrência, falha na API ou banco, cancelamento. **Pós-condição:** histórico consistente, presença indexada, cards vinculados; sessão ativa liberada apenas se o encerrante for seu proprietário. **Status:** fluxo básico existe; garantia de concorrência é proposta.

### UC-02 — Traduzir como visitante

**Ator:** visitante anônimo. **Pré-condição:** acesso público ao tradutor. **Fluxo:** digitar texto → enviar ao backend → mostrar tradução → se sessão ativa e autorizado, criar card. **Exceções:** sem sessão, API indisponível, entrada fora do limite, falha de autorização e limite de taxa. **Pós-condição:** nenhum dado privado exposto. **Status:** tradução e gravação atuais existem; proteção de abuso é proposta.

### UC-03 — Revisar vocabulário

**Ator:** aluno (também acessível a staff). **Pré-condição:** participar de sessão com cards e ter sessão autenticada. **Fluxo:** ver decks → abrir deck → navegar pelos cards → concluir pilha → registrar progresso se prazo alcançado. **Exceções:** sessão sem cards, sem permissão, falha de gravação. **Pós-condição:** progresso persistido sem regressão.

### UC-04 — Administrar usuários

**Ator:** administrador. **Pré-condição:** identidade/autorização verificadas. **Fluxo:** listar e buscar usuários → criar conta com papel → editar perfil ou revogar. **Exceções:** e-mail duplicado, erro de Auth, gravação parcial. **Pós-condição:** estado em Auth e perfil coerentes. **Status:** operações atuais exigem melhorias de backend.

## 8. Decisões em aberto

1. O visitante realmente deve **salvar automaticamente** toda tradução como flashcard ou deve haver confirmação/moderação?
2. Quantas sessões simultâneas a plataforma precisa suportar?
3. Quem pode ver sessões e cards além dos próprios participantes?
4. Qual o prazo de retenção de presença, dados pessoais e traduções?
5. É aceitável uma conta Auth ainda existir após “exclusão” lógica?
6. A regra 1/7/30 dias é fixa ou será parametrizável pelo administrador?

Essas respostas devem ser registradas como ADR/requisitos antes de alterações de banco.
## 9. Rastreabilidade dos reparos integrados

| Caso | Critério | Evidência | Limite atual |
| --- | --- | --- | --- |
| RF-06 / CA-04 | Presença e índice coerentes | PR #16; `session-updates.js`; 6 testes puros; CI aprovada | Não avaliado no Emulator |
| RF-04 / UC-01 | Início único e encerramento recuperável | PR #16; `presentation.page.js` | Dois mediadores ainda podem conflitar |
| RF-07 / UC-02 | Resposta tardia não migra para outra sessão | PR #16; `domain/active-session.js` com 3 testes unitários | Não resolve spam nem backend |

## 10. Rastreabilidade da etapa de hardening (Claude, 19/11/2026)

Evidências e limites completos em `docs/entrega/MATRIZ_DE_TESTES.md`. "Simulado" = Firebase simulado/simulador de
regras; "Emulator" = pendente de execução na CI.

| Requisito / critério | Mudança | Evidência | Limite atual |
| --- | --- | --- | --- |
| RF-01, CA-01 / RNF-01 | Proposta de regras com negação padrão, escalada de papel negada, conta sem perfil e revogada sem acesso | `tests/rules/rbac.rules.test.mjs` (simulado 40/40); E2E perfis | Emulator pendente; regras ativas desconhecidas |
| RF-07, CA-02 | Escrita anônima de cards negada; tradutor informa o que aconteceu; Emulator não tenta gravar | R rbac + E tradutor-contas | Backend controlado **não implementado** (bloqueado) |
| RF-04, UC-01, CA-03 | Posse por aba, versão, confirmação para assumir, queda/retorno (ADR-003) | U presentation-lock; R sessao-ativa (simulado 13/13); E concorrencia (5) | Uma sessão pública por vez; Emulator pendente |
| RF-06, CA-04 | Presença e índice obrigatoriamente na mesma escrita (regra) | R rbac/privacidade; E fluxos | Remoção de um só lado não é bloqueada por regra |
| RF-08, RF-09, CA-05 | Etapa SRS só +1 com carimbo; aluno só em sessão de que participou | R rbac; U srs; E fluxos | Prazos não verificáveis nas regras |
| CA-06, RNF-02, RNF-03 | Aluno lê só o próprio índice e decks; presença sem PII (ADR-004) | R privacidade (simulado 12/12); E privacidade; medição sintética −83,3% | Dados antigos com PII até a migração |
| RF-11, CA-07 | Criação de conta desfaz o login se o perfil falhar | U account-creation; E tradutor-contas | Backend com Admin SDK pendente |
| RNF-06, RNF-07 | CI em três jobs sem deploy; Emulator local isolado e verificável | `.github/workflows/ci.yml`; U emulator-safety/environment; E ambiente | CI ainda não executada no GitHub |
| RNF-04 | Checagens básicas de acessibilidade e teclado nas 8 páginas | E acessibilidade (12) | Auditoria WCAG completa pendente |


## 11. Rastreabilidade da auditoria técnica (Claude, 20/11/2026 — Issue #41, PR #42)

E = EXECUTADO nesta auditoria; M = medido com `scripts/benchmarks/page-performance.mjs`.

| Requisito | O que mudou ou foi verificado | Evidência | Pendente |
| --- | --- | --- | --- |
| RNF-01 Segurança | Seleção de ambiente fechada: produção só em `PRODUCTION_HOSTNAMES`; `h()` recusa código em atributos; SRI exigido para terceiros | U `environment`, `dom-safety`; E2E `ambiente` (falha no código antigo); `verify-static` (E) | Regras ativas, credencial histórica, backend |
| RNF-03 Desempenho (dados) | Aluno: custo proporcional às próprias sessões **confirmado** (46 leituras, 107–141 KiB com 300 ou 1.500 sessões) | M escalas média e grande | **Equipe** ainda lê coleções inteiras (até 6,2 MiB / ~50 s no perfil móvel) — ARQ-04 |
| RNF-03b Desempenho (carregamento) — **proposto agora** | Meta: página interna ≤ 250 KiB transferidos e ≤ 40 requisições com cache frio | M: 198–213 KiB e 33–45 requisições (antes 373–403 KiB e 56–67) | Aprovar a meta; CLS do login 0,12 (meta ≤ 0,1) |
| RNF-06 Qualidade | CI: matriz de camadas e ciclos, `css:check`, `icons:check`, SRI | U `architecture-rules`, `css-bundle`, `icons`; CI do PR #42 | lint de HTML/CSS continua ausente |
| RNF-07 Operação | Nenhum endereço de desenvolvimento, teste ou pré-visualização alcança produção; gate para domínio próprio | ADR-002 (revisão), `SEGURANCA_E_DEPLOY.md` | Staging, backup testado |
| RNF-08 Observabilidade | Sem mudança; lacuna registrada (ARQ-09) | — | Endpoint de erros/métricas no backend |
| RNF-09 Evolução | Dependência reversa e ciclos agora **impedidos** pela CI; ADR-006 (artefatos gerados) | U `architecture-rules` (violações injetadas) | Decisão sobre empacotador só com medição |
