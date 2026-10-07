/**
 * Email one-time-code dialog (bilingual AR/EN), shown on top of the auth
 * screen for:
 *   - 'signup'   — confirm a new account with the code from the welcome email,
 *   - 'recovery' — reset the password with the code from the reset email.
 * Success signs the user in (the auth flow reloads the page).
 * Styles: assets/css/otp-dialog.css.
 */
import { verifySignupCode, resendSignupCode, resetPasswordWithCode, requestPasswordReset } from './auth.js';

const { otpLength: CODE_LENGTH, resendCooldownSec: COOLDOWN } = window.TC_CONFIG.auth;

const TEXT = {
  ar: {
    signupTitle: 'تأكيد البريد الإلكتروني',
    recoveryTitle: 'إعادة تعيين كلمة المرور',
    sentTo: `أرسلنا رمزاً مكوّناً من ${CODE_LENGTH} أرقام إلى`,
    spam: 'لم تجده؟ تحقّق من مجلد الرسائل غير المرغوب فيها.',
    codeLabel: 'رمز التحقق',
    newPassword: 'كلمة المرور الجديدة',
    confirmPassword: 'تأكيد كلمة المرور',
    verify: 'تحقّق ومتابعة',
    setPassword: 'تعيين كلمة المرور',
    working: 'جارٍ التحقق…',
    success: 'تم التحقق! جارٍ تسجيل الدخول…',
    noCode: 'لم يصلك الرمز؟',
    resend: 'إعادة الإرسال',
    resendIn: (s) => `إعادة الإرسال بعد ${s} ث`,
    resent: 'تم إرسال رمز جديد إلى بريدك.',
    close: 'إغلاق',
    mismatch: 'كلمتا المرور غير متطابقتين.',
    errors: {
      'Enter the code from the email.': 'أدخل الرمز المرسل إلى بريدك.',
      'The code is invalid or has expired. Request a new one.': 'الرمز غير صحيح أو منتهي الصلاحية. اطلب رمزاً جديداً.',
      'Too many attempts — please wait a minute and try again.': 'محاولات كثيرة — انتظر دقيقة ثم حاول مجدداً.',
      'Password must be at least 8 characters.': 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.',
      'Network error — check your connection.': 'خطأ في الاتصال — تحقّق من الإنترنت.',
    },
  },
  en: {
    signupTitle: 'Verify your email',
    recoveryTitle: 'Reset your password',
    sentTo: `We sent a ${CODE_LENGTH}-digit code to`,
    spam: "Can't find it? Check your spam folder.",
    codeLabel: 'Verification code',
    newPassword: 'New password',
    confirmPassword: 'Confirm password',
    verify: 'Verify & continue',
    setPassword: 'Set new password',
    working: 'Verifying…',
    success: 'Verified! Signing you in…',
    noCode: "Didn't get the code?",
    resend: 'Resend code',
    resendIn: (s) => `Resend in ${s}s`,
    resent: 'A new code was sent to your email.',
    close: 'Close',
    mismatch: 'Passwords do not match.',
    errors: {},
  },
};

const lang = () => ((window.tcLangSwitch && window.tcLangSwitch.current) || window.TC_CONFIG.defaultLang) === 'en' ? 'en' : 'ar';

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  children.forEach((c) => node.appendChild(c));
  return node;
}

/**
 * Open the dialog. `mode` is 'signup' or 'recovery'. With `{ resend: true }`
 * a fresh code is requested immediately (e.g. sign-in of an unverified account).
 */
