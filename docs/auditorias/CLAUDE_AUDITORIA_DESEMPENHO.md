# Auditoria de desempenho — FluenCircle (Claude)

**Data:** 20/11/2026 · **Autor:** Claude (Claude Code, modelo Opus 5.5) · **Issue:** #41 · **Base:** `main` =
`0e27c9abd1518f3d9a3ad2f0910b6d68e0b29caa` · **Branch:** `audit/claude-security-performance-architecture`.
**Revisão humana:** pendente.

> **Regra deste relatório:** toda melhoria afirmada foi **medida antes e depois nas mesmas condições**. O que é
> estimativa está marcado como **ESTIMADO**. Nenhum número de Lighthouse aparece aqui porque o Lighthouse **não foi
> executado** (§2.4).

## 1. Resumo dos resultados (MEDIDOS)

Linha de base = `main` `0e27c9a`. Final = branch com os commits `2263bfb` (ícones locais) e `76a0e23` (folha única de CSS),
além das correções sem efeito de desempenho. Mediana de 5 execuções por página, cache frio, escala pequena.

| Página (papel) | Bytes | Requisições | FCP móvel | Autenticado (móvel) | Dados na tela (móvel) |
| --- | --- | --- | --- | --- | --- |
| Login (público) | 473 → **187 KiB (−60%)** | 49 → 26 | 848 → **568 ms (−33%)** | — | — |
| Tradutor (público) | 112 → 106 KiB (−5%) | 43 → 22 | 812 → **468 ms (−42%)** | — | 1.706 → 1.581 ms (−7%) |
| Home (aluno) | 395 → **198 KiB (−50%)** | 56 → 33 | 824 → **516 ms (−37%)** | 2.557 → **1.990 ms (−22%)** | 2.571 → 2.011 ms (−22%) |
| Flashcards (aluno) | 403 → 207 KiB (−49%) | 61 → 38 | 864 → 520 ms (−40%) | 2.519 → 2.048 ms (−19%) | 2.640 → 2.153 ms (−18%) |
| Flashcards (equipe) | 403 → 207 KiB (−49%) | 61 → 38 | 864 → 528 ms (−39%) | 2.519 → 2.054 ms (−18%) | 2.613 → 2.144 ms (−18%) |
| Sessões (equipe) | 398 → 201 KiB (−49%) | 58 → 35 | 808 → 516 ms (−36%) | 2.476 → 2.084 ms (−16%) | 2.548 → 2.175 ms (−15%) |
| Apresentação (equipe) | 384 → 213 KiB (−44%) | 67 → 45 | 896 → 548 ms (−39%) | 2.661 → 2.161 ms (−19%) | 2.677 → 2.197 ms (−18%) |
| Planos (admin) | 401 → 204 KiB (−49%) | 59 → 36 | 836 → 536 ms (−36%) | 2.587 → 2.055 ms (−21%) | 2.701 → 2.151 ms (−20%) |
| Acessos (admin) | 373 → 202 KiB (−46%) | 56 → 34 | 852 → 536 ms (−37%) | 2.580 → 2.041 ms (−21%) | 2.648 → 2.132 ms (−19%) |

Sem limitação de rede (mesma máquina), o FCP caiu 3–41% e a autenticação 4–14%: a diferença real aparece quando há
latência e banda limitada. Arquivos: `docs/auditorias/evidencias/desempenho/01`, `02` (linha de base) e `11`, `12` (final).

**Problemas medidos e ainda abertos:** leitura integral das coleções pelas telas da equipe (até **6,2 MiB** e **~50 s**
no perfil móvel com 1.500 sessões — §4.3) e CLS de **0,12** na tela de login (§4.6).

## 2. Metodologia

### 2.1 Ferramenta

`scripts/benchmarks/page-performance.mjs` (versionado, com funções puras testadas em
`tests/unit/page-performance-lib.test.js`). Uso: `npm run bench:pages` ou, com opções,
`BENCH_ARGS="--scale=medium --network=mobile --runs=5" npm run bench:pages`.

1. **Segurança:** recusa qualquer alvo que não seja Emulator local de projeto `demo-*` (reutiliza `assertSafeTarget`).
2. **Dados:** recria as contas de demonstração e grava a carga sintética (`example.test`); escalas abaixo.
3. **Servidor:** `public/` por **HTTP/2 + TLS (certificado temporário) + gzip**, o mais próximo do Firebase Hosting
   possível localmente. Só as portas do Emulator são reescritas na resposta de `firebase.config.js`.
4. **Navegador:** Chromium 153 do Playwright, *headless*, **contexto novo por medição** (cache frio), já autenticado
   pelo papel da página (estado do IndexedDB salvo após um login real no Auth Emulator).
