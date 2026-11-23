// Verificações estáticas determinísticas, sem rede, Firebase ou dependências npm.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findIconCandidates, FAMILIES } from './build-icons.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const publicRoot = join(repoRoot, 'public');
const entries = readdirSync(publicRoot).filter((file) => file.endsWith('.html'));
const missing = [];
const problems = [];
let references = 0;
let thirdParty = 0;

/**
 * Recursos de terceiros que podem ficar sem SRI (`integrity`), com o motivo.
 * O CSS do Google Fonts é gerado por navegador e muda sem aviso: não há hash fixo possível.
 * Todo o resto (script ou folha de estilo de outra origem) precisa de integrity + crossorigin.
 */
const SRI_EXEMPT_HOSTS = new Map([['fonts.googleapis.com', 'CSS dinâmico do Google Fonts']]);

for (const htmlName of entries) {
  const htmlPath = join(publicRoot, htmlName);
  const html = readFileSync(htmlPath, 'utf8');
  const urls = [
    ...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi),
    ...html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["']/gi),
  ];
  for (const match of urls) {
    const url = match[1];
    if (/^(?:https?:|data:|\/\/|#|mailto:)/i.test(url)) continue;
    const pathname = url.split(/[?#]/)[0];
    if (!pathname) continue;
    const base = pathname.startsWith('/') ? publicRoot : dirname(htmlPath);
    const target = resolve(base, pathname.replace(/^\//, ''));
    references++;
    if (!existsSync(target)) missing.push({ file: htmlName, target: pathname });
  }

  // main.css é só o manifesto (cadeia de @import); as páginas carregam a folha única gerada.
  if (/\bhref=["'](?:\.\/)?css\/main\.css["']/i.test(html)) {
    problems.push(`${htmlName}: carrega css/main.css (cadeia de @import); use css/app.css (npm run css:build)`);
  }

  // Scripts e folhas de estilo de outra origem: só com SRI (ou exceção justificada acima).
  const tags = [
    ...[...html.matchAll(/<script\b[^>]*>/gi)].map((m) => ({ tag: m[0], url: /\bsrc=["']([^"']+)["']/i.exec(m[0])?.[1] })),
    ...[...html.matchAll(/<link\b[^>]*>/gi)]
      .filter((m) => /\brel=["'](?:stylesheet|modulepreload|preload)["']/i.test(m[0]))
      .map((m) => ({ tag: m[0], url: /\bhref=["']([^"']+)["']/i.exec(m[0])?.[1] })),
  ];
  for (const { tag, url } of tags) {
    if (!url || !/^(?:https?:)?\/\//i.test(url)) continue;
    thirdParty++;
    const host = new URL(url, 'https://local.invalid').hostname;
    if (SRI_EXEMPT_HOSTS.has(host)) continue;
    if (!/\bintegrity=["']sha(?:256|384|512)-/i.test(tag) || !/\bcrossorigin=/i.test(tag)) {
      problems.push(`${htmlName}: recurso de terceiro sem SRI (integrity + crossorigin): ${url}`);
    }
  }
}

// Todo ícone referenciado no código precisa de regra em icons.css (pega também nome digitado errado).
const iconsCssPath = join(publicRoot, 'css', 'components', 'icons.css');
const iconsCss = existsSync(iconsCssPath) ? readFileSync(iconsCssPath, 'utf8') : '';
const sources = {};
const collect = (dir) => {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, item.name);
    if (item.isDirectory()) collect(file);
    else if (/\.(html|js)$/.test(file)) sources[relative(repoRoot, file).replaceAll('\\', '/')] = readFileSync(file, 'utf8');
  }
};
collect(publicRoot);
const candidates = findIconCandidates(sources);
let icons = 0;
for (const family of FAMILIES) {
  for (const name of candidates[family]) {
    icons++;
    if (!iconsCss.includes(`:where(.fa-${family}.fa-${name}) {`)) {
      problems.push(`ícone sem regra em css/components/icons.css: fa-${family} fa-${name} (rode npm run icons:build)`);
    }
  }
}

for (const filename of [
  'docs/firebase/database.rules.proposta.json',
  'docs/firebase/firebase.json.exemplo',
  'firebase.emulator.json',
  'package.json',
]) {
  JSON.parse(readFileSync(join(repoRoot, filename), 'utf8'));
}

if (missing.length || problems.length) {
  for (const item of missing) console.error('Referência local não encontrada:', item);
  for (const problem of problems) console.error(problem);
  process.exitCode = 1;
} else {
  console.log(`HTML: ${entries.length} páginas; ${references} referências locais conferidas; 0 ausentes.`);
  console.log(`Terceiros: ${thirdParty} scripts/folhas de estilo externos; todos com SRI ou exceção justificada.`);
  console.log(`Ícones: ${icons} referências com regra em icons.css.`);
  console.log('JSON de configuração e propostas: sintaxe válida.');
}
