# Firebase: regras do banco, Emulator e hosting

> **Estado:** proposta testável, **não publicada e NÃO APTA A DEPLOY**. As regras ativas em produção
> não estão no repositório e não foram vistas por nenhuma IA. Nada aqui é aplicado automaticamente.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `firebase/rules/database.rules.source.mjs` | **Fonte comentada** das regras propostas. Edite aqui. |
| `docs/firebase/database.rules.proposta.json` | JSON **gerado** (`npm run rules:build`). É o que o Emulator carrega. A CI recusa JSON fora de sincronia (`npm run rules:check`). |
| `firebase.emulator.json` | Configuração **somente do Emulator** (Auth, Realtime Database, Hosting e UI em `127.0.0.1`). |
| `tests/rules/*.test.mjs` | Matriz de acesso com casos permitidos e negados. |
| `tests/support/rtdb-rules-simulator.js` | Simulador local das regras (pré-verificação offline; **não é o Firebase**). |
| `docs/firebase/firebase.json.exemplo` | Exemplo de hosting com cabeçalhos de segurança (CSP). Não é usado por nenhum script. |

Não existe `firebase.json` na raiz **de propósito**: sem ele, um `firebase deploy` digitado por engano
não encontra o que publicar. Todos os scripts npm usam `--config firebase.emulator.json --project demo-fluencircle-audit`
(um teste unitário garante isso).

## Como o Realtime Database avalia regras

- **`.read` e `.write` cascateiam.** Se um nó concede acesso, todos os filhos herdam e nenhum filho consegue revogar.
  Por isso a raiz nega tudo e cada permissão fica no nível mais fundo possível (ex.: `users/$uid` e não `users`).
- **`.validate` não cascateia.** Vale no próprio nó, é avaliada nos ancestrais do caminho escrito e em toda a
  subárvore nova, e **não roda em remoções**. Valida esquema; não decide quem pode escrever.
- `root`/`data` são o estado antes da escrita; `newData` é o estado depois — inclusive dos outros caminhos de um
  `update` multicaminho. É assim que a proposta exige que presença (`attendees`) e índice (`user_sessions`) entrem juntos.

Referência: <https://firebase.google.com/docs/database/security/core-syntax>.

## Matriz de acesso proposta

✅ permitido · ❌ negado · Casos testados em `tests/rules/` (RBAC, sessão ativa e privacidade).

| Nó | Visitante | Aluno | Mediador | Admin | Observações |
| --- | --- | --- | --- | --- | --- |
| raiz `/` | ❌ | ❌ | ❌ | ❌ | negação padrão |
| `users/{uid}` | ❌ | lê o **próprio** | lê a lista | lê e grava | papel ∈ {student, mediator, admin}; só admin grava (sem escalada) |
| `deleted_users/{uid}` | ❌ | lê a **própria** entrada | ❌ | lê e grava | o login consulta a própria entrada |
| `meetings` (temas) | ❌ | ❌ | lê e grava | lê e grava | título 1–200, ≥ 1 pergunta, sem campos extras |
| `meeting_sessions` | ❌ | ❌ coleção e sessão inteira; lê só `topic`/`startedAt` da **própria** sessão | lê e grava | lê e grava | `mediatorEmail` = e-mail do token de quem cria |
| `…/attendees/{uid}` | ❌ | ❌ | grava `{ addedAt }` **junto** com `user_sessions` | idem | **sem nome/e-mail** (PII fica em `users`); aluno precisa ter perfil |
| `current_session` | **lê** | lê | publica com posse | publica com posse | só id, título, início e posse (sem pessoas); versão +1 na troca de dono; assumir apresentação viva exige `takeoverOf`; presença só do dono — testes em `sessao-ativa.rules.test.mjs` |
| `flashcards/{sessão}` | ❌ **(não cria card)** | lê **só** decks das próprias sessões (com perfil) | lê e grava | lê e grava | frente/verso 1–500, `sessionId` coerente, sessão existente |
| `student_reviews/{uid}` | ❌ | lê/grava o **próprio**, só em sessão de que participou | o próprio (estuda qualquer deck) | o próprio | etapa avança **de 1 em 1** (1→2→3) com carimbo ISO |
| `user_sessions/{uid}` | ❌ | lê o **próprio** | grava `{ topic, startedAt }` (com presença) | idem | ninguém se inscreve sozinho; entradas antigas `true` só leitura |
| conta sem perfil / revogada | — | ❌ em tudo, exceto ler o próprio `users/{uid}` ou `deleted_users/{uid}` | — | — | |

