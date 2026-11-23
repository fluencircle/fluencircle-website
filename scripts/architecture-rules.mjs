/**
 * @file Regras de arquitetura do frontend (funções PURAS, testadas em
 * tests/unit/architecture-rules.test.js e usadas por verify-architecture.mjs).
 *
 * Camadas de public/js e quem pode importar quem (o mesmo do README e do
 * diagrama de componentes em docs/diagramas/DIAGRAMAS.md):
 *
 *   pages ──► services ──► core ──► config
 *     │  └──► ui ─────────┘          ▲
 *     └─────► domain ◄── services    │
 *                         ui ────────┘
 *
 * - domain/ é puro: não importa nada;
 * - config/ só importa config/;
 * - core/ (SDK Firebase, papéis, navegação) só importa core/ e config/;
 * - services/ (único acesso a banco e backend) não conhece ui/ nem pages/;
 * - ui/ (componentes de tela) não acessa services/ nem pages/;
 * - pages/ orquestram tudo, e nada importa pages/ além delas mesmas.
 */

export const LAYERS = Object.freeze(['config', 'core', 'domain', 'services', 'ui', 'pages']);

export const ALLOWED_IMPORTS = Object.freeze({
  config: Object.freeze(['config']),
  core: Object.freeze(['core', 'config']),
  domain: Object.freeze([]),
  services: Object.freeze(['services', 'core', 'domain', 'config']),
  ui: Object.freeze(['ui', 'core', 'config']),
  pages: Object.freeze(['pages', 'services', 'domain', 'ui', 'core', 'config']),
});

/** Camadas que não podem tocar no DOM (assim continuam testáveis sem navegador). */
export const DOM_FREE_LAYERS = Object.freeze(['config', 'domain', 'services']);

const IMPORT_PATTERN = /^\s*(?:import|export)\s[^;]*?\sfrom\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;

/**
 * Troca comentários por espaços (mantendo as quebras de linha), respeitando
 * strings, template literals e expressões regulares. Assim `typeof import(...)`
 * em JSDoc não conta como dependência e `'https://...'` não vira comentário.
 */
export function stripComments(source) {
  let output = '';
  let i = 0;
  let lastSignificant = '';
  const blank = (text) => text.replace(/[^\n]/g, ' ');
  while (i < source.length) {
    const char = source[i];
    const next = source[i + 1];
    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      output += blank(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      output += blank(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      let j = i + 1;
      while (j < source.length && source[j] !== char) j += source[j] === '\\' ? 2 : 1;
      output += source.slice(i, j + 1);
      i = j + 1;
      lastSignificant = char;
      continue;
    }
    // Regex literal: "/" onde não pode haver divisão.
    if (char === '/' && (lastSignificant === '' || '(,=:[!&|?{};+-*%<>~^'.includes(lastSignificant))) {
      let j = i + 1;
      let inClass = false;
      while (j < source.length && source[j] !== '\n') {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === '[') inClass = true;
        else if (source[j] === ']') inClass = false;
        else if (source[j] === '/' && !inClass) break;
        j++;
      }
      output += source.slice(i, j + 1);
      i = j + 1;
      lastSignificant = '/';
      continue;
    }
    output += char;
    if (!/\s/.test(char)) lastSignificant = char;
    i++;
  }
  return output;
}

/** Especificadores importados por um módulo (estáticos, de reexportação e dinâmicos literais). */
export function parseImports(source) {
  const specifiers = [];
  for (const match of stripComments(source).matchAll(IMPORT_PATTERN)) specifiers.push(match[1] || match[2] || match[3]);
  return specifiers;
}

/** Resolve `./x.js` relativo a `from` (caminhos com "/" a partir de public/js). */
export function resolveRelative(from, specifier) {
  const parts = from.split('/').slice(0, -1);
  for (const segment of specifier.split('/')) {
    if (segment === '..') parts.pop();
    else if (segment !== '.' && segment !== '') parts.push(segment);
  }
  return parts.join('/');
}

export const layerOf = (modulePath) => modulePath.split('/')[0];

/**
 * Grafo de imports relativos entre módulos de public/js.
 * @param {Record<string, string>} sources caminho ("pages/x.js") → código
 * @returns {Record<string, string[]>}
 */
export function buildImportGraph(sources) {
  const graph = {};
  for (const [file, source] of Object.entries(sources)) {
    graph[file] = parseImports(source).filter((s) => s.startsWith('.')).map((s) => resolveRelative(file, s));
  }
  return graph;
}

/** Imports que violam a matriz de camadas ou apontam para módulos inexistentes. */
export function findLayerViolations(graph) {
  const problems = [];
  for (const [file, targets] of Object.entries(graph)) {
    const from = layerOf(file);
    if (!ALLOWED_IMPORTS[from]) {
      problems.push(`${file}: módulo fora das camadas conhecidas (${LAYERS.join(', ')})`);
      continue;
    }
    for (const target of targets) {
      if (!(target in graph)) problems.push(`${file}: importa módulo inexistente ${target}`);
      else if (!ALLOWED_IMPORTS[from].includes(layerOf(target))) problems.push(`${file}: ${from}/ não pode importar ${target}`);
    }
  }
  return problems;
}

/** Ciclos de import (cada ciclo listado uma vez, a partir do menor caminho). */
export function findCycles(graph) {
  const cycles = new Set();
  const state = {};
  const stack = [];
  const visit = (node) => {
    state[node] = 'visiting';
    stack.push(node);
    for (const next of graph[node] || []) {
      if (!(next in graph)) continue;
      if (state[next] === 'visiting') {
        const cycle = stack.slice(stack.indexOf(next));
        const start = cycle.indexOf([...cycle].sort()[0]);
        cycles.add([...cycle.slice(start), ...cycle.slice(0, start)].join(' → '));
      } else if (!state[next]) {
        visit(next);
      }
    }
    stack.pop();
    state[node] = 'done';
  };
  for (const node of Object.keys(graph).sort()) if (!state[node]) visit(node);
  return [...cycles].map((cycle) => `ciclo de import: ${cycle}`);
}

/** Uso de DOM em camadas que devem continuar puras ou sem interface. */
export function findDomAccess(sources) {
  const problems = [];
  for (const [file, source] of Object.entries(sources)) {
    if (!DOM_FREE_LAYERS.includes(layerOf(file))) continue;
    const code = stripComments(source);
    if (/\bdocument\s*\.|\bwindow\s*\.\s*document\b|\bHTMLElement\b/.test(code)) {
      problems.push(`${file}: ${layerOf(file)}/ não deve acessar o DOM`);
    }
  }
  return problems;
}
