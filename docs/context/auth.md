# auth.md — Girigo App Authentication and Authorisation

---

## 1. Authentication Strategy

### Method: Firebase Anonymous Authentication with JWT

Girigo uses **Firebase Anonymous Authentication**. On first launch, the app calls
`signInAnonymously()` which creates a new Firebase Auth user with a unique UID and
issues a **signed JWT (ID token)**. The JWT is automatically attached by the
Firebase JS SDK to every subsequent Firestore and Firebase Storage request.

There is no login screen, no email address, no password, and no user-visible sign-in
flow. Authentication is invisible to the user.

### Why This Method Is Appropriate

| Reason | Detail |
|---|---|
| Zero onboarding friction | Users reach the core feature (recording a wish) without creating an account. This matches the mysterious, effortless tone of the app. |
| Permanent identity per install | Each device installation gets a unique, persistent UID. The user's wish history is tied to that UID for the lifetime of the install. |
| Firebase SDK manages everything | Token issuance, refresh, caching, and attachment to requests are handled automatically. No custom auth code is written. |
| Sufficient for the use case | The app's social graph is zero — users have no relationship to each other. Identity serves only to isolate data, not to establish a social presence. |

### Tradeoffs

| Tradeoff | Impact |
|---|---|
| No account portability | If a user uninstalls the app, their anonymous UID is gone. Reinstalling creates a new identity; old wishes become permanently inaccessible. This is documented as a known limitation, not a bug. |
| No credential-based recovery | There is no "forgot password" or account recovery flow. The anonymous identity is tied to the device install only. |
| No revocation by user | A user cannot sign out or delete their account — the anonymous session persists for the lifetime of the app install. This is acceptable because the app holds no sensitive credentials to protect against reuse. |

### What Is Explicitly Not Supported in MVP

| Feature | Status |
|---|---|
| Email/password authentication | Not implemented — upgrade path exists (Firebase `linkWithCredential`) |
| Google Sign-In | Not implemented — upgrade path exists (`linkWithCredential` preserves existing wishes) |
| Apple Sign-In | Not implemented |
| Phone/SMS authentication | Not implemented |
| Magic link (email) | Not implemented |
| Multi-device account sync | Not implemented — anonymous auth is single-device |

The `linkWithCredential` Firebase API allows migrating an anonymous user to a named
account while preserving their UID and all associated Firestore documents. This is
the planned upgrade path — the data model does not need to change to support it.

### Identity Provider

**Firebase Authentication (Google)** is the sole identity provider. It is trusted
because:
- It is a Google-managed service with 99.95% uptime SLA
- All tokens are cryptographically signed with Google's private keys; Firestore
  validates them server-side before honouring any read or write
- The Firebase JS SDK handles provider communication — the app never sees raw
  credentials

**If Firebase Auth is unavailable:**
The app cannot create new sessions for first-time users. Returning users (who have
a valid cached token) can continue to read from Firestore via the SDK's offline
persistence cache. The auth failure is caught in `AuthService.initAuth()` and the
user is shown an error state with a retry option. No fallback identity provider
exists — acceptable for a portfolio project.

---

## 2. Token and Session Management

### Token Lifecycle

Firebase Anonymous Auth issues one type of token:

| Token | Lifespan | Purpose |
|---|---|---|
| **Firebase ID Token (JWT)** | 1 hour | Attached to every Firestore and Storage SDK request as a Bearer token |

There are no refresh tokens in the traditional sense. Firebase uses a
**session cookie managed internally by the Firebase JS SDK** (not accessible
to application code) to silently issue new ID tokens before the current one expires.

### Where Tokens Are Stored

| Storage Location | What Is Stored | Why |
|---|---|---|
| Firebase SDK internal cache (IndexedDB in WebView) | The current ID token and session credentials | Managed by the Firebase JS SDK — not accessible to application code |
| `@capacitor/preferences` | `uid` and `username` only (not tokens) | Persistent identity reference across app restarts |

**The application never reads, stores, or transmits the raw JWT.** The Firebase SDK
handles all token attachment to requests internally. No token is ever written to
`localStorage`, component state, or Pinia stores.

### Refresh Strategy

Token refresh is **fully automatic** and managed by the Firebase JS SDK:

1. The SDK tracks token expiry internally
2. Before a token expires (or when an expired token is detected on a rejected request),
   the SDK silently calls Firebase Auth's token refresh endpoint
