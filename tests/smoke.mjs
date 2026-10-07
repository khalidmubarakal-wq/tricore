// End-to-end smoke test: loads the app in headless Chromium with Supabase
// stubbed, and walks the landing page, auth screen, dashboard and team panel.
// Usage: npm test        (requires `npm install`; uses Playwright's Chromium)
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from '../scripts/serve.mjs';

const USER_ID = '00000000-0000-0000-0000-000000000001';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = `${b64({ alg: 'HS256' })}.${b64({ sub: USER_ID, email: 'demo@example.com', exp: 4102444800, user_metadata: { full_name: 'Demo User', role: 'pm' } })}.sig`;
const AUTH_USER = { id: USER_ID, email: 'demo@example.com', user_metadata: { full_name: 'Demo User', role: 'pm' } };
const EVIL_NAME = '<img src=x onerror="window.__pwned=1">';
const SEED = {
  projects: [{ id: 'PRJ-1', code: 'PRJ-001', name: 'Alpha Rollout', owner: 'Demo User', status: 'inProgress', priority: 'high',
    start: '2026-01-01', end: '2026-12-31', budget: 500000, _isOwner: true,
    _members: [{ id: 'm1', project_id: 'PRJ-1', user_id: 'u2', role: 'member', name: EVIL_NAME, load: 3 }] }],
  wbs: [
    { id: 'w1', pid: 'PRJ-1', par: null, code: '1', name: 'Alpha Rollout', type: 'summary', ps: '2026-01-01', pe: '2026-12-31', bac: 500000, ac: 0, pct: 0, deps: [] },
    { id: 'w2', pid: 'PRJ-1', par: 'w1', code: '1.1', name: 'Design', type: 'workpackage', ps: '2026-01-01', pe: '2026-03-01', bac: 200000, ac: 100000, pct: 60, deps: [] },
  ],
  baselines: [], claims: [], risks: [], changeRequests: [],
  profile: { name: 'Demo User', email: 'demo@example.com', role: 'pm', avatarMode: 'initial' },
};

const server = createServer().listen(0);
const BASE = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
let failed = false;

async function scenario(name, fn, { signedIn = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  // No external network: fonts/icons are optional, Supabase is stubbed.
  await ctx.route(/fonts\.googleapis|fonts\.gstatic|cdnjs/, (r) => r.abort());
  await ctx.route(/supabase\.co/, (r) => {
    const { method } = r.request(), url = r.request().url();
    if (url.includes('/auth/v1/user')) return r.fulfill({ json: AUTH_USER });
    return r.fulfill({ status: 200, contentType: 'application/json', body: method === 'GET' ? '[]' : '' });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (signedIn) {
    await page.addInitScript(([token, user, seed]) => {
      if (sessionStorage.getItem('__seeded')) return;
      sessionStorage.setItem('__seeded', '1');
      sessionStorage.setItem('tc_active', '1');
      localStorage.setItem('sb-bfgnwnrxlljkwkzzucza-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', user }));
      localStorage.setItem(`tc_user_data_${user.id}`, JSON.stringify(seed));
    }, [JWT, AUTH_USER, SEED]);
  }
  try {
    await fn(page);
    assert.deepEqual(errors, [], 'uncaught page errors');
    console.log(`✓ ${name}`);
  } catch (e) {
    failed = true;
    console.error(`✗ ${name}\n  ${e.message.split('\n').join('\n  ')}`);
  } finally {
    await ctx.close();
  }
}

await scenario('landing → beta popup → sign-in screen', async (page) => {
  await page.goto(BASE);
  await page.waitForSelector('#tc-beta-overlay', { state: 'visible' });
  await page.check('#tc-beta-cb');
  await page.click('#tc-beta-accept-btn');
  await page.waitForSelector('#tc-beta-overlay', { state: 'hidden' });
  assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
  await page.click('#lp-lang-btn');
  assert.equal(await page.getAttribute('html', 'dir'), 'ltr');
  await page.click('#lp-login-btn');
  await page.waitForSelector('.auth-bg input[type="email"]');
  await page.waitForSelector('#tc-lp', { state: 'hidden' });
});

await scenario('signed-in tab restores the dashboard and survives reload', async (page) => {
  await page.goto(BASE);
  await page.waitForSelector('.sidebar');
  assert.equal(await page.isVisible('#tc-lp'), false, 'landing page hidden');
  await page.reload();
  await page.waitForSelector('.sidebar');
  assert.equal(await page.evaluate(() => window.tricoreCurrentUser()?.userId), USER_ID);
}, { signedIn: true });

await scenario('team panel: join modal, escaped member names', async (page) => {
  await page.goto(BASE);
  await page.waitForSelector('.nav-item');
  await (await page.$$('.nav-item'))[1].click();
  await page.click('text=Alpha Rollout');
  await page.click('#tc-team-tab');
  await page.waitForSelector('#tc-team-panel');
  await page.click('#tc-team-panel .tc-tab >> nth=1');
  await page.click('#tc-tab-members button.btn-p');
  await page.waitForSelector('#tc-join-modal');
  assert.equal(await page.evaluate(() => window.__pwned), undefined, 'member name must not execute as HTML');
  assert.ok(await page.evaluate((n) => document.getElementById('tc-team-panel').textContent.includes(n), EVIL_NAME));
}, { signedIn: true });

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
