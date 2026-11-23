/**
 * Folha única (scripts/build-css.mjs): mesma ordem da cascata do manifesto,
 * url() relativas corrigidas para a nova pasta e app.css versionado em sincronia.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseManifest, rebaseUrls, bundleCss, generate, OUTPUT } from '../../scripts/build-css.mjs';

test('manifesto: só @import url() relativos, na ordem', () => {
  assert.deepEqual(parseManifest('/* c */\n@import url("base/a.css");\n@import url(\'pages/b.css\');\n'), ['base/a.css', 'pages/b.css']);
  assert.throws(() => parseManifest('@import url("a.css");\nbody { color: red; }'), /só @import/);
  assert.throws(() => parseManifest('@import url("https://cdn.example/x.css");'), /não relativo/);
  assert.throws(() => parseManifest('@import url("/abs.css");'), /não relativo/);
});

test('url() relativa é reescrita para a pasta de app.css; as demais ficam intactas', () => {
  const { css, rewritten } = rebaseUrls([
    '.a { cursor: url(../../assets/cursor-left.png), auto; }',
    ".b { background: url('../img/x.png'); }",
    '.c { mask: url("data:image/svg+xml,%3Csvg%3E"); }',
    '.d { background: url(https://example.test/y.png); }',
    '.e { background: url(/abs.png); }',
    '.f { filter: url(#efeito); }',
  ].join('\n'), 'pages');
  assert.equal(rewritten, 2);
  assert.match(css, /url\(\.\.\/assets\/cursor-left\.png\)/);
  assert.match(css, /url\('img\/x\.png'\)/);
  for (const kept of ['data:image/svg+xml', 'https://example.test/y.png', 'url(/abs.png)', 'url(#efeito)']) assert.ok(css.includes(kept), kept);
});

test('concatena na ordem do manifesto e recusa @import aninhado', () => {
  const files = { 'a.css': '.a{}', 'pages/b.css': '.b{background:url(../c.png)}' };
  const css = bundleCss((path) => files[path], '@import url("a.css");\n@import url("pages/b.css");');
  assert.ok(css.indexOf('.a{}') < css.indexOf('.b{'), 'ordem preservada');
  assert.match(css, /url\(c\.png\)/);
  assert.match(css, /ARQUIVO GERADO/);
  assert.throws(() => bundleCss(() => '@import url("x.css");', '@import url("a.css");'), /aninhado/);
});

test('css/app.css versionado está em sincronia com css/main.css', () => {
  assert.equal(readFileSync(OUTPUT, 'utf8'), generate(), 'rode npm run css:build');
});

test('as páginas carregam a folha única, não o manifesto com @import', () => {
  for (const page of ['index.html', 'auth.html', 'circle-translator.html', 'flash-cards.html', 'admin.html']) {
    const html = readFileSync(new URL(`../../public/${page}`, import.meta.url), 'utf8');
    assert.match(html, /href="css\/app\.css"/, page);
    assert.doesNotMatch(html, /href="css\/main\.css"/, page);
  }
});
