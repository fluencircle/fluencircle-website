/**
 * @file Gera `public/css/app.css`: a folha ÚNICA que as páginas carregam, a partir
 * do manifesto `public/css/main.css` (lista de @import na ordem da cascata).
 *
 *   npm run css:build   # depois de editar qualquer arquivo de public/css/
 *   npm run css:check   # CI (offline): falha se app.css estiver fora de sincronia
 *
 * Por quê (medido com scripts/benchmarks/page-performance.mjs, perfil móvel):
 * `main.css` com 20 @import obrigava o navegador a baixar main.css, só então
 * descobrir as outras 20 folhas — uma ida e volta a mais, bloqueando a primeira
 * pintura, e 21 requisições por página. A folha única cortou ~300 ms do FCP.
 *
 * Não há minificação nem transformação de CSS: só concatenação na mesma ordem e
 * ajuste de `url()` relativas (as partes ficam em subpastas; app.css fica em css/).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const CSS_DIR = join(ROOT, 'public', 'css');
export const SOURCE = join(CSS_DIR, 'main.css');
export const OUTPUT = join(CSS_DIR, 'app.css');

/** Caminhos dos @import do manifesto, na ordem. Só aceita `@import url("...")` relativo. */
export function parseManifest(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const imports = [...withoutComments.matchAll(/@import\s+url\(\s*["']?([^"')]+)["']?\s*\)\s*;/g)].map((m) => m[1]);
  const leftover = withoutComments.replace(/@import\s+url\([^)]*\)\s*;/g, '').trim();
  if (leftover) throw new Error('main.css deve conter só @import url("..."); mova as regras para um arquivo da pasta certa.');
  for (const path of imports) {
    if (/^(?:[a-z]+:|\/)/i.test(path)) throw new Error(`@import não relativo em main.css: ${path}`);
  }
  return imports;
}

/**
 * Reescreve `url()` relativas de uma folha que vai mudar de pasta.
 * Mantém: data:, http(s):, //host, caminhos absolutos (/x) e fragmentos (#x).
 * @param {string} css conteúdo
 * @param {string} fromDir pasta original (relativa a css/, com "/")
 * @returns {{ css: string, rewritten: number }}
 */
export function rebaseUrls(css, fromDir) {
  let rewritten = 0;
  const out = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, quote, url) => {
    if (/^(?:[a-z]+:|\/|#)/i.test(url.trim())) return match;
    rewritten++;
    const rebased = posix.normalize(posix.join(fromDir, url.trim()));
    return `url(${quote}${rebased}${quote})`;
  });
  return { css: out, rewritten };
}

/**
 * Concatena as partes na ordem do manifesto.
 * @param {(path: string) => string} readPart lê um arquivo relativo a css/
 * @param {string} manifest conteúdo de main.css
 */
export function bundleCss(readPart, manifest) {
  const parts = parseManifest(manifest);
  const sections = parts.map((path) => {
    const source = readPart(path);
    if (/@import\b/.test(source.replace(/\/\*[\s\S]*?\*\//g, ''))) throw new Error(`@import aninhado não suportado: ${path}`);
    const { css } = rebaseUrls(source, posix.dirname(path));
    return `/* ===== ${path} ===== */\n${css.trimEnd()}\n`;
  });
  const header = [
    '/*',
    ' * ARQUIVO GERADO por scripts/build-css.mjs a partir de css/main.css — não edite à mão.',
    ' * Edite os arquivos de css/ e rode `npm run css:build` (a CI confere com `npm run css:check`).',
    ` * ${parts.length} folhas, na ordem da cascata de main.css.`,
    ' */',
    '',
  ].join('\n');
  return `${header}${sections.join('\n')}`;
}

export function generate() {
  return bundleCss((path) => readFileSync(join(CSS_DIR, path), 'utf8'), readFileSync(SOURCE, 'utf8'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const css = generate();
    if (process.argv.includes('--check')) {
      const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8') : '';
      if (current !== css) {
        console.error('css/app.css fora de sincronia com css/main.css e suas partes. Rode `npm run css:build` e versione o resultado.');
        process.exitCode = 1;
      } else {
        console.log('CSS: app.css em sincronia com main.css.');
      }
    } else {
      writeFileSync(OUTPUT, css);
      console.log(`CSS: ${relative(ROOT, OUTPUT)} gerado (${Buffer.byteLength(css)} bytes, a partir de ${relative(ROOT, dirname(SOURCE))}/main.css).`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
