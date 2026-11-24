# Final authentication fixes: A1–A5

**Conclusion: READY FOR FINAL MANUAL TESTING**

All five audit findings were addressed. The original 39 tests remain and pass. Nine tests were added, and the existing Vue Router test was extended with the original redirect-loop case and late recovery cases. This is a source-level and automated-test result, not browser sign-off or merge approval.

## Resolution and regression evidence

| Finding | Resolution | Regression evidence |
| --- | --- | --- |
| **A1 — Explicit verification and failed incoming exchanges affected unrelated sessions** | Password verification now uses a storage-independent `GET /auth/v1/user`. The store sends the same immutable, verified JWT on the PUT and does not write a session from either response. Incoming implicit credentials are exchanged by a temporary Supabase Auth client with no persistence, shared broadcast, or auto-refresh. Only a successful session can be handed to the shared SDK for normal startup. | Held an A lookup response, installed B in the real SDK, then returned `403 session_not_found`: B remained signed in and no password mutation ran. For incoming links, intercepted the real SDK’s `session_not_found` lookup and `refresh_token_not_found` refresh paths; neither changed a concurrently installed B or emitted shared `SIGNED_OUT`. Also verified successful handoff, one refresh of an expired incoming access token, refusal to overwrite a change observed during exchange, and the SDK’s startup broadcast using Node’s `BroadcastChannel`. |
| **A2 — Late logout overwrote a newer sign-in** | Pinia follows the SDK’s local `SIGNED_OUT` event instead of clearing the session again on completion. The app watcher navigates on the local state change, not on late revocation. A failed revocation does not read or refresh a newer session after local removal is observed. | Held real SDK revocation, signed B in before it finished, then completed the response. B remained in both the SDK and Pinia, with no late navigation to login. The failure variant also verified that B’s session was not read. |
| **A3 — Malformed recovery fell back to the existing account** | Capture distinguishes missing fields, explicit errors, unsupported codes, and ambiguous credentials from a clean authenticated reset. A non-secret pending marker survives early cleanup and interrupted reloads; it is removed only after recovery credentials establish the active account. Late SPA recovery credentials are discarded and the destination is marked invalid. Clean reset visits and reloads after successful recovery remain supported. | Reproduced marker-only callbacks, unsupported codes, empty fields, split credentials, incorrect token type, and a reload with only the pending marker. None opened A’s form. Verified recovery for B removed the marker, preserved existing query and hash, and allowed a clean reload. |
| **A4 — Redirect normalization loop** | Cleanup removes auth fields and sanitizes nested redirect targets without normalizing unrelated query fields or anchors. Internal redirect validation still normalizes the path to reject auth destinations and blocks external targets. | Exercised Vue Router with `/planner?label=Sam's`, repeated query parameters, and anchors. The benign navigation terminated, and the equivalent credential-bearing navigation removed tokens without losing the legitimate values. |
| **A5 — Password API lost HTTP status on malformed bodies** | Both HTTP methods preserve status, parse JSON defensively, and validate the user response before using it. The adapter uses the SDK’s API-version header, bypasses cached responses, and does not follow redirects. It does not retry password mutations. | Empty `401`, HTML `502`, JSON `null` at `429`, and unexpected arrays, fields, and success bodies were checked. The empty `401` reaches the store’s session-expiry path; an invalid or mismatched success payload is not treated as success. |

## Architecture and security review

