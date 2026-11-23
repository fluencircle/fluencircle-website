# Planos e agenda semanal — guia para aluno e equipe

**Versão:** porte do PR original #2 por Claude, revisado pelo ChatGPT. **Uso permitido:** desenvolvimento acadêmico em ambiente demo isolado, sem deploy.

## Funcionalidades e atores

O recurso acrescenta `plans.html`, disponível para mediador e administrador. As funções de **criar, editar e excluir planos** e **atribuir um plano a cada usuário** são exclusivas de administrador. Mediador e administrador podem escolher o tema, as perguntas de preparação e o link HTTPS de um encontro de um plano numa semana. Um aluno com plano válido vê **apenas** os próprios encontros no painel **Sua semana** da home. O cadastro usa `users/{uid}/planId` e aceita o antigo `plan` na ausência de `planId`. Salvar uma edição em **Acessos** atualiza o cadastro para o campo atual. Não existe cobrança, checkout nem verificação de pagamento.

A versão histórica do PR #2 incluía chat, voz WebRTC, várias salas simultâneas e entrada automática de alunos. Esses recursos **não foram importados**, por dependerem de backend e decisões de autorização que ainda não foram testadas. Consulte `docs/auditorias/PR2_AVALIACAO_E_PORTE.md`.

## Executar na demonstração local

Siga primeiro `docs/entrega/GUIA_DO_ALUNO.md` para instalar Node.js 22, Java 21, dependências (`npm ci`), iniciar o Firebase Emulator e carregar dados sintéticos. Confira a faixa de **ambiente de teste local**. Nunca use dados ou credenciais reais.

1. Entre como administradora de demonstração, abra **Planos e agenda**, vá à aba **Planos** e cadastre um plano com nome, valor de referência e um ou mais horários semanais.
2. Na tela **Acessos**, vincule o plano ao aluno; confira a coluna e a busca por nome de plano.
3. Entre como mediador, abra **Planos e agenda**, selecione a semana, clique no encontro e escolha um tema e link `https://`.
4. Entre como aluno vinculado em outra janela: confira **Sua semana**, as perguntas de preparação e o botão **Entrar**.
5. Verifique que um aluno com outro plano não recebe os encontros do primeiro e que alunos sem plano não veem agenda (a matriz RTDB exige testes no Emulator).
6. Volte ao admin, remova um horário com tema definido e salve. Abra o plano em uma nova edição e adicione um horário no mesmo dia. O novo encontro começa com tema a definir. Os outros horários mantêm seus temas e links.

## Estrutura técnica

| Dado | Caminho RTDB proposto | Regra pretendida |
| --- | --- | --- |
| Cadastro e valor do plano | `plans/{planId}` | catálogo: equipe; cadastro: admin; aluno: apenas o próprio plano |
| Plano de usuário | `users/{uid}/planId` | apenas admin altera |
| Encontro por semana ISO | `weekly_sessions/{2026-W47}/{planId}_{dia}_{indice}` | equipe escreve; aluno lê apenas encontros do próprio plano |

**Importante:** `database.rules.proposta.json` e a fonte comentada em `firebase/rules/` são regras **de teste/proposta**, não as regras ativas do banco. A data da agenda é calculada na hora local do navegador; diferenças de fuso e horário de verão devem ser validadas antes de uso internacional.

O índice de cada horário faz parte da chave persistida do encontro. O plano grava o próximo índice em `nextSessionIndex`, preservando a identidade dos horários em edições sucessivas. A remoção de um horário ou mudança de dia desvincula o tema antigo. Alterar a hora dentro do mesmo dia mantém os temas do horário. Planos sem contador continuam com seus horários existentes e passam a atribuir novos índices a partir de 100, acima da faixa antiga. Se duas abas editarem o mesmo plano, a edição feita a partir da versão anterior recebe um aviso ao salvar.

O calendário histórico usava uma chave de semana do mês sem armazenar o mês. Uma chave antiga pode apontar para várias semanas ou coincidir com uma chave ISO. Para recuperar um encontro identificado por outra fonte, confira a data e o plano, navegue até a semana correta e defina tema e link nessa semana. As perguntas de preparação reproduzem o tema selecionado no momento desse salvamento. Excluir um plano pode deixar `planId` antigo em contas já vinculadas. A administração pode atualizar esses vínculos em **Acessos**.

## Testes e limites

```bash
npm test
npm run rules:check
npm run test:rules:sim
npm run test:rules        # exige Java 21 + Firebase Emulator
npm run test:e2e          # exige Playwright instalado
npm run test:e2e:emulator # navegador com Auth, RTDB e Hosting Emulator
node scripts/verify-static.mjs
node scripts/verify-architecture.mjs
```

Os testes unitários exercitam semana ISO, validação, links HTTPS e atribuição estável de índices. Os de regras cobrem o acesso de cada perfil e a progressão do contador. Os cenários de navegador cobrem a edição em duas abas e a remoção seguida da criação de um horário no mesmo dia. A homologação exige revisar as regras ativas, o backend, a migração de dados e o aceite do mantenedor.

## Como continuar

- Modelo: `public/js/domain/plans.js`; persistência: `public/js/services/plans.service.js`.
- Páginas: `public/js/pages/plans.page.js`, `public/js/pages/home.page.js`, `public/js/pages/admin.page.js`.
- UI reutilizável: `public/js/ui/week-slot-card.js`.
- Regras propostas: `firebase/rules/database.rules.source.mjs`; testes: `tests/rules/planos.rules.test.mjs`.
- Evolução de chat/voz e múltiplas salas requer ADR separado, regras específicas, backend auditável, testes E2E e aprovação humana.

**Decisão de release:** apto somente para contribuição e demonstração acadêmica após CI; **NO-GO** para produção sem validação externa.
