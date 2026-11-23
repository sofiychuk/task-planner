# Password recovery implementation

## Implemented

- Added **Забули пароль?** on the login screen and `/forgot-password`.
- Reset requests use Supabase `resetPasswordForEmail`, with trimmed email validation, disabled controls, loading indicators, accessible feedback, and neutral success text that does not disclose whether an account exists.
- Added repeat-email requests with the existing 60-second cooldown and an option to correct the address.
- Added `/auth/reset-password` with link validation, new-password and confirmation fields, existing 8–72-character validation, password visibility controls, loading/error states, and a success screen.
- Password changes use `updateUser({ password })`. The user remains signed in and can explicitly continue to the original safe destination.
- Standard implicit recovery links and custom `token_hash` / `type=recovery` links are supported.
- Invalid, expired, missing-session, same-password, weak-password, network, rate-limit, and reauthentication failures receive user-friendly Ukrainian messages.
- Recovery routing runs before guest-only redirects and the signup-confirmation callback. URL credentials/errors are removed with replacement navigation after processing.

## Files

### Created

| File | Purpose |
| --- | --- |
| `src/views/auth/ForgotPasswordView.vue` | Request/resend reset emails and show neutral confirmation |
| `src/views/auth/ResetPasswordView.vue` | Verify recovery, validate passwords, update password, and show completion/errors |
| `tests/password-recovery.test.mjs` | Dependency-free Node test-runner checks using existing Vue/Pinia dependencies and mocked Supabase |
| `PASSWORD_RECOVERY_IMPLEMENTATION.md` | This report |

### Modified

| File | Changes |
| --- | --- |
| `src/lib/auth-redirect.js` | Capture recovery metadata before SDK URL cleanup, one-shot routing, captured-state cleanup, reset redirect builder, and exclusion of recovery routes from post-auth redirects |
| `src/lib/auth-errors.js` | Missing-session and reauthentication messages |
| `src/stores/auth.js` | Reset-email/update-password actions and preservation of SDK initialization errors |
| `src/router/index.js` | Lazy-loaded recovery routes and early recovery routing |
| `src/views/auth/LoginView.vue` | Forgot-password link with safe return destination |

No dependencies, environment values, Supabase Dashboard settings, or unrelated application views were changed. No commits or pushes were made.

## Architectural decisions

1. **Keep the existing architecture.** Supabase calls remain in the Pinia store; routing stays in the router/views. Existing shared auth components, cooldown, validation, Tailwind styles, and Ukrainian copy are reused.
2. **Reuse `/auth/callback` for emailed redirects.** Reset requests target the existing callback with `recovery=1`; the router forwards them to the reset screen. This avoids introducing another emailed callback endpoint. Actual acceptance of URLs with query parameters still depends on the existing Supabase allowlist.
3. **Retain implicit flow.** Supabase consumes implicit tokens; the application captures only flow metadata beforehand. Valid recovery links falling back to the Site URL are recognized by `type=recovery`. Custom token-hash links are verified explicitly as recovery.
4. **Do not infer success from an unrelated session.** Token hashes are always verified, even when already signed in. SDK initialization failures are preserved because `getSession()` can return an older session after a failed URL exchange.
5. **Recovery creates a normal Supabase session.** The reset route is not guest-only. A persisted authenticated session can reopen the form after reload; an already signed-in user can also access it directly. Supabase authorizes the update. The form displays the account email and rejects submission if the account changes or signs out while the form is open.
6. **No forced logout or automatic timer after success.** Users see a persistent success message and explicitly continue. Session lifetime/revocation remains governed by Supabase.
7. **Avoid extra auth persistence.** No tokens, passwords, or duplicate session state are added to browser storage. Captured callback metadata is cleared after processing.

## Verification and regression review

- `npm run build` — passed, 101 modules transformed.
- `node --test tests/password-recovery.test.mjs` — all 6 tests passed.
- `git diff --check` — passed; Git only reported Windows line-ending notices.
- Automated checks cover recovery metadata after hash cleanup, expired-link errors, recovery versus signup token types, safe redirects and callback construction, validation/error mapping, reset/update API arguments, shared initialization, loading/concurrent-action behavior, network failure recovery, and existing sign-in/signup/resend/verification/sign-out store actions.
- Reviewed guard ordering and existing app-shell session watchers: recovery routes are not guest-only or protected routes, so normal authenticated redirects do not skip the reset screen.
- Existing signup callback generation and auth actions remain in place. No live accounts or passwords were modified during verification.

## Known limitations and external dependencies

- **Live email delivery and browser E2E were not exercised.** Automated Supabase checks use mocks; the production build is not proof of SMTP delivery or Dashboard configuration.
- Existing Supabase redirect allowlists, recovery email templates, rate limits, SMTP configuration, and password policy still apply. Nothing in the Dashboard was inspected or changed.
- For default templates, the recovery email should use Supabase's generated confirmation URL. Custom direct links must include `token_hash` and `type=recovery` and load the SPA.
- If Supabase drops the requested redirect and sends an expired-link error to the Site URL without any recovery marker/type, the application cannot distinguish it from another authentication-link error. Correct existing redirect configuration is necessary for reliable error landing.
- Hosting must support history-mode SPA fallback, including direct loads/reloads of `/auth/callback` and `/auth/reset-password`.
- PKCE remains unsupported, consistent with the existing explicit implicit-flow configuration.
- Cooldown is per mounted screen, not a security/rate-limit mechanism; Supabase enforces server-side limits.
- Password policy is the existing client-side 8–72 characters. A stricter server policy can reject a password and is handled as an error; server configuration was not changed.
- Callback capture occurs on full application load, as before. Manually injecting fresh auth credentials into an already-running SPA is not a supported link-opening workflow.
- Password updates may require additional reauthentication under project policy; those failures direct users to request a fresh recovery link. No separate OTP/MFA reauthentication UI was introduced.

## Manual test checklist

### Reset request

- Open login → **Забули пароль?**; verify the original safe redirect is retained.
- Submit empty/invalid email; check inline feedback and focus.
- Request resets for registered and unregistered addresses; verify identical neutral success behavior.
- Verify actual email delivery, resend after 60 seconds, loading/disabled controls, and correction of the email address.
- Test offline behavior and Supabase rate limits.

### Recovery and password update

- Open the real email link in the same browser, a different browser, and a mobile device.
- Confirm arrival on the reset form rather than the planner or signup-success screen.
- Open a recovery link while signed in to a different account; verify the displayed email and the account actually updated.
- Test custom `token_hash` links, if used, including expired hashes while another account is signed in.
- Test expired/reused/malformed links and opening the reset route without any session.
- Reload before submitting; confirm recovery-session persistence and clean URL.
- Test empty, short, overlong, mismatched, unchanged, and server-rejected passwords.
- Disconnect the network while submitting; ensure errors allow retry without false success.
- Sign out or change accounts in another tab while the form is open; verify it cannot submit for the changed account.
- Complete the change → success → continue; sign out, then confirm the new password works and the old one does not.

### Existing auth and presentation

- Re-test registration, email confirmation, resend confirmation, sign-in, sign-out, session restoration, and protected routes.
- Verify unsafe redirects such as `//evil.example` or recovery/auth routes fall back to `/`.
- Verify keyboard-only navigation, password visibility toggles, error announcements, focus indicators, mobile widths, and loading states.
- Verify direct production-host requests to both auth routes use the SPA fallback.
