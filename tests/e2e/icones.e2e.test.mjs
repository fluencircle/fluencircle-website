/**
 * E2E — ícones servidos pelo próprio site (css/components/icons.css), sem o CSS e
 * as fontes do cdnjs. Em cada página e papel: todo ícone `fa-*` do DOM resolve
 * para uma máscara SVG (classe sem regra seria pega aqui), os visíveis têm tamanho
 * e cor herdada, e nenhuma requisição sai para o cdnjs.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeBackend, launchBrowser, newContext, openPage, unexpectedErrors } from './support/harness.mjs';
import { ACTORS } from '../fixtures/synthetic-data.mjs';

const CASES = [
  { page: 'auth.html', as: null, ready: '#login-form' },
  { page: 'index.html', as: ACTORS.studentA, ready: '#student-agenda .week-slot' },
  { page: 'flash-cards.html', as: ACTORS.studentA, ready: '#sessions-grid .srs-meeting-card' },
  { page: 'presentation.html', as: ACTORS.mediatorA, ready: '#option-list .meeting-option' },
  { page: 'set-meeting.html', as: ACTORS.mediatorA, ready: '#themes-grid .manage-theme-card' },
  { page: 'manage-meetings.html', as: ACTORS.mediatorA, ready: '#manage-meetings-grid .manage-meeting-card' },
  { page: 'plans.html', as: ACTORS.admin, ready: '#week-agenda .week-slot' },
  { page: 'admin.html', as: ACTORS.admin, ready: '#users-table-body .user-name-cell' },
];

describe('E2E [Firebase simulado] ícones locais', () => {
  let browser;
  before(async () => { browser = await launchBrowser(); });
  after(async () => { await browser?.close(); });

  for (const { page: pagePath, as, ready } of CASES) {
    test(`${pagePath}${as ? ` (${as.role})` : ''}: todo ícone tem máscara SVG; nada vem do cdnjs`, async () => {
      const ctx = await newContext(browser, createFakeBackend());
      const { page, errors } = await openPage(ctx, pagePath, { as });
      await page.locator(ready).first().waitFor({ state: 'attached' });
      const icons = await page.evaluate(() => [...document.querySelectorAll('i.fa-solid, i.fa-regular, i.fa-brands')].map((el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        // offsetHeight ignora transform (há ícones girados); o retângulo só diz se aparece.
        return {
          classes: el.className,
          mask: style.maskImage || style.webkitMaskImage || '',
          visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden',
          height: el.offsetHeight,
          fontSize: parseFloat(style.fontSize),
          color: style.color,
          background: style.backgroundColor,
        };
      }));
      assert.ok(icons.length > 0, 'esperava ícones na página');
      for (const icon of icons) {
        assert.match(icon.mask, /data:image\/svg\+xml/, `sem máscara SVG: ${icon.classes}`);
        if (!icon.visible) continue;
        assert.ok(Math.abs(icon.height - icon.fontSize) <= 1, `altura deve ser 1em: ${icon.classes} (${icon.height} × ${icon.fontSize})`);
        assert.equal(icon.background, icon.color, `cor herdada (currentColor): ${icon.classes}`);
      }
      const requested = ctx.network.blocked.concat(ctx.network.missing);
      assert.ok(!requested.some((url) => url.includes('cdnjs')), JSON.stringify(requested));
      assert.deepEqual(ctx.network.missing, []);
      assert.deepEqual(unexpectedErrors(errors), []);
      await ctx.context.close();
    });
  }
});