3. A new signed ID token is issued and stored internally by the SDK
4. All subsequent requests use the new token

**The application has no refresh logic.** No timer, no interceptor, no refresh
trigger is written in the app.

**If refresh fails** (e.g. prolonged offline, Firebase Auth outage):
- Firestore SDK serves reads from the offline persistence cache
- Writes are queued offline and retried when connectivity and auth are restored
- If the session is irrecoverably lost, `onAuthStateChanged` fires with `null` —
  `AuthService.initAuth()` detects this and calls `signInAnonymously()` to create
  a new session (new UID — existing wish history is inaccessible under the new UID)

**Infinite refresh loop prevention:** Not a concern with Firebase SDK-managed
refresh. The SDK uses exponential backoff on failed refresh attempts and does not
retry indefinitely.

### Token Revocation

Firebase ID tokens cannot be revoked in real time by the application layer (this
requires Firebase Admin SDK with server-side revocation, which requires Firebase
Functions — not available on the free Spark plan).

**Practical impact:** If an anonymous token were somehow compromised, it would
remain valid until its 1-hour expiry. For a portfolio project with 6 users and no
sensitive personal data beyond video recordings, this risk is acceptable.

**User-initiated "logout":** Not implemented. Anonymous auth has no meaningful logout
concept — the session is tied to the device install. Clearing app data or
uninstalling effectively ends the session (the anonymous UID is lost).

**Can users log out from all devices:** Not applicable — anonymous auth is
single-device by design.

---

## 3. Authorisation Model

### Access Control Model: RBAC (Role-Based Access Control)

Girigo uses a simple two-role RBAC model. Roles are stored as a `role` field on
each Firestore user document.

### Roles and Permissions

| Role | How Assigned | Permissions |
|---|---|---|
| `user` | Default — set automatically on account creation | Read own user document, write own user document; create wishes with own `uid`; read own wishes; receive push notifications |
| `admin` | Manual — set in Firebase Console by the developer | All `user` permissions; read all users and wishes; update wish status (one-way transitions only); delete any wish; access in-app admin panel |

### Permission Matrix

| Operation | `user` | `admin` |
|---|---|---|
| Read own user document | ✅ | ✅ |
| Write own user document (lastSeen, pushToken) | ✅ | ✅ |
| Self-assign `role: 'admin'` | ❌ | ❌ (set manually only) |
| Create a wish attributed to own `uid` | ✅ | ✅ |
| Create a wish attributed to another `uid` | ❌ | ❌ |
| Read own wishes | ✅ | ✅ |
| Read another user's wishes | ❌ | ✅ |
| Update wish status | ❌ | ✅ (pending → granted/rejected only) |
| Delete a wish | ❌ | ✅ |
| Access `/admin` route | ❌ | ✅ (after PIN gate) |
| Send push notifications | ❌ | ✅ |

### Are Permissions Static or Dynamic?

**Static.** The permission set for each role is fixed in code (Firestore security
rules and router guards). Roles are assigned manually — no dynamic permission
assignment exists.

### Where Permissions Are Defined and Enforced

| Layer | Mechanism | Bypassable? |
|---|---|---|
| **Firestore security rules** (server-side) | Checks `role` field via `get()` lookup on every read/write | No — enforced by Firebase infrastructure |
| **Firebase Storage security rules** (server-side) | Checks `uid` path matching and file constraints | No — enforced by Firebase infrastructure |
| **Vue Router navigation guard** (client-side) | Redirects non-admin users away from `/admin` | Yes — client-side only, UX convenience |
| **Admin PIN gate** (client-side) | SHA-256 PIN comparison before showing admin UI | Yes — client-side only, UX convenience |

**The client-side guards are UX conveniences only.** A user who bypasses them
(e.g. by modifying the client code) still cannot perform any admin operation because
every Firestore write and read is validated server-side by the security rules.

### What Must Never Bypass Authorization Checks

- The Firestore security rules must be deployed and active at all times — if rules
  are accidentally deleted or set to `allow read, write: if true`, the entire data
  layer is open. Verify rules are deployed via `firebase deploy --only firestore:rules`
  before distributing any APK.
- The `isAdmin()` function in the security rules uses `get()` to read the user's
  Firestore document — this means the `role` field on the user document is the
  authoritative source of admin status. No client-side flag can override it.

---

## 4. Session Security

### No Cookie-Based Sessions

