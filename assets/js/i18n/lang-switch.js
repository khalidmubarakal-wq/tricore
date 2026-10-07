/**
 * Bilingual system (AR ↔ EN) for the landing page and the app.
 *   - Persists the preference in localStorage (TC_CONFIG.storage.lang).
 *   - Landing page: `data-i18n` keys looked up in the table below.
 *   - App: RTL CSS deactivates via `html[dir]`; the runtime Arabic translator
 *     (app-translator.js) is paused/resumed on toggle.
 * Public API: window.tcLangSwitch { current, toggle(), set(lang), init() }.
 */
(function() {
'use strict';

// ══════════════════════════════════════════════════════
// 1. TRANSLATIONS TABLE  (key → { ar, en })
// ══════════════════════════════════════════════════════
var T = {
  // ── Navbar ───────────────────────────────────────────
  nav_feat:      { ar:'المميزات',       en:'Features' },
  nav_price:     { ar:'الأسعار',        en:'Pricing' },
  nav_login:     { ar:'تسجيل الدخول',   en:'Sign In' },
  nav_register:  { ar:'ابدأ مجاناً',    en:'Get Started' },

  // ── Hero ─────────────────────────────────────────────
  badge:   { ar:'منصة أداء المشاريع المتكاملة', en:'Integrated Project Performance Platform' },
  h1:      { ar:'سلّم كل مشروع',        en:'Deliver Every Project' },
  h1span:  { ar:'بنجاح',               en:'Successfully' },
  desc:    { ar:'منصة TriCore تمنح فرق إدارة المشاريع تحليلات EVM في الوقت الفعلي، وتخطيطاً قائماً على WBS، وتنفيذاً عبر Gantt & Kanban، بالإضافة إلى المطالبات المالية — كل ذلك في منصة ذكية موحدة.',
             en:'TriCore gives project management teams real-time EVM analytics, WBS-driven planning, Gantt & Kanban execution, and financial claims — all in one intelligent platform.' },
  cta1:    { ar:'ابدأ مجاناً — بدون بطاقة ائتمان', en:'Start Free — No Credit Card' },
  cta2:    { ar:'شاهد العرض التوضيحي', en:'Watch Demo' },
  stat1:   { ar:'مشروع منجز',          en:'Projects Delivered' },
  stat2:   { ar:'رضا العملاء',         en:'Client Satisfaction' },
  stat3:   { ar:'دعم فني',             en:'Technical Support' },

  // ── Floating tags ────────────────────────────────────
  ftag1t:  { ar:'معامل التكلفة 1.2',   en:'CPI 1.2' },
  ftag1s:  { ar:'كفاءة عالية في التكلفة', en:'Cost Efficient ✓' },
  ftag2t:  { ar:'3 مشاريع نشطة',       en:'3 Active Projects' },
  ftag2s:  { ar:'متابعة EVM فورية',    en:'Live EVM Tracked' },

  // ── Mock card ────────────────────────────────────────
  mock_title: { ar:'لوحة تحكم المشروع', en:'Project Dashboard' },

  // ── Trust ────────────────────────────────────────────
  trust_lbl: { ar:'موثوق به من قِبَل فرق المشاريع في', en:'Trusted by project teams delivering' },
  trust1:  { ar:'التحول الرقمي الحكومي', en:'Government Digital Transformation' },
  trust2:  { ar:'تكامل أنظمة ERP',     en:'ERP System Integration' },
  trust3:  { ar:'منصات BI والتحليلات', en:'BI & Analytics Platforms' },
  trust4:  { ar:'مشاريع البناء',       en:'Construction Projects' },
  trust5:  { ar:'تطوير البرمجيات',     en:'Software Development' },

  // ── Features ─────────────────────────────────────────
  feat_tag:   { ar:'إمكانيات المنصة',  en:'Platform Capabilities' },
  feat_title: { ar:'كل ما يحتاجه مدير المشاريع', en:'Everything a PM Needs' },
  feat_sub:   { ar:'مصمم لمديري المشاريع ومحللي PMO والمديرين التنفيذيين وأعضاء الفريق — كل منهم يتمتع بوصول محدد حسب الدور وأدوات مخصصة.',
                en:'Built for project managers, PMO analysts, executives, and team members — each with role-specific access and purpose-built tools.' },

  // ── CTA section ──────────────────────────────────────
  cta_h:   { ar:'جاهز لتسليم مشاريعك بثقة؟', en:'Ready to Deliver Projects with Confidence?' },
  cta_sub: { ar:'انضم إلى مئات فرق إدارة المشاريع التي تستخدم TriCore لتحقيق النجاح في كل مرة.',
             en:'Join hundreds of project teams using TriCore to achieve success every time.' },
  cta_btn: { ar:'ابدأ تجربتك المجانية الآن', en:'Start Your Free Trial Now' },

  // ── Footer ───────────────────────────────────────────
  footer_copy: { ar:'© 2026 TriCore. جميع الحقوق محفوظة.', en:'© 2026 TriCore. All rights reserved.' },
};

// ── Navbar link text (by href) ─────────────────────────
var NAV_LINKS = {
  '#lpf-sec': { ar:'المميزات', en:'Features' },
  '#lpc-sec': { ar:'ابدأ مجاناً',  en:'Get Started' },
};

// ══════════════════════════════════════════════════════
// 2. APP UI STRINGS  (shown when app is active)
// ══════════════════════════════════════════════════════
var APP_STRINGS = {
  ar: {
    search_placeholder: 'البحث في المشاريع والمهام والأعضاء...',
    help:          'المساعدة',
    notifications: 'الإشعارات',
    profile:       'الملف الشخصي',
    lang_label:    'EN',
    lang_dir:      'rtl',
  },
  en: {
    search_placeholder: 'Search projects, tasks, members…',
    help:          'Help',
    notifications: 'Notifications',
    profile:       'Profile',
    lang_label:    'عربي',
    lang_dir:      'ltr',
  },
};

// ══════════════════════════════════════════════════════
// 3. CORE SWITCH LOGIC
// ══════════════════════════════════════════════════════
var LS_KEY = window.TC_CONFIG.storage.lang;

function getLang() {
  try { return localStorage.getItem(LS_KEY) || window.TC_CONFIG.defaultLang; } catch (e) { return window.TC_CONFIG.defaultLang; }
}

function applyLang(lang) {
  // ── 3a. html attributes ────────────────────────────
  var html = document.documentElement;
  html.lang = lang;
  html.dir  = lang === 'ar' ? 'rtl' : 'ltr';

  // ── 3b. Landing page: i18n elements ───────────────
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var key = el.getAttribute('data-i18n');
    if (T[key] && T[key][lang]) {
      el.textContent = T[key][lang];
    }
  });

  // ── 3c. Landing page: nav links ───────────────────
  document.querySelectorAll('#tc-lp .lpn-links a[href]').forEach(function(a) {
    var href = a.getAttribute('href');
    if (NAV_LINKS[href]) a.textContent = NAV_LINKS[href][lang];
  });

  // ── 3d. Landing page: navbar buttons ─────────────
  var loginBtn    = document.getElementById('lp-login-btn');
  var registerBtn = document.getElementById('lp-register-btn');
  var langLabel   = document.getElementById('lp-lang-label');
  if (loginBtn)    loginBtn.textContent    = lang === 'ar' ? 'تسجيل الدخول'  : 'Sign In';
  if (registerBtn) registerBtn.textContent = lang === 'ar' ? 'ابدأ مجاناً'   : 'Get Started';
  if (langLabel)   langLabel.textContent   = lang === 'ar' ? 'EN' : 'عربي';

  // ── 3e. Landing page: mock card title ────────────
  var mockTitle = document.querySelector('.mock-title');
  if (mockTitle) mockTitle.textContent = T.mock_title[lang];

  // ── 3f. Landing page: CTA arrow icon direction ───
  var icon1 = document.getElementById('lp-cta1-icon');
  var icon2 = document.getElementById('lp-cta-icon');
  if (icon1) icon1.className = 'fas fa-arrow-' + (lang === 'ar' ? 'left' : 'right');
  if (icon2) icon2.className = 'fas fa-arrow-' + (lang === 'ar' ? 'left' : 'right');

  // ── 3g. Landing page: lp div direction ───────────
  var lpDiv = document.getElementById('tc-lp');
  if (lpDiv) lpDiv.style.direction = lang === 'ar' ? 'rtl' : 'ltr';

  // ── 3h. App topbar: update lang button label ─────
  var appLangLabel = document.getElementById('tc-app-lang-label');
  if (appLangLabel) {
    appLangLabel.textContent = APP_STRINGS[lang].lang_label;
  }

  // ── 3i. App topbar: update search placeholder ────
  var searchInput = document.querySelector('#tc-topbar-search input');
  if (searchInput) {
    searchInput.placeholder = APP_STRINGS[lang].search_placeholder;
    searchInput.dir         = lang === 'ar' ? 'rtl' : 'ltr';
    searchInput.style.textAlign = lang === 'ar' ? 'right' : 'left';
  }

  // ── 3j. Translator: pause or resume ──────────────
  if (window._tcTranslatorPause) {
    if (lang === 'en') {
      window._tcTranslatorPause(true);   // pause + revert
    } else {
      window._tcTranslatorPause(false);  // resume + re-run
    }
  }

  // ── 3k. RTL CSS overrides: the #tc-arabic-rtl and
  //    html[dir="rtl"] selectors handle this automatically.
  //    When dir=ltr, all html[dir="rtl"] rules deactivate. ✓

  // ── 3l. App font-family adjust for EN mode ────────────
  var rootEl = document.getElementById('root');
  if (rootEl) {
    rootEl.style.fontFamily = lang === 'en'
      ? "'Plus Jakarta Sans', system-ui, sans-serif"
      : "'Noto Sans Arabic', 'Plus Jakarta Sans', system-ui, sans-serif";
  }
  // Body font
  document.body.style.fontFamily = lang === 'en'
    ? "'Plus Jakarta Sans', system-ui, sans-serif"
    : "'Noto Sans Arabic', 'Plus Jakarta Sans', system-ui, sans-serif";

  // ── 3m. App topbar aria labels ───────────────────
  var helpBtn = document.querySelector('.tc-topbar-icon-btn[title]');
  if (helpBtn) {
    helpBtn.title = APP_STRINGS[lang].help;
    helpBtn.setAttribute('aria-label', APP_STRINGS[lang].help);
  }
  var notifBtn = document.getElementById('tc-notif-btn');
  if (notifBtn) {
    notifBtn.title = APP_STRINGS[lang].notifications;
    notifBtn.setAttribute('aria-label', APP_STRINGS[lang].notifications);
  }
  var avatarBtn = document.getElementById('tc-avatar-btn');
  if (avatarBtn) avatarBtn.title = APP_STRINGS[lang].profile;

  // ── 3m. Dispatch event for any listeners ─────────
  window.dispatchEvent(new CustomEvent('tc:lang-changed', { detail: { lang: lang } }));
  // Force React to re-render by toggling a tiny CSS variable
  // This triggers React's reconciler to update conditional labels
  document.documentElement.style.setProperty('--tc-lang', lang === 'ar' ? '1' : '0');
}

