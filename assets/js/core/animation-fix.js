/**
 * Clear the stacking context left behind by finished entrance animations.
 *
 * Animations that use transforms with `animation-fill-mode: both` keep a
 * stacking context on the element after they end, so `position: fixed`
 * descendants (modals, tooltips) get positioned relative to that element
 * instead of the viewport. Resetting `will-change` (and the residual
 * transform) once the animation ends removes it.
 */
const CLEAR_WILL_CHANGE = new Set([
  'fadeUp', 'scaleIn', 'fadeIn', 'slideRight', 'slideLeft', 'popIn',
  // Enterprise UI + landing animations (transform based)
  'tcFadeUp', 'tcFadeIn', 'tcScaleIn', 'lp5fi', 'lpExit', 'lpfloat', 'lpgrow',
]);
const CLEAR_TRANSFORM = new Set(['tcFadeUp', 'tcScaleIn', 'tcFadeIn', 'popIn']);

function onAnimationEnd(e) {
  const el = e.target;
  if (!el || typeof el.style === 'undefined') return;
  if (!CLEAR_WILL_CHANGE.has(e.animationName)) return;
  el.style.willChange = 'auto';
  if (CLEAR_TRANSFORM.has(e.animationName)) el.style.transform = '';
}

export function installAnimationFix() {
  document.addEventListener('animationend', onAnimationEnd, { passive: true, capture: false });
}