Girigo does not use HTTP cookies. There is no server, no session cookie, no
`HttpOnly`/`Secure`/`SameSite` configuration to manage. The Firebase JS SDK uses
an internal token store (IndexedDB within the Capacitor WebView) that is not
accessible to JavaScript outside the SDK.

### Session Hijacking

The traditional session hijacking attack vector (stealing a session cookie via XSS)
does not apply because:
- No cookies are used
- The Firebase ID token is stored inside the SDK's internal IndexedDB — not in
  `localStorage` or any JavaScript-accessible location
- Vue 3 templates auto-escape all interpolated values — XSS via the app's own
  rendering is prevented

### Suspicious Session Detection

Not implemented in MVP. Firebase Auth provides basic anomaly detection at the
platform level (Google's infrastructure). No custom suspicious session detection
is built for a 6-user portfolio project.

---

## 5. Password and Credential Security

### No Passwords in MVP

There are no passwords in Girigo. Anonymous authentication requires no credential
from the user. Password storage, hashing, policies, breach checking, and reset
flows do not apply to the MVP.

If email/password auth is added in a future upgrade, Firebase Authentication handles
password hashing (scrypt by default) — the application never sees or stores raw
passwords.

### Admin PIN

The only credential-adjacent element is the **admin panel PIN**. This is a
UX gate, not a security mechanism. Details:

| Property | Value |
|---|---|
| Storage format | SHA-256 hash of the PIN, stored as `pinHash` field on the admin's Firestore user document |
| Hashing algorithm | SHA-256 via the Web Crypto API (built into the browser — no library required) |
| Salt | None — PIN is hashed unsalted |
| Verification | Client-side: app computes SHA-256(entered PIN) and compares to stored `pinHash` |
| Security classification | UX gate only — not a cryptographic security measure |

**Why no salt?** Unsalted SHA-256 is weak for credential storage (vulnerable to
rainbow tables). However, the admin PIN is not a security credential — it prevents
accidental access to the admin UI on a shared device. The actual security layer is
the Firestore server-side rules, which check `role === 'admin'` regardless of
whether the PIN was entered. An attacker who bypasses the PIN check still cannot
perform admin operations. For this reason, bcrypt or Argon2 would be over-engineering
for what is essentially a screen lock.

**Setting up the admin PIN (initial configuration):**

```ts
// Run once in a browser console or Node.js script to generate the pinHash
const pin = '123456' // choose your PIN
const encoder = new TextEncoder()
const data = encoder.encode(pin)
const hashBuffer = await crypto.subtle.digest('SHA-256', data)
const hashArray = Array.from(new Uint8Array(hashBuffer))
const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
console.log(hashHex) // paste this into Firestore as pinHash
```

Paste the output into the admin's Firestore user document as the `pinHash` field
via the Firebase Console.

---

## 6. Abuse Protection

### Available Protections Within the Free Tier

Firebase Functions (which would enable custom rate limiting) are not available on the
free Spark plan. The following protections exist within the current architecture:

| Threat | Protection |
|---|---|
| User reading another user's data | Firestore security rules enforce per-`uid` data isolation at the server level |
| User creating wishes attributed to another user | Security rules check `request.resource.data.uid == request.auth.uid` |
| User self-assigning admin role | Security rules block `role` field updates by non-admin users |
| Excessive wish submissions (spam) | No hard limit — acceptable at 6 users; Firebase Storage cost pressure (5GB free) provides a natural cap |
| Brute-force admin PIN | No server-side enforcement — PIN is a UX gate; the server rejects admin operations via Firestore rules regardless |
| Anonymous account farming | Each anonymous account can only access its own data; farming accounts produces no advantage |

### Firebase Platform-Level Protections

Firebase Authentication includes platform-level abuse protection maintained by
Google:
- Automatic blocking of malicious authentication traffic
- Rate limiting on `signInAnonymously()` calls per IP (handled by Firebase
  infrastructure, not configurable)

### What Is Not Protected in MVP

| Gap | Future Mitigation |
|---|---|
| No per-user wish submission rate limit | Implement with Firebase Functions (requires Blaze plan) |
| No CAPTCHA or challenge on anonymous sign-in | Not needed for a closed 6-user portfolio project |
| No brute-force protection on admin PIN | Acceptable — Firestore rules are the real security layer |

---

## 7. Multi-Factor Authentication (MFA)

**Not applicable in MVP.**

MFA applies to credential-based authentication (email/password, phone). Girigo uses
anonymous authentication — there is no credential to protect with a second factor.

If email/password authentication is added in a future upgrade, Firebase Authentication
supports TOTP-based MFA via `multiFactor` enrolment. This would be added at that
time.

---

## 8. Account Lifecycle

### Account Creation

| Step | What Happens |
|---|---|
| 1 | App launches for the first time — no existing session in Firebase SDK cache |
| 2 | `AuthService.initAuth()` calls `signInAnonymously()` |
| 3 | Firebase Auth creates a new anonymous user with a unique UID |
| 4 | A display username is generated client-side (format: `adjective_noun_NNNNN`) |
| 5 | `uid` and `username` are written to `@capacitor/preferences` |
| 6 | A user document is created at `/users/{uid}` in Firestore with `role: 'user'` |
| 7 | FCM push token registration is attempted |
| 8 | User is navigated to the onboarding screens |

No email verification, phone verification, or any user-provided identity is required.
Account creation is invisible to the user — they never experience a "sign up" flow.

### Account Changes

There are no user-facing account change features in MVP. Users cannot change their
username, email, password, or any account setting. The username is generated once
and displayed as a cosmetic label only.

The `lastSeen` and `pushToken` fields on the user document are updated automatically
by the app — not by user action.

### Re-authentication

Not applicable — there is no credential to re-authenticate with.

### Account Deletion and Deactivation

**Account deletion is not available to users in MVP.** There is no "delete my
account" feature. The anonymous session persists for the lifetime of the app install.

**Effective account termination** occurs when the user:
- Uninstalls the app (anonymous UID is lost; account becomes orphaned in Firebase)
- Clears the app's data via Android Settings (same effect as uninstall)

In both cases, the Firestore user document and wish documents remain in the database
but are permanently inaccessible (no valid UID can reach them). Orphaned documents
from uninstalled accounts are acceptable at this scale.

**Admin-initiated removal:** An admin can delete individual wishes via the admin
panel. There is no admin feature to delete a user account or ban a user in MVP.

### Anonymous Identity Persistence Warning

This is a critical known limitation that should be communicated clearly in the
app's onboarding or a future "about" screen:

> Reinstalling the app creates a new identity. Your wish history from before the
> reinstall is not recoverable.

This is inherent to anonymous authentication. The `linkWithCredential` upgrade path
(Google Sign-In or email/password) would allow persistent identity across installs —
structure exists in the codebase for this future addition.

---

## 9. API Security Integration

### How Auth Is Enforced on Every Request

The Firebase JS SDK automatically attaches the current user's ID token as a signed
JWT Bearer token to every Firestore and Firebase Storage request. This happens
internally — no application code adds auth headers.

**The app never makes an unauthenticated Firebase request** (after first launch)
because `AuthService.initAuth()` resolves before any Firestore operation is
attempted, and the Vue Router guard prevents navigation to any data-fetching screen
until auth is confirmed.

### How Tokens Are Validated

Token validation is performed entirely by Firebase's server-side infrastructure:
1. Firebase receives the JWT Bearer token on every SDK request
2. Firebase verifies the token's cryptographic signature against Google's public keys
3. Firebase checks the token's expiry (`exp` claim) and audience (`aud` claim)
4. If valid, the request proceeds; `request.auth.uid` is available in security rules

The application never validates tokens manually — this would be duplicating Firebase's
server-side work incorrectly.

### On Expired or Malformed Token

| Scenario | Firebase SDK Behaviour | App Behaviour |
|---|---|---|
| Token expired | SDK automatically refreshes silently before the request fails | Request succeeds with new token — transparent to app |
| Refresh fails (offline) | SDK queues the operation offline | Firestore reads served from cache; writes queued for retry |
| Token malformed or tampered | Firebase rejects the request with `permission-denied` | Service layer catches and surfaces "Something went wrong. Please try again." |
| No auth session at all | Firebase rejects all requests | `AuthService.initAuth()` re-runs `signInAnonymously()` |

### Standard Auth Error Response

Firebase SDK errors relevant to auth are caught in the `AuthService` and service
layer. The standard error handling pattern:

```ts
try {
  await signInAnonymously(auth)
} catch (error) {
  // Firebase error codes: auth/network-request-failed, auth/too-many-requests
  console.error('AuthService.signInAnonymously failed:', error)
  throw new Error('Could not connect. Please check your internet connection.')
}
```

No Firebase error codes are ever surfaced to the UI layer.

---

## 10. Trust Boundaries and Threat Model

### Trust Hierarchy

| Component | Trust Level | Reasoning |
|---|---|---|
| Firebase Auth (Google servers) | Fully trusted | Cryptographically signed tokens; Google's infrastructure |
| Firestore security rules | Fully trusted | Server-side, cannot be modified by the client |
| Firebase Storage rules | Fully trusted | Server-side, cannot be modified by the client |
| Firebase JS SDK | Trusted | Official SDK from Google; handles token management securely |
| Capacitor WebView | Partially trusted | Isolated OS WebView; not accessible to other apps on the device |
| Vue application code | Untrusted for security decisions | Client-side code can be modified; all security decisions are server-side |
| Device (Android/iOS) | Untrusted | Physical device could be compromised; no sensitive credentials stored |

### Top Threats and Mitigations

**Threat 1 — Token theft via XSS**
- Risk: Attacker injects JavaScript that reads the Firebase ID token
- Mitigation: Firebase SDK stores tokens in IndexedDB — not readable via
  `document.cookie` or standard `localStorage` access. Vue 3 auto-escapes all
  template interpolation. `v-html` is prohibited in the codebase.
- Residual risk: Low

**Threat 2 — Privilege escalation (user → admin)**
- Risk: User modifies client-side code to bypass the router guard or PIN check
  and access admin functionality
- Mitigation: Router guard and PIN are UX conveniences only. All admin operations
  (read all wishes, update status, delete) are rejected by Firestore security rules
  server-side if the user's `role` is not `'admin'`. Bypassing the client-side check
  gains the attacker nothing.
- Residual risk: None for data access; the admin UI would be visible but non-functional

**Threat 3 — Cross-user data access**
- Risk: User constructs a Firestore query to read another user's wishes
- Mitigation: Security rules enforce `resource.data.uid == request.auth.uid` on all
  wish reads. The server rejects any query that would return another user's documents.
  Client-side filtering alone would be insufficient — the rules enforce this at the
  database level.
- Residual risk: None

**Threat 4 — Fake wish creation (attributing a wish to another user's UID)**
- Risk: User crafts a Firestore write with a different user's UID in the `uid` field
- Mitigation: Security rules check `request.resource.data.uid == request.auth.uid`
  on every wish creation. A write with a mismatched UID is rejected.
- Residual risk: None

**Threat 5 — Storage path traversal (uploading to another user's folder)**
- Risk: User uploads a video to `/wishVideos/{other-uid}/{wishId}.mp4`
- Mitigation: Storage rules check `request.auth.uid == uid` where `uid` is extracted
  from the path. Writes to another user's path are rejected.
- Residual risk: None

**Threat 6 — Replay attacks**
- Risk: Attacker intercepts and replays a Firebase request with a valid token
- Mitigation: Firebase ID tokens include a `jti` (JWT ID) claim. Firebase's
  infrastructure detects and rejects replayed tokens. HTTPS (enforced by Firebase SDK)
  prevents interception in transit.
- Residual risk: None

**Threat 7 — Anonymous account creates excessive wishes (storage abuse)**
- Risk: Attacker creates many anonymous accounts and fills Firebase Storage
- Mitigation: Storage rules enforce a 20MB per-file limit. No per-user quota exists
  in MVP (Firebase Functions required). At 6 invited users on a portfolio project,
  this is not a realistic threat.
- Residual risk: Low — no mitigation needed at this scale

---

## 11. Audit and Monitoring

### Authentication Events Tracked

| Event | Where Logged |
|---|---|
| Successful anonymous sign-in | Firebase Console → Authentication → Users (automatic) |
| New anonymous user created | Firebase Console → Authentication → Users (automatic) |
| Token refresh | Firebase SDK internal — not surfaced to the app |
| Auth errors (network failure, too-many-requests) | Firebase Crashlytics via `AuthService` error logging |

Firebase Analytics automatically tracks the `login` event when `signInAnonymously()`
succeeds (mapped via Firebase's automatic event collection).

### Admin Actions Tracked

Admin actions leave a natural audit trail in Firestore document fields:
- `grantedAt` timestamp records when a wish was reviewed
- `status` records the outcome
- `adminMessage` records what was communicated to the user

No dedicated audit log collection exists in MVP — see `database.md` Section 12 for
the rationale and future upgrade path.

### Detecting Suspicious Behaviour

Firebase Auth provides platform-level anomaly detection (Google infrastructure).
No custom suspicious behaviour detection is implemented in MVP. Given the 6-user
closed portfolio context, alerting infrastructure would be over-engineering.

---

## 12. Compliance and Privacy

### Applicable Regulation: Singapore PDPA

The developer is based in Singapore and the app's test users are in Singapore.
The **Personal Data Protection Act (PDPA)** technically applies to any organisation
that collects, uses, or discloses personal data about individuals.

The app collects:
- **Video recordings** — personal data (biometric information, likeness, voice)
- **Wish text** — potentially personal data (personal expression)
- **Anonymous device identity** — not directly personally identifiable without
  cross-referencing

**Practical position for MVP:**
All six users are invited friends who are explicitly told they are testing a
portfolio app. Informed consent is implicit in their participation. No data is
shared with third parties beyond Google (Firebase). No data is sold or monetised.

**Minimum acceptable privacy practice for MVP:**
The permissions explanation screen (already specified in the onboarding flow) should
clearly state:
- What data is collected (video, text, device identifier)
- Why it is collected (app functionality)
- Who can see it (the developer/admin)
- That it is stored on Google Firebase

This is not a full PDPA-compliant privacy notice but is sufficient for a portfolio
project with six consenting test users.

### GDPR

Not applicable — no EU users are targeted or expected.

### Data Retention

No formal retention policy in MVP. See `database.md` Section 4 for the retention
approach (data kept until Firebase free tier limits are approached or the project
is decommissioned).

---

## 13. Developer and Testing Considerations

### Authenticating in Local Development

`ionic serve` runs the app in Chrome as a standard web context. Firebase anonymous
auth works identically in the browser — a new anonymous UID is issued on first visit
and persists in the browser's IndexedDB.

**Development anonymous UID is separate from device UID.** The developer will have
a different UID in the browser (`ionic serve`) than on their physical Android device.
Both can exist simultaneously in Firebase Auth and Firestore.

**Setting up the admin account (one-time developer setup):**

1. Run `ionic serve` — app creates an anonymous user in Firebase
2. Open the app, note that a new user appears in Firebase Console → Authentication
3. Copy the UID from Firebase Console
4. Go to Firebase Console → Firestore → `/users/{uid}` → Edit document
5. Change `role` from `'user'` to `'admin'`
6. Generate the admin PIN hash (see Section 5) and add `pinHash` field to the document
7. The admin panel is now accessible via the 5-tap gesture on this browser session

Repeat step 1–6 on the physical device to set up admin access on the developer's phone.

### Testing Auth Flows

| Scenario | How to Test |
|---|---|
| First launch (new user) | Clear site data in Chrome DevTools (Application → Storage → Clear) and reload |
| Returning user | Reload the app without clearing data — existing UID and wish list should load |
| Auth failure simulation | Use Chrome DevTools → Network → Offline mode during app launch |
| Admin access | Set `role: 'admin'` in Firebase Console for the current session's UID |
| Non-admin blocked from admin route | Use a non-admin UID session and attempt to navigate to `/admin` directly |
| Firestore rules testing | Firebase Console → Firestore → Rules → Rules Playground — test reads/writes as specific UIDs |

### Firebase Local Emulator for Auth Testing

The **Firebase Local Emulator Suite** includes an Auth emulator that simulates
`signInAnonymously()` without making real Firebase network requests. Useful for
offline development and CI testing:

```bash
firebase emulators:start --only auth,firestore
```

In the app, point to the local emulator during test runs:

```ts
// Only in test/emulator mode — never in production
import { connectAuthEmulator } from 'firebase/auth'
import { connectFirestoreEmulator } from 'firebase/firestore'

if (import.meta.env.VITE_USE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099')
  connectFirestoreEmulator(db, 'localhost', 8080)
}
```

Add `VITE_USE_EMULATOR=true` to `.env.test` (gitignored). Never set this in
`.env` or `.env.example`.

### Test Users

There are no persistent test user accounts. Each test session creates a fresh
anonymous UID. For Firestore security rules integration tests (run against the
emulator), test UIDs are generated inline within the test:

```ts
// In a Vitest integration test using the Firestore emulator
const testUserUid = 'test-user-uid-001'
const testAdminUid = 'test-admin-uid-001'

// Set up admin document in emulator before tests run
await setDoc(doc(db, 'users', testAdminUid), {
  uid: testAdminUid,
  role: 'admin',
  // ...other required fields
})
```

No test data is ever written to the production Firebase project.