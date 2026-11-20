# Histórico de contribuições humanas e por IA

Este documento atribui **funções de assistência**, não forja autoria de commit. A autoria formal é o campo `author/committer` de cada objeto Git; commits e PRs são a fonte de verdade para revisão.

| PR | Responsabilidade | Entrega | Integração/estado |
| --- | --- | --- | --- |
| #1 | ChatGPT | `AGENTS.md`, protocolo de rastreabilidade e templates GitHub | Merge na main |
| #2 | Claude (proposta recebida) + conta proprietária (commit) | Reorganização de oito páginas, serviços e testes | Merge na main; **sem deploy** |
| #3 | ChatGPT | Verificação de integridade, transcrição do PDF, CI offline | Merge na branch de Claude, propagado à main |
| #4 | Claude (documento original), responsável (upload), ChatGPT (checksum) | PDF binário original de 15 páginas e metadata | Merge na main |
| #16 | ChatGPT | Mutação atômica de presença/sessão, UX de publicação, predicado de tradução; 9 novos testes | Merge na main; CI offline verde |
| #17 | ChatGPT | Auditoria independente de segurança/dados e runbook NO-GO | Merge na main |
| #18 | ChatGPT | Requisitos, manual, nove diagramas Mermaid, ADR, prompt Gemini, README e ledger | **Merge na main; CI 44430941350 aprovada** |
| #19 | ChatGPT | Checagem de camadas e sinks HTML em CI e documentação | **Merge na main; CI 44431326113 aprovada** |
| #22 | ChatGPT | Exportador de snapshot pinado e logs para Gemini | Merge na main; workflow de exportação validado |
| #23 | Gemini (parecer encaminhado) + ChatGPT (normalização/importação) | 9 achados e 4 artefatos de auditoria | **Merge na main; CI 44514494925 aprovada**; sem testes dinâmicos pelo Gemini |
| #26 | ChatGPT (correções) com achados de Gemini | SRS inválido e datas, CSP regional, contenção de regra RTDB **somente em proposta**, relatório final | **Merge na main; CI 44515234156: 30/30 testes** |
| #29–#34 | Claude (31 commits originais) + ChatGPT (auditoria e correção de corrida em testes) | Emulator e regras, E2E, concorrência de sessão, privacidade, tradução/contas, documentação do aluno | **Mesclado na main** com SHAs originais preservados; **65/65 testes no Emulator oficial e 44/44 E2E com Firebase simulado** em CI #44537468469; nenhum deploy |
| #42 (Draft) | Claude (auditoria, implementação, testes e documentação; Issue #41), em paralelo ao PR #40 do Codex | Seleção de ambiente fechada (produção só nos endereços publicados), ícones locais e folha única de CSS com ganho **medido**, `h()` endurecido, tradutor com tempo limite, verificação de camadas/ciclos, ferramenta de desempenho, relatórios de segurança, arquitetura, desempenho e compatibilidade histórica, 14 diagramas validados | **Draft, sem merge**; clone limpo: 153/153 unitários, 79/79 regras no Emulator oficial, 60/60 E2E; mesclagem de teste com o #40 sem conflitos; revisão independente pendente; nenhum deploy |
| Futuro | Responsável + IAs revisoras | Regras ativas, backend Render, credencial histórica, staging e release | **Aberto; NO-GO produção** |

## Compromissos

1. Cada etapa nova deve indicar Issue, SHA de base, escopo, IA, comando, testes observados, testes não executados e riscos.
2. As métricas 79 E2E/52 screenshots são relato histórico do Claude; não são reproduções executadas por ChatGPT.
3. **Atualização da auditoria ChatGPT em 19/11/2026:** Firebase Emulator oficial foi executado na CI (65/65); **Render e rotação de credencial histórica continuam não verificados**.
4. Merge de código para auditoria **não é** liberação de deploy. Gates estão em `docs/operacao/SEGURANCA_E_DEPLOY.md`.
5. A revisão Gemini (quando ocorrer) deve apresentar discordâncias e testes, nunca apenas aprovar relatórios anteriores.
