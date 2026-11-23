# ADR-006 — Artefatos gerados e verificados, sem etapa de build obrigatória

**Estado:** proposta implementada na branch `audit/claude-security-performance-architecture`; aguarda revisão e aceite
humano. **Data:** 20/11/2026 · **Issue:** #41 · **Implementação:** Claude · **Revisão:** pendente.

## Contexto

O site é servido direto de `public/` ("sem etapa de build", ADR-001). Medições reprodutíveis
(`scripts/benchmarks/page-performance.mjs`, perfil móvel 150 ms / 1,6 Mbit/s / CPU 4x, mediana de 5 execuções) mostraram
dois custos dessa escolha:

1. `css/main.css` com 20 `@import`: 21 requisições de CSS e uma ida e volta a mais antes da primeira pintura;
2. Font Awesome inteiro do cdnjs (CSS de 100 KiB, sem SRI, mais fontes de ícone de até ~300 KiB por página) para 42 ícones.

O projeto já resolvia um problema parecido nas regras do banco: fonte comentada → JSON gerado e **versionado** →
`npm run rules:check` na CI.

## Decisão

Estender o mesmo padrão — **gerar, versionar e verificar** — ao CSS e aos ícones:

| Fonte (editada por pessoas) | Gerador | Artefato versionado (servido) | Verificação na CI |
| --- | --- | --- | --- |
| `firebase/rules/database.rules.source.mjs` | `npm run rules:build` | `docs/firebase/database.rules.proposta.json` | `rules:check` (offline) |
| `public/css/main.css` (manifesto) + partes | `npm run css:build` | `public/css/app.css` | `css:check` (offline) |
| uso de `fa-*` no HTML/JS + `@fortawesome/fontawesome-free` 6.5.0 | `npm run icons:build` | `public/css/components/icons.css` | `icons:check` (job e2e, que tem `npm ci`) e cobertura no `verify-static` (offline) |

Regras: o artefato gerado não é editado à mão (cabeçalho avisa); `verify-static.mjs` recusa página que carregue
`main.css` e qualquer script/folha de estilo de terceiro sem SRI (exceção justificada: CSS do Google Fonts).

## Alternativas consideradas

| Alternativa | Por que não agora |
| --- | --- |
| Vite/bundler | ganho maior possível (SDK, módulos), mas exige etapa de build para todo mundo; precisa ser **medido** antes (ADR futuro) |
| 21 `<link>` em cada HTML | elimina a ida e volta, mas espalha a ordem da cascata por 9 arquivos |
| Subconjunto da fonte de ícones (woff2) | ferramenta extra (fonttools); ainda uma fonte para baixar e trocar |
| SRI no CSS do cdnjs | resolve só a integridade, não o peso (fontes continuam) |

## Consequências

- ✅ Medido: −45 a −59% de bytes por página; FCP −290 a −360 ms e −21 requisições no perfil móvel; nenhum CDN de
  terceiros além do Google Fonts e do SDK do Firebase.
- ✅ Equivalência verificada: 112 ícones com caixas de layout idênticas às do Font Awesome real; capturas de 7 páginas
  idênticas antes/depois da folha única (exceto dados da execução).
- ⚠️ Quem editar CSS precisa rodar `npm run css:build` (`npm run serve` e `npm run emulators` já rodam antes de subir);
  ícone novo exige `npm run icons:build`. A CI recusa artefatos desatualizados.
- ⚠️ Os ícones são do Font Awesome Free (CC BY 4.0): a atribuição fica no topo de `icons.css`.
