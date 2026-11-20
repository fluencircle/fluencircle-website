/**
 * @file Fonte comentada das regras PROPOSTAS do Realtime Database.
 *
 * O JSON que o Firebase entende (`docs/firebase/database.rules.proposta.json`)
 * é GERADO a partir deste arquivo por `npm run rules:build`. Edite aqui, gere
 * o JSON e rode os testes. A CI recusa um JSON fora de sincronia.
 *
 * Por que um gerador? O RTDB não tem funções nas regras: a mesma condição
 * ("é mediador ou admin") se repete dezenas de vezes. Escrever cada repetição
 * à mão é a principal fonte de erro. Aqui cada condição tem nome e explicação.
 *
 * Como o RTDB avalia (resumo — detalhes em docs/firebase/LEIA-ME.md):
 * - `.read`/`.write` CASCATEIAM: se um nó concede, todos os filhos herdam e
 *   nenhum filho consegue revogar. Por isso a raiz nega tudo e as permissões
 *   ficam o mais fundo possível.
 * - `.validate` NÃO cascateia: vale para o nó onde está e só para valores não
 *   nulos (remoções não são validadas). Ela confere ESQUEMA, não autoria.
 * - `root`/`data` = estado antes da escrita; `newData` = estado depois.
 *
 * ESTADO: proposta para auditoria e testes no Emulator. NÃO É A REGRA DE
 * PRODUÇÃO (que não está versionada) e NÃO DEVE SER PUBLICADA sem decisão
 * humana, comparação com as regras ativas e plano de rollback.
 */

// ---------------------------------------------------------------------------
// Condições reutilizáveis (sempre entre parênteses para não errar precedência)
// ---------------------------------------------------------------------------

const signedIn = 'auth != null';
const myRole = "root.child('users').child(auth.uid).child('role').val()";

/** Conta autenticada COM perfil em `users` (contas sem perfil ou revogadas não passam). */
export const hasProfile = `(${signedIn} && root.child('users').child(auth.uid).exists())`;

/** Administrador. */
export const isAdmin = `(${signedIn} && ${myRole} === 'admin')`;

/** Equipe: mediador ou administrador. */
export const isStaff = `(${signedIn} && (${myRole} === 'mediator' || ${myRole} === 'admin'))`;

/** O próprio dono do nó identificado pela variável `$x`. */
const isSelf = (variable) => `(${signedIn} && auth.uid === ${variable})`;

/**
 * Participou da sessão: aceita o índice `user_sessions` ou a lista
 * `attendees` (dados antigos podem ter só um dos dois).
 */
const attended = (uidExpr, sessionExpr) => `(root.child('user_sessions').child(${uidExpr}).child(${sessionExpr}).exists()`
  + ` || root.child('meeting_sessions').child(${sessionExpr}).child('attendees').child(${uidExpr}).exists())`;

/** Quem está autenticado tem perfil e participou da sessão `$x` (leitura do aluno). */
const isAttendee = (sessionExpr) => `(${hasProfile} && ${attended('auth.uid', sessionExpr)})`;

// ---------------------------------------------------------------------------
// Validadores de esquema
// ---------------------------------------------------------------------------

/** Texto com tamanho entre `min` e `max`. */
const text = (max, min = 0) => `newData.isString() && newData.val().length >= ${min} && newData.val().length <= ${max}`;

/** Data ISO 8601 em UTC, como gera `new Date().toISOString()`. */
const isoTimestamp = "newData.isString() && newData.val().matches(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,3})?Z$/)";

/** E-mail simples (sem espaços, um @). A verificação real é do Firebase Auth. */
const email = "newData.isString() && newData.val().length <= 254 && newData.val().matches(/^[^@ ]+@[^@ ]+$/)";

/** Id de posse da aba que apresenta (mesmo padrão de domain/presentation-lock.js). */
const presenterIdFormat = 'newData.isString() && newData.val().matches(/^[A-Za-z0-9_-]{16,64}$/)';

/** Recusa qualquer campo não listado no mesmo nível. */
const noOtherFields = { $other: { '.validate': false } };