// ══════════════════════════════════════════════════════
// 4. PUBLIC API
// ══════════════════════════════════════════════════════
window.tcLangSwitch = {
  current: getLang(),

  toggle: function() {
    var next = this.current === 'ar' ? 'en' : 'ar';
    this.set(next);
  },

  set: function(lang) {
    this.current = lang;
    try { localStorage.setItem(LS_KEY, lang); } catch(e) {}
    applyLang(lang);
    // Re-enhance topbar buttons if app is mounted
    setTimeout(function() {
      var appLangLabel = document.getElementById('tc-app-lang-label');
      if (appLangLabel) {
        appLangLabel.textContent = APP_STRINGS[lang].lang_label;
      }
    }, 50);
  },

  init: function() {
    var saved = getLang();
    this.current = saved;
    applyLang(saved);
  },
};

// ══════════════════════════════════════════════════════
// 5. INIT — apply saved preference on page load
// ══════════════════════════════════════════════════════
(function() {
  var saved = getLang();
  // Apply immediately to prevent flash
  document.documentElement.lang = saved;
  document.documentElement.dir  = saved === 'ar' ? 'rtl' : 'ltr';

  // Full apply after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      window.tcLangSwitch.init();
    });
  } else {
    window.tcLangSwitch.init();
  }

  // Re-apply after app boots (handles React mount)
  setTimeout(function() { window.tcLangSwitch.set(getLang()); }, 900);
  setTimeout(function() { window.tcLangSwitch.set(getLang()); }, 2200);
  setTimeout(function() { window.tcLangSwitch.set(getLang()); }, 4100);

  // ── Watch for topbar mount to sync the lang button label ──
  // The tcUIEnhance script creates #tc-app-lang-btn after React renders.
  // We observe the document and update the label as soon as it appears.
  //
  // ⚠️ ROOT-CAUSE FIX (topbarObserver infinite-loop):
  //   Original code had subtree:true AND called _tcTranslatorPause() inside the callback.
  //   _tcTranslatorPause → revertTranslations → modifies hundreds of text nodes (childList
  //   mutations) → topbarObserver fires again → _tcTranslatorPause again → infinite loop
  //   → Main Thread Stall → "Page Unresponsive".
  //
  //   Fix strategy:
  //   1. Re-entrancy guard (_topbarBusy) prevents cascading callbacks.
  //   2. subtree:false — only watch direct children of #root, not the whole tree.
  //      This dramatically reduces mutation event volume after React re-renders.
  //   3. _tcTranslatorPause is deferred with requestAnimationFrame, breaking the
  //      synchronous mutation cascade entirely.
  //   4. Guard against calling the same value twice (lbl.textContent same value check).
  var _topbarBusy = false;
  var topbarObserver = new MutationObserver(function() {
    // Re-entrancy guard: prevents DOM modifications inside this callback
    // from immediately re-triggering the observer and forming an infinite loop.
    if (_topbarBusy) return;

    var btn = document.getElementById('tc-app-lang-btn');
    var lbl = document.getElementById('tc-app-lang-label');
    if (btn && lbl) {
      _topbarBusy = true;
      var cur = getLang();

      // Only write if the value actually differs (avoids triggering a new mutation)
      if (lbl.textContent !== APP_STRINGS[cur].lang_label) {
        lbl.textContent = APP_STRINGS[cur].lang_label;
      }

      // Sync non-childList attributes (safe — attribute changes don't trigger childList observer)
      var searchInp = document.querySelector('#tc-topbar-search input');
      if (searchInp) {
        searchInp.placeholder = APP_STRINGS[cur].search_placeholder;
        searchInp.dir = cur === 'ar' ? 'rtl' : 'ltr';
        searchInp.style.textAlign = cur === 'ar' ? 'right' : 'left';
      }

      // CRITICAL: _tcTranslatorPause() calls revertTranslations/runTranslations which
      // modifies hundreds of text nodes across the entire DOM tree. Those are childList
      // mutations that re-fire this observer synchronously — causing an infinite loop.
      // FIX: Defer via requestAnimationFrame so mutations complete BEFORE we pause/resume.
      if (window._tcTranslatorPause) {
        var _pauseVal = (cur === 'en');
        requestAnimationFrame(function() {
          _topbarBusy = false;
          window._tcTranslatorPause(_pauseVal);
        });
      } else {
        _topbarBusy = false;
      }
    }
  });
  // subtree: false — only direct children of #root change when React mounts/unmounts
  // the entire app shell. This is sufficient to detect when the topbar is added/removed
  // while massively reducing the number of mutation events (from thousands → ~5 per
  // navigation). Using subtree: true here was the primary cause of the freeze.
  topbarObserver.observe(document.getElementById('root') || document.body, {
    childList: true, subtree: false
  });

})();

})(); // end tcLangSwitch IIFE