- The temporary Auth client uses public SDK options and methods (`setSession()` and `dispose()`). It has an isolated storage key and cannot persist or broadcast its failure. A verified session is written to the application-configured `storage` before the shared client starts. The application configures the same storage key that the installed SDK previously used, retaining saved sessions and cross-tab compatibility. The handoff uses the installed SDK’s serialized `Session` format, verified against the real SDK in tests.
- A rejected incoming exchange makes no write to shared session storage. Before publishing a successful exchange the app checks that the stored value has not changed since the exchange began. This is a check for an intervening change, not an atomic transaction across browser processes. The app never restores an earlier session snapshot.
- Early `history.replaceState` cleanup and `detectSessionInUrl: false` are retained. Both implicit session links and token-hash links are supported without a browser-local PKCE verifier. Token-hash verification still uses the shared SDK’s `verifyOtp()`; the SDK only saves a session on a successful response that contains one.
- The password PUT cannot be retargeted by a delayed account switch. Requests use the verified bearer token, and an observed switch aborts pending work and invalidates the result. A mutation the server already accepted cannot be undone. Backend password, JWT, and reauthentication policies still apply; the app does not implement a separate nonce-entry flow.
- No new confirmed source-code defect remains in the A1–A5 scope after focused review. The deliberately retained limitations include implicit bearer-link session confusion, the lack of guaranteed server revocation during offline logout, and already-started SDK operations completing after a view unmounts. Query credentials can reach the initial HTTP request before JavaScript can clean the URL.

## Validation

| Check | Result |
| --- | --- |
| `npm test` | **48 passed, 0 failed** on Node 24.19.0. |
| `npm run build` | **Passed** with Vite 8.3.7; 105 modules transformed. The build regenerated ignored `dist/` output. |
| `git diff --check` | **Passed**. Git printed Windows line-ending notices only. |
| Focused A1–A5 review | Original scenarios reproduced with regression cases using installed Supabase JS/Auth JS **2.119.1**, Vue Router **4.6.4**, real Vue lifecycle scopes, and synthetic intercepted responses. |

The SDK broadcast test uses two clients in one Node process with synthetic browser globals; the SDK warns about the shared storage key in that deliberate setup. Native browser storage, navigation, and cross-tab event ordering were not tested. No live accounts, Dashboard changes, environment changes, or secret inspection were used. The production build used Vite’s normal configuration loading. No commits or pushes were made.

## Remaining browser and external checks

Before approving merge:

1. In staging, open actual confirmation and recovery emails in a fresh browser/device, then repeat while A is signed in and the email is for B. Exercise the link formats the templates actually emit. Check expiry/reuse, malformed links, pending and failed reloads, successful reset reload, and visible account identity.
2. Exercise native Back/Forward, reload, and internal navigation with query parameters and anchors. No access token, refresh token, or token hash should reappear in the application’s URL or history entry. Verify callback request logging, caching, referrer policy, and telemetry; JavaScript cleanup does not protect the initial request.
3. Exercise cross-tab sign-in, sign-out, and refresh in supported browsers. Race an account switch against password verification and submission, and against logout while revocation is pending. Test offline logout with valid and near-expiry sessions, then reload and verify the intended behavior on other devices.
4. Confirm email templates, exact redirect allowlists, SPA fallback, publishable/anon browser key, CORS for the bearer GET/PUT and version header, and password strength, reuse, reauthentication, JWT, and revocation policies. If the configured recovery path needs a nonce, verify how it will be provided without weakening the policy. If secure email-change templates use this callback, validate the separate intermediate, sessionless confirmation step.
5. Verify API-level account enumeration and abuse controls, and grants/RLS for any exposed tables, storage, functions, or Realtime data. Frontend route guards and neutral copy do not substitute for backend enforcement.

## Files

**Created:** `src/lib/incoming-session.js`, `AUTH_FINAL_FIXES_REPORT.md`.

**Modified:** `src/App.vue`, `src/lib/auth-errors.js`, `src/lib/auth-redirect.js`, `src/lib/password-update.js`, `src/lib/supabase.js`, `src/router/index.js`, `src/stores/auth.js`, `src/views/auth/AuthCallbackView.vue`, `src/views/auth/ResetPasswordView.vue`, `tests/auth-security.test.mjs`, `tests/auth-test-utils.mjs`, `tests/password-recovery.test.mjs`.

No dependencies or lockfile changes were needed.
