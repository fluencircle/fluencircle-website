# Guia do aluno — FluenCircle

Este guia leva você de um clone vazio até uma demonstração local completa, sem tocar em dados reais, e mostra onde
mexer para continuar o projeto. Tempo estimado: 30 minutos na primeira vez.

> **Regra de ouro:** tudo aqui roda na sua máquina, com o **Firebase Emulator** e dados **sintéticos**. Nunca use o
> projeto Firebase de produção para testar, nunca faça `firebase deploy` e nunca coloque chaves ou senhas reais no
> Git. As regras completas para pessoas e IAs estão em [`AGENTS.md`](../../AGENTS.md).

## 1. O que é o projeto

Site das sessões de conversação do FluenCircle: o **mediador** conduz uma sessão com slides de perguntas, registra a
presença e transforma dúvidas de vocabulário em **flashcards**; o **aluno** revisa os flashcards em marcos de 1, 7 e
30 dias; o **visitante** usa um tradutor público; o **administrador** gerencia contas. HTML, CSS e JavaScript puros
(módulos ES, **sem build**), com Firebase Authentication e Realtime Database.

## 2. Pré-requisitos

| Ferramenta | Versão | Para quê | Como conferir |
| --- | --- | --- | --- |
| Node.js | 20 ou mais nova (recomendado 22) | testes, scripts, Emulator | `node --version` |
| Java (JDK) | **21** ou mais nova | o Firebase Emulator (firebase-tools 15) só roda com Java 21+ | `java -version` |
| Git | recente | clonar e versionar | `git --version` |
| Navegador | Chrome/Edge/Firefox atual | usar o site | — |

Não precisa de conta Google nem de login no Firebase: o projeto de demonstração `demo-fluencircle-audit` é fictício.

## 3. Instalação

```bash
git clone https://github.com/Lucas-Sperotto/fluencircle-website.git
cd fluencircle-website
npm ci                               # instala versões exatas do package-lock.json
npx playwright install chromium      # navegador dos testes E2E (só uma vez)
npm test                             # deve terminar com "fail 0"
```

## 4. Rodar o site localmente com dados sintéticos

Use **dois terminais**:

```bash
# terminal 1 — sobe Auth (9099), Realtime Database (9000), Hosting (5050) e a interface do Emulator (4000)
npm run emulators

# terminal 2 — execute SOMENTE depois que todos os emuladores estiverem prontos
npm run emulators:seed
npm run emulators:verify  # SOMENTE LEITURA: verifica usuários, sessões, planos e flashcards
```

A carga agora precisa imprimir **`SEED_OK`** e a verificação precisa imprimir **`SEED_VERIFY_OK`**,
com pelo menos 5 perfis, 3 sessões e 2 planos no projeto `demo-fluencircle-audit`.
Se os comandos terminarem silenciosamente, **não considere a carga concluída**:
atualize o clone (`git pull --ff-only`) e execute `npm run emulators:seed -- --check`
(precisa imprimir `SEED_CLI_CHECK_OK`, sem gravar nada). A carga substitui apenas
o **banco demo local** e recria suas contas; não a execute para preservar modificações
feitas anteriormente no Emulator.

Abra **http://127.0.0.1:5050**. Uma faixa amarela no rodapé confirma: *"Ambiente de teste local — Firebase Emulator
(demo-fluencircle-audit)"*. Se a faixa não aparecer, **pare**: você não está no ambiente de teste.

