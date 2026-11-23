# Compatibilidade funcional com o histórico do aluno — inventário independente (Claude)

**Data:** 20/11/2026 · **Autor:** Claude (Claude Code, modelo Opus 5.5) · **Issue:** #41 · **Branch:**
`audit/claude-security-performance-architecture` · **Base auditada:** `main` = `0e27c9abd1518f3d9a3ad2f0910b6d68e0b29caa`.
**Revisão humana:** pendente. Este documento é uma **alegação a verificar**, não aprovação.

## 1. Escopo, método e níveis de evidência

Pergunta: a refatoração **eliminou, enfraqueceu ou alterou** algo que o aluno havia implementado? A resposta compara
**comportamentos** (o que é lido e gravado, quem pode fazer o quê, o que a pessoa vê), não nomes de arquivo.

| Versão | SHA | Data | O que é |
| --- | --- | --- | --- |
| Main original do aluno | `dd8a9d8560d6b7fb8d93e7c259cef05f3b799e42` | 21/10/2026 | "removed plans from main branch" — base de tudo |
| Planos (intermediário) | `eb5e085`, `016eb93` | 22/10/2026 | página `plans.html`, plano no usuário, agenda do aluno |
| Branch `plans` original | `3c6e7f0f8a5374baaa76cfc3a363184ea8b42c85` | 18/11/2026 | "presentation refactoring" — **PR upstream #2, ainda aberto** |
| Main refatorada (upstream) | `67e79220a3356bb6100afde2e8aaba66653b13eb` | 19/11/2026 | merge do porte de planos (PR upstream #3) |
| Main do fork (auditada) | `0e27c9abd1518f3d9a3ad2f0910b6d68e0b29caa` | 20/11/2026 | = upstream + correção do seed (PR #38) |
| PR #40 do Codex (Draft) | `b771a1b7be80366061846c3e0bb54b1b8b42caf1` | 20/11/2026 | recuperação funcional em andamento (não integrada) |

Todas as referências foram conferidas com `git cat-file`/`git merge-base` em 20/11/2026: `dd8a9d8` é ancestral de
`3c6e7f0` e da main; `3c6e7f0` **não** é ancestral de nenhuma main (o trabalho de 18/11 nunca foi integrado).

**Método.** Cada versão foi extraída com `git archive` e lida por inteiro (`presentation.js`, `cards.js`, `admin.js`,
`auth.js`, `manage-meetings.js`, `set-meeting.js`, `script.js`, `plans.js`, páginas HTML). Para cada funcionalidade foram
registradas as leituras/escritas no banco e o fluxo de tela, e então comparadas com o código atual. **Este inventário foi
escrito antes de ler a matriz do Codex** (`CODEX_MATRIZ_COMPATIBILIDADE_HISTORICA.md`, PR #40); a comparação está no §6.

**Níveis de evidência:** **EXECUTADO** (rodado nesta auditoria) · **VERIFICADO NO CÓDIGO** (lido no Git) ·
**RELATADO POR TERCEIRO** (documento de outra IA/pessoa, não reexecutado) · **NÃO VERIFICADO**.
Salvo indicação, cada linha abaixo é **VERIFICADO NO CÓDIGO**.

Legenda da situação: ✅ preservado · 🔁 preservado com mudança **deliberada** (documentada) · ⚠️ divergente ·
⛔ ausente · 🧪 recuperado só no Emulator (PR #40, não integrado).

## 2. Inventário — main original do aluno (`dd8a9d8`)

| ID | Funcionalidade original | Evidência histórica | Main `0e27c9a` | PR #40 | Situação |
| --- | --- | --- | --- | --- | --- |
| H01 | Login por e-mail/senha com mensagens por código de erro | `js/auth.js` 42–49, 147–181 | `services/auth.service.js` 15–23, 74–85 | igual | ✅ |
| H02 | Conta em `deleted_users` ou sem perfil é deslogada | `js/auth.js` 56–81 | `resolveAccess` 49–65 (leitura em paralelo) | igual | ✅ |
| H03 | Papel e e-mail em `sessionStorage` para o menu não "piscar" | `js/auth.js` 81, 127–145 | `core/session-cache.js` (mesmas chaves `fluentech_*`) | igual | ✅ |
| H04 | Menu e atalhos por papel (`mediator-access`/`admin-access`) | `js/auth.js` 96–125 | `ui/app-shell.js` 83–93 | igual | ✅ (só interface; a proteção real são as regras) |
| H05 | Guarda de páginas internas + botão Sair; página da equipe/admin manda quem não tem o papel para a home | `js/auth.js` 195–244; `js/admin.js` 63–69; `js/manage-meetings.js` 43–47 | `pages/shared/page-setup.js` | igual | 🔁 o papel agora vem do **banco**; antes vinha do cache do navegador e só era conferido se o cache existisse |
| H06 | Tela de login com marca, WhatsApp, rodapé (CNPJ/endereço) e meta `facebook-domain-verification` | `auth.html` | `auth.html` 7, 77, 90 | igual | ✅ |
| H07 | Home com atalhos por papel | `index.html`, `js/script.js` | `index.html` + `home.page.js` | + "Círculos ao vivo" (Emulator) | ✅ |
| H08 | Barra lateral retrátil com item ativo | `js/menu.js` 7–40 | `ui/app-shell.js` (uma lista única) | igual | ✅ |
| H09 | Decks: aluno vê sessões em que esteve presente e que têm cards; equipe vê todas | `js/cards.js` 142–198 (`session.attendees[uid]`) | `flashcards.page.js` 50–76 (aluno lê **só** `user_sessions/{uid}`) | igual | ⚠️ **D-01** (dados antigos) |
| H10 | SRS 1/7/30 dias, selos, linha do tempo, pendentes primeiro e depois mais recentes | `js/cards.js` 67–138, 219–226 | `domain/srs.js`, `domain/user-sessions.js` `sortDecks` | igual | ✅ (datas inválidas não dão 100%) |
| H11 | Modo de estudo: pilha 3D, virar, avançar, voltar, reiniciar, cartão final, barra | `js/cards.js` 289–450 | `ui/card-stack.js` | transições isoladas | ✅ |
| H12 | Concluir a pilha avança a etapa se liberada | `js/cards.js` 451–500 | `flashcards.page.js` 175–197 + regra que só aceita +1 | igual | ✅ |
| H13 | Escolher tema e iniciar sessão (`meeting_sessions` + `current_session`) | `js/presentation.js` 408–462 | `presentation.page.js` 115–155; posse/versão (ADR-003) | publicação opcional no Emulator | 🔁 confirmação antes de assumir sessão de outra tela |
| H14 | Slides: título, perguntas, "Fim"; setas, espaço e clique por metade; cursores | `js/presentation.js` 372–494 | `presentation/slides.js`, `presentation.page.js` 206–231 | ignora atalhos em campos | ✅ |
| H15 | Presença: busca de alunos, adicionar/remover, contador | `js/presentation.js` 137–292 | `presentation/attendance.js` | igual | 🔁 sem nome/e-mail no banco (ADR-004); remoção também apaga o índice |
| H16 | Tradutor na sessão + "Adicionar ao Flash Card" | `js/presentation.js` 568–681 | `presentation/translator-modal.js` | proteção contra respostas atrasadas | ⚠️ **D-04** no main; ✅ no PR #40 |
| H17 | Encerrar sessão (modal) remove `current_session` | `js/presentation.js` 526–556 | `presentation.page.js` 157–192 | igual | 🔁 só a aba dona remove; erro não é mostrado como sucesso |
| H18 | Fechar/recarregar a aba encerra a sessão ativa (`beforeunload`) | `js/presentation.js` 559–563 | sem `beforeunload`; `onDisconnect` apaga `live/{aba}` | igual | 🔁 **D-03** |
| H19 | Temas: listar, criar, editar perguntas, renumerar, excluir com confirmação | `js/set-meeting.js` | `themes.page.js` | igual | ✅ (aspas não quebram mais os campos) |
| H20 | Histórico de sessões (mais recentes primeiro), contagem de cards, mediador | `js/manage-meetings.js` 69–135 | `sessions.page.js` 29–62 | igual | ✅ (custo cresce com o total — ver relatório de desempenho) |
| H21 | Editor de cards da sessão: editar, salvar, excluir, adicionar | `js/manage-meetings.js` 186–340 | `sessions.page.js` 78–166 | igual | ✅ |
| H22 | Excluir sessão (sessão + cards) | `js/manage-meetings.js` 160–170 | `deleteSession` multicaminho (+ índices dos alunos) | igual | 🔁 atômico; antes deixava `user_sessions` órfão |
| H23 | Acessos: tabela em ordem alfabética, busca, papéis | `js/admin.js` 80–197 | `admin.page.js` | busca também por plano | ✅ |
| H24 | Criar conta sem derrubar o admin (app secundário) | `js/admin.js` 15–30, 291 | `core/firebase-auth.js` 43–48 + compensação | igual | 🔁 desfaz a conta se o perfil falhar |
| H25 | Excluir = apagar perfil + `deleted_users` | `js/admin.js` 337–350 | `revokeUser` (uma escrita atômica) | igual | ✅ |
| H26 | Tradutor público: mostra a sessão ativa e traduz | `circle-translator.html` (script inline) | `circle-translator.page.js` | igual | ✅ |
| H27 | Tradutor público **grava** o card na sessão ativa sem login (REST `flashcards/{id}.json`) | `circle-translator.html` linha ~237 | produção: tenta via SDK; Emulator: **desligado** | igual | 🔁 **D-02** (decisão humana pendente) |
| H28 | Rodapé do tradutor com convite no WhatsApp | `circle-translator.html` | igual | igual | ✅ |

## 3. Inventário — branch `plans` (`3c6e7f0`) e intermediários

| ID | Funcionalidade | Evidência histórica | Main `0e27c9a` | PR #40 | Situação |
| --- | --- | --- | --- | --- | --- |
| P01 | Plano como atributo do usuário (coluna, seletor, busca) | `eb5e085`; `3c6e7f0:js/admin.js` 60–197 (`user.planId \|\| user.plan`) | `admin.page.js` (`planId`) | lê também `plan` antigo | 🔁 no main o campo antigo `plan` era ignorado — **D-06**; resolvido no PR #40 |
| P02 | Catálogo de planos (`plans.html`/`plans.js`) | `016eb93`; **apagado** em `c398127`/`3c6e7f0` | `plans.html` + `plans.page.js` (só admin edita) | índices estáveis | ✅ (o porte devolveu o que o próprio aluno havia apagado) |
| P03 | Agenda da semana: tema e link por horário (`weekly_sessions`) | `016eb93:js/plans.js` 56–120 | aba "Agenda da semana" | igual | 🔁 chave de semana mudou — **D-05** |
| P04 | Agenda do participante na home | `016eb93:js/script.js` 32–140 (desligado da `index.html` em `3c6e7f0`) | `home.page.js` + `ui/week-slot-card.js` | igual | ✅ |
| P05 | **Várias salas ao vivo** (`current_session/{id}`), lista lateral com mediador, horário e nº de participantes | `3c6e7f0:js/presentation.js` 172–219 | ⛔ uma sessão ativa (ADR-003) | 🧪 `live_rooms/{id}` com lista "Círculos ao vivo" | ⛔ no main |
| P06 | **Aluno entra sozinho** na sala ("Participar") e a presença é gravada | `3c6e7f0:js/presentation.js` 380–462 | ⛔ presença só pelo mediador | 🧪 entra como membro; **não** grava presença | ⛔ / parcial |
| P07 | **Slides sincronizados** do mediador para os participantes (RTDB + Socket.IO) | `3c6e7f0:js/presentation.js` 164–169, 573–604 | ⛔ | 🧪 texto do slide atual em `live_rooms/{id}/slide` (sem Socket.IO) | ⛔ / parcial |
| P08 | Contador "n / total" e prévia da próxima pergunta só para o mediador | `3c6e7f0:js/presentation.js` 519–569 | ⛔ | ⛔ | ⛔ |
| P09 | **Voz WebRTC** em malha (até 6), mudo, indicador de quem fala, TURN pelo backend | `3c6e7f0:js/presentation.js` 655–1153 | ⛔ | ⛔ | ⛔ (depende de backend Socket.IO não auditável) |
| P10 | **Chat** da sessão (`meeting_sessions/{id}/chat`) | `3c6e7f0:js/presentation.js` 1443–1644 | ⛔ | 🧪 `live_room_chat/{id}` (texto, últimas 50, autor anônimo para os pares) | ⛔ / parcial |
| P11 | Mascote **"Fluêncio"**: `fc: palavra` responde no chat e vira flashcard | `3c6e7f0:js/presentation.js` 1548–1593, 1622–1629 | ⛔ | ⛔ | ⛔ |
| P12 | Flashcards com `source` e `createdBy` | `3c6e7f0:js/presentation.js` 1225–1241 | ⛔ (regra recusa campos extras) | ⛔ | ⛔ (só fazia sentido com P10/P11) |
| P13 | Menu "Círculos" e remoção do item Home | `3c6e7f0:index.html` 39–54 | ⛔ (menu atual + "Planos e agenda") | seção "Círculos ao vivo" na home | ⛔ / parcial |
| P14 | Novo layout da apresentação (+1.000 linhas de CSS) e CSS global reorganizado | `c398127`, `3c6e7f0:css/pages/presentation.css` | ⛔ | ⛔ | ⛔ (visual dos itens P05–P11) |

**Defeitos do próprio `3c6e7f0`** (não são perdas; impedem um merge direto — confirmados nesta auditoria):
XSS armazenado no chat do Fluêncio (`innerHTML` com `replyToName`, `originalWord` e a resposta do Gemini, linhas
1484–1499); nome, e-mail e foto dos participantes gravados em `current_session`, que tem leitura **pública**
(linhas 335–352, 427–434); quem é mediador decidido no navegador comparando e-mails (424); Socket.IO de
`cdn.socket.io` sem SRI (`index.html` 11); `js/notifications.js` referenciado e inexistente (`index.html` 268; o mesmo já
ocorria em 6 páginas de `dd8a9d8`);
`DEBUG_VOICE = true` (20); `script.js` e `admin.js` leem `plans` depois de `plans.html`/`plans.js` terem sido apagados.
Essas escritas exigiriam regras abertas — o mesmo motivo do NO-GO de produção.

## 4. Divergências de comportamento

| ID | Severidade | Divergência | Evidência | Impacto | Resolução / recomendação |
| --- | --- | --- | --- | --- | --- |
| D-01 | **Média** (dados reais) | O aluno passou a ver decks **só** pelo índice `user_sessions/{uid}`; o original usava `meeting_sessions/{id}/attendees/{uid}`. No original as duas escritas eram **separadas** (`presentation.js` 223–232) e a remoção apagava só a presença (249). | `dd8a9d8:js/cards.js` 175; `flashcards.page.js` 64–76 | (a) presença gravada sem índice (2ª escrita falhou) → deck **some** para o aluno; (b) aluno removido da presença com índice velho → deck **reaparece** | A migração `scripts/migrations/privacy-migration.mjs` cria os índices que faltam (a) mas só **relata** os órfãos (b). Ela precisa rodar **antes** do novo frontend, com decisão humana sobre os órfãos. NÃO VERIFICADO em dados reais. |
| D-02 | Alta (segurança) / decisão de produto | O tradutor público gravava o card sem login. A proposta de regras **nega**; no Emulator a gravação está desligada; em produção o código ainda tenta. | `circle-translator.html` ~237; `environment.js` | Se as regras ativas permitirem, qualquer pessoa grava em qualquer sessão; se negarem, o recurso deixa de existir | Backend controlado (`docs/backend/CONTRATO_BACKEND.md`). Desligar em produção é decisão humana (Issues #5, #8). |
| D-03 | Baixa | Fechar a aba do mediador apagava `current_session` (`beforeunload`); agora a presença por aba cai pelo `onDisconnect` e o nó fica "fora do ar". | `dd8a9d8:js/presentation.js` 559–563; `sessions.service.js` 87–92 | Para o tradutor o efeito é o mesmo (não mostra sessão); o nó antigo fica até a próxima publicação | Mudança deliberada (ADR-003); `beforeunload` não é confiável em celular. |
| D-04 | Baixa (custo/duplicidade) | No original, Enter chamava `translateBtn.click()`, que **não faz nada** com o botão desabilitado; na refatoração chamava `translate()` direto, permitindo várias traduções simultâneas (custo no backend) e salvar o resultado de um pedido antigo. | `dd8a9d8:js/presentation.js` 640–643; `translator-modal.js` 103–106 | Pedidos duplicados ao Gemini | **Corrigido no PR #40** (guarda de pedido pendente, `event.repeat`); verificado no código do PR. |
| D-05 | Baixa (só se houver dados) | A chave da semana do aluno era a **semana do mês** (`AAAA-W1..W5`, repete todo mês); o porte usa semana ISO. | `016eb93:js/plans.js` 65; `domain/plans.js` `isoWeekKey` | Se a branch `plans` chegou a ser publicada, temas gravados em `weekly_sessions/AAAA-W0x` aparecem nas semanas ISO 1–5 de janeiro | Exportar `weekly_sessions` antes do deploy e decidir (descartar ou migrar). NÃO VERIFICADO se há dados. |
| D-06 | Baixa | O admin original aceitava o campo antigo `user.plan`; o porte lia só `planId`. | `3c6e7f0:js/admin.js` 161, 189 | Aluno com `plan` antigo ficaria sem agenda | **Corrigido no PR #40** (regras e leitura aceitam `plan` quando `planId` não existe). |
| D-07 | Informativa | Salas, entrada do aluno, slides sincronizados, chat, Fluêncio e voz (P05–P11) existiam só na branch não integrada. | §3 | O produto atual não tem "círculos online" | Recuperação parcial e segura no PR #40 (só Emulator); voz e Fluêncio dependem de backend controlado. Decisão de produto + ADR (ver §7). |

## 5. O que os testes atuais não provam

Os 50 E2E originais (Firebase **simulado**) e os 79 testes de regras cobrem o comportamento **refatorado**; nenhum teste
compara com o original. As divergências D-01, D-05 e D-06 envolvem **dados antigos** que só existem em produção — o banco
sintético não os contém, então "todos os testes passando" não demonstra compatibilidade com eles. Recomenda-se, antes de
qualquer deploy: exportar um backup (`docs/operacao/BACKUP_E_ROLLBACK.md`), rodar `privacy-migration.mjs` em modo de
plano sobre ele e revisar contagens de índices criados e órfãos.

## 6. Comparação com a matriz do Codex

Fonte: `docs/auditorias/CODEX_MATRIZ_COMPATIBILIDADE_HISTORICA.md` no commit `b771a1b` (PR #40, Draft), lida **depois** de
os §§2–4 estarem escritos. É uma comparação entre duas IAs — **não** substitui revisão humana.

**Concordâncias (mesma conclusão por caminhos independentes):** as funcionalidades de login, revogação, contas, temas,
condução da sessão, presença manual, histórico, editor de cards, decks/SRS, planos e agenda; a ausência de salas, entrada
do aluno, chat, Fluêncio e voz na main; D-01 (decks só pelo índice), D-02 (gravação anônima do tradutor), D-05 (chave
da semana do mês) e D-06 (campo `plan` antigo); e os defeitos de segurança do `3c6e7f0` (XSS do Fluêncio, PII em nó
público, host decidido por e-mail).

**Encontrados só pelo Codex — conferidos agora (VERIFICADO NO CÓDIGO):**
- `js/notifications.js` é carregado por **6 páginas já na main original** (`dd8a9d8`) e por 4 em `3c6e7f0`, e nunca
  existiu no Git — eu tinha registrado só o caso de `3c6e7f0`. Não é perda: o feedback era o `showToast`.
- `public/js/firebase.js` (importado por todas as telas internas) e `firebase.json` estavam no `.gitignore` do aluno
  (linhas 10 e 14): **nenhuma das duas versões históricas roda a partir do Git** e a configuração de hosting e regras
  que servia o site nunca foi versionada. Isso reforça que as regras ativas são desconhecidas.
- Detalhes de interface do `3c6e7f0` (botões do tradutor e da gaveta de presença com `display:none` na página final;
  botão "Criar Círculo" visível ao aluno; `voice-status-text` referenciado e ausente).

**Encontrados só neste inventário:** D-03 (`beforeunload`), D-04 descrito pela causa exata (`translateBtn.click()` era
inócuo com o botão desabilitado; a chamada direta não), a preservação da meta `facebook-domain-verification`, e o caso
inverso de D-01 (índice antigo **sem** presença faz o deck **reaparecer**, porque a remoção original não apagava o índice).

**Divergências de avaliação (para decisão humana):**

| Item | Codex | Este inventário | Motivo da diferença |
| --- | --- | --- | --- |
| D-01 decks pelo índice | Alto | Média | Concordo que é sistemático no caso inverso (toda remoção antiga deixou índice), mas o dano é exibir vocabulário de uma sessão a quem foi removido dela; a perda (presença sem índice) só ocorre se a 2ª escrita falhou |
| D-05 chave da semana | Alto | Baixa | Depende de a branch `plans` ter sido publicada com dados; nada no Git indica deploy dela (NÃO VERIFICADO). Se houver dados, concordo com "Alto" |
| Voz (P09) | "Substituição parcial por reunião HTTPS" | ⛔ ausente | O link de reunião externa da agenda não equivale a voz na sala (mute, indicadores, entrada pela sala); prefiro não chamar de substituição |

**Cobertura:** a matriz do Codex tem 38 linhas agrupadas por área e aponta testes para cada uma; este inventário tem 28 + 14
itens por versão e uma lista de divergências com severidade. Os dois documentos são complementares; nenhum dos dois
verificou dados ou regras reais.

## 7. Conclusões e decisões que cabem a pessoas

1. **Não há perda silenciosa** no que existia na main original (`dd8a9d8`): as 28 funcionalidades estão presentes; 9
   mudaram de propósito (documentadas em ADRs) e 2 divergem em dados antigos (D-01, D-02).
2. A maior diferença é com a branch `plans` (`3c6e7f0`): **salas, entrada do aluno, slides sincronizados, chat,
   Fluêncio e voz não estão na main**. O porte de 19/11 registrou isso (`PR2_AVALIACAO_E_PORTE.md`), mas a lacuna
   continua sendo funcionalidade do aluno — não deve ser tratada como aceitável só porque os testes passam.
3. Recomendação: integrar a recuperação do PR #40 depois de revisão cruzada (comentários deixados no PR), manter voz e
   Fluêncio como TO-BE até haver backend controlado, e decidir por ADR se as salas substituem ou convivem com o
   `current_session` único do tradutor público.
