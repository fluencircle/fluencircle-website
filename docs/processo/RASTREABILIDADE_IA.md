# Rastreabilidade de contribuições de IA — FluenCircle

**Status:** processo em uso no fork, com PRs documentados; sujeito a revisão humana. **Base inicial:** `fluencircle/fluencircle-website@dd8a9d8560d6b7fb8d93e7c259cef05f3b799e42`.

## Princípios
- Cada tarefa nasce de uma Issue; cada mudança passa por branch, commits, PR, revisão e decisão de integração.
- A **identidade Git** registra quem efetuou o commit. O campo **assistência de IA** indica qual sistema gerou, sugeriu, implementou ou revisou o conteúdo. Essas funções não devem ser confundidas.
- O resultado de cada ferramenta é uma **alegação a verificar**, não aprovação automática.
- Revisores não fazem alterações silenciosas no código que estão julgando. Correções exigem commit novo e revisão.
- Segurança, integridade e conformidade não podem depender de concordância entre modelos.

## Papéis por fase
| Fase | IA/ferramenta | Responsabilidade | Artefato principal |
| --- | --- | --- | --- |
| 0 | Claude | Proposta de refatoração modular, já recebida em ZIP/diff; autoria da proposta, ainda não integrada | Branch `refactor/claude-modularizacao` e PR Draft |
| 1 | ChatGPT | Auditoria preliminar independente, engenharia e governança | Branch de documentos, Issues e PR de documentação |
| 2 | Gemini | Revisão cruzada de código, segurança e documentação | `audit/gemini-revisao`, relatório reproduzível e PR |
| 3 | ChatGPT | Auditoria final das alterações reais e evidências, com decisão proposta de GO/NO-GO | Relatório final e revisão de PR |
| 4 | Responsável humano | Aprovação, merges, configuração de serviços e deploy | Decisão formal documentada |

A sequência é um plano de trabalho; não indica que os PRs futuros já existam.

## Convenção de nomes
- Branches: `refactor/claude-modularizacao`, `docs/ai-governance`, `docs/auditoria-chatgpt`, `audit/gemini-revisao`, `fix/<issue>-<tema>`.
- Commits: **Conventional Commits**, com escopo e intenção específica. Ex.: `fix(sessions): prevent stale mediator from clearing current session`.
- PRs: `[Claude][Refactor] ...`, `[ChatGPT][Docs] ...`, `[Gemini][Audit] ...`, conforme a função.
- Labels desejáveis: `ai:claude`, `ai:chatgpt`, `ai:gemini`, `type:security`, `type:documentation`, `priority:P0` ... `priority:P3` (criar quando Issues estiver habilitado).

## Cabeçalho obrigatório na Issue
- **Problema ou objetivo**: resultado observável, não solução presumida.
- **Contexto e base**: branch e SHA originais.
- **Responsável / IA assistente**: quem solicita, executa e revisa.
- **Critérios de aceite**: testes e observações que demonstram conclusão.
- **Riscos**: impacto, compatibilidade e se bloqueia produção.
- **Evidências**: links dos commits, PR, testes e revisões.
- **Estado**: backlog, em desenvolvimento, em revisão, bloqueado ou concluído.

## Registro obrigatório no PR
```text
Issue relacionada: Closes #N / Relates to #N
Ferramenta executora: Claude | ChatGPT | Gemini | humano
Ferramentas revisoras: ...
Base: <branch>@<sha>
Arquivos e alterações: ...
Decisões e trade-offs: ...
Testes efetivamente executados: comando / versão / resultado / logs
Testes não executados: ...
Segurança e privacidade: ...
Compatibilidade, dados e rollback: ...
Riscos remanescentes: ...
Aprovação humana: pendente/aprovada + referência
```

## Inventário inicial
| ID | Origem | Material | Verificação | Estado |
| --- | --- | --- | --- | --- |
| CL-001 | Claude | ZIP, patch e PDF de auditoria | Código integrado no PR #2 e PDF original no PR #4; alegações E2E históricas ainda não reproduzidas | **Integrado como baseline, não aprovado para deploy** |
| CG-001 | ChatGPT | Validação do ZIP e CI (#3); reparos de dados/UX (#16); auditoria própria (#17) | 25/25 testes unitários, GitHub Actions aprovadas; testes externos pendentes | **Integrado, sujeito a testes no Emulator** |
| GM-001 | Gemini | Revisão cruzada independente, planejada | Nenhum resultado ainda | Planejada |
| CG-002 | ChatGPT | Revisão final, planejada | Depende de código e evidências novos | Planejada |
| CL-002 | Claude | Hardening e entrega ao aluno (Issue #28): 31 commits em 6 branches empilhados | Unitários 87/87, regras no simulador 65/65, E2E 44/44 executados localmente; Emulator e CI **não executados**; ver `docs/auditorias/CLAUDE_HANDOFF_FINAL.md` | **Em revisão (Draft), sem merge** |
| CL-003 | Claude | Auditoria técnica independente (Issue #41): segurança, arquitetura, desempenho medido, compatibilidade histórica, diagramas; 8 commits de código/teste e 6 de documentação na branch `audit/claude-security-performance-architecture` | Clone limpo: unitários 153/153, regras no **Emulator oficial** 79/79, simulador 79/79, E2E 60/60, seed verificado; mesclagem de teste com o PR #40 sem conflitos; ver `docs/processo/CLAUDE_IMPLEMENTATION_LOG.md` | **Em revisão (Draft), sem merge**; revisão independente pendente |

## Critério de fechamento
Uma Issue só é encerrada quando há PR relacionado, testes/evidências suficientes e decisão registrada. Um PR só pode ser mesclado após revisão dos riscos da sua área e aprovação humana. **Sem merge automático de mudanças de segurança ou de dados.**