const validate = (expression) => ({ '.validate': expression });

/** Horário local "HH:MM" (24 h). */
const clockTime = "newData.isString() && newData.val().matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)";

/** Id de plano (formato dos ids do push()); o mesmo de domain/plans.js. */
const isPlanId = (node) => `${node}.isString() && ${node}.val().matches(/^[A-Za-z0-9_-]{1,64}$/)`;

/** Índices persistidos por domain/plans.js, incluindo a faixa legada 0–99. */
const planSessionIndexPattern = '(0|[1-9][0-9]{0,5})';

/** Aplica um teste ao plano canônico ou, se o campo não existir, ao identificador legado. */
const profilePath = "root.child('users').child(auth.uid)";
const canonicalPlan = `${profilePath}.child('planId')`;
const legacyPlan = `${profilePath}.child('plan')`;
const ownPlan = (match) => `((${isPlanId(canonicalPlan)} && ${match(`${canonicalPlan}.val()`)})`
  + ` || (!${canonicalPlan}.exists() && ${isPlanId(legacyPlan)} && ${match(`${legacyPlan}.val()`) }))`;

const activeAccount = `(${hasProfile} && !root.child('deleted_users').child(auth.uid).exists())`;
const room = "root.child('live_rooms').child($roomId)";
const roomHost = `(${isStaff} && ${room}.child('hostUid').val() === auth.uid)`;
const roomOnline = `${room}.child('online').val() === true`;
const roomMember = `(${roomHost} || root.child('live_room_members').child($roomId).child(auth.uid).val() === true)`;

// ---------------------------------------------------------------------------
// Árvore de regras
// ---------------------------------------------------------------------------