A interface do Emulator (http://127.0.0.1:4000) mostra o banco e as contas em tempo real — ótima para entender o
que cada ação grava.

### Contas de demonstração (senha de todas: `fluencircle-demo`)

| Papel | E-mail | O que ver |
| --- | --- | --- |
| Aluna A | `ana.aluna@example.test` | decks "Technology & Daily Life" e "Travel" |
| Aluno B | `bruno.aluno@example.test` | decks "Travel" e "Travel II" (tem um registro no formato antigo) |
| Mediadora A | `carla.mediadora@example.test` | temas, sessão ao vivo, histórico |
| Mediador B | `diego.mediador@example.test` | para testar dois mediadores ao mesmo tempo |
| Administradora | `elisa.admin@example.test` | tela de acessos |
| Sem perfil | `fabio.semperfil@example.test` | login recusado: "Conta não encontrada" |
| Revogada | `gabi.revogada@example.test` | login recusado: "Esta conta foi excluída" |

Os uids são gerados pelo Auth Emulator a cada carga; os dados vêm de `tests/fixtures/synthetic-data.mjs`.

## 5. Roteiro de demonstração (≈ 15 minutos)

Use uma janela normal e uma **anônima** (contas diferentes ao mesmo tempo).

1. **Admin cria uma conta.** Entre como `elisa.admin@...` → *Acessos* → *Novo Perfil* (papel Aluno). Saia e entre com
   a conta nova. *Experimente:* um nome com mais de 80 caracteres — a regra recusa o perfil e o site **desfaz** a
   conta de login (sem conta órfã).
2. **Mediadora prepara um tema.** `carla.mediadora@...` → *Temas* → *Novo Tema*.
3. **Sessão ao vivo.** *Iniciar sessão* → escolha o tema → *Iniciar*. A barra mostra "Publicada no tradutor público".
4. **Tradutor público.** Na janela anônima abra http://127.0.0.1:5050/circle-translator.html: aparece "Sessão
   ativa: ...". Traduza uma palavra: a tradução aparece e a mensagem explica que **neste ambiente o tradutor público
   não salva flashcards** (a gravação pública depende de um backend controlado). *A tradução depende do backend do
   Render; sem internet ela falha com "Não foi possível traduzir agora" — o resto da demonstração não depende dele.*
5. **Presença e card.** Na sessão: *Participantes* → adicione Ana. Na interface do Emulator, veja que
   `attendees/{uid}` guarda **só a data** e que `user_sessions/{uid}` recebeu o resumo da sessão. *Tradutor* → traduza
   → *Salvar Flashcard*.
6. **Dois mediadores.** Na janela anônima entre como `diego.mediador@...` e tente iniciar outra sessão: o site
   **pergunta** antes de assumir o tradutor. *Cancelar* não cria nada; *Assumir* troca a sessão do tradutor e a tela
   da Carla mostra "Outra tela assumiu o tradutor público".
7. **Aba antiga fechada.** Feche a aba da Carla (que perdeu o tradutor no passo 6): a sessão do Diego **continua** no
   tradutor — a aba antiga não derruba a nova. Agora feche a aba do Diego: o tradutor passa a mostrar "Nenhuma sessão
   ativa". A queda e o retorno de rede da mesma aba são cobertos pelos testes E2E
   (`tests/e2e/concorrencia.e2e.test.mjs`); o modo "Offline" do DevTools nem sempre derruba conexões já abertas.
8. **Aluno estuda.** Entre como `ana.aluna@...` → *Flash Cards*: só os decks dela. Abra "Travel", passe todos os
   cartões: a etapa de 1 dia é registrada.
9. **Privacidade.** Ainda como Ana: os decks de Bruno não aparecem e a tela não baixa as sessões dos outros. A prova
   de que uma aluna **não consegue** ler presenças alheias está nos testes de regras
   (`tests/rules/privacidade.rules.test.mjs`) e no E2E que lista cada caminho lido (`tests/e2e/privacidade.e2e.test.mjs`).
10. **Encerrar.** *Encerrar* na sessão. Pare o Emulator com `Ctrl+C` (os dados somem; rode o seed de novo quando quiser).

## 6. Testes

| Comando | O que prova | Precisa de |
| --- | --- | --- |
| `npm test` | lógica pura (SRS, posse da sessão, índice, ambiente, contas), simulador e configuração | só Node |
| `npm run test:rules` | **matriz de acesso no Firebase Emulator** (prova oficial das regras) | `npm ci` + Java 21 |
| `npm run test:rules:sim` | a mesma matriz no simulador local (pré-verificação rápida, **não é o Firebase**) | só Node |
| `npm run test:e2e` | fluxos pela interface, perfis, concorrência, privacidade e acessibilidade básica, com Firebase **simulado** | `npm install` + `npx playwright install chromium` |
| `npm run rules:check` | o JSON das regras corresponde à fonte comentada | só Node |
| `node scripts/verify-architecture.mjs` | camadas respeitadas e nenhum `innerHTML` com dados | só Node |

Dicas: `RULES_DEBUG=1 npm run test:rules:sim` mostra o **motivo** de cada negação; `E2E_CHROME_PATH=/caminho/do/chrome`
usa um Chrome já instalado. Os títulos dos testes de regras dizem qual executor rodou (`[Emulator]` ou `[SIMULADOR…]`).

## 7. Onde mexer

| Quero… | Arquivo |
| --- | --- |
| mudar uma permissão do banco | `firebase/rules/database.rules.source.mjs` → `npm run rules:build` → teste em `tests/rules/` |
| mudar regra da revisão espaçada | `public/js/domain/srs.js` + `tests/unit/srs.test.js` |
| mudar o protocolo da sessão ativa | `public/js/domain/presentation-lock.js` + regras + `tests/rules/sessao-ativa.rules.test.mjs` |
| acessar um nó novo do banco | `public/js/services/db-paths.js` e um serviço em `public/js/services/` |
| criar uma tela | HTML em `public/`, script em `public/js/pages/`, estilos na pasta `public/css/` correspondente |
| mudar endereços/limites/ambiente | `public/js/config/` |

Camadas e motivos: [`docs/entrega/ARQUITETURA_E_FLUXOS.md`](ARQUITETURA_E_FLUXOS.md) e [`docs/ARQUITETURA.md`](../ARQUITETURA.md).
Regras do código (resumo): dados nunca em `innerHTML` (use `h()`); só `services/` fala com o banco; `domain/` não
importa nada; páginas internas começam com `initProtectedPage()`; sem `style=` no HTML.

## 8. Como continuar o projeto

Em ordem sugerida (detalhes em [`LIMITACOES_E_PENDENCIAS.md`](LIMITACOES_E_PENDENCIAS.md)):

1. Confirmar que a CI continua verde após cada mudança; o job `rules-emulator` e o `package-lock.json` **já existem** na `main`. Usar `npm ci` e manter o lockfile atualizado quando dependências forem alteradas.
2. Backend controlado do tradutor (contrato em `docs/backend/CONTRATO_BACKEND.md`) e criação de contas pelo Admin SDK.
3. Salas por código/QR para várias sessões simultâneas (plano no `ADR-003`).
4. Projeto de staging, migração de privacidade em staging e publicação controlada (checklist).
5. Acessibilidade completa (axe-core, contraste, leitor de tela) e E2E contra o Emulator com o SDK real.
6. Avaliar a arquitetura B (Vite) só depois disso (`ADR-001`).

Para cada contribuição: Issue → branch própria → commits pequenos (`feat(...)`, `fix(...)`, `test(...)`, `docs(...)`)
→ PR Draft com evidências, conforme [`docs/processo/RASTREABILIDADE_IA.md`](../processo/RASTREABILIDADE_IA.md).

## 9. Problemas comuns

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| `firebase-tools no longer supports Java version before 21` | Java antigo | instale JDK 21+ e confira `java -version` |
| `npm run emulators:seed` termina sem mensagem nem contas | Versão anterior usava comparação `file://` incompatível com Windows/espaços | atualize o clone e confirme `npm run emulators:seed -- --check` exibindo `SEED_CLI_CHECK_OK` |
| `npm run emulators:seed` falha com "fetch failed" | Auth/RTDB Emulator não iniciou ou está em outra máquina/porta | espere os serviços ficarem prontos no terminal 1; use o mesmo ambiente/WSL nos dois terminais |
| `npm run emulators:verify` informa coleções ausentes | carga não executada ou interface está olhando outro projeto/namespace | confira `demo-fluencircle-audit-default-rtdb` e a porta 9000; rode `npm run emulators:seed` novamente |
| porta 9000/9099/5050/4000 ocupada | outro processo usando a porta | feche o processo ou mude a porta em `firebase.emulator.json` **e** em `public/js/config/firebase.config.js` |
| página em branco, erro de módulo | aberta via `file://` | sirva por HTTP (`npm run emulators` ou `npm run serve`) |
| sem a faixa amarela | página aberta por IP de rede (ex.: `192.168…`) seleciona **produção** | use `127.0.0.1` ou `localhost` |
| tradução falha | backend do Render indisponível ou sem internet | não afeta o restante; ver contrato do backend |
| E2E: "exigem o pacote playwright" | dependências não instaladas | `npm install` e `npx playwright install chromium` |
