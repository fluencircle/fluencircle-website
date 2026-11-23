/**
 * @file Checagem offline de invariantes de arquitetura e sinks HTML.
 *
 * Verifica, em public/js:
 * - sinks HTML (innerHTML, outerHTML, insertAdjacentHTML, document.write);
 * - SDK do Firebase por CDN só em core/ e caminhos do banco só em services/;
 * - matriz de camadas (quem pode importar quem), imports quebrados e ciclos;
 * - ausência de DOM em domain/, services/ e config/.
 * As regras de camadas estão em scripts/architecture-rules.mjs (testadas).
 *
 * Defesa regressiva básica: não substitui análise por AST, Firebase Rules
 * Emulator, testes de DOM nem a revisão humana de segurança.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildImportGraph, findLayerViolations, findCycles, findDomAccess } from './architecture-rules.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const jsRoot = join(root, 'public', 'js');
const problems = [];
const sources = {};

function collect(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, item.name);
    if (item.isDirectory()) { collect(file); continue; }
    if (!item.isFile() || !file.endsWith('.js')) continue;
    sources[relative(jsRoot, file).replaceAll('\\', '/')] = readFileSync(file, 'utf8');
  }
}

collect(jsRoot);

for (const [name, source] of Object.entries(sources)) {
  // Dados externos devem ser exibidos com h()/textContent, não HTML cru.
  if (/\.\s*(?:innerHTML|outerHTML)\s*=(?!=)/.test(source) ||
      /\.\s*insertAdjacentHTML\s*\(/.test(source) ||
      /\bdocument\s*\.\s*write\s*\(/.test(source)) {
    problems.push(`${name}: sink HTML exige auditoria`);
  }
  if (name.startsWith('domain/') && /^\s*import\s/m.test(source)) {
    problems.push(`${name}: domain/ não deve importar módulos`);
  }
  if (!name.startsWith('core/') && source.includes('https://www.gstatic.com/firebasejs/')) {
    problems.push(`${name}: SDK Firebase CDN fora de core/`);
  }
  if (!name.startsWith('services/') && source.includes('db-paths.js')) {
    problems.push(`${name}: caminhos RTDB fora de services/`);
  }
}

const graph = buildImportGraph(sources);
problems.push(...findLayerViolations(graph), ...findCycles(graph), ...findDomAccess(sources));

const count = Object.keys(sources).length;
const edges = Object.values(graph).reduce((total, targets) => total + targets.length, 0);
if (problems.length) {
  for (const problem of problems) console.error(problem);
  process.exitCode = 1;
} else {
  console.log(`Arquitetura: ${count} módulos JS e ${edges} imports verificados (camadas, ciclos, DOM e sinks); 0 violações.`);
}
