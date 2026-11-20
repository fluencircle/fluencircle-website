# Matriz de acesso — interface e dados

**Fonte de verdade da autorização:** as **regras do banco** (`firebase/rules/database.rules.source.mjs`). A interface
apenas esconde atalhos e redireciona. Esta matriz descreve a **proposta testada**; as regras **ativas em produção não
são conhecidas** (ver `docs/entrega/LIMITACOES_E_PENDENCIAS.md`).

Legenda: ✅ permitido · ❌ negado · — não se aplica. Coluna "Teste" aponta onde o caso é verificado
(`R:` regras em `tests/rules/`, `E:` E2E em `tests/e2e/`).

## 1. Páginas (interface)

| Página | Visitante | Aluno | Mediador | Admin | Teste |
| --- | --- | --- | --- | --- | --- |
| `auth.html` (login) | ✅ | ✅ | ✅ | ✅ | E: perfis |
| `circle-translator.html` (tradutor público) | ✅ | ✅ | ✅ | ✅ | E: fluxos, tradutor-contas |
| `index.html` (início) | ❌ → login | ✅ flashcards, agenda própria e círculos no demo | ✅ atalhos de equipe e círculos no demo | ✅ | E: perfis, planos; `tests/e2e-emulator/rooms.test.mjs` |
| `flash-cards.html` | ❌ → login | ✅ só os próprios decks | ✅ todos os decks | ✅ todos | E: perfis, privacidade |
| `presentation.html` (sessão ao vivo) | ❌ → login | ❌ aviso + home | ✅ | ✅ | E: perfis, concorrencia |
| `set-meeting.html` (temas) | ❌ → login | ❌ aviso + home | ✅ | ✅ | E: perfis, fluxos |
| `manage-meetings.html` (sessões) | ❌ → login | ❌ aviso + home | ✅ | ✅ | E: perfis, fluxos |
| `admin.html` (acessos) | ❌ → login | ❌ aviso + home | ❌ aviso + home | ✅ (inclui plano do usuário) | E: perfis, planos |
| `plans.html` (planos e agenda, ADR-005) | ❌ → login | ❌ aviso + home | ✅ agenda; catálogo só leitura | ✅ agenda e catálogo | E: planos, acessibilidade |
| Conta sem perfil / revogada | login recusado com mensagem | — | — | — | E: perfis |

## 2. Dados (regras propostas)

| Nó | Visitante | Aluno | Mediador | Admin | Teste |
| --- | --- | --- | --- | --- | --- |
| `/` (raiz) | ❌ | ❌ | ❌ | ❌ | R: rbac |
| `users` (lista) | ❌ | ❌ | ✅ ler | ✅ ler | R: rbac |
| `users/{uid}` próprio | — | ✅ ler | ✅ ler | ✅ ler/gravar | R: rbac |
| `users/{uid}` de outra pessoa | ❌ | ❌ | ✅ ler (lista) | ✅ ler/gravar | R: rbac |
| alterar o próprio papel | — | ❌ | ❌ | ✅ | R: rbac |
| `deleted_users/{uid}` | ❌ | ✅ ler a própria | ❌ | ✅ | R: rbac |
| `meetings` (temas) | ❌ | ❌ | ✅ ler/gravar | ✅ | R: rbac |
| `meeting_sessions` (coleção ou sessão inteira) | ❌ | ❌ | ✅ ler/gravar | ✅ | R: rbac, privacidade |
| `meeting_sessions/{s}/topic` e `/startedAt` | ❌ | ✅ só se participou | ✅ | ✅ | R: privacidade |
| `meeting_sessions/{s}/attendees` | ❌ | ❌ | ✅ grava `{addedAt}` junto com o índice | ✅ | R: rbac, privacidade |
| `current_session` | ✅ **ler** | ✅ ler | ✅ publicar com posse/versão | ✅ | R: rbac, sessao-ativa |
| `current_session/live/{aba}` | ❌ | ❌ | ✅ só a aba dona | ✅ só a aba dona | R: sessao-ativa |
| `live_rooms/{s}` (demo) | ❌ | ✅ ler | ✅ ler e controlar sala própria | ✅ ler e controlar sala própria | R: live-rooms |
| `live_room_members/{s}/{uid}` (demo) | ❌ | ✅ registrar só a própria entrada em sala online | ✅ mesma entrada, anfitrião encerra | ✅ mesma entrada, anfitrião encerra | R: live-rooms |
| `live_room_chat/{s}` (demo) | ❌ | ✅ ler após entrada e escrever mensagens próprias com sala online | ✅ após entrada ou como anfitrião | ✅ após entrada ou como anfitrião | R: live-rooms |
| `flashcards` (coleção) | ❌ | ❌ | ✅ ler | ✅ | R: privacidade |
| `flashcards/{s}` | ❌ **inclusive criar card** | ✅ ler se participou | ✅ ler/gravar | ✅ | R: rbac, privacidade; E: tradutor-contas |
| `student_reviews/{uid}` próprio | ❌ | ✅ +1 etapa, sessão em que participou | ✅ o próprio | ✅ o próprio | R: rbac |
| `student_reviews` de outra pessoa | ❌ | ❌ | ❌ | ❌ | R: rbac |
| `user_sessions/{uid}` | ❌ | ✅ ler o próprio | ✅ gravar (com presença) | ✅ | R: rbac, privacidade |
| `users/{uid}/planId` | ❌ | ✅ ler o próprio; ❌ gravar | ❌ gravar | ✅ gravar (plano existente) | R: planos |
| `plans` (catálogo) | ❌ | ❌ | ✅ ler | ✅ ler/gravar | R: planos |
| `plans/{p}` | ❌ | ✅ ler só o próprio plano | ✅ ler | ✅ ler/gravar | R: planos |
| `weekly_sessions/{semana}` inteira | ❌ | ❌ | ✅ ler | ✅ ler | R: planos |
| `weekly_sessions/{semana}/{p}_{dia}_{i}` | ❌ | ✅ ler só encontros do próprio plano (chave inteira conferida) | ✅ ler/gravar (link só https) | ✅ | R: planos |
| conta sem perfil / revogada | — | ❌ (exceto ler o próprio `users/{uid}` / `deleted_users/{uid}`) | — | — | R: rbac, privacidade |

## 3. Backend de tradução (Render)

| Operação | Visitante | Aluno | Mediador | Admin | Estado |
| --- | --- | --- | --- | --- | --- |
| Traduzir | ✅ | ✅ | ✅ | ✅ | AS-IS sem autenticação e sem limite conhecido — **NÃO VERIFICADO** |
| Salvar card público pelo backend | proposto | proposto | proposto | proposto | **TO-BE**, `docs/backend/CONTRATO_BACKEND.md` |
| Criar/revogar conta pelo backend (Admin SDK) | ❌ | ❌ | ❌ | proposto | **TO-BE** |

## 4. Riscos aceitos (registrados e testados)

- Mediadores leem nome e e-mail de todos os perfis (busca de presença).
- Qualquer membro da equipe pode apagar `current_session`; o cliente só apaga se for a aba dona.
- O aluno pode registrar carimbo de data retroativo **no próprio progresso** (datas ISO não são comparáveis nas regras).
