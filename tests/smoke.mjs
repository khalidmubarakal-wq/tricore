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

/**
 * Run one scenario in a fresh browser context. `supabase(route, path, method)`
 * may answer a Supabase request itself (return true); everything else gets
 * the default stub. Every Supabase call is recorded in `calls`.
 */
async function scenario(name, fn, { signedIn = false, betaAccepted = false, supabase = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  // No external network: fonts/icons are optional, Supabase is stubbed.
  await ctx.route(/fonts\.googleapis|fonts\.gstatic|cdnjs/, (r) => r.abort());
  const calls = [];
  await ctx.route(/supabase\.co/, async (r) => {
    const method = r.request().method(), path = new URL(r.request().url()).pathname;
    calls.push({ method, path, body: r.request().postDataJSON?.() ?? null });
    if (supabase && (await supabase(r, path, method))) return;
    if (path === '/auth/v1/user') return r.fulfill({ json: AUTH_USER });
    return r.fulfill({ status: 200, contentType: 'application/json', body: method === 'GET' ? '[]' : '' });
  });
  const page = await ctx.newPage();
  if (betaAccepted) await page.addInitScript(() => sessionStorage.setItem('tc_beta_accepted', '1'));
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
    await fn(page, calls);
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

// ── Email one-time codes ─────────────────────────────────────────────
const SESSION = { access_token: JWT, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, user: AUTH_USER };
const CODE = '482916';
const verifyStub = (type) => (r, path) => {
  if (path !== '/auth/v1/verify') return false;
  const body = r.request().postDataJSON();
  const ok = body.token === CODE && body.type === type && body.email === AUTH_USER.email;
  r.fulfill(ok ? { json: SESSION } : { status: 403, json: { msg: 'Token has expired or is invalid' } });
  return true;
};
async function openAuth(page) {
  await page.goto(BASE);
  await page.click('#lp-login-btn');
  await page.waitForSelector('.auth-bg input[type="email"]');
}
async function typeCode(page, code) {
  await page.click('#tc-otp .tc-otp-cell >> nth=0');
  await page.keyboard.type(code);
}

await scenario('sign-up asks for the emailed code, then signs in', async (page, calls) => {
  await openAuth(page);
  await page.click('.auth-tab >> nth=1');
  await page.fill('input[autocomplete="name"]', 'Demo User');
  await page.fill('.auth-bg input[type="email"]', AUTH_USER.email);
  const pw = page.locator('.auth-bg input[type="password"]');
  await pw.nth(0).fill('Sup3rSecret!');
  await pw.nth(1).fill('Sup3rSecret!');
  await page.click('.auth-bg button[type="submit"]');
  await page.waitForSelector('#tc-otp');
  await typeCode(page, '111111'); // wrong code → error, stays open
  await page.waitForSelector('#tc-otp .tc-otp-err:not(:empty)');
  await typeCode(page, CODE); // auto-submits when complete
  await page.waitForSelector('.sidebar', { timeout: 15000 });
  const verify = calls.filter((c) => c.path === '/auth/v1/verify').map((c) => c.body);
  assert.deepEqual(verify.at(-1), { email: AUTH_USER.email, token: CODE, type: 'signup' });
}, {
  betaAccepted: true,
  supabase: (r, path) => {
    if (path === '/auth/v1/signup') { r.fulfill({ json: { ...AUTH_USER, confirmation_sent_at: new Date().toISOString() } }); return true; }
    return verifyStub('signup')(r, path);
  },
});

await scenario('signing in before verifying re-sends the code', async (page, calls) => {
  await openAuth(page);
  await page.fill('.auth-bg input[type="email"]', AUTH_USER.email);
  await page.fill('.auth-bg input[type="password"]', 'Sup3rSecret!');
  await page.click('.auth-bg button[type="submit"]');
  await page.waitForSelector('#tc-otp');
  await page.waitForFunction(() => document.querySelector('#tc-otp .tc-otp-info')?.textContent);
  assert.ok(calls.some((c) => c.path === '/auth/v1/resend' && c.body?.type === 'signup'), 'resend requested');
}, {
  betaAccepted: true,
  supabase: (r, path) => {
    if (path !== '/auth/v1/token') return false;
    r.fulfill({ status: 400, json: { error: 'invalid_grant', error_description: 'Email not confirmed' } });
    return true;
  },
});

await scenario('forgot password: code + new password signs in', async (page, calls) => {
  await openAuth(page);
  await page.click('text=Reset it');
  await page.fill('.auth-bg input[type="email"]', AUTH_USER.email);
  await page.click('.auth-bg button[type="submit"]');
  await page.waitForSelector('#tc-otp');
  await typeCode(page, CODE);
  const pw = page.locator('#tc-otp input[type="password"]');
  await pw.nth(0).fill('N3wPassword!');
  await pw.nth(1).fill('mismatch');
  await page.click('#tc-otp button[type="submit"]');
  await page.waitForSelector('#tc-otp .tc-otp-err:not(:empty)'); // mismatch caught locally
  await typeCode(page, CODE);
  await pw.nth(1).fill('N3wPassword!');
  await page.click('#tc-otp button[type="submit"]');
  await page.waitForSelector('.sidebar', { timeout: 15000 });
  assert.ok(calls.some((c) => c.path === '/auth/v1/recover'), 'reset email requested');
  const update = calls.find((c) => c.path === '/auth/v1/user' && c.method === 'PUT');
  assert.deepEqual(update?.body, { password: 'N3wPassword!' });
}, { betaAccepted: true, supabase: verifyStub('recovery') });

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
