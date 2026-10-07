# Email verification codes (OTP)

TriCore confirms new accounts and resets passwords with a one-time code sent
by email. Users type it into a dialog in the app (`assets/js/core/otp-dialog.js`):

| Flow | When the dialog opens | What the code does |
| --- | --- | --- |
| **Sign-up** | right after registering (if email confirmation is on), or when an unverified user tries to sign in (a fresh code is sent automatically) | confirms the email and signs the user in |
| **Password reset** | after "Forgot password? → Send Reset Code" | together with the new password, resets it and signs the user in |

The emails contain **only the code**, no link. What Supabase puts in an email
is decided entirely by its email templates (dashboard settings), not by the
app: until the templates below are installed, Supabase keeps sending its
default emails, which contain **only a link**. (If a user does click such a
link, the app still handles it.)

## Supabase setup (one time)

These are dashboard settings; the app cannot change them.

1. **Authentication → Sign In / Providers → Email**
   - Turn on **Confirm email**.
   - **Email OTP Length**: `6` (must match `auth.otpLength` in `assets/js/config.js`).
   - **Email OTP Expiration**: `3600` seconds (the templates say "expires in 1 hour").
2. **Authentication → Email Templates** — replace the default templates:
   1. Open the **Reset Password** tab.
   2. **Subject**: `رمز إعادة تعيين كلمة المرور · Your TriCore password reset code`
   3. **Message body**: switch the editor to **Source** (HTML) if it isn't
      already, select everything, delete it, and paste the full contents of
      [`email-templates/reset-password.html`](email-templates/reset-password.html).
   4. **Save changes**.
   5. Repeat for the **Confirm signup** tab with subject
      `رمز تفعيل حسابك في TriCore · Your TriCore verification code` and
      [`email-templates/confirm-signup.html`](email-templates/confirm-signup.html).

   The templates use `{{ .Token }}` (the code) and `{{ .SiteURL }}` (for the
   logo). They deliberately contain no `{{ .ConfirmationURL }}`, so no link is
   sent. To check: request a reset — the email should show a 6-digit code
   and no button.
3. **Authentication → URL Configuration**: set **Site URL** to the deployed
   app (e.g. your Vercel domain) so the logo in the emails loads.
4. **Production email**: Supabase's built-in mail service is heavily rate
   limited and meant for testing. Configure **Custom SMTP** (Resend, Postmark,
   SES, …) under **Project Settings → Authentication** before inviting real users.

## API calls used

- `POST /auth/v1/signup` — creates the user and sends the confirmation email.
- `POST /auth/v1/resend` `{ type: "signup", email }` — new sign-up code.
- `POST /auth/v1/recover` `{ email }` — sends the reset email (also used to resend).
- `POST /auth/v1/verify` `{ email, token, type: "signup" | "recovery" }` — returns a session.
- `PUT /auth/v1/user` `{ password }` — sets the new password (recovery flow).
