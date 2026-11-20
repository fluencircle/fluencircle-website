# ADR-002 — Ambiente isolado por padrão, regras geradas e dois executores de teste

**Estado:** aceita para desenvolvimento e testes; não altera produção. **Decisão 1 revista em 20/11/2026** (ver
"Revisão de 20/11/2026" no fim).
**Data:** 19/11/2026 · **Issues:** #5, #7, #13, #15, #41 · **Implementação:** Claude · **Revisão:** pendente (ChatGPT) e aceite humano.

## Contexto

- Servir o site localmente usava o projeto **real** `fluentech-1e18a` (OPS-05): qualquer teste podia ler ou gravar
  dados de produção.
- A proposta de regras era um JSON escrito à mão, com a mesma condição ("é mediador ou admin") repetida dezenas de
  vezes, sem teste de acesso permitido/negado (FC-02).
- O ambiente em que a implementação foi feita **não tinha Firebase Emulator** nem rede para instalá-lo; a prova
  oficial das regras precisava ficar para a CI, sem que isso significasse entregar regras nunca executadas.

## Decisões

1. **Seleção de ambiente sem exceção** (`public/js/config/environment.js`): página em `localhost`, `127.0.0.1`,
   `[::1]` ou `*.localhost` usa o Firebase Emulator com o projeto `demo-fluencircle-audit`; qualquer outro endereço
   usa produção. Não há parâmetro de URL para forçar produção a partir da máquina local. O ambiente de teste mostra
   um selo fixo na tela, que os testes E2E conferem.
2. **Configuração só do Emulator** em `firebase.emulator.json` (Auth 9099, RTDB 9000, Hosting 5050, UI 4000, tudo
   em `127.0.0.1`). **Não existe `firebase.json` na raiz**: um `firebase deploy` por engano não tem o que publicar.
   Todo script npm que chama o Firebase usa `--config firebase.emulator.json --project demo-fluencircle-audit`
   (teste unitário garante; nenhum script faz deploy).
3. **Regras geradas de uma fonte comentada** (`firebase/rules/database.rules.source.mjs` →
   `docs/firebase/database.rules.proposta.json` por `npm run rules:build`). A CI recusa JSON fora de sincronia.
4. **Dois executores para os mesmos testes de regras** (`tests/rules/`): o **Firebase Emulator** com
   `@firebase/rules-unit-testing` (prova oficial, job `rules-emulator` da CI) e um **simulador local** sem rede
   (`tests/support/rtdb-rules-simulator.js`, pré-verificação). O título das suítes diz qual executor rodou.
5. **E2E com Firebase simulado** (`tests/e2e/`): o SDK do CDN é trocado por módulos falsos que falam com um banco
   compartilhado entre abas e contextos, que **aplica as regras propostas** pelo simulador. Toda requisição externa
   é bloqueada e registrada.
6. **Dados sintéticos únicos** (`tests/fixtures/synthetic-data.mjs`, e-mails em `example.test`) para regras, E2E e
   carga do Emulator (`npm run emulators:seed`, que recusa projeto não `demo-*` e host não local).

## Alternativas consideradas

| Alternativa | Motivo para não adotar agora |
| --- | --- |
| Projeto Firebase de **staging** | Recomendado para a fase de publicação, mas exige criação e credenciais por pessoa humana; registrado no checklist |
| `firebase.json` na raiz com regras e hosting | Facilita deploy acidental de regras não aprovadas |
| Bolt / compilador de regras de terceiros | Bolt foi descontinuado; o gerador local tem ~200 linhas legíveis |
| Rodar só no Emulator | Não executável neste ambiente; sem o simulador, as regras sairiam sem nenhuma execução |
| Parâmetro `?ambiente=producao` em localhost | Viola o objetivo de "nunca tocar produção por engano" |

## Consequências

- ✅ Rodar localmente não toca produção; testes não dependem de rede.
- ⚠️ O simulador pode divergir do Firebase. Mitigações: 17 testes de fidelidade a exemplos documentados, rótulo
  explícito, e a regra "**se divergir, o Emulator vence**". Até a CI rodar o Emulator, os resultados de regras são
  **SIMULADOS**, não prova.
- ⚠️ O E2E prova o fluxo da interface e a integração com as regras **simuladas**; não prova o SDK real nem a rede.
- ⚠️ Rodar o Emulator exige **Java 21+** (firebase-tools 15) e `npm install` (sem `package-lock.json` por enquanto).
- ~~ℹ️ Servir o site por IP de rede local (ex.: `192.168.x.x`) seleciona **produção** — decisão consciente para não
  quebrar uso em sala; documentada no guia do aluno.~~ Substituída pela revisão abaixo.

## Revisão de 20/11/2026 — seleção fechada por padrão (Issue #41)

**Problema confirmado (executado):** a regra "endereço local → Emulator; **qualquer outro** → produção" falhava
aberta. `npm run serve` (o `http.server` do Python) imprime `http://0.0.0.0:5501/`; abrir esse link selecionava o
projeto **real**, assim como `127.0.0.2`, IP da rede local, `*.local`, canal de pré-visualização do Hosting
(`fluentech-1e18a--<canal>.web.app`) e arquivo aberto do disco (hostname vazio). Isso contradizia a garantia de
"nunca tocar produção por engano" e as regras do `AGENTS.md`.

**Decisão:** só os endereços publicados listados em `PRODUCTION_HOSTNAMES` (`public/js/config/firebase.config.js`:
`fluentech-1e18a.web.app` e `fluentech-1e18a.firebaseapp.com`) usam produção. **Todo o resto usa o Emulator.**
Endereço que não é desta máquina (IP da rede, pré-visualização, arquivo) continua no Emulator e mostra um selo
próprio ("Endereço não reconhecido…"). `npm run serve` passa a escutar só em `127.0.0.1`.

**Consequências:**
- ✅ Nenhum endereço de desenvolvimento, teste ou pré-visualização alcança o banco real.
- ⚠️ **Domínio próprio** (se houver) precisa entrar em `PRODUCTION_HOSTNAMES` **antes** do deploy; senão o site
  publicado aponta para o Emulator e não funciona — falha **segura**, mas visível. Gate registrado em
  `docs/operacao/SEGURANCA_E_DEPLOY.md`.
- ⚠️ Usar o site "em sala" pela rede local passa a exigir o endereço publicado (o motivo original da exceção). Para
  testar no celular, use o Emulator com um túnel/porta encaminhada na mesma máquina ou um projeto de staging.
- Testes: `tests/unit/environment.test.js` (regressão com cada endereço que antes ia para produção) e
  `tests/e2e/ambiente.e2e.test.mjs` (origens de rede local e de pré-visualização), que falham no código anterior.
