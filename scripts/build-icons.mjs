/**
 * @file Gera `public/css/components/icons.css`: os ícones do Font Awesome
 * Free que o site USA, como máscaras SVG embutidas, no lugar do CSS de 100 KiB
 * e das fontes de ícone baixados do cdnjs em toda página.
 *
 *   npm run icons:build    # regenera a partir de node_modules/@fortawesome/fontawesome-free
 *   npm run icons:check    # CI: falha se o CSS estiver fora de sincronia com o uso
 *
 * A marcação continua a mesma (`<i class="fa-solid fa-trash">` e `icon('fa-trash')`):
 * cada classe vira uma caixa de 1em de altura, com a largura proporcional ao
 * desenho (como a fonte original), pintada com `currentColor`. Os seletores usam
 * `:where()` (especificidade zero) para que o CSS das páginas prevaleça, como antes.
 *
 * Licença dos ícones: CC BY 4.0 (Fonticons, Inc.) — a atribuição vai no topo do
 * CSS gerado. Ver docs/operacao/DEPENDENCIAS.md.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const OUTPUT = join(ROOT, 'public', 'css', 'components', 'icons.css');
export const PACKAGE_DIR = join(ROOT, 'node_modules', '@fortawesome', 'fontawesome-free');

export const FAMILIES = Object.freeze(['solid', 'regular', 'brands']);
/** Classes do Font Awesome que não são ícones (tamanho, animação, família). */
const NON_ICON = new Set(['fa-solid', 'fa-regular', 'fa-brands', 'fa-fw', 'fa-spin', 'fa-pulse', 'fa-lg', 'fa-sm', 'fa-xs',
  'fa-2x', 'fa-3x', 'fa-4x', 'fa-5x', 'fa-border', 'fa-inverse', 'fa-stack', 'fa-li', 'fa-ul']);

/**
 * Ícones referenciados no código, por família (sem consultar o pacote).
 * Reconhece: classes em HTML/JS (`fa-solid fa-x`), o atalho `icon('fa-x', 'regular')`
 * e nomes soltos em strings JS (`{ icon: 'fa-house' }`, `planActionButton('fa-pen', ...)`),
 * que o `icon()` desenha como sólidos.
 *
 * @param {Record<string, string>} files caminho → conteúdo (HTML e JS)
 * @returns {Record<string, string[]>} família → nomes (sem o prefixo fa-), ordenados
 */
export function findIconCandidates(files) {
  return findUsedIcons(files, () => true);
}

/**
 * Ícones usados que existem no pacote (o gerador ignora nomes que não são ícones).
 * @param {Record<string, string>} files caminho → conteúdo (HTML e JS)
 * @param {(family: string, name: string) => boolean} exists o ícone existe no pacote?
 * @returns {Record<string, string[]>} família → nomes (sem o prefixo fa-), ordenados
 */
