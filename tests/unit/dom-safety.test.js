/**
 * Endurecimento de `h()` (public/js/ui/dom.js): texto nunca vira código.
 * As funções testadas são puras; `h()` em si é exercitado por todos os E2E.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDangerousUrl, assertSafeAttribute } from '../../public/js/ui/dom.js';

test('URLs que executam código são perigosas, inclusive disfarçadas', () => {
  for (const url of ['javascript:alert(1)', 'JavaScript:alert(1)', ' javascript:x', '\u0001javascript:x', 'java\tscript:x',
    'java\nscript:x', 'vbscript:msgbox(1)', 'data:text/html,<script>alert(1)</script>', 'data:image/svg+xml,<svg onload=x>']) {
    assert.equal(isDangerousUrl(url), true, JSON.stringify(url));
  }
});

test('URLs comuns e imagens embutidas continuam permitidas', () => {
  for (const url of ['https://meet.example.test/sala', 'index.html', '?sala=abc', '#topo', '/assets/x.png', 'mailto:a@example.test',
    'https://wa.me/550000?text=oi', 'data:image/png;base64,iVBORw0KGgo=', 'javascript-guia.html']) {
    assert.equal(isDangerousUrl(url), false, url);
  }
});

test('manipulador de evento como texto é recusado', () => {
  assert.throws(() => assertSafeAttribute('onclick', 'alert(1)'), /precisa ser uma função/);
  assert.throws(() => assertSafeAttribute('ONERROR', 'x'), /precisa ser uma função/);
});

test('URL perigosa em atributo de URL é recusada; em outros atributos, não se aplica', () => {
  assert.throws(() => assertSafeAttribute('href', 'javascript:alert(1)'), /URL insegura/);
  assert.throws(() => assertSafeAttribute('src', 'data:text/html,x'), /URL insegura/);
  assert.throws(() => assertSafeAttribute('formaction', 'vbscript:x'), /URL insegura/);
  assert.doesNotThrow(() => assertSafeAttribute('href', 'https://example.test'));
  assert.doesNotThrow(() => assertSafeAttribute('aria-label', 'javascript: o livro'));
  assert.doesNotThrow(() => assertSafeAttribute('title', 'data: 21/11'));
});
