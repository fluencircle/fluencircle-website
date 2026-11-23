# Runbook de segurança e implantação — FluenCircle

**Ambiente padrão:** Emulator local e CI. **Estado de produção:** BLOQUEADO (**NO-GO**) até os gates abaixo. Este
documento **não é** script de deploy; deploy é sempre ação humana explícita.

## 1. Ambientes

| Ambiente | Como é selecionado | Dados | Quem usa | Estado |
| --- | --- | --- | --- | --- |
| Local / Emulator | **qualquer** endereço fora de `PRODUCTION_HOSTNAMES` (automático) + `npm run emulators` | sintéticos (`npm run emulators:seed`) | estudantes e desenvolvimento | ✅ implementado (ADR-002, revisão de 20/11/2026) |
| CI (GitHub Actions) | jobs `offline`, `rules-emulator`, `e2e` | sintéticos; Emulator dentro do runner | PRs e `main` | ✅ configurado; **ainda não executado** com estes jobs |
| Staging | projeto Firebase separado + domínio próprio | cópia controlada ou sintéticos | validação antes de produção | ❌ **não existe** — decisão humana |
| Produção | **somente** `fluentech-1e18a.web.app` e `fluentech-1e18a.firebaseapp.com` (`PRODUCTION_HOSTNAMES`) | reais | público | publicação bloqueada |

**Gate de deploy (ADR-002, revisão de 20/11/2026):** antes de publicar em domínio próprio, incluí-lo em
`PRODUCTION_HOSTNAMES` (`public/js/config/firebase.config.js`) por PR revisado. Sem isso o site publicado mostra o
selo "Endereço não reconhecido" e aponta para o Emulator (falha segura). Pré-visualizações do Hosting nunca usam
produção; para validar com dados, crie um projeto de **staging** (Issue #15).

## 2. Segredos e credenciais

- A configuração **web** do Firebase não é segredo; chave do Gemini, credenciais do Admin SDK, exportações do Auth e
  backups do banco **são**. Nunca no Git, Issues, PRs, logs, relatórios ou prompts de IA.
- **Credencial histórica (Issue #6):** uma chave esteve em `public/js/env.js` entre os commits `6c8f017` e `d680b33`.
  Apagar arquivo não a remove do histórico. **Somente o operador do Google Cloud** pode identificar o tipo, verificar
  uso, revogar/rotacionar e registrar evidência sanitizada. Nenhuma IA confirmou a rotação.
- Variáveis do backend (nomes): ver `docs/backend/CONTRATO_BACKEND.md` §4.

## 3. Mudanças de regras

1. Exportar as regras **ativas** e versioná-las (ver `BACKUP_E_ROLLBACK.md`).
2. Editar a fonte `firebase/rules/database.rules.source.mjs`, rodar `npm run rules:build`.
3. `npm run test:rules` (Emulator) e `npm run test:rules:sim`; anexar os logs ao PR.
4. Revisão por duas pessoas; publicação primeiro em staging. Nunca `firebase deploy --only database` a partir de
   uma proposta não aprovada.

## 4. Backend

Código não acessível nesta entrega (bloqueio registrado). Antes de produção: auditoria do repositório, prompt no
servidor, App Check, rate limit, teto de custo, CORS restrito, logs sem PII e testes de contrato.

## 5. Release

Checklist completo em `docs/entrega/CHECKLIST_FINAL.md`. Backup e rollback em `docs/operacao/BACKUP_E_ROLLBACK.md`.

## 6. Comandos seguros (não alteram serviços externos)

```bash
npm test
npm run rules:check
npm run test:rules:sim
npm run test:e2e
npm run test:rules          # Emulator local, projeto demo
node scripts/verify-static.mjs
node scripts/verify-architecture.mjs
```

## 7. Registro de decisão (19/11/2026)

| Critério | Estado |
| --- | --- |
| CI offline + simulador de regras | Configurado; executado localmente (ver `docs/entrega/MATRIZ_DE_TESTES.md`) |
| Regras propostas testadas no **Emulator** | **Pendente** (job `rules-emulator`; não executado no ambiente da implementação) |
| Regras **reais** exportadas e comparadas | **Pendente** (operador) |
| Escrita pública com proteção contra abuso | **Pendente** (backend); proposta nega escrita anônima |
| Credencial antiga avaliada/rotacionada | **Pendente** (operador GCP) |
| Backend Render auditado | **Bloqueado** (sem acesso ao código) |
| Mediadores concorrentes | Implementado (ADR-003); testado com Firebase simulado; Emulator pendente |
| Leitura mínima e PII | Implementado (ADR-004); migração de dados reais **pendente** |
| E2E e acessibilidade básica | 44 casos com Firebase simulado; E2E contra Emulator/staging **pendente** |
| Staging, backup testado e rollback | **Pendente** |
| Autorização humana para deploy | **Ausente** |

**Decisão: NO-GO para produção.** Liberado para revisão, merges de código/documentação e entrega acadêmica.