export function openOtpDialog(mode, email, { resend = false } = {}) {
  document.getElementById('tc-otp')?.remove();
  const L = lang();
  const t = TEXT[L];
  const isRecovery = mode === 'recovery';
  let busy = false;
  let cooldownTimer = null;

  // ── Code cells ──────────────────────────────────────────────
  const cells = Array.from({ length: CODE_LENGTH }, (_, i) => el('input', {
    class: 'tc-otp-cell', type: 'text', inputmode: 'numeric', maxlength: '1',
    autocomplete: i === 0 ? 'one-time-code' : 'off',
    'aria-label': `${t.codeLabel} ${i + 1}`,
  }));
  const code = () => cells.map((c) => c.value).join('');
  const fill = (digits, from = 0) => {
    digits.split('').slice(0, CODE_LENGTH - from).forEach((d, k) => { cells[from + k].value = d; });
    const next = Math.min(from + digits.length, CODE_LENGTH - 1);
    cells[next].focus();
  };
  cells.forEach((cell, i) => {
    cell.addEventListener('input', () => {
      const digits = cell.value.replace(/\D/g, '');
      cell.value = '';
      if (digits) fill(digits, i);
      setError('');
      if (!isRecovery && code().length === CODE_LENGTH) submit();
    });
    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !cell.value && i > 0) { cells[i - 1].value = ''; cells[i - 1].focus(); e.preventDefault(); }
      if (e.key === 'ArrowLeft' && i > 0) cells[i - 1].focus();
      if (e.key === 'ArrowRight' && i < CODE_LENGTH - 1) cells[i + 1].focus();
    });
    cell.addEventListener('paste', (e) => {
      const digits = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
      if (!digits) return;
      e.preventDefault();
      fill(digits, 0);
      if (!isRecovery && code().length === CODE_LENGTH) submit();
    });
  });

  // ── New password (recovery only) ────────────────────────────
  const pw = el('input', { class: 'tc-otp-input', type: 'password', autocomplete: 'new-password', placeholder: t.newPassword, 'aria-label': t.newPassword, minlength: '8' });
  const pw2 = el('input', { class: 'tc-otp-input', type: 'password', autocomplete: 'new-password', placeholder: t.confirmPassword, 'aria-label': t.confirmPassword });

  // ── Messages / buttons ──────────────────────────────────────
  const err = el('div', { class: 'tc-otp-msg tc-otp-err', role: 'alert' });
  const info = el('div', { class: 'tc-otp-msg tc-otp-info', 'aria-live': 'polite' });
  const setError = (m) => { err.textContent = m ? (t.errors[m] || m) : ''; if (m) info.textContent = ''; };
  const setInfo = (m) => { info.textContent = m; if (m) err.textContent = ''; };
  const submitBtn = el('button', { class: 'tc-otp-btn', type: 'submit', text: isRecovery ? t.setPassword : t.verify });
  const resendBtn = el('button', { class: 'tc-otp-link', type: 'button', onclick: () => doResend() });

  const close = () => { clearInterval(cooldownTimer); overlay.remove(); };
  const overlay = el('div', { id: 'tc-otp', class: 'tc-otp-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tc-otp-title', dir: L === 'ar' ? 'rtl' : 'ltr' }, [
    el('form', { class: 'tc-otp-card', novalidate: '', onsubmit: (e) => { e.preventDefault(); submit(); } }, [
      el('button', { class: 'tc-otp-close', type: 'button', 'aria-label': t.close, text: '×', onclick: close }),
      el('div', { class: 'tc-otp-icon', 'aria-hidden': 'true', text: isRecovery ? '🔐' : '✉️' }),
      el('h2', { id: 'tc-otp-title', class: 'tc-otp-title', text: isRecovery ? t.recoveryTitle : t.signupTitle }),
      el('p', { class: 'tc-otp-sub' }, [document.createTextNode(t.sentTo + ' '), el('strong', { dir: 'ltr', text: email })]),
      el('div', { class: 'tc-otp-cells', dir: 'ltr', role: 'group', 'aria-label': t.codeLabel }, cells),
      ...(isRecovery ? [el('div', { class: 'tc-otp-fields' }, [pw, pw2])] : []),
      err, info, submitBtn,
      el('div', { class: 'tc-otp-resend' }, [el('span', { text: t.noCode + ' ' }), resendBtn]),
      el('p', { class: 'tc-otp-hint', text: t.spam }),
    ]),
  ]);
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.body.appendChild(overlay);
  cells[0].focus();

  function startCooldown() {
    let left = COOLDOWN;
    resendBtn.disabled = true;
    resendBtn.textContent = t.resendIn(left);
    clearInterval(cooldownTimer);
    cooldownTimer = setInterval(() => {
      left -= 1;
      if (left > 0) { resendBtn.textContent = t.resendIn(left); return; }
      clearInterval(cooldownTimer);
      resendBtn.disabled = false;
      resendBtn.textContent = t.resend;
    }, 1000);
  }

  async function doResend() {
    if (resendBtn.disabled) return;
    startCooldown();
    const r = isRecovery ? await requestPasswordReset(email) : await resendSignupCode(email);
    if (r.ok) setInfo(t.resent); else setError(r.err);
  }

  async function submit() {
    if (busy) return;
    if (code().length !== CODE_LENGTH) { setError('Enter the code from the email.'); cells[code().length]?.focus(); return; }
    if (isRecovery) {
      if (pw.value.length < 8) { setError('Password must be at least 8 characters.'); pw.focus(); return; }
      if (pw.value !== pw2.value) { setError(t.mismatch); pw2.focus(); return; }
    }
    busy = true;
    submitBtn.disabled = true;
    submitBtn.textContent = t.working;
    setError('');
    const r = isRecovery
      ? await resetPasswordWithCode(email, code(), pw.value)
      : await verifySignupCode(email, code());
    if (r.ok) { setInfo(t.success); return; } // page reloads into the dashboard
    busy = false;
    submitBtn.disabled = false;
    submitBtn.textContent = isRecovery ? t.setPassword : t.verify;
    setError(r.err);
    cells.forEach((c) => { c.value = ''; });
    cells[0].focus();
  }

  if (resend) doResend(); else startCooldown();
}
