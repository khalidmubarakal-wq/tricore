/**
 * Small DOM helpers shared by the DOM-level feature modules.
 */

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape a value for use in HTML text or a quoted attribute. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/**
 * Encode a value as a JS string literal for an inline event handler
 * attribute, e.g. `onclick="fn(${jsArg(id)})"`.
 */
export function jsArg(value) {
  return escapeHtml(JSON.stringify(String(value ?? '')));
}

/** Show a transient pill-shaped toast at the bottom of the screen. */
export function toast(msg, color = '#059669') {
  document.querySelector('.tc-toast-el')?.remove();
  const t = document.createElement('div');
  t.className = 'tc-toast-el';
  t.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:${color};color:#fff;padding:10px 22px;border-radius:99px;font-size:12.5px;font-weight:600;z-index:9999;font-family:inherit;box-shadow:0 4px 16px rgba(0,0,0,.2);white-space:nowrap;`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

/** Deterministic 0–359 hue for a name, used for avatar colours. */
export function nameHue(name) {
  return [...String(name)].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
}

/** Up to two upper-case initials of a name. */
export function initials(name) {
  return String(name).split(' ').map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
}
