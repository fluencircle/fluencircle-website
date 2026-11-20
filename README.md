# FluenCircle — site

Plataforma das sessões de conversação do FluenCircle: o mediador conduz a sessão com slides de perguntas, registra a presença e transforma as dúvidas de vocabulário em flashcards; o aluno revisa esses flashcards em marcos de 1, 7 e 30 dias (revisão espaçada).

Feito com HTML, CSS e JavaScript puros (módulos ES), **sem etapa de build**, sobre Firebase Authentication, Realtime Database e Hosting. A tradução usa um backend próprio no Render, que repassa os pedidos ao Gemini.

## Páginas

| Página | Quem usa | O que faz |
| --- | --- | --- |
| `auth.html` | todos | login |
| `index.html` | logados | atalhos conforme o papel |
| `flash-cards.html` | logados | decks por sessão e modo de estudo com revisão espaçada |
| `presentation.html` | mediador, admin | sessão ao vivo: slides, presença, tradutor e flashcards |
| `set-meeting.html` | mediador, admin | temas e perguntas de apoio |
| `manage-meetings.html` | mediador, admin | histórico de sessões e edição dos flashcards |
| `admin.html` | admin | contas e papéis |
| `circle-translator.html` | público, sem login | tradutor das sessões presenciais; salvamento público direto ainda depende de regras/backend e não é liberado no demo |

## Como rodar localmente (sempre isolado da produção)

Os módulos ES não funcionam abrindo o arquivo direto (`file://`): sirva por HTTP. **Em `localhost`/`127.0.0.1` o site
usa sempre o Firebase Emulator** com o projeto fictício `demo-fluencircle-audit` e mostra um selo amarelo no rodapé
(`public/js/config/environment.js`). Não há como apontar a máquina local para a produção sem alterar código.

```bash
npm ci                     # Node 20+ e Java 21+ (o Emulator do firebase-tools 15 exige Java 21)
npm run emulators          # terminal 1: Auth, Realtime Database, Hosting (http://127.0.0.1:5050) e UI (4000)
npm run emulators:seed     # terminal 2: dados sintéticos, imprime SEED_OK
npm run emulators:verify   # somente leitura: confirma que dados chegaram ao RTDB demo
```

**Importante para Windows/WSL:** aguarde Auth (9099) e RTDB (9000) ficarem prontos antes do seed;
os dois terminais devem acessar o mesmo ambiente local. Uma execução correta exibe
`SEED_OK` e `SEED_VERIFY_OK`; uma saída vazia **não é sucesso**.
Use `npm run emulators:seed -- --check` para validar a invocação sem acessar o banco.