export function findUsedIcons(files, exists) {
  const used = { solid: new Set(), regular: new Set(), brands: new Set() };
  const add = (family, name) => {
    if (!NON_ICON.has(`fa-${name}`) && exists(family, name)) used[family].add(name);
  };
  for (const [file, source] of Object.entries(files)) {
    for (const match of source.matchAll(/\bfa-(solid|regular|brands)\s+((?:fa-[a-z0-9-]+\s*)+)/g)) {
      for (const token of match[2].trim().split(/\s+/)) add(match[1], token.replace(/^fa-/, ''));
    }
    for (const match of source.matchAll(/\bicon\(\s*['"]fa-([a-z0-9-]+)['"]\s*(?:,\s*['"](solid|regular|brands)['"]\s*)?\)/g)) {
      add(match[2] || 'solid', match[1]);
    }
    if (file.endsWith('.js')) {
      // Nomes passados por variável (menu, botões de ação): o icon() usa a família sólida por padrão.
      for (const match of source.matchAll(/['"]fa-([a-z0-9-]+)['"]/g)) {
        if (!FAMILIES.includes(match[1])) add('solid', match[1]);
      }
    }
  }
  return Object.fromEntries(FAMILIES.map((family) => [family, [...used[family]].sort()]));
}

/** Converte um SVG do pacote numa URL `data:` curta e segura para CSS. */
export function svgToDataUrl(svg) {
  const clean = svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/"/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  const encoded = clean.replace(/%/g, '%25').replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E');
  return `url("data:image/svg+xml,${encoded}")`;
}

/** Largura do ícone em `em`, a partir do viewBox (a altura do desenho é 1em). */
export function widthFromViewBox(svg) {
  const match = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  if (!match) throw new Error('SVG sem viewBox "0 0 L A".');
  return Number((Number(match[1]) / Number(match[2])).toFixed(4));
}

/**
 * Monta o CSS final.
 * @param {Record<string, string[]>} used
 * @param {(family: string, name: string) => string} readSvg
 * @param {string} version versão do pacote de origem
 */
export function buildIconsCss(used, readSvg, version) {
  const total = FAMILIES.reduce((sum, family) => sum + used[family].length, 0);
  const lines = [
    '/*',
    ' * ARQUIVO GERADO por scripts/build-icons.mjs — não edite à mão (npm run icons:build).',
    ` * Ícones: Font Awesome Free ${version} by @fontawesome — https://fontawesome.com`,
    ' * License: https://fontawesome.com/license/free (Icons: CC BY 4.0) Copyright 2023 Fonticons, Inc.',
    ` * ${total} ícones usados pelo site, como máscaras SVG: herdam a cor (currentColor) e o tamanho (font-size).`,
    ' */',
    // :where() zera a especificidade: o CSS das páginas (ex.: largura fixa no menu lateral)
    // continua mandando, como mandava com a fonte do Font Awesome.
    ':where(.fa-solid, .fa-regular, .fa-brands) {',
    '  display: inline-block;',
    '  width: 1em;',
    '  height: 1em;',
    '  vertical-align: -0.125em;',
    '  flex-shrink: 0;',
    '  font-style: normal;',
    '  background-color: currentColor;',
    // Sem --fc-icon (classe sem regra), a máscara transparente não pinta nada — nunca um quadrado.
    '  -webkit-mask: var(--fc-icon, linear-gradient(transparent, transparent)) center / contain no-repeat;',
    '  mask: var(--fc-icon, linear-gradient(transparent, transparent)) center / contain no-repeat;',
    '}',
    '/* Navegador sem máscara CSS: melhor nenhum ícone (são decorativos) do que um quadrado. */',
    '@supports not ((-webkit-mask-image: none) or (mask-image: none)) {',
    '  :where(.fa-solid, .fa-regular, .fa-brands) { background: none; }',
    '}',
  ];
  for (const family of FAMILIES) {
    for (const name of used[family]) {
      const svg = readSvg(family, name);
      lines.push(`:where(.fa-${family}.fa-${name}) { width: ${widthFromViewBox(svg)}em; --fc-icon: ${svgToDataUrl(svg)}; }`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function collectSources() {
  const files = {};
  const walk = (dir) => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, item.name);
      if (item.isDirectory()) walk(file);
      else if (/\.(html|js)$/.test(file)) files[relative(ROOT, file).replaceAll('\\', '/')] = readFileSync(file, 'utf8');
    }
  };
  walk(join(ROOT, 'public'));
  return files;
}

/** Gera o CSS a partir do pacote instalado (`npm ci`). */
export function generate() {
  if (!existsSync(PACKAGE_DIR)) throw new Error('Pacote @fortawesome/fontawesome-free ausente: rode `npm ci`.');
  const { version } = JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8'));
  const svgPath = (family, name) => join(PACKAGE_DIR, 'svgs', family, `${name}.svg`);
  const used = findUsedIcons(collectSources(), (family, name) => existsSync(svgPath(family, name)));
  return buildIconsCss(used, (family, name) => readFileSync(svgPath(family, name), 'utf8'), version);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const css = generate();
    if (process.argv.includes('--check')) {
      const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8') : '';
      if (current !== css) {
        console.error('icons.css fora de sincronia com os ícones usados. Rode `npm run icons:build` e versione o resultado.');
        process.exitCode = 1;
      } else {
        console.log('Ícones: icons.css em sincronia com o uso em public/.');
      }
    } else {
      writeFileSync(OUTPUT, css);
      console.log(`Ícones: ${relative(ROOT, OUTPUT)} gerado (${Buffer.byteLength(css)} bytes).`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
