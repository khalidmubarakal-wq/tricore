# TriCore architecture

TriCore is a static front-end: one HTML page plus assets, backed by Supabase
(Auth, PostgREST, Storage). There is no build step. The React application ships
as a **pre-compiled bundle** (`assets/js/vendor/tricore-app.bundle.js`; its
source is not in this repository). Everything else is hand-written code that
wraps that bundle: the landing page, the Supabase layer, i18n and DOM-level
feature add-ons.

## Layout

```
index.html                     page shell: markup + ordered <script>/<link> tags
assets/
  img/                         logo.png (light bg), logo-on-dark.png, logo-mark.png, favicon.svg
  css/
    base.css                   document base + boot splash (in <head>)
    team-panel.css             team governance panel (in <head>)
    landing.css                landing page (#tc-lp)
    enterprise-ui.css          design-system overrides of the bundle's styles
    rtl.css / ltr-overrides.css  Arabic RTL layout / English LTR corrections
    beta-popup.css, team-upgrade.css, otp-dialog.css
  js/
    config.js                  window.TC_CONFIG: Supabase URL/key, storage keys
    bootstrap/
      session-guard.js         restore/clear the session before anything renders
      zl-proxy.js              queue bundle saves made before core/ is ready
      boot-screen.js           hide the splash once React mounts
    landing/landing.js         landing page interactions, tcEnterApp()
    domain/project-tools.js    window.TriCoreProjectTools: project/WBS templates
    vendor/tricore-app.bundle.js   compiled React app (do not edit by hand)
    core/                      ES modules, entry point main.js
      config.js                ES view of TC_CONFIG + cache helpers
      supabase.js              fetch-based Supabase client + token helpers
      mappers.js               app record ⇄ DB row field mapping
      data-sync.js             fetchFromDB / debounced syncToDB / deletions
      session.js               session state, landing visibility, profiles
      auth.js                  sign in/up/out, OTP verification, password reset, restore
      otp-dialog.js            email one-time-code dialog (sign-up / password reset)
      team-api.js              join project / remove member / toggle joining
      zl-bridge.js             window.Zl adapter + auth form interception
      team-panel.js            Team tab: RACI, members, heatmap, audit
      claim-attachments.js     invoice upload on the claim modal
      animation-fix.js         clear stacking contexts after animations
      dom.js                   escapeHtml, jsArg, toast, avatar helpers
    ui/                        ui-enhance, logo-handlers, beta-popup, team-upgrade-v4
    i18n/                      app-translator (EN→AR runtime), lang-switch (AR/EN toggle)
```

## Load order

Script order in `index.html` is significant:

1. **`<head>`**: `config.js`, then `session-guard.js`. If this tab has a
   live session (sessionStorage `tc_active` plus a stored Supabase token), the
   guard writes `tc_session` for the bundle and adds `html.tc-session-active`,
   which hides the landing page before it is painted.
2. **Landing page** markup and `landing.js`.
3. **Before the bundle**: `project-tools.js` (used by the bundle),
   `zl-proxy.js` (must intercept the bundle's `window.Zl = …` assignment)
   and `boot-screen.js`.
4. **The React bundle** renders into `#root`. It also renders its own `<style>`
   inside `#root`.
5. **`core/main.js`** (module, deferred until parsing ends) installs the
   Supabase-backed `window.Zl`, drains queued saves and validates the session.
6. **Override stylesheets** (`enterprise-ui`, `rtl`, `ltr-overrides`) are
   linked *after* `#root`, so they win the cascade over the bundle's `<style>`.
   Do not move them into `<head>`.
7. DOM enhancements, i18n, beta popup and the team v4 upgrade.

## The bundle contract (`window.Zl`)

The bundle reads and writes everything through a synchronous store,
`window.Zl`: `login`, `register`, `logout`, `session`, `getUserById`,
`getUserData`, `saveUserData`, `updateProfile`, `updatePassword`,
`requestPasswordReset`, `setNewPassword`. `core/zl-bridge.js` provides it:

- **Auth**: the auth forms are intercepted at `submit` (capture phase), so the
  real async request starts at once. `Zl.login()` reports "Signing in…" until
  the result is ready. A successful sign-in reloads the page and the session
  guard restores the session synchronously.
- **Data**: `saveUserData` writes the local cache (`tc_user_data_<id>`),
  tracks deletions and, once the user is *hydrated*, schedules a debounced
  upsert to Supabase. Only rows of projects the user owns are written, as
  required by RLS.

## Storage keys

All keys are defined in `assets/js/config.js`. The bundle has the session and
data keys compiled in, so keep them stable.

| Key | Store | Purpose |
| --- | --- | --- |
| `sb-<ref>-auth-token` | local | Supabase access/refresh token + user |
| `tc_session` | local | session object the bundle reads on first render |
| `tc_user_data_<userId>` | local | workspace cache |
| `tc_lang` | local | `ar` / `en` |
| `tc_active` | session | this tab is signed in (cleared when the tab closes) |
| `tc_beta_accepted` | session | beta warning accepted |

## Known limitations

- The React source is not in the repo, so behaviour inside the bundle can only
  be adjusted from the outside (DOM observers, CSS overrides, the `Zl` adapter).
- Join codes: the team panel shows `join_code || code`, but `join_code` is not
  part of the field mappers, and regenerating a code only updates the local
  cache. Joining by code needs the `projects.join_code` column populated
  server-side.
- Claim attachments are uploaded, but the bundle does not store the returned
  path on the claim (`window._tcLastAttachment` is never read).
- The workload heatmap uses random placeholder values for projects beyond the
  first when a member has no per-project `load` array.
- The RACI badge and member-popup upgrades in `ui/team-upgrade-v4.js` are
  inactive (see the note at the top of that file).
