# Dependências do FluenCircle

Consulta: 19/11/2026; atualizado em 20/11/2026 (ícones locais, Issue #41). Versões de ferramentas conferidas no registro npm nesta data; nada foi instalado por IA no
ambiente de produção.

## 1. Em produção (carregadas pelo navegador)

| Dependência | Versão | Onde é usada | Observação |
| --- | --- | --- | --- |
| Firebase JS SDK (app, auth, database) | **10.8.0** via `www.gstatic.com` | só `public/js/core/firebase.js` e `core/firebase-auth.js` | Linha atual é a 13 (a `@firebase/rules-unit-testing` 6.0.0 já exige `firebase ^13`). Atualizar = trocar a versão nas duas URLs e rodar E2E + Emulator. |
| Font Awesome Free — só os ícones usados | 6.5.0, **servido pelo próprio site** (`public/css/components/icons.css`, gerado) | ícones (máscaras SVG) | Desde 20/11/2026 não vem mais do cdnjs (CSS de 100 KiB sem SRI + fontes de até 300 KiB por página). Ícones CC BY 4.0 — atribuição no topo do CSS gerado. Regenerar: `npm run icons:build`. |
| Google Fonts — Montserrat | — | tipografia | SIL OFL. Único CSS de terceiro restante; isento de SRI por ser gerado por navegador (`scripts/verify-static.mjs`). |
| Backend de tradução (Render) | desconhecida | `config/app.config.js` | Código não acessível; contrato proposto em `docs/backend/CONTRATO_BACKEND.md` |

O site não tem etapa de build nem dependências npm em tempo de execução.

## 2. Desenvolvimento e testes (`devDependencies`)

| Pacote | Versão fixada | Para quê | Requisitos |
| --- | --- | --- | --- |
| `firebase-tools` | 15.37.0 | Emulator (Auth, RTDB, Hosting) | Node ≥ 20; **Java 21+** para os emuladores |
| `@firebase/rules-unit-testing` | 5.0.1 | testes de regras no Emulator | Node ≥ 20; peer `firebase ^12` |
| `firebase` | ^12.0.0 | só para os testes de regras (Node) | — |
| `playwright` | 1.63.0 | testes E2E e medição de desempenho (`npm run bench:pages`) | `npx playwright install chromium` baixa o navegador |
| `@fortawesome/fontawesome-free` | 6.5.0 | fonte dos SVGs para `npm run icons:build` / `icons:check` | nada dele é carregado pelo navegador além dos ícones gerados |

Licenças: `firebase-tools` MIT; `firebase` e `@firebase/rules-unit-testing` Apache-2.0; `playwright` Apache-2.0;
`@fortawesome/fontawesome-free` CC-BY-4.0 AND OFL-1.1 AND MIT.

`package-lock.json` versionado (PR #35); a CI usa `npm ci`.

Alternativa registrada: `@firebase/rules-unit-testing` 6.0.0 exige `firebase ^13` e **Node ≥ 24.12**; adotar junto
com a migração do SDK do site para a linha 13.

## 3. Ferramentas

| Ferramenta | Versão mínima | Uso |
| --- | --- | --- |
| Node.js | 20 (CI usa 22) | testes, scripts, Emulator |
| Java (JDK) | 21 | Firebase Emulator (firebase-tools 15) |
| Git | qualquer recente | versionamento |
| Python 3 | opcional | `npm run serve` (servidor estático simples) |
| Navegador Chromium/Chrome | o do Playwright | E2E; `E2E_CHROME_PATH` permite usar um Chrome já instalado |

## 4. GitHub Actions

`actions/checkout@v4`, `actions/setup-node@v4`, `actions/setup-java@v4` (Temurin 21), `actions/cache@v4`
(binários do Emulator). Nenhum job usa segredos nem publica nada.

## 5. Política de atualização

- Ferramentas de teste com versão **exata**; atualizar em PR próprio, com a suíte completa verde.
- SDK do navegador: atualizar só com E2E e Emulator verdes e teste em staging (troca de versão maior pode mudar
  comportamento de transação e reconexão).
- Revisar avisos de segurança (`npm audit`) no PR, sem aplicar `--force` automaticamente.