5. **Métricas por página:** FCP e LCP (Paint/LCP API), CLS (soma dos `layout-shift` sem interação), **autenticado** =
   instante em que `#user-email` é preenchido por `setShellUser` (fim de `requireAuth`), **dados** = instante em que o
   seletor da página aparece (cards, linhas da tabela etc.), requisições e bytes codificados por tipo (CDP `Network`),
   **operações do Realtime Database** contadas nos quadros WebSocket do protocolo do SDK (`g` = get, `q` = listen,
   `p`/`m` = escrita), bytes recebidos pelo WebSocket, heap JS, nós de DOM e listeners (CDP `Performance.getMetrics`).
6. **Repetição:** 5 execuções por página (3 nas escalas média e grande), páginas intercaladas a cada rodada;
   relata-se **mediana**, mínimo e máximo (nos JSON).

### 2.2 Perfis de rede

| Perfil | Parâmetros | Como |
| --- | --- | --- |
| `none` | rede local da máquina | sem limitação |
| `mobile` | latência 150 ms, 1,6 Mbit/s ↓, 750 kbit/s ↑, **CPU 4×** | `Network.emulateNetworkConditions` + `Emulation.setCPUThrottlingRate` (mesmos números do perfil móvel do Lighthouse, mas **aplicados** pelo DevTools, não simulados) |

### 2.3 Escalas sintéticas

| Escala | Sessões | Cards | Alunos | Presentes/sessão | Sessões do aluno medido | Tamanho do banco |
| --- | --- | --- | --- | --- | --- | --- |
| small | 3 | 5 | 2 | 1–2 | 2 | 4,4 KB |
| medium | 303 | 4.505 | 102 | 10 | 42 | 1,29 MB |
| large | 1.503 | 30.005 | 402 | 12 | 42 | 8,1 MB |

O aluno medido tem **o mesmo número de sessões** nas escalas média e grande, para separar o custo O(próprias sessões)
do aluno do custo O(total) da equipe.

### 2.4 Ambiente e limites (o que estes números NÃO são)

- Máquina: Linux 6.18 (WSL2), x86-64, 16 núcleos lógicos, 7 GiB; Node 22.22.3; Chromium 153.0.8010.12;
  Firebase Emulator (firebase-tools 15.37.0, Java 21) **na mesma máquina** — não há latência de servidor real.
- CDNs reais (gstatic, Google Fonts e, na linha de base, cdnjs) foram acessados pela internet da máquina; variação
  de rede entre execuções está nos mínimos/máximos dos JSON.
- O *throttling* do DevTools é aproximado e aplicado por requisição; **não** reproduz um celular real (GPU, memória,
  navegador do sistema). Medição em aparelho físico: **NÃO EXECUTADA**.
- Viewport de desktop (1280×720); responsividade em largura de celular não foi medida (o CSS `responsive/mobile.css`
  existe; teste visual em aparelho fica para homologação).
- **Lighthouse: NÃO EXECUTADO.** Não está nas dependências e as páginas internas exigem login (seria preciso um *user
  flow* autenticado). As métricas equivalentes (FCP, LCP, CLS, bytes, requisições) foram coletadas pelo CDP; não
  convertê-las em "nota Lighthouse".
- Os números servem para **comparar versões nas mesmas condições**, não para prever o tempo em produção.

## 3. Linha de base (MEDIDA, antes de qualquer otimização)

### 3.1 Peso por tipo (escala pequena, sem limitação) — `01-baseline-small-none.json`

| Página | Total | Fontes | Scripts | CSS | Terceiros |
| --- | --- | --- | --- | --- | --- |
| Login | 472,9 KiB / 49 req. | **305,7 KiB (3)** | 123,9 KiB (21) | 41,7 KiB (24) | 433,2 KiB |
| Tradutor | 111,7 KiB / 43 | — | 87,9 KiB (19) | 22,8 KiB (23) | 68,9 KiB |
| Páginas internas | 373–403 KiB / 56–67 | **191–217 KiB (2–3)** | 134–148 KiB (26–38) | 41,7 KiB (24) | 319–344 KiB |

Fontes de ícone e texto eram **mais da metade** do peso; o CSS vinha em **24 requisições** por página (main.css + 20
`@import` + página + Font Awesome + Google Fonts).

### 3.2 Perfil móvel — `02-baseline-small-mobile.json`

FCP 808–896 ms; conteúdo autenticado só em **2.476–2.661 ms**; dados em 2.548–2.701 ms.

### 3.3 Volume de dados por escala (sem limitação) — `03`, `04`, `05`

