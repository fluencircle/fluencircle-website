# Limitações e pendências

Separação obrigatória: o que foi **testado localmente** (com Firebase simulado ou simulador de regras), o que falta
para **produção** e o que é **melhoria futura**. Redigido originalmente por Claude em 19/11/2026. **Nota de auditoria posterior (ChatGPT, 19/11/2026):** o bloqueio de GitHub e a ausência de testes oficiais na sessão Claude foram superados após a importação: PRs #29–#34 estão na main, o Firebase Emulator oficial aprovou 65/65 e o Playwright simulado 44/44 em CI (#44537468469). Este documento preserva abaixo o contexto histórico de Claude; veja `docs/entrega/CHECKLIST_FINAL.md` e `docs/auditorias/CHATGPT_ACEITE_ACADEMICO_2026-11-19.md` para o estado atual. **O backend de produção continua não auditado e o deploy segue NO-GO.**

## 1. Bloqueios desta entrega

| Bloqueio | Efeito | Quem desbloqueia |
| --- | --- | --- |
| Sem permissão de escrita no GitHub ("link your GitHub account") | branches e PRs Draft não foram publicados por Claude; entregues em pacote (`git bundle`) com os textos dos PRs | mantenedor (conectar o GitHub no claude.ai ou publicar o pacote) |
| Sem `firebase-tools`/rede no ambiente da implementação | regras **não executadas no Emulator**; carga do Emulator não executada | CI (job `rules-emulator`) ou qualquer máquina com `npm install` + Java 21 |
| Repositório do backend do Render não localizado | backend não auditado nem alterado; contrato só proposto | mantenedor (indicar repositório e dar acesso) |
| Regras ativas de produção desconhecidas | impossível dizer se produção está exposta hoje | operador do Firebase (exportar e versionar) |
| Credencial histórica (Issue #6) | rotação não confirmada | operador do Google Cloud |

## 2. Testado localmente × pendente para produção × futuro

| Tema | Testado localmente (EXECUTADO) | Pendente para produção | Melhoria futura |
| --- | --- | --- | --- |
| Regras RTDB | 65 casos no **simulador**; JSON gerado e sincronizado | rodar no Emulator; comparar com as regras ativas; staging; decisão humana | testes de regras por sala; regras de consulta se surgirem consultas |
| Ambiente isolado | seleção por endereço, selo, carga sintética com guarda | criar projeto de **staging** | variáveis de ambiente com bundler (arquitetura B) |
| Tradutor público | escrita anônima negada; mensagens corretas; Emulator não tenta gravar | backend controlado; decidir desligar a gravação direta em produção | moderação/opt-in dos cards públicos |
| Concorrência da sessão ativa | posse por aba, versão, assumir com confirmação, queda/retorno (U, R simulado, E) | Emulator; publicar regras + hosting juntos | salas por código/QR (ADR-003) |
| Privacidade e escala | leitura pelo índice; presença sem PII; medição sintética | **migrar dados antigos** (plano offline) em staging e produção; política LGPD | diretório de nomes para mediadores (sem e-mail) |
| Contas | desfazer conta se o perfil falhar | backend com Admin SDK; desligar cadastro público | custom claims de papel |
| SRS | etapa +1 e carimbo obrigatório nas regras; cliente rejeita dados inválidos | — | timestamps numéricos (`now`) para validar prazos nas regras |
| CI | jobs separados sem deploy; offline, Emulator e E2E foram reproduzidos pela auditoria GitHub posterior | `package-lock.json` e `npm ci` adicionados em PR subsequente; monitorar dependências e commits de lock | cache de dependências; relatório de cobertura |
| E2E | 44 casos com Firebase simulado | E2E contra Emulator com o SDK real e contra staging | axe-core, contraste, leitor de tela |

## 3. Limitações conhecidas do comportamento atual

1. **Um tradutor público por vez.** Assumir exige confirmação; várias sessões simultâneas só com salas por código.
2. **Qualquer membro da equipe pode apagar `current_session`** pela API (o cliente só apaga se for a aba dona).
3. **Mediadores leem nome e e-mail de todos os perfis** (necessário para a busca da presença).
4. **Prazos do SRS não são verificáveis nas regras** (datas em texto ISO); o aluno pode adulterar apenas o próprio progresso.
5. **Resumo no índice do aluno é cópia** do tema/início da sessão; se um dia a sessão puder ser renomeada, o índice não acompanha.
6. **Gravação direta do tradutor em produção** permanece ligada por compatibilidade com regras desconhecidas.
7. **Conta órfã** ainda é possível se o perfil falhar **e** o desfazer também falhar (o admin recebe o uid).
8. **Produção só nos endereços publicados** (`PRODUCTION_HOSTNAMES`, revisão do ADR-002 em 20/11/2026). IP de rede
   local, pré-visualização do Hosting e arquivo do disco usam o Emulator. Um domínio próprio precisa ser incluído na
   lista antes do deploy.
9. O SDK do Firebase no navegador continua na **10.8.0**; atualizar exige E2E e Emulator verdes.
10. **Agenda por posição do horário** (ADR-005): remover ou reordenar horários de um plano pode desalinhar temas já
    agendados (a tela avisa); excluir um plano não limpa `users/*/planId`. Plano é só informativo (sem cobrança).
11. **PR #2 parcialmente portado:** salas simultâneas, chat/Fluêncio e voz WebRTC não entraram — ver
    `docs/auditorias/PR2_AVALIACAO_E_PORTE.md`.

## 4. Decisões humanas em aberto

1. Desligar a gravação pública direta em produção já, ou esperar o backend?
2. Criar o projeto de staging e quem o administra.
3. LGPD: prazo de retenção de presença, progresso e cards; o que fazer com esses dados ao revogar uma conta; aviso de
   privacidade do tradutor público.
4. Aprovar (ou não) o risco de mediadores verem e-mails de alunos.
5. Quando migrar para salas por código e comunicar a mudança de QR.
6. Rotação da credencial histórica (Issue #6).
7. Salas simultâneas com entrada do aluno, chat e voz (PR #2): aprovar o desenho proposto em
   `docs/auditorias/PR2_AVALIACAO_E_PORTE.md` §4 antes de implementar.

## 5. Itens que **não** foram feitos de propósito

Deploy, publicação de regras, acesso a Firebase/Render reais, rotação de credenciais, alteração de dados reais,
merge na `main`, criação de backend especulativo e uso de contas ou dados pessoais reais.