/** Monta o objeto de regras (o mesmo conteúdo do JSON gerado). */
export function buildRules() {
  return {
    rules: {
      // Negação padrão: nada é legível ou gravável sem uma regra explícita abaixo.
      '.read': false,
      '.write': false,

      // Perfis. A equipe lê a lista (busca de alunos na presença e tela de acessos);
      // cada pessoa lê o próprio perfil (login). Só o admin grava: impede que um
      // aluno troque o próprio papel (escalada de privilégio).
      users: {
        '.read': isStaff,
        $uid: {
          '.read': isSelf('$uid'),
          '.write': isAdmin,
          '.validate': "newData.hasChildren(['email', 'role'])",
          firstName: validate(text(80)),
          lastName: validate(text(80)),
          email: validate(email),
          role: validate("newData.val() === 'student' || newData.val() === 'mediator' || newData.val() === 'admin'"),
          // Plano contratado (PR #2). Precisa existir em `plans`; remover = gravar null.
          planId: validate(`${isPlanId('newData')} && root.child('plans').child(newData.val()).exists()`),
          // Perfis importados podem manter os campos antigos até a edição em Acessos.
          plan: validate('data.exists() && newData.val() === data.val()'),
          planName: validate('data.exists() && newData.val() === data.val()'),
          createdAt: validate(isoTimestamp),
          updatedAt: validate(isoTimestamp),
          ...noOtherFields,
        },
      },

      // Planos de assinatura (PR #2; ADR-005). A equipe lê o catálogo; cada
      // pessoa lê SÓ o próprio plano (agenda da home). Só o admin cria e edita.
      plans: {
        '.read': isStaff,
        $planId: {
          '.read': `(${hasProfile} && ${ownPlan((plan) => `${plan} === $planId`)})`,
          '.write': isAdmin,
          '.validate': "newData.hasChildren(['name', 'price', 'sessions']) && $planId.matches(/^[A-Za-z0-9_-]{1,64}$/)"
            + " && (!data.child('nextSessionIndex').exists() || (newData.child('nextSessionIndex').exists() && newData.child('nextSessionIndex').val() >= data.child('nextSessionIndex').val()))",
          name: validate(text(80, 1)),
          description: validate(text(300)),
          price: validate('newData.isNumber() && newData.val() >= 0 && newData.val() <= 100000'),
          nextSessionIndex: validate('newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 1 && newData.val() <= 1000000'),
          sessions: {
            $index: {
              '.validate': `$index.matches(/^${planSessionIndexPattern}$/) && newData.hasChildren(['dayOfWeek', 'startTime', 'endTime'])`,
              dayOfWeek: validate('newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 0 && newData.val() <= 6'),
              startTime: validate(clockTime),
              endTime: validate(clockTime),
              ...noOtherFields,
            },
          },
          createdAt: validate(isoTimestamp),
          updatedAt: validate(isoTimestamp),
          ...noOtherFields,
        },
      },

      // Agenda da semana (PR #2; ADR-005): weekly_sessions/{2026-W47}/{planId_dia_i}.
      // A equipe define tema e link de cada encontro. O participante lê só os
      // encontros do PRÓPRIO plano, um a um (a chave é "<planId>_<dia>_<i>").
      // Tema e perguntas são copiados aqui porque o aluno não lê `meetings`.
      weekly_sessions: {
        '.read': isStaff,
        $weekKey: {
          '.validate': '$weekKey.matches(/^[0-9]{4}-W[0-9]{2}$/)',
          $slotKey: {
            // o resto da chave tem de ser só "<dia>_<i>": impede que o plano "x" leia o plano "x_y"
            '.read': `(${hasProfile} && ${ownPlan((plan) => `$slotKey.beginsWith(${plan} + '_')`
              + ` && $slotKey.replace(${plan} + '_', '').matches(/^[0-6]_${planSessionIndexPattern}$/)`)})`,
            '.write': isStaff,
            '.validate': `newData.hasChildren(['topicTitle', 'updatedAt']) && $slotKey.matches(/^[A-Za-z0-9_-]+_[0-6]_${planSessionIndexPattern}$/)`,
            topicId: validate(text(128)),
            topicTitle: validate(text(200, 1)),
            questions: {
              $index: validate(`$index.matches(/^[0-9]+$/) && ${text(500, 1)}`),
            },
            meetLink: validate('newData.isString() && newData.val().length <= 500 && newData.val().matches(/^https:[/][/][A-Za-z0-9._~:/?#@!$&()*+,;=%-]+$/)'),
            updatedAt: validate(isoTimestamp),
            ...noOtherFields,
          },
        },
      },

      // Lista de bloqueio de contas revogadas. A própria conta lê a sua entrada
      // para o login recusar o acesso (auth.service.js → isUserBlocked).
      deleted_users: {
        '.read': isAdmin,
        $uid: {
          '.read': isSelf('$uid'),
          '.write': isAdmin,
          '.validate': "newData.hasChildren(['deletedAt'])",
          deletedAt: validate(isoTimestamp),
          deletedBy: validate(text(254)),
          ...noOtherFields,
        },
      },

      // Temas de conversa (o nó chama `meetings` por compatibilidade com os dados).
      meetings: {
        '.read': isStaff,
        $themeId: {
          '.write': isStaff,
          '.validate': "newData.hasChildren(['topic', 'questions'])",
          topic: validate(text(200, 1)),
          questions: {
            $index: validate(`$index.matches(/^[0-9]+$/) && ${text(500, 1)}`),
          },
          createdAt: validate(isoTimestamp),
          updatedAt: validate(isoTimestamp),
          ...noOtherFields,
        },
      },

      // Sessões realizadas. Só a equipe lê a coleção ou uma sessão inteira
      // (há presenças de várias pessoas). Quem participou lê APENAS `topic` e
      // `startedAt` da própria sessão — usado só para entradas antigas do índice
      // (Issue #10). A tela do aluno parte de `user_sessions/{uid}`.
      meeting_sessions: {
        '.read': isStaff,
        $sessionId: {
          '.write': isStaff,
          '.validate': "newData.hasChildren(['topic', 'startedAt'])",
          templateId: validate(text(128)),
          topic: { '.read': isAttendee('$sessionId'), '.validate': text(200, 1) },
          startedAt: { '.read': isAttendee('$sessionId'), '.validate': isoTimestamp },
          // Quem cria a sessão registra o PRÓPRIO e-mail; depois ele não muda.
          mediatorEmail: validate(`${text(254)} && (data.exists() ? newData.val() === data.val() : newData.val() === auth.token.email)`),
          attendees: {
            $uid: {
              // Presença só existe junto com o índice reverso, na MESMA escrita
              // (update multicaminho de session-updates.js). Remoções não passam por .validate.
              // PII mínima (Issue #10): só a data; nome e e-mail ficam em `users`.
              // Registros antigos com name/email continuam legíveis pela equipe, mas
              // nenhuma escrita nova pode gravá-los ($other).
              '.validate': "newData.hasChildren(['addedAt'])"
                + " && root.child('users').child($uid).exists()"
                + " && newData.parent().parent().parent().parent().child('user_sessions').child($uid).child($sessionId).exists()",
              addedAt: validate(isoTimestamp),
              ...noOtherFields,
            },
          },
          ...noOtherFields,
        },
      },

      // Sessão ativa lida pelo tradutor público (sem login): leitura aberta,
      // por isso guarda o MÍNIMO (id, título, início e posse; nada de pessoas).
      //
      // Posse e concorrência (Issue #9; lógica em public/js/domain/presentation-lock.js):
      // - `presenterId` identifica a ABA que apresenta; `live/{presenterId}` é a
      //   presença dela (o onDisconnect de cada aba apaga só a própria chave);
      // - `version` só cresce de 1 em 1 na troca de dono; a mesma aba grava sem
      //   mudar versão nem dono (ex.: restaurar a presença ao reconectar);
      // - trocar o dono de uma apresentação VIVA exige `takeoverOf` = dono atual
      //   (a pessoa confirmou "assumir"); dono ausente libera a troca;
      // - nó no formato antigo (sem `version`) pode ser substituído.
      // Encerrar (apagar) continua permitido a qualquer membro da equipe; o
      // cliente só apaga se for o dono (risco aceito e testado).
      current_session: {
        '.read': true,
        '.write': isStaff,
        '.validate': "newData.hasChildren(['sessionId', 'topic', 'startedAt', 'presenterId', 'version'])"
          + ' && (!data.exists()'
          + " || !data.hasChild('version')"
          + " || (newData.child('presenterId').val() === data.child('presenterId').val() && newData.child('version').val() === data.child('version').val())"
          + " || (newData.child('version').val() === data.child('version').val() + 1"
          + " && (data.child('live').child(data.child('presenterId').val()).val() !== true"
          + " || newData.child('takeoverOf').val() === data.child('presenterId').val())))",
        sessionId: validate("newData.isString() && newData.parent().parent().child('meeting_sessions').child(newData.val()).exists()"),
        topic: validate(text(200, 1)),
        startedAt: validate(isoTimestamp),
        presenterId: validate(presenterIdFormat),
        version: validate('newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 1'),
        takeoverOf: validate(presenterIdFormat),
        live: {
          $presenterId: validate("newData.val() === true && $presenterId === newData.parent().parent().child('presenterId').val()"),
        },
        ...noOtherFields,
      },

      // Círculos da demonstração. O catálogo autenticado contém apenas tema,
      // UID do anfitrião e slide atual. Conversa e entradas ficam separadas.
      live_rooms: {
        '.read': activeAccount,
        $roomId: {
          '.write': `(${activeAccount} && ${isStaff} && (${roomHost} || (!data.exists() && newData.exists()`
            + " && root.child('meeting_sessions').child($roomId).child('mediatorEmail').val() === auth.token.email"
            + " && root.child('meeting_sessions').child($roomId).exists())))",
          '.validate': "newData.hasChildren(['hostUid', 'topic', 'slide'])",
          hostUid: validate("newData.val() === auth.uid"),
          topic: validate("newData.val() === root.child('meeting_sessions').child($roomId).child('topic').val()"),
          slide: validate(text(500, 1)),
          online: validate('newData.val() === true'),
          ...noOtherFields,
        },
      },

      live_room_members: {
        $roomId: {
          '.write': `(${activeAccount} && ${roomHost} && !newData.exists())`,
          $uid: {
            // Entrar exige perfil ativo e sala online; sair remove somente o próprio vínculo.
              // A remoção continua possível com sala offline ou perfil revogado.
              '.write': `((${activeAccount} && ${isSelf('$uid')} && ${roomOnline} && newData.val() === true) || (auth != null && ${isSelf('$uid')} && !newData.exists()))`,
            '.validate': 'newData.val() === true',
          },
        },
      },

      live_room_chat: {
        $roomId: {
          '.read': `(${activeAccount} && ${room}.exists() && ${roomMember})`,
          '.write': `(${activeAccount} && ${roomHost} && !newData.exists())`,
          $messageId: {
            '.write': `(${activeAccount} && ${roomOnline} && ${roomMember} && !data.exists() && newData.exists())`,
            '.validate': "newData.hasChildren(['senderUid', 'text'])",
            senderUid: validate('newData.val() === auth.uid'),
            text: validate(text(500, 1)),
            ...noOtherFields,
          },
        },
      },

      // Flashcards por sessão. Visitante NÃO grava direto (Issue #5): a gravação
      // pública precisa de backend controlado. Leitura: equipe lê tudo; aluno lê
      // só os decks das sessões de que participou (Issue #10).
      flashcards: {
        '.read': isStaff,
        $sessionId: {
          '.read': isAttendee('$sessionId'),
          '.write': isStaff,
          $cardId: {
            '.validate': "newData.hasChildren(['front', 'back'])"
              + " && newData.parent().parent().parent().child('meeting_sessions').child($sessionId).exists()",
            front: validate(text(500, 1)),
            back: validate(text(500, 1)),
            topic: validate(text(200)),
            sessionId: validate('newData.val() === $sessionId'),
            createdAt: validate(isoTimestamp),
            ...noOtherFields,
          },
        },
      },

      // Revisão espaçada. Só o próprio aluno, com perfil, em sessão de que
      // participou (a equipe estuda qualquer deck). A etapa só AVANÇA de 1 em 1
      // e cada etapa grava o seu carimbo. Limite conhecido: as datas são texto
      // ISO, então a regra não consegue impedir um carimbo retroativo — o
      // aluno só "engana" o próprio estudo (risco aceito, ver LEIA-ME).
      student_reviews: {
        $uid: {
          '.read': isSelf('$uid'),
          $sessionId: {
            '.write': `${isSelf('$uid')} && ${hasProfile} && (${attended('$uid', '$sessionId')} || ${isStaff})`,
            '.validate': "newData.hasChildren(['stage', 'lastReviewedAt'])"
              + " && newData.child('stage').val() === (data.exists() ? data.child('stage').val() + 1 : 1)"
              + " && newData.hasChild('stage' + newData.child('stage').val() + 'CompletedAt')",
            stage: validate('newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 1 && newData.val() <= 3'),
            lastReviewedAt: validate(isoTimestamp),
            stage1CompletedAt: validate(isoTimestamp),
            stage2CompletedAt: validate(isoTimestamp),
            stage3CompletedAt: validate(isoTimestamp),
            ...noOtherFields,
          },
        },
      },

      // Índice reverso de presença (aluno → sessões). Cada aluno lê só o seu;
      // só a equipe grava, e sempre junto com `attendees` (mesma escrita).
      // Formato novo: resumo { topic, startedAt } para a tela de flashcards não
      // ler meeting_sessions. Entradas antigas `true` continuam legíveis, mas
      // não podem mais ser gravadas.
      user_sessions: {
        $uid: {
          '.read': isSelf('$uid'),
          $sessionId: {
            '.write': isStaff,
            '.validate': "newData.hasChildren(['topic', 'startedAt'])"
              + " && newData.parent().parent().parent().child('meeting_sessions').child($sessionId).child('attendees').child($uid).exists()",
            topic: validate(text(200, 1)),
            startedAt: validate(isoTimestamp),
            ...noOtherFields,
          },
        },
      },
    },
  };
}