| Página | Operações RTDB | Recebido (média) | Recebido (grande) | Dados na tela (grande, sem limitação) |
| --- | --- | --- | --- | --- |
| Flashcards (aluno) | 46 get | 107,4 KiB | 141,0 KiB | 360 ms |
| Flashcards (equipe) | 5 get (**coleções inteiras**) | **965,7 KiB** | **6.235,5 KiB** | 1.238 ms |
| Sessões (equipe) | 4 get (**coleções inteiras**) | **965,6 KiB** | **6.235,5 KiB** | 1.043 ms |
| Apresentação (equipe) | 4 get (todos os perfis + temas) | 28,9 KiB | 97,8 KiB | 306 ms |
| Acessos (admin) | 4 get (todos os perfis + planos) | 17,9 KiB | 64,5 KiB | 343 ms |
| Planos (admin) | 5 get | 13,4 KiB | 35,7 KiB | 336 ms |
| Home (aluno) | 6 get | 1,8 KiB | 1,8 KiB | 298 ms |

**Escala grande no perfil móvel** (`05-baseline-large-mobile.json`): Flashcards (equipe) **50,1 s** e Sessões (equipe)
**49,6 s** até mostrar dados; Flashcards (aluno) 3,7 s. O *throttling* do DevTools se aplica ao WebSocket do RTDB
(6,2 MiB a 1,6 Mbit/s ≈ 31 s de transferência, mais o processamento com CPU 4×).

## 4. Achados

### PERF-01 — Font Awesome do CDN (CORRIGIDO, medido)

- **Antes:** CSS de 100 KiB do cdnjs (sem SRI) + até 3 fontes woff2 (191–306 KiB) para **42 ícones**.
- **Mudança:** `npm run icons:build` gera `css/components/icons.css` (42 máscaras SVG, 25,9 KB, 7,7 KB com gzip).
- **Equivalência:** 112 ícones em 7 páginas com caixas de layout **idênticas** às do Font Awesome real (diferença máxima
  0 px) e capturas comparadas.
- **Efeito isolado (medido, `06`/`07`):** −45% a −59% de bytes; no perfil móvel, conteúdo autenticado 180–310 ms antes.

### PERF-02 — Cadeia de `@import` (CORRIGIDO, medido)

- **Antes:** `main.css` + 20 `@import` = uma ida e volta a mais antes da primeira pintura e 21 requisições.
- **Mudança:** `npm run css:build` gera `css/app.css` (68,5 KB, 13,9 KB com gzip), mesma ordem da cascata.
- **Efeito isolado (medido em variante equivalente, `07` → `08`):** FCP móvel −290 a −360 ms; −21 requisições; LCP −100 a
  −300 ms. Conferido depois no código final (`12`).
- **Equivalência:** capturas de 7 páginas idênticas byte a byte, exceto dados da própria execução (UIDs, contagem
  regressiva do SRS).

### PERF-03 — Telas da equipe leem coleções inteiras (ABERTO, medido)

`sessions.page.js` e a visão da equipe de `flashcards.page.js` fazem `get meeting_sessions` e `get flashcards` sem
filtro: o custo cresce com **todo** o histórico (966 KiB com 300 sessões; 6,2 MiB com 1.500; ~50 s no perfil móvel). A
correção (paginação por `startedAt` com `.indexOn` e contagem só das sessões da página) está desenhada em
`CLAUDE_AUDITORIA_ARQUITETURAL.md` ARQ-04 e **não foi implementada** para não editar os mesmos arquivos do PR #40.
**ESTIMADO** após a correção: ~120 KiB por visita em qualquer escala.

### PERF-04 — Leitura do aluno é proporcional às próprias sessões (CONFIRMADO, medido)

46 leituras pequenas e 107–141 KiB tanto com 300 quanto com 1.500 sessões no total (o aumento vem dos cards por sessão:
15 → 20). Confirma o ADR-004 com medida, não só com a estimativa sintética de `scripts/benchmarks/read-volume.mjs`.

### PERF-05 — Perfis inteiros na apresentação e em Acessos (BAIXO)

Apresentação e Acessos leem `users` inteiro (97,8 KiB e 64,5 KiB com 405 perfis). Aceitável até alguns milhares de
perfis; a apresentação poderia ler só alunos com uma consulta por papel (exige `.indexOn` e regra de consulta).

### PERF-06 — CLS da tela de login (ABERTO, medido)

