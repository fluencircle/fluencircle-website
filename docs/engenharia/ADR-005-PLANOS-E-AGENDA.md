# ADR-005: Planos de assinatura e agenda semanal

**Estado:** aceita para o código e para a proposta de regras. As regras **não foram publicadas** e não houve migração de dados.
**Data:** 19/11/2026
**Origem:** PR #2 (Igor de Andrade Tafarello), reimplementado sobre a arquitetura em camadas
**Implementação:** Claude
**Revisão:** ChatGPT em 19/11/2026 (código, regras propostas, testes locais e regressões de índices); aceite humano e implantação ainda pendentes

## Contexto

O PR #2 foi escrito sobre o código anterior à modularização (`dd8a9d8`). Ele trouxe duas ideias:

- o plano de assinatura como atributo do usuário;
- uma agenda semanal em que cada horário do plano recebe um tema e um link de chamada.

Problemas da forma original:

- **Sem regras.** O PR gravava em `plans` e `weekly_sessions` sem nenhuma regra versionada. Na proposta atual, a raiz nega tudo, então essas escritas seriam recusadas.
- **Dados que o aluno não pode ler.** A agenda do aluno lia `plans` inteiro, `weekly_sessions/{semana}` inteiro e `meetings` (temas). As regras atuais só deixam `meetings` para a equipe (ADR-004).
- **Chave de semana errada.** A "semana" era a semana do mês (`Math.ceil((dia + 6) / 7)`). Isso repete chaves entre meses (`2026-W03` em janeiro e em fevereiro) e quebra na virada de mês.
- **HTML montado com dados do banco.** Os cards e o `href` do link eram montados com `innerHTML`. Um link `javascript:` ou um título com HTML seria executado.
- **Recurso sem tela.** O último commit do PR apagou `plans.html` e `plans.js` (a tela que criava planos e definia a agenda). Também tirou `script.js` da `index.html`. No estado final do PR, ninguém conseguia criar plano nem ver a agenda.

## Decisão

1. **Modelo de dados** (nomes do PR mantidos para não perder dados que já existam):
   - `users/{uid}/planId`: id do plano. Só o admin grava, e o plano precisa existir. Perfis cujo campo `planId` está ausente podem usar o identificador legado `plan`. Um `planId` vazio registrado por versão antiga representa desvínculo. Ao editar, a tela Acessos grava a referência canônica e remove os campos `plan` e `planName`.
   - `plans/{planId}` guarda nome, preço de referência, descrição opcional, horários em `sessions/{i}` (dia de 0 a 6 e início e fim no formato `HH:MM`), `nextSessionIndex`, `createdAt` e `updatedAt`. O contador é opcional para leitura de planos anteriores a esta correção.
   - `weekly_sessions/{AAAA-Www}/{planId}_{dia}_{i}` guarda `{ topicId, topicTitle, questions[], meetLink?, updatedAt }`.
     - A semana segue a **ISO 8601** (semana começa na segunda; a semana 1 é a que contém a primeira quinta-feira).
     - Ela é calculada na data **local**, como os horários do plano.
2. **Leitura mínima**, na mesma linha do ADR-004:
   - A equipe lê o catálogo e a semana inteira.
   - O participante lê **só o próprio plano** e, **um a um**, os encontros cuja chave seja exatamente `<seu planId>_<dia>_<i>`. A regra confere a chave inteira, não só o prefixo: ids do `push()` podem conter `_`, e sem isso o plano `x` leria os encontros de `x_y`.
   - Tema e perguntas são **copiados** para o encontro, porque o aluno não lê `meetings`.
3. **Quem grava.** O admin grava planos e o vínculo usuário→plano. A equipe (mediador ou admin) grava a agenda.
4. **Interface:**
   - `plans.html` ("Planos e agenda", só equipe), com duas abas:
     - agenda da semana, com navegação entre semanas;
     - catálogo de planos, que só o admin edita.
   - Em Acessos: coluna "Plano", seletor no formulário e busca pelo nome do plano.
   - Na home: seção "Sua semana" para quem tem plano.
   - O link "Entrar" só aparece se for `https://` com caracteres de URL. A regra do banco usa o mesmo padrão.
5. **Lógica pura** em `domain/plans.js`: semana ISO, agenda, validação do formulário e normalização das listas do RTDB, que podem voltar como objeto.

## Consequências

- **Positivas:**
  - o recurso fica completo (criar plano → vincular → definir tema → aluno ver);
  - nenhum dado de outro plano ou de temas vaza para o aluno;
  - links e textos não viram HTML;
  - há testes de domínio, de regras e E2E.
- **Custo:** cada encontro do aluno é uma leitura separada. Um plano tem no máximo 14 horários.
- **Limites conhecidos:**
  - **Integridade do índice:** a interface preserva o índice ao reordenar ou mudar a hora dentro do mesmo dia. A remoção ou mudança de dia desvincula temas das semanas já programadas. A tela exige confirmação para mudanças nos horários existentes. Os registros desvinculados permanecem armazenados. A próxima edição usa `nextSessionIndex` para evitar reaproveitá-los. Planos sem contador reservam os índices 0–99 para a faixa histórica. A capacidade é de 14 horários ativos por plano e há espaço de 0 a 999999 para identidades. A edição roda em transação e avisa se a versão aberta em outra aba ficou desatualizada.
  - Excluir um plano não limpa `users/*/planId`. A home e Acessos mostram "plano não encontrado / Plano removido".
  - Chaves do PR #2 podem coincidir com semanas ISO de janeiro ou fevereiro. O registro legado só guarda a hora de edição, que não identifica a semana letiva. Para recuperar uma linha cuja origem e data estejam confirmadas, a equipe deve verificar o destino antes de vincular o tema e o link na semana correta. Os dados legados ainda precisam ser inventariados.
  - Preço e plano são só informativos. Não há cobrança nem bloqueio de acesso por plano.

## Verificação

| Camada | Arquivo | O que cobre |
| --- | --- | --- |
| Unidade | `tests/unit/plans.test.js` | semana ISO, agenda, listas como objeto, links, validação e preservação de índices antigos em edições |
| Regras | `tests/rules/planos.rules.test.mjs` | catálogo, plano próprio/alheio, colisão de prefixo, `planId` inexistente, link `javascript:`, campos extras |
| E2E | `tests/e2e/planos.e2e.test.mjs` | fluxo completo admin → mediador → aluno; aluno barrado em `plans.html`; a11y das telas novas |

As regras foram testadas no **simulador local**. O Firebase Emulator não estava disponível no ambiente desta implementação. O job `rules-emulator` da CI é a verificação definitiva.


### Suplemento de verificação independente — ChatGPT

- Os oito commits originais de Claude foram reconstruídos exatamente a partir do Git bundle enviado pelo responsável, sobre `upstream/main@da51788`.
- Na inspeção, havia risco de alteração silenciosa do vínculo entre índice do horário e tema quando um horário anterior era removido. Foi aplicado `preservePlanSessionIndices()` e teste de regressão.
- Foi também adicionada proteção contra respostas antigas de semanas selecionadas anteriormente sobrescreverem a agenda atual.
- **Validação local reexecutada:** 103/103 testes unitários, 79/79 no simulador de regras, nove páginas HTML/35 referências, 52 módulos JS sem violações estáticas. Firebase Emulator oficial e Playwright permanecem condicionados à CI do Pull Request.
- Nenhuma regra ativa do Firebase foi lida ou publicada. Este documento não constitui autorização para deploy.
