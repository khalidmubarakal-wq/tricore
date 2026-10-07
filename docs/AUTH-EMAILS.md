# Email verification codes (OTP)

TriCore confirms new accounts and resets passwords with a one-time code sent
by email. Users type it into a dialog in the app (`assets/js/core/otp-dialog.js`):

| Flow | When the dialog opens | What the code does |
| --- | --- | --- |
| **Sign-up** | right after registering (if email confirmation is on), or when an unverified user tries to sign in (a fresh code is sent automatically) | confirms the email and signs the user in |
| **Password reset** | after "Forgot password? → Send Reset Code" | together with the new password, resets it and signs the user in |

The links in the emails keep working as a fallback.

## Supabase setup (one time)

These are dashboard settings; the app cannot change them.

1. **Authentication → Sign In / Providers → Email**
   - Turn on **Confirm email**.
   - **Email OTP Length**: `6` (must match `auth.otpLength` in `assets/js/config.js`).
   - **Email OTP Expiration**: `3600` seconds (the templates say "expires in 1 hour").
2. **Authentication → Email Templates**
   - **Confirm signup**: subject `رمز تفعيل حسابك في TriCore · Your TriCore verification code`,
     body: paste [`email-templates/confirm-signup.html`](email-templates/confirm-signup.html).
   - **Reset Password**: subject `رمز إعادة تعيين كلمة المرور · Your TriCore password reset code`,
     body: paste [`email-templates/reset-password.html`](email-templates/reset-password.html).

   The templates use `{{ .Token }}` (the code), `{{ .ConfirmationURL }}`
   (fallback link) and `{{ .SiteURL }}` (for the logo).
3. **Authentication → URL Configuration**: set **Site URL** to the deployed
   app (e.g. your Vercel domain) so the logo and the fallback links resolve.
4. **Production email**: Supabase's built-in mail service is heavily rate
   limited and meant for testing. Configure **Custom SMTP** (Resend, Postmark,
   SES, …) under **Project Settings → Authentication** before inviting real users.

## API calls used

- `POST /auth/v1/signup` — creates the user and sends the confirmation email.
- `POST /auth/v1/resend` `{ type: "signup", email }` — new sign-up code.
- `POST /auth/v1/recover` `{ email }` — sends the reset email (also used to resend).
- `POST /auth/v1/verify` `{ email, token, type: "signup" | "recovery" }` — returns a session.
- `PUT /auth/v1/user` `{ password }` — sets the new password (recovery flow).