**Leitura mínima (Issue #10, ADR-004):** a tela do aluno parte de `user_sessions/{uid}` e lê só os decks das
próprias sessões; casos em `tests/rules/privacidade.rules.test.mjs`. Dados antigos (presença com nome/e-mail e
índice `true`) continuam legíveis; o plano offline de migração está em `scripts/migrations/`.

**Limites aceitos e registrados:**
- As datas do SRS são texto ISO; a regra não consegue comparar com `now`. Um aluno pode registrar um carimbo
  retroativo **no próprio progresso** (só prejudica o próprio estudo).
- Mediadores leem nome e e-mail de todos os perfis (necessário para a busca de presença). Alternativa futura:
  um diretório só com nome de exibição.
- Qualquer membro da equipe pode apagar `current_session` (encerrar); o cliente só apaga se for a aba dona.
  Decisão e plano de salas por código/QR em `docs/engenharia/ADR-003-SESSAO-ATIVA.md`.

## Testar (nunca em produção)

```bash
npm install                 # uma vez: firebase-tools, @firebase/rules-unit-testing (Node 20+, Java 21+)
npm run test:rules          # PROVA OFICIAL: sobe o Emulator (projeto demo) e roda tests/rules/
npm run test:rules:sim      # pré-verificação offline no simulador local (sem Java/rede)
RULES_DEBUG=1 npm run test:rules:sim   # mostra o motivo de cada negação
```

`scripts/test-rules.mjs --driver=emulator` recusa rodar se `FIREBASE_DATABASE_EMULATOR_HOST` não for local.

## Ambiente local de demonstração

```bash
npm run emulators           # terminal 1: Auth (9099), RTDB (9000), Hosting (5050) e UI (4000)
npm run emulators:seed      # terminal 2: imprime SEED_OK quando gravou e releu o banco demo
npm run emulators:verify    # somente leitura: imprime SEED_VERIFY_OK e os totais
# abra http://127.0.0.1:5050 — o selo amarelo no rodapé confirma o Emulator
```

Em `localhost`/`127.0.0.1` o site **sempre** usa o Emulator (`public/js/config/environment.js`); não há
parâmetro para forçar produção a partir da máquina local. A carga sintética recusa projeto que não seja `demo-*`
e hosts que não sejam locais.

## Publicação BLOQUEADA — o que falta para uma decisão humana

1. Exportar as regras **ativas** pelo console (Realtime Database → Regras) e versioná-las, por exemplo em
   `docs/firebase/producao/database.rules.ativas.json`, após conferir que não contêm segredo.
2. Comparar com a proposta e decidir cada diferença (duas pessoas).
3. Rodar `npm run test:rules` na CI do PR e anexar o log.
4. Fazer backup do banco e testar a restauração num projeto de staging.
5. Publicar primeiro em staging, com o hosting correspondente, e repetir os testes E2E.
6. Só então, com autorização registrada, publicar em produção — e ter o rollback (regras anteriores) à mão.

A proposta **bloqueia a escrita anônima de flashcards**: o tradutor público deixa de salvar cards até existir o
backend controlado (Issues #5 e #8).

## Cabeçalhos do hosting (`firebase.json.exemplo`)

Adiciona `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` e cache para JS,
CSS e imagens. A CSP libera só as origens que o site usa (gstatic, Google Fonts, cdnjs, Firebase — inclusive
`*.firebasedatabase.app` — e o backend no Render) e bloqueia scripts inline. Teste num canal de pré-visualização de
um projeto de **staging** antes de qualquer ativação; uma CSP restritiva demais quebra o site sem aviso.

## Fora do código (somente o operador do projeto)

- Revogar/rotacionar a credencial que ficou no histórico do Git (Issue #6) — só o operador do GCP confirma.
- Restringir a API key web aos domínios do site e ativar o App Check para o Realtime Database.
- No backend: verificar ID token/App Check, montar o prompt no servidor e limitar requisições.