Sem Java, ainda é possível abrir as páginas com `npm run serve` (http://localhost:5501), mas sem banco elas
ficam sem dados. Detalhes e contas de demonstração: [`docs/firebase/LEIA-ME.md`](docs/firebase/LEIA-ME.md).

## Testes

```bash
npm test                          # unitários (domain/, serviços puros, configuração, simulador) — sem rede
npm run test:rules                # regras RTDB no Firebase Emulator (regras no Emulator oficial; precisa de npm ci + Java 21)
npm run test:rules:sim            # mesma matriz no simulador local (pré-verificação offline; não é o Emulator)
npm run test:e2e                  # E2E e acessibilidade básica (Playwright; Firebase simulado com as regras propostas)
npm run rules:check               # JSON das regras em sincronia com a fonte comentada
node scripts/verify-static.mjs    # arquivos locais e JSON de configuração
node scripts/verify-architecture.mjs  # camadas e sinks HTML proibidos
```

## Estrutura

```
public/                    site (sem build): 8 páginas, assets, css/ e js/ em camadas
├── js/config/             ambiente (Emulator × produção), Firebase, backend e limites
├── js/core/               único ponto do SDK Firebase (CDN), papéis, navegação
├── js/domain/             regras puras: SRS, posse da sessão ativa, índice do aluno, erros
├── js/services/           único acesso ao banco e ao backend
├── js/ui/                 componentes: moldura, selo de ambiente, DOM seguro, diálogos
└── js/pages/              um script de entrada por página
firebase/rules/            FONTE comentada das regras propostas (gera docs/firebase/*.json)
firebase.emulator.json     configuração só do Emulator (não existe firebase.json na raiz de propósito)
scripts/                   verificações, gerador de regras, carga do Emulator, migração offline, medição
tests/unit/                testes puros (node --test)
tests/rules/               matriz de acesso (Emulator ou simulador)
tests/e2e/                 Playwright com Firebase simulado + acessibilidade básica
tests/fixtures/            dados sintéticos compartilhados
docs/                      engenharia, entrega ao aluno, operação, auditorias e processo
```

Detalhes: [`docs/entrega/ARQUITETURA_E_FLUXOS.md`](docs/entrega/ARQUITETURA_E_FLUXOS.md) e [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Regras do código

1. **Dados nunca entram em `innerHTML`.** Monte elementos com `h()` de `js/ui/dom.js`: textos viram nós de texto e não são interpretados como HTML.
2. **Só `services/` fala com o banco.** Os nomes dos nós ficam em `services/db-paths.js`.
3. **`domain/` não importa nada.** São funções puras, cobertas por `tests/unit/`.
4. **Toda página interna começa com `initProtectedPage()`**, que exige login, aplica o papel no menu e barra quem não tem permissão.
5. **Sem `style=` no HTML e sem estilos montados em strings no JS.** Estilos novos vão no arquivo CSS da seção; a ordem dos `@import` em `main.css` importa.
6. **Regras do banco só pela fonte** `firebase/rules/database.rules.source.mjs` (`npm run rules:build`), sempre com teste em `tests/rules/`.
7. **Testes nunca usam o Firebase de produção**: Emulator (`npm run test:rules`), simulador ou Firebase simulado nos E2E, com dados de `tests/fixtures/`.
8. Comentários e textos em português; nomes no código em inglês.

## Publicação: BLOQUEADA até auditoria de segurança

**NÃO execute deploy em produção a partir deste snapshot.** O merge na `main` preserva um baseline para engenharia e auditoria, não uma release. As regras reais do Firebase ainda precisam ser exportadas/testadas; o tradutor público, o backend Render e sessões simultâneas possuem riscos abertos. Consulte [gates de implantação](docs/operacao/SEGURANCA_E_DEPLOY.md) e [auditoria independente](docs/auditorias/AUDITORIA_INDEPENDENTE_2026-11-18.md).

Desenvolvimento local usa **somente o Firebase Emulator** (seleção automática por endereço). A CI roda testes offline e o Emulator dentro do runner, com projeto `demo-*`; ela não publica hosting, regras ou funções e não usa segredos.

## Segurança

O navegador não é barreira de segurança: esconder botões por papel é só conveniência. A proteção dos dados depende das **regras do Realtime Database** — a proposta testada fica em `firebase/rules/` (matriz em [`docs/engenharia/MATRIZ_DE_ACESSO.md`](docs/engenharia/MATRIZ_DE_ACESSO.md)). Concorrência de mediadores e leitura mínima do aluno foram tratadas no código (ADR-003 e ADR-004); regras reais, backend, credencial histórica e publicação continuam pendentes ([limitações](docs/entrega/LIMITACOES_E_PENDENCIAS.md)).

## Documentação

**Comece por aqui (entrega ao aluno):**
- [`docs/entrega/GUIA_DO_ALUNO.md`](docs/entrega/GUIA_DO_ALUNO.md) — instalação, demonstração local, testes e como continuar
- [`docs/entrega/PLANOS_E_AGENDA.md`](docs/entrega/PLANOS_E_AGENDA.md) — manual de planos, permissões e agenda semanal (porte do PR original #2)
- [`docs/entrega/ARQUITETURA_E_FLUXOS.md`](docs/entrega/ARQUITETURA_E_FLUXOS.md) — módulos, dados, fluxos, frontend × backend
- [`docs/entrega/MATRIZ_DE_TESTES.md`](docs/entrega/MATRIZ_DE_TESTES.md) — comandos executados, resultados e o que não provam
- [`docs/entrega/LIMITACOES_E_PENDENCIAS.md`](docs/entrega/LIMITACOES_E_PENDENCIAS.md) — local × produção × futuro
- [`docs/entrega/CHECKLIST_FINAL.md`](docs/entrega/CHECKLIST_FINAL.md) — aceite e critérios GO/NO-GO

**Engenharia:**
- [`docs/engenharia/REQUISITOS_E_CASOS_DE_USO.md`](docs/engenharia/REQUISITOS_E_CASOS_DE_USO.md) — requisitos, casos de uso e rastreabilidade
- [`docs/engenharia/MATRIZ_DE_ACESSO.md`](docs/engenharia/MATRIZ_DE_ACESSO.md) — quem acessa o quê (interface e dados), com testes
- ADRs: [001 arquitetura](docs/engenharia/ADR-001-ARQUITETURA.md) · [002 ambientes e regras](docs/engenharia/ADR-002-AMBIENTES-E-REGRAS.md) · [003 sessão ativa](docs/engenharia/ADR-003-SESSAO-ATIVA.md) · [004 privacidade](docs/engenharia/ADR-004-PRIVACIDADE-E-LEITURA.md) · [005 planos e agenda](docs/engenharia/ADR-005-PLANOS-E-AGENDA.md)
- [`docs/diagramas/DIAGRAMAS.md`](docs/diagramas/DIAGRAMAS.md) — 14 diagramas Mermaid (AS-IS e TO-BE)
- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) — camadas, ciclo das páginas, modelo de dados, CSS
- [`docs/firebase/LEIA-ME.md`](docs/firebase/LEIA-ME.md) — regras, Emulator e hosting
- [`docs/backend/CONTRATO_BACKEND.md`](docs/backend/CONTRATO_BACKEND.md) — backend controlado proposto (bloqueado) e modelo de ameaças

**Uso e operação:**
- [`docs/usuario/MANUAL_DO_USUARIO.md`](docs/usuario/MANUAL_DO_USUARIO.md) — manual por perfil
- [`docs/operacao/SEGURANCA_E_DEPLOY.md`](docs/operacao/SEGURANCA_E_DEPLOY.md) — ambientes, segredos, gates e decisão
- [`docs/operacao/BACKUP_E_ROLLBACK.md`](docs/operacao/BACKUP_E_ROLLBACK.md) — backup, restauração e rollback
- [`docs/operacao/DEPENDENCIAS.md`](docs/operacao/DEPENDENCIAS.md) — dependências, versões e licenças

**Auditoria e processo (histórico):**
- [`docs/auditorias/CLAUDE_HANDOFF_FINAL.md`](docs/auditorias/CLAUDE_HANDOFF_FINAL.md) — entrega **histórica** de Claude, anterior aos merges e reexecuções da CI
- [`docs/auditorias/CHATGPT_ACEITE_ACADEMICO_2026-11-19.md`](docs/auditorias/CHATGPT_ACEITE_ACADEMICO_2026-11-19.md) — resultado independente após os PRs #29–#34 e dependências travadas
- [`docs/auditorias/AUDITORIA_INDEPENDENTE_2026-11-18.md`](docs/auditorias/AUDITORIA_INDEPENDENTE_2026-11-18.md), [`GEMINI_AUDITORIA.md`](docs/auditorias/GEMINI_AUDITORIA.md), [`CHATGPT_REVISAO_FINAL_GEMINI_2026-11-19.md`](docs/auditorias/CHATGPT_REVISAO_FINAL_GEMINI_2026-11-19.md)
- [`docs/AUDITORIA.md`](docs/AUDITORIA.md) e [`docs/MIGRACAO.md`](docs/MIGRACAO.md) — registro histórico da reorganização Claude
- [`docs/processo/CHANGELOG_IA.md`](docs/processo/CHANGELOG_IA.md) e [`RASTREABILIDADE_IA.md`](docs/processo/RASTREABILIDADE_IA.md) — atribuição e processo

## Licença

MIT — veja [`LICENSE`](LICENSE).
