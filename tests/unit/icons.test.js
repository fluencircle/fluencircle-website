/**
 * Gerador de ícones (scripts/build-icons.mjs): só funções puras, sem o pacote do
 * Font Awesome (o job offline da CI não instala dependências; a sincronia exata
 * com o pacote é conferida por `npm run icons:check` no job e2e).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findUsedIcons, findIconCandidates, svgToDataUrl, widthFromViewBox, buildIconsCss } from '../../scripts/build-icons.mjs';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! licença --><path d="M0 0h448v512H0z"/></svg>';

test('encontra ícones em classes HTML, no atalho icon() e em nomes passados por variável', () => {
  const used = findIconCandidates({
    'public/index.html': '<i class="fa-solid fa-layer-group" aria-hidden="true"></i><i class="fa-brands fa-whatsapp"></i>',
    'public/js/pages/a.js': "icon('fa-trash'); icon('fa-clock', 'regular'); h('i', { class: 'fa-solid fa-graduation-cap empty-state__icon' });",
    'public/js/ui/app-shell.js': "const NAV = [{ icon: 'fa-house' }]; planActionButton('fa-pen', 'Editar');",
  });
  assert.deepEqual(used.brands, ['whatsapp']);
  assert.deepEqual(used.regular, ['clock']);
  for (const name of ['layer-group', 'trash', 'graduation-cap', 'house', 'pen']) assert.ok(used.solid.includes(name), name);
});

test('ignora classes de família/modificador e nomes que não existem no pacote', () => {
  const used = findUsedIcons({
    'public/x.html': '<i class="fa-solid fa-fw fa-spin fa-trash"></i>',
    'public/js/x.js': "const family = 'fa-solid'; icon('fa-nao-existe');",
  }, (family, name) => name === 'trash');
  assert.deepEqual(used, { solid: ['trash'], regular: [], brands: [] });
});

test('SVG vira data URL sem comentário de licença e com caracteres escapados para CSS', () => {
  const url = svgToDataUrl(SVG.replace('M0', 'M0 #'));
  assert.match(url, /^url\("data:image\/svg\+xml,%3Csvg /);
  assert.ok(!url.includes('licença'));
  assert.ok(!/[<>#"](?=[^)]*\)$)/.test(url.slice(5, -2)), 'sem <, >, # ou aspas duplas dentro da URL');
  assert.ok(url.includes('%23'));
});

test('largura proporcional ao viewBox (altura do desenho = 1em)', () => {
  assert.equal(widthFromViewBox(SVG), 0.875);
  assert.equal(widthFromViewBox('<svg viewBox="0 0 640 512">'), 1.25);
  assert.throws(() => widthFromViewBox('<svg>'), /viewBox/);
});

test('CSS gerado: regra base segura, atribuição CC BY 4.0 e uma regra por ícone', () => {
  const css = buildIconsCss({ solid: ['trash'], regular: ['clock'], brands: [] }, () => SVG, '6.5.0');
  assert.match(css, /Font Awesome Free 6\.5\.0/);
  assert.match(css, /CC BY 4\.0/);
  assert.match(css, /var\(--fc-icon, linear-gradient\(transparent, transparent\)\)/, 'classe sem regra não pinta quadrado');
  assert.match(css, /@supports not/);
  assert.match(css, /:where\(\.fa-solid\.fa-trash\) \{ width: 0\.875em; --fc-icon: url\("data:image\/svg\+xml,/);
  assert.match(css, /^:where\(\.fa-solid, \.fa-regular, \.fa-brands\) \{/m, 'especificidade zero: o CSS das páginas prevalece');
  assert.match(css, /:where\(\.fa-regular\.fa-clock\) \{/);
});

test('o icons.css versionado cobre todo ícone referenciado em public/', () => {
  const css = readFileSync(new URL('../../public/css/components/icons.css', import.meta.url), 'utf8');
  assert.match(css, /ARQUIVO GERADO por scripts\/build-icons\.mjs/);
  // Amostra fixa de ícones usados em telas diferentes (o verify-static confere todos).
  for (const selector of [':where(.fa-solid.fa-trash) {', ':where(.fa-solid.fa-layer-group) {', ':where(.fa-regular.fa-clock) {', ':where(.fa-brands.fa-whatsapp) {']) {
    assert.ok(css.includes(selector), selector);
  }
});
