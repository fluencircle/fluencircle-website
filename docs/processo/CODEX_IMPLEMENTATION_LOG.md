# Registro de implementação Codex

**Data** 20/11/2026, America/Sao_Paulo. **Issue** [#39 do fork](https://github.com/Lucas-Sperotto/fluencircle-website/issues/39).

## Entradas e base Git

- Missão do solicitante, `AGENTS.md`, README, ADRs 001–005, contrato de backend, guias de entrega, Issues #5–#10, #13, #15 e #28 do fork.
- `origin/main@0e27c9abd1518f3d9a3ad2f0910b6d68e0b29caa` foi a base de `audit/codex-recuperacao-funcional`. `upstream/main@67e79220a3356bb6100afde2e8aaba66653b13eb` e `upstream/plans@3c6e7f0f8a5374baaa76cfc3a363184ea8b42c85` foram conferidos no servidor antes das alterações.
- A main original `dd8a9d8560d6b7fb8d93e7c259cef05f3b799e42` e Plans original foram abertos em worktrees destacados. `git ls-tree`, `git show`, `git diff` e `git log` rastrearam páginas, funções, listeners e contratos de dados. [Matriz histórica](../auditorias/CODEX_MATRIZ_COMPATIBILIDADE_HISTORICA.md)
- O PR #2 upstream mantém Plans histórico. Os PRs #1 e #3 upstream integraram a refatoração e o porte de planos. O PR #38 do fork integrou o seed verificável. [Histórico upstream](https://github.com/fluencircle/fluencircle-website/pulls?q=is%3Apr) · [Fork #38](https://github.com/Lucas-Sperotto/fluencircle-website/pull/38)

## Commits e responsabilidade

| Commit | Escopo | Caminhos centrais |
| --- | --- | --- |
| `ea7c1c719425178a944ed2b26155f1385da8d241` | Transições e revisão de flashcards | `public/js/ui/card-stack.js`, `pages/flashcards.page.js`, `tests/e2e/fluxos.e2e.test.mjs` |
| `88079a1975c85fa1d6d5eeb9841e3512706507be` | Resposta e gravação do tradutor | `pages/circle-translator.page.js`, `pages/presentation/translator-modal.js`, `tests/e2e/tradutor-contas.e2e.test.mjs` |
| `79dfa117f66aacb9cc37eaf924d95d5bb6f3a3f7` | Identidade de horários e vínculo de plano legado | `domain/plans.js`, `pages/admin.page.js`, `pages/home.page.js`, `pages/plans.page.js`, `services/plans.service.js`, `services/users.service.js`, fonte de regras, JSON e testes de planos |
| `9194d49388de206f4cc727b607fdd541b3430ef4` | Círculos autenticados no demo e posse do tradutor | `public/index.html`, `public/presentation.html`, `pages/room-lobby.js`, `services/live-rooms.service.js`, `domain/presentation-lock.js`, fonte de regras, documentação e testes de salas |
| `dc369e754b5afcf4c4cfb98f3f2854dc90dcdcf8` | Integração real de browser e CI | `tests/e2e-emulator/`, `package.json`, `.github/workflows/ci.yml` |

Os caminhos iniciados por `pages/`, `domain/` e `services/` são relativos a `public/js/`. O commit de documentação acrescenta a matriz, o relatório de testes, o registro de correções e este log. Consulte o histórico da branch para a lista completa de arquivos.

Codex (OpenAI) fez inventário, implementação, testes, revisão cruzada entre agentes da mesma ferramenta e preparação dos Drafts. O autor Git dos commits novos identifica Codex. As inspeções cruzadas fazem parte da implementação. Revisão independente e aceite humano seguem pendentes.

O transporte do seed foi feito em `fix/emulator-seed-upstream`, com sete `git cherry-pick -x` sobre o HEAD upstream identificado e preservação da autoria original. `git diff --exit-code 0e27c9a 073466d` verificou igualdade de árvore. [Draft upstream #4](https://github.com/fluencircle/fluencircle-website/pull/4) · [CI upstream do transporte](https://github.com/fluencircle/fluencircle-website/actions/runs/44774131323)

## EXECUTADO

- Clones limpos do fork e upstream, `npm ci`, Node `22.22.3`, npm `10.9.8`, Java `21.0.13.1`, Firebase CLI `15.37.0`, RTDB Emulator `4.11.2`, Playwright `1.63.0` e Chromium `153.0.8010.12`.
- `npm test`, `npm run test:rules`, `npm run test:rules:sim`, `npm run test:e2e`, `npm run test:e2e:emulator`, `npm run rules:check`, `node scripts/verify-static.mjs`, `node scripts/verify-architecture.mjs`, `node --check` e `git diff --check`. Cenários, pré-condições e resultados no [Relatório funcional](../auditorias/CODEX_TESTES_FUNCIONAIS_REAIS.md).
- `npm run emulators` → `npm run emulators:seed` → `npm run emulators:verify` em processos separados no clone do fork. A auditoria confirmou número de registros diretamente no namespace demo. No upstream original, o seed de Linux gravou três sessões e o script `emulators:verify` estava ausente.
- Na CI do fork, a instalação de fontes opcionais pelo `--with-deps` atrasou o job simulado. A configuração final instala o Chromium do Playwright e usa as bibliotecas do runner Ubuntu. Os comandos, dados e asserções das duas suítes de browser permanecem os mesmos.

## VERIFICADO NO CÓDIGO

- A execução usa projeto demo em loopback. O agente manteve a recuperação dos círculos condicionada ao ambiente local. A CI usa dados sintéticos e aplica a proposta de regras nos emuladores.
- Usuários do Plans podem ter `plan`, índices de presença `true` e chaves de agenda incompatíveis entre ISO e semana do mês. As duas primeiras formas têm tratamento implementado. O agente escolheu exigir data de referência para reconstituir agenda ambígua. [Correções e regressões](../auditorias/CODEX_CORRECOES_E_REGRESSOES.md)

## RELATADO POR TERCEIRO

- O aluno encontrou demonstração sem dados. O PR #38 registra o problema de execução direta no Windows. O check Windows do GitHub Actions verifica a entrada do script com `--check`. A máquina do aluno e a causa específica da falha nela permanecem sem evidência direta. [Fork #38](https://github.com/Lucas-Sperotto/fluencircle-website/pull/38)

## NÃO VERIFICADO

- Regras ativas, dados reais, credencial histórica, Render/Gemini, sinalização/voz e dispositivos físicos. O backend de tradução respondeu com fixture nos testes de browser.
- Retenção de chat, moderação e carga fora da demonstração. Presença acadêmica continua confirmada pela equipe. O tradutor público mantém um destino de sessão selecionado pela equipe.
- Aceite humano, produção e homologação. Os Drafts permitem revisão dos deltas e das verificações sem alterar as branches `main`.
