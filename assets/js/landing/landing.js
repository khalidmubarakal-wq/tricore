/**
 * Landing page behaviour (#tc-lp): enter-app transition, navbar shadow on
 * scroll, feature-card reveal and smooth in-page anchors.
 * Loaded at the end of #tc-lp, so its markup is already parsed.
 */
(function tcLanding() {
  'use strict';

  var EXIT_MS = 420;
  var lp = document.getElementById('tc-lp');

  /** Leave the landing page for the auth screen ('login' | 'register'). */
  window.tcEnterApp = function (mode) {
    window.__tcLandingMode = mode || 'login';
    if (!lp) return;
    lp.classList.add('lp-exit');
    setTimeout(function () { lp.style.display = 'none'; }, EXIT_MS);
  };

  if (!lp) return;

  // Navbar shadow once the page is scrolled.
  var nav = document.getElementById('lp-navbar');
  if (nav) {
    lp.addEventListener('scroll', function () {
      nav.style.boxShadow = lp.scrollTop > 40 ? '0 4px 6px -1px rgba(0,0,0,.1)' : 'none';
    });
  }

  // Staggered reveal of feature cards as they scroll into view.
  var cards = lp.querySelectorAll('.lpf-obs');
  if (cards.length && window.IntersectionObserver) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.style.opacity = '1';
        e.target.style.transform = 'translateY(0)';
        io.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    cards.forEach(function (c, i) {
      c.style.cssText = 'opacity:0;transform:translateY(28px);transition:all .6s ease ' + (i * 0.09) + 's';
      io.observe(c);
    });
  }

  // Smooth scrolling for navbar anchors.
  lp.querySelectorAll('.lpn-links a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var target = document.getElementById(this.getAttribute('href').slice(1));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
})();
