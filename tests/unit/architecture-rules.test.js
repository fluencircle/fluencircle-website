/**
 * Regras de arquitetura (scripts/architecture-rules.mjs): cada verificação é
 * conferida com uma violação INJETADA, para provar que ela de fato detecta o
 * problema — e com o código real, que precisa passar limpo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseImports, stripComments, resolveRelative, buildImportGraph, findLayerViolations, findCycles, findDomAccess, ALLOWED_IMPORTS,
} from '../../scripts/architecture-rules.mjs';

const JS_ROOT = fileURLToPath(new URL('../../public/js', import.meta.url));

function realSources() {
  const sources = {};
  const walk = (dir) => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, item.name);
      if (item.isDirectory()) walk(file);
      else if (file.endsWith('.js')) sources[relative(JS_ROOT, file).replaceAll('\\', '/')] = readFileSync(file, 'utf8');
    }
  };
  walk(JS_ROOT);
  return sources;
}

test('lê imports estáticos, reexportações, imports só de efeito e dinâmicos literais', () => {
  const source = [
    "import { a } from './a.js';",
    "import b, { c } from '../core/b.js';",
    "export { d } from './d.js';",
    "import './efeito.js';",
    "const m = await import('./dinamico.js');",
    "import { x } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';",
  ].join('\n');
  assert.deepEqual(parseImports(source), ['./a.js', '../core/b.js', './d.js', './efeito.js', './dinamico.js',
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js']);
});

test('ignora import() em comentário JSDoc, mas não confunde URL em string com comentário', () => {
  const source = [
    '/** @param {ReturnType<typeof import(\'../domain/plans.js\').x>} item */',
    "// import { y } from './comentado.js';",
    "import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';",
    "const re = /^https:\\/\\/[a-z]+$/; const s = 'a // não é comentário';",
    "import { z } from './real.js';",
  ].join('\n');
  assert.deepEqual(parseImports(source), ['https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js', './real.js']);
  assert.ok(stripComments(source).includes("'a // não é comentário'"));
  assert.equal(stripComments(source).split('\n').length, 5, 'mantém as linhas');
});

test('resolve caminhos relativos a partir de public/js', () => {
  assert.equal(resolveRelative('pages/presentation/slides.js', '../../ui/dom.js'), 'ui/dom.js');
  assert.equal(resolveRelative('services/a.js', './db-paths.js'), 'services/db-paths.js');
});

test('o código real respeita camadas, não tem ciclos nem DOM fora de lugar', () => {
  const sources = realSources();
  const graph = buildImportGraph(sources);
  assert.deepEqual(findLayerViolations(graph), []);
  assert.deepEqual(findCycles(graph), []);
  assert.deepEqual(findDomAccess(sources), []);
  assert.ok(Object.keys(graph).length >= 50, 'esperava encontrar os módulos de public/js');
});

test('detecta import "para cima" (serviço importando interface)', () => {
  const graph = buildImportGraph({
    'services/x.service.js': "import { showToast } from '../ui/toast.js';",
    'ui/toast.js': '',
  });
  assert.deepEqual(findLayerViolations(graph), ['services/x.service.js: services/ não pode importar ui/toast.js']);
});

test('detecta interface acessando o banco e qualquer camada importando pages/', () => {
  const graph = buildImportGraph({
    'ui/widget.js': "import { listThemes } from '../services/themes.service.js';",
    'core/x.js': "import '../pages/home.page.js';",
    'services/themes.service.js': '',
    'pages/home.page.js': '',
  });
  const problems = findLayerViolations(graph);
  assert.ok(problems.includes('ui/widget.js: ui/ não pode importar services/themes.service.js'));
  assert.ok(problems.includes('core/x.js: core/ não pode importar pages/home.page.js'));
});

test('detecta import de módulo inexistente e camada desconhecida', () => {
  const problems = findLayerViolations(buildImportGraph({
    'pages/a.js': "import './nao-existe.js';",
    'misc/b.js': '',
  }));
  assert.ok(problems.includes('pages/a.js: importa módulo inexistente pages/nao-existe.js'));
  assert.ok(problems.some((p) => p.startsWith('misc/b.js: módulo fora das camadas')));
});

test('detecta ciclos de import e os relata uma única vez', () => {
  const graph = buildImportGraph({
    'services/a.js': "import './b.js';",
    'services/b.js': "import './c.js';",
    'services/c.js': "import './a.js';",
    'services/d.js': "import './a.js';",
  });
  assert.deepEqual(findCycles(graph), ['ciclo de import: services/a.js → services/b.js → services/c.js']);
});

test('detecta DOM em services/ e domain/, mas ignora comentários', () => {
  const problems = findDomAccess({
    'services/s.js': 'export const x = () => document.getElementById("a");',
    'domain/d.js': '/* document.querySelector em comentário */ export const y = 1; // document.title',
    'ui/u.js': 'document.body.append(1);',
  });
  assert.deepEqual(problems, ['services/s.js: services/ não deve acessar o DOM']);
});

test('domain/ não pode importar nada', () => {
  assert.deepEqual(ALLOWED_IMPORTS.domain, []);
  const graph = buildImportGraph({ 'domain/a.js': "import './b.js';", 'domain/b.js': '' });
  assert.deepEqual(findLayerViolations(graph), ['domain/a.js: domain/ não pode importar domain/b.js']);
});