CLS 0,117–0,123 (acima de 0,1, "precisa melhorar"), igual antes e depois. **Causa medida** (atribuição do
`layout-shift`): aos ~400 ms o bloco `#auth-elements` passa de 700×166 para 730×221 px e empurra as duas ilustrações —
troca da fonte Montserrat (`display=swap`) por métricas diferentes da fonte de reserva. Opções: `display=optional`
(sem troca; a 1ª visita pode ficar com a fonte do sistema), fonte de reserva com `size-adjust`/`ascent-override`, ou
servir a Montserrat pelo próprio site com `preload`. Decisão de identidade visual — **não alterado**.

### PERF-07 — Cascata de módulos e SDK (ABERTO, ESTIMADO)

As páginas internas têm **8 níveis** de import local antes de chegar ao SDK (EXECUTADO, contagem no grafo) e o SDK do
Firebase representa ~80–85% do JavaScript transferido (estimado pela diferença entre bytes de terceiros e locais).
`<link rel="modulepreload">` gerado ou um empacotador poderiam encurtar a cascata — **não medido**; a ferramenta permite
medir uma variante com `BENCH_PUBLIC_DIR` antes de decidir.

### PERF-08 — Leitura repetida do perfil na home (BAIXO, medido)

`home-student` faz `get users/{uid}` **duas vezes** (em `resolveAccess` e em `loadStudentWeek`). Passar o perfil já
lido para a página evita uma ida ao banco. Arquivo alterado pelo PR #40: fica como recomendação.

### PERF-09 — Memória e listeners (MEDIDO: sem vazamento cumulativo)

Cenário `--scenario=study-loop`: abrir um deck, passar todos os cartões e voltar, 20 vezes, com GC forçado antes de cada
amostra.

| Versão | Nós de DOM (ciclo 1 → 20) | Listeners (1 → 20) | Heap JS (1 → 20) | Elementos desconectados vivos |
| --- | --- | --- | --- | --- |
| `main` | 296 → **298** | 53 → **53** | 3,14 → 3,40 MB | só a última geração de cartões (mantida pelo `CardStack` até o próximo deck) |
| PR #40 | 236 → **236** | 45 → **45** | 3,10 → 3,35 MB | nenhum |

**Lição de método:** a primeira medição indicou ~73 nós e ~7 listeners "vazando" por ciclo. A investigação mostrou um
**artefato da ferramenta**: `page.waitForSelector()` devolve um `ElementHandle` que, sem `dispose`, mantém o elemento
vivo. Com `locator().waitFor()` o vazamento desaparece (`a658d02`). O heap cresce ~14 KB por ciclo sem relação com o DOM
(provável cache do SDK); não investigado além disso. Listeners do RTDB: só o tradutor público (1 `listen`) e a
apresentação ao vivo mantêm escutas; nenhuma página medida acumula escutas.

### PERF-10 — Operações redundantes e autenticação

O tempo até "autenticado" (≈ 2,0–2,2 s no perfil móvel depois das correções) é dominado por baixar e encadear os
módulos e o SDK (§PERF-07), não pelo banco: no Emulator local a verificação de acesso faz 2 leituras em paralelo
(`users/{uid}` e `deleted_users/{uid}`).

## 5. Reprodução

```bash
npm ci
# terminal único: sobe o Emulator, roda e derruba (Java 21)
BENCH_ARGS="--scale=small --runs=5 --network=mobile --out=resultado.json" npm run bench:pages
# comparar outra versão nas mesmas condições
git archive <ref> public | tar -x -C /tmp/outra && \
  BENCH_PUBLIC_DIR=/tmp/outra/public BENCH_ARGS="--skip-seed --runs=5 --network=mobile" npm run bench:pages
# vazamento de memória
BENCH_ARGS="--scenario=study-loop --runs=20" npm run bench:pages
```

Se as portas padrão do Emulator estiverem ocupadas, use uma cópia de `firebase.emulator.json` com outras portas: a
ferramenta lê `FIREBASE_*_EMULATOR_HOST` e reescreve só a resposta local de `firebase.config.js`.

## 6. Recomendações

| Prioridade | Ação | Evidência | Estado |
| --- | --- | --- | --- |
| P1 | Paginar as telas da equipe (PERF-03) | 6,2 MiB / 50 s medidos | após integrar o PR #40 |
| P2 | Resolver o CLS do login (PERF-06) | 0,12 medido, causa atribuída | decisão visual |
| P2 | Medir `modulepreload` gerado e, depois, um empacotador (PERF-07) | estimado | protótipo + benchmark |
| P3 | Evitar a leitura repetida do perfil (PERF-08) | 2 leituras medidas | após o PR #40 |
| P3 | Rodar `bench:pages` com teto de bytes por página na CI (opcional, lento) | ferramenta pronta | proposta |
