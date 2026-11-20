# Matriz de testes — relatório histórico de execução Claude

> **Atualização (Claude, 20/11/2026, PR #42):** execução mais recente, num **clone limpo** da branch `audit/claude-security-performance-architecture`: 153/153 unitários, 79/79 regras no **Firebase Emulator oficial**, 79/79 no simulador, 60/60 E2E (Firebase simulado), seed verificado (`SEED_OK`/`SEED_VERIFY_OK`) e as verificações estáticas, de arquitetura e de artefatos gerados. Comandos, ambiente e o que **não** foi executado: [`CLAUDE_IMPLEMENTATION_LOG.md`](../processo/CLAUDE_IMPLEMENTATION_LOG.md) §5–§6; desempenho medido: [`CLAUDE_AUDITORIA_DESEMPENHO.md`](../auditorias/CLAUDE_AUDITORIA_DESEMPENHO.md).

> **Complemento posterior (ChatGPT, 19/11/2026):** o registro abaixo descreve o ambiente original do Claude e não deve ser reescrito como se ele tivesse acesso ao GitHub ou ao Firebase Emulator. Depois do recebimento, os PRs #29–#34 foram abertos e mesclados, a correção de isolamento de testes foi aplicada por ChatGPT e a CI independente aprovou **87/87 unitários offline, 65/65 testes de regras no Firebase Emulator oficial e 44/44 E2E Playwright com Firebase simulado** na execução [44537468469](https://github.com/Lucas-Sperotto/fluencircle-website/actions/runs/44537468469). Os resultados e ressalvas atuais estão em [CHATGPT_ACEITE_ACADEMICO_2026-11-19.md](../auditorias/CHATGPT_ACEITE_ACADEMICO_2026-11-19.md). Esses testes não validam produção.

**Executor:** Claude (Opus 5.5), em ambiente Linux isolado da Anthropic, em 19/11/2026.
**Código testado:** branch `feat/claude-hardening-entrega`, commit `f98048e` (último commit de código; os commits
seguintes só alteram documentação). **Base:** `main@5d0180c`.

Níveis de evidência (AGENTS.md): **EXECUTADO** · **VERIFICADO NO CÓDIGO** · **RELATADO POR TERCEIRO** ·
**NÃO EXECUTADO/BLOQUEADO**. Nenhum teste tocou Firebase real, Render ou dados pessoais.

## 1. Ambiente da execução

| Item | Valor |
| --- | --- |
| Sistema | Ubuntu 24.04.5 LTS x86_64 |
| Node / npm | v22.23.5 / 10.9.9 |
| Navegador dos E2E | Google Chrome for Testing 153.0.8010.12 (`E2E_CHROME_PATH=/usr/bin/google-chrome`) |
| Playwright | 1.63.0 já presente no ambiente, ligado por *symlink* em `node_modules/` (nenhuma instalação pela rede) |
| Java | OpenJDK 21.0.13 |
| `firebase-tools` | **ausente** — o ambiente não permite instalar pacotes da rede |
| Rede | sem acesso a npm, Firebase, Render ou GitHub API com escrita |

## 2. Resultados

| # | Suíte | Comando | Escopo | Estado | Resultado |
| --- | --- | --- | --- | --- | --- |
| 1 | Unitários | `npm test` | domain, serviços puros, configuração, ambiente, simulador, gerador de regras | **EXECUTADO** | **87/87** aprovados (15 arquivos) |
| 2 | Sintaxe | `find public/js tests scripts firebase … \| xargs node --check` | 91 arquivos JS/MJS | **EXECUTADO** | sem erros |
| 3 | Estáticos | `node scripts/verify-static.mjs` | 8 HTML, 31 referências locais, JSON de configuração | **EXECUTADO** | 0 ausentes |
| 4 | Arquitetura | `node scripts/verify-architecture.mjs` | 48 módulos: camadas e sinks HTML | **EXECUTADO** | 0 violações |
| 5 | Sincronia das regras | `npm run rules:check` | JSON gerado = fonte comentada | **EXECUTADO** | em sincronia |
| 6 | Regras — **simulador** | `npm run test:rules:sim` | RBAC 40 + sessão ativa 13 + privacidade 12 | **EXECUTADO (SIMULADO)** | **65/65** — pré-verificação, **não é prova** |
| 7 | Regras — **Emulator** | `npm run test:rules` | os mesmos 65 casos no Firebase Emulator | **NÃO EXECUTADO — BLOQUEADO** | `sh: firebase: not found` (exit 127); configurado no job `rules-emulator` |
| 8 | E2E + acessibilidade | `npm run test:e2e` | 7 arquivos, 44 casos, Firebase **simulado** aplicando as regras propostas | **EXECUTADO** | **44/44** em 3 execuções seguidas (≈ 37 s cada) |
| 9 | Carga do Emulator | `npm run emulators:seed` | contas e banco sintéticos | **NÃO EXECUTADO** (sem Emulator) | guarda de segurança testada no item 1 |
| 10 | Medição sintética | `node scripts/benchmarks/read-volume.mjs` | volume lido pelo aluno, antes × depois | **EXECUTADO** | 767,3 KiB/2 leituras → 128,0 KiB/53 leituras (−83,3%); presenças alheias expostas 2.348 → 0 |
| 11 | Plano de migração | `node scripts/migrations/plan-privacy-migration.mjs <backup sintético>` | só dados sintéticos | **EXECUTADO** | 1 presença com PII, 1 índice antigo, 0 órfãos |
| 12 | Diagramas | `mmdc` (mermaid-cli 11.16.0) em todos os blocos Mermaid de `docs/` e README | 15 diagramas | **EXECUTADO** | 15 renderizados, 0 falhas |
| 13 | CI no GitHub Actions | jobs `offline`, `rules-emulator`, `e2e` | — | **NÃO EXECUTADO** | sem permissão de push neste ambiente |

Logs completos (TAP/texto) acompanham a entrega no pacote `evidencias-claude-2026-11-19` (fora do Git); os números
acima foram copiados desses logs.

## 3. Cobertura por perfil e área

`R` = regras (`tests/rules/`), `E` = E2E (`tests/e2e/`), `U` = unitário. Entre parênteses, o arquivo.

| Área | Visitante | Aluno A/B | Mediador A/B | Admin | Sem perfil / revogada |
| --- | --- | --- | --- | --- | --- |
| Login e redirecionamento | E (perfis) | E (perfis) | E (perfis) | E (perfis) | E (perfis) |
| Perfis e papéis (`users`) | R (rbac) | R (rbac): sem escalada | R (rbac) | R + E (fluxos) | R (rbac) |
| Temas | R | R | R + E (fluxos) | R | — |
| Sessões e presença | R | R (privacidade) | R + E (fluxos) | R | R |
| Sessão ativa / concorrência | R (sessao-ativa) | R | R + E (concorrencia) | R | — |
| Flashcards | R + E (tradutor-contas): **não cria** | R (privacidade) + E (privacidade) | R + E (fluxos) | R | R (privacidade) |
| Revisão espaçada | — | R (rbac) + U (srs) + E (fluxos) | R | R | R |
| Índice do aluno / PII | R | R + E (privacidade) | R | R | R |
| Contas (desfazer) | — | — | — | U (account-creation) + E (tradutor-contas) | — |
| Ambiente isolado | E (ambiente) | E | E | E | — |
| Acessibilidade básica | E (acessibilidade) | E | E | E | — |

## 4. Critérios de aceite (REQUISITOS_E_CASOS_DE_USO.md)

| Critério | Situação nesta entrega |
| --- | --- |
| CA-01 Autorização direta negada a aluno/visitante | Casos negativos escritos e aprovados no **simulador**; Emulator **pendente** |
| CA-02 Tradutor público sem acesso privado; gravação só por fluxo autorizado | Escrita anônima negada (R + E); fluxo autorizado = backend **não implementado** (bloqueado) |
| CA-03 Sessão A não apaga/substitui B por reconexão ou aba | Implementado e testado (U + R simulado + E); Emulator pendente |
| CA-04 Presença e índice coerentes | Regra exige os dois na mesma escrita (R); E2E confere o resultado |
| CA-05 Marcos 1/7/30 dias sem antecipar | U (srs) + regra de +1 etapa; prazos não verificáveis nas regras (limite registrado) |
| CA-06 Aluno não obtém dados de outros alunos | R (privacidade) + E com lista exata de leituras; dados antigos com PII ainda existem até a migração |
| CA-07 Sem conta órfã se o perfil falhar | U + E (desfazer); conta órfã só se o desfazer também falhar (informada ao admin) |

## 5. O que estes testes **não** provam

- Que as regras **ativas** em produção sejam seguras (são desconhecidas).
- Que o Firebase real se comporte igual ao simulador — até o job `rules-emulator` rodar, os resultados de regras são
  **simulados**.
- O comportamento do SDK real do Firebase (transações, reconexão, cache) no navegador: os E2E usam módulos falsos.
- Segurança, custo ou limites do backend do Render (código não acessível).
- Acessibilidade completa (contraste, leitor de tela, WCAG 2.2 AA): só checagens básicas automatizadas.
- Desempenho real: a medição de volume é sintética e não mede latência.

## 6. Como reproduzir

```bash
npm ci && npx playwright install chromium
npm test && npm run rules:check && npm run test:rules:sim
npm run test:rules        # precisa de Java 21; posteriormente APROVADO em GitHub Actions #44537468469
npm run test:e2e
node scripts/benchmarks/read-volume.mjs
```
