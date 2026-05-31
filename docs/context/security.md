# security.md — Girigo App Security

---

## Framing Note

Girigo has no custom backend server. Firebase manages all infrastructure security
(network isolation, encryption at rest, DDoS protection, server hardening). This
document focuses on the security responsibilities that fall to the application layer:
Firestore and Storage security rules, client-side security, secrets management,
dependency hygiene, and the threat model specific to a Firebase BaaS + Capacitor
mobile app.

---

## 1. Threat Modeling

### Critical Assets

| Asset | Sensitivity | Why It Matters |
|---|---|---|
| User video recordings | Medium | Personal recordings — private to the submitting user |
| Wish text | Low–Medium | Personal expression — private to the submitting user |
| Firebase Auth anonymous UID | Low | Not a secret, but links a device to its data |
| Firestore security rules | High | If misconfigured, the entire database is exposed |
| FCM legacy server key (in `.env`) | High | Anyone with this key can send push notifications to any device on the project |
| Admin PIN hash | Low–Medium | UX gate only — real security is Firestore rules |
| Android APK signing keystore | High | If compromised, attacker can publish fake signed APKs |

### Potential Attackers

| Attacker | Realistic? | Motivation |
|---|---|---|
| **Automated bots** | Low — Firebase config is technically public; bots could interact with the Firebase project | Spam wish submissions, storage abuse |
| **Authenticated user (one of 6 friends)** | Very low | Curiosity — attempting to read another user's wishes |
| **The developer (accidental misconfiguration)** | Medium | Deploying incorrect Firestore rules that open the database |
| **APK reverse engineer** | Very low | Extracting Firebase config or FCM server key from the APK |
| **Insider threat** | Not applicable | Solo developer — no team |

### Attack Scenarios

---

**Scenario 1 — Firestore Rules Misconfiguration**
- **How it executes:** Developer accidentally deploys `allow read, write: if true` rules
  (common mistake when testing locally) to production.
- **Target:** Entire Firestore database — all user documents and wish documents.
- **Impact:** Any authenticated user can read all users' wishes and modify any document.
  Catastrophic — complete data exposure.
- **Likelihood:** Medium (a common developer error with Firebase).
- **Impact if successful:** High.
- **Mitigation:** Rules are stored in `firestore.rules` in version control, reviewed
  before every `firebase deploy`, and tested against the Firebase Local Emulator
  before deployment. The CI pipeline runs rules integration tests before any merge
  to `main`. Never deploy rules manually without a test run.

---

**Scenario 2 — Firebase Config Extraction from APK**
- **How it executes:** Attacker decompiles the APK using `apktool` or `jadx`,
  extracts `google-services.json` or the `VITE_FIREBASE_API_KEY` value from the
  bundled JavaScript.
- **Target:** Firebase project API key, project ID, storage bucket.
- **Impact:** Attacker can interact with the Firebase project as an anonymous user —
  submit wishes, create accounts. They cannot read other users' data (Firestore rules
  prevent this) and cannot perform admin operations.
- **Likelihood:** Low — requires deliberate decompilation effort.
- **Impact if successful:** Low — Firebase config is designed to be public. Security
  comes from Firestore rules, not config obscurity. See `tech-stack.md` Section 9.
- **Mitigation:** Ensure Firestore and Storage rules are correctly deployed. The
  config being exposed is a known and accepted property of Firebase architecture, not
  a vulnerability.

---

**Scenario 3 — FCM Server Key Extraction from APK**
- **How it executes:** Same decompilation approach as Scenario 2. The FCM legacy
  server key (stored in `.env` and baked into the APK build) is extracted from the
  bundled JavaScript.
- **Target:** FCM push notification capability.
- **Impact:** Attacker can send push notifications to any device registered on this
  Firebase project. Notifications are cosmetic — they cannot exfiltrate data or
  execute code on the device.
- **Likelihood:** Low — requires deliberate decompilation effort.
- **Impact if successful:** Medium — spam notifications to 6 test users. Annoying
  but not data-compromising.
- **Known limitation:** This is a documented architectural compromise. The correct
  solution (server-side FCM via Firebase Functions) requires the Blaze plan. For a
  portfolio project with 6 users, the risk is accepted. See `backend.md` Section 8.
- **Mitigation path:** Upgrade to Blaze plan → implement Firebase Function triggered
  on wish status change → remove FCM key from client entirely.

---

**Scenario 4 — Cross-User Data Access (Broken Access Control)**
- **How it executes:** A user modifies the Ionic app's JavaScript (using browser
  DevTools during `ionic serve`, or by patching the APK) to construct a Firestore
  query without the `uid` filter, attempting to read all wishes.
- **Target:** Other users' wish documents and videos.
- **Impact:** If rules are correct: zero — the server rejects the query.
  If rules are misconfigured: full exposure of all wishes.
- **Likelihood:** Very low — requires technical knowledge.
- **Impact if successful (rules correct):** None.
- **Impact if successful (rules misconfigured):** High.
- **Mitigation:** Firestore security rules enforce `resource.data.uid == request.auth.uid`
  server-side on all wish reads. Client-side filtering is a UX convenience only and
  is not relied upon for security.

---

**Scenario 5 — XSS via Wish Text**
- **How it executes:** User submits wish text containing `<script>alert(1)</script>`
  or other HTML/JavaScript as their wish text. Admin views the wish text in the admin
  panel and the script executes.
- **Target:** Admin's browser session (during `ionic serve`) or admin's device WebView.
- **Impact:** In a traditional web app, this could steal the admin's session. In
  Girigo, the anonymous admin session has no meaningful value to an attacker (it
  can only access the admin's own data). Practical impact is minimal.
- **Likelihood:** Low — requires a malicious user among the 6 test users.
- **Mitigation:** Vue 3 templates auto-escape all interpolated values. Wish text is
  rendered via `{{ wish.wishText }}` — never via `v-html`. The `v-html` directive is
  prohibited in the codebase and blocked by ESLint rule `vue/no-v-html`.
- **Residual risk:** None for data theft. Cosmetic text would render as literal
  HTML-escaped characters.

---

**Scenario 6 — Privilege Escalation (User → Admin)**
- **How it executes:** User modifies the Ionic app's JavaScript to bypass the router
  guard check for `/admin`, or enters the hidden 5-tap gesture and guesses/bypasses
  the PIN.
- **Target:** Admin panel UI and admin Firestore operations.
- **Impact:** Admin UI becomes visible but all admin Firestore operations
  (read all wishes, update status, delete wish) are rejected server-side by
  Firestore rules checking `role === 'admin'`.
- **Likelihood:** Very low.
- **Impact if successful:** None for data access. Admin UI is visible but non-functional.
- **Mitigation:** Client-side guards are explicitly documented as UX conveniences.
  Server-side Firestore rules are the authoritative enforcement layer.

---

**Scenario 7 — Android APK Signing Key Compromise**
- **How it executes:** GitHub Secrets storing the APK signing keystore or keystore
  password are exposed (e.g., via a GitHub Actions workflow vulnerability or
  accidental logging).
- **Target:** APK signing integrity.
- **Impact:** Attacker could publish a modified APK with the same signing certificate,
  which Android would accept as an upgrade to the legitimate app. Users who install
  the malicious APK could have data exfiltrated.
- **Likelihood:** Very low — GitHub Secrets are not exposed in workflow logs by design.
- **Mitigation:** Keystore and password stored only in GitHub Secrets. Never committed
  to the repository. Rotate the keystore if a compromise is suspected (requires users
  to reinstall from scratch — acceptable for a portfolio app).

### Likelihood vs Impact Summary

| Threat | Likelihood | Impact | Priority |
|---|---|---|---|
| Firestore rules misconfiguration | Medium | High | **High** — prevent with CI rules tests |
| FCM key extraction from APK | Low | Medium | Medium — accepted limitation, documented |
| Cross-user data access | Very low | None (if rules correct) | Low |
| XSS via wish text | Low | None (Vue auto-escaping) | Low |
| Firebase config extraction | Low | Low (by design) | Low |
| Privilege escalation | Very low | None (server rules) | Low |
| APK key compromise | Very low | High | Medium — mitigated by GitHub Secrets |

---

## 2. Attack Surface Mapping

### Publicly Exposed Endpoints

There are no custom HTTP endpoints. The publicly reachable surfaces are all
Firebase-managed:

| Surface | Exposed To | Protected By |
|---|---|---|
| Firebase Auth (`identitytoolkit.googleapis.com`) | Public internet | Firebase platform infrastructure |
| Firestore (`firestore.googleapis.com`) | Public internet | Firestore security rules + Auth token validation |
| Firebase Storage (`firebasestorage.googleapis.com`) | Public internet | Storage security rules + Auth token validation |
| FCM send endpoint (`fcm.googleapis.com`) | Public internet (with server key) | FCM server key (stored in `.env`, known limitation — see Scenario 3) |
| GitHub Pages download page (`/docs/index.html`) | Public internet | No auth — static page only |
| APK download URL (GitHub Release asset) | Public internet | No auth — APK is a public distribution artifact |

### User-Controlled Inputs

| Input | Where Accepted | Risk Level |
|---|---|---|
| Wish text (max 280 chars) | `PreviewView` → Firestore | Low — rendered as escaped text, never as HTML |
| Video file (MP4, max 20MB) | `RecordView` → Firebase Storage | Medium — binary content, validated by Storage rules for MIME type and size |
| Thumbnail (JPEG) | Generated client-side → Firebase Storage | Low — generated by the app, not user-supplied directly |
| Admin message text (max 500 chars) | `AdminWishDetailView` → Firestore | Low — rendered as escaped text |
| Admin PIN (numeric) | `AdminView` | Low — UX gate only |

### What Accepts Untrusted Input

- **Firestore** accepts the wish text and admin message as string fields. These are
  treated as data, never as executable content. Vue's template rendering ensures
  they are always HTML-escaped.
- **Firebase Storage** accepts video file uploads. The Storage security rules enforce
  MIME type (`video/*`) and file size (≤20MB) server-side.

### Internal Services Assumed Trusted

The Firebase JS SDK is treated as trusted infrastructure. The Firestore and Storage
security rules are the server-side enforcement layer — they are not "assumed trusted"
but actively verified on every request by Firebase's infrastructure.

---

## 3. Input Handling and Validation

### Validation Layers

| Input | Frontend Validation | Backend Validation (Firebase Rules) |
|---|---|---|
| Wish text | Max 280 chars enforced in UI; character counter | No server-side length enforcement (acceptable — rules focus on structure, not content length) |
| Admin message | Max 500 chars enforced in UI | No server-side length enforcement |
| Video file MIME type | Capacitor camera plugin provides the file — MIME type is app-controlled, not user-typed | Storage rules: `request.resource.contentType.matches('video/.*')` |
| Video file size | Compressed client-side to target <20MB before upload | Storage rules: `request.resource.size < 20 * 1024 * 1024` |
| Firestore `uid` field on wish creation | Service layer sets `uid` from `auth.currentUser.uid` | Rules: `request.resource.data.uid == request.auth.uid` |
| Firestore `status` on creation | Service layer always sets `status: 'pending'` | Rules: enforced via update-only transition check |
| `videoUrl` and `thumbnailUrl` non-empty | Service layer validates before calling Firestore | Rules: `request.resource.data.videoUrl != ''` |

### Sanitisation vs Validation

**Validation** (reject if invalid): Used for all inputs. File size, MIME type,
field presence, `uid` matching — all validated before or at the Firebase layer.

**Sanitisation** (clean before use): Not required. No user input is rendered as
HTML. Vue 3 templates auto-escape all string interpolation. The app does not use
`innerHTML`, `document.write`, or `v-html` anywhere — these are prohibited by
ESLint rule and code convention.

### Most Dangerous Inputs

| Input | Why Dangerous | Mitigation |
|---|---|---|
| Video file upload | Binary content; could be a non-video file with a `video/mp4` extension | Storage rules enforce MIME type server-side; Capacitor camera plugin provides the file directly from the device camera (not user-selected from filesystem) |
| Wish text | Could contain HTML/script tags if rendered unsafely | Vue auto-escaping; `v-html` is prohibited |
| FCM server key (in `.env`) | Sensitive credential baked into APK build | Stored in `.env` (gitignored); baked into APK at build time — known limitation, documented |

---

## 4. Authentication and Authorisation Security

Covered in full in `auth.md`. Security-focused summary:

### Auth Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Token leakage via XSS | Firebase SDK stores tokens in IndexedDB — not accessible via JavaScript outside the SDK. XSS via the app's own rendering is prevented by Vue 3 auto-escaping. |
| Privilege escalation (user → admin) | Client-side router guard is UX only. All admin Firestore operations are rejected server-side by rules checking `role === 'admin'`. |
| Session hijacking via token theft | No cookies. Firebase tokens are in SDK-internal storage. HTTPS enforced by Firebase SDK on all requests. |
| Anonymous account farming for storage abuse | Each anonymous account can only write to its own Storage path. No cross-user benefit. File size limit (20MB) and free Storage limit (5GB total) constrain total abuse potential. |
| Admin PIN brute force | PIN is client-side UX only. No rate limiting on PIN attempts (acceptable — Firestore rules are the real security layer). |

### Responding to a Compromised Account

For a portfolio project with 6 users and anonymous auth:
1. Navigate to Firebase Console → Authentication
2. Identify the anonymous UID (from Firestore wish documents if the user reported
   a specific wish)
3. Disable the user account in Firebase Console → Authentication → Users →
   Disable account
4. Delete abusive content via the admin panel
5. Review and tighten Firestore security rules if the compromise exploited a rule gap

---

## 5. Data Protection

### Sensitive Data Classification

| Data | Classification | Rationale |
|---|---|---|
| User video recordings | **Sensitive** | Personal recordings — voice, likeness, private expression |
| Wish text | **Internal** | Personal expression, visible only to owner and admin |
| Firebase anonymous UID | **Internal** | Not personally identifiable in isolation; links device to data |
| FCM push token | **Internal** | Could be used to send unwanted notifications if extracted |
| Admin PIN hash | **Internal** | UX gate; not a cryptographic secret |
| APK signing keystore | **Highly sensitive** | Compromise allows publishing fake signed APKs |
| FCM legacy server key | **Highly sensitive** | Allows sending notifications to any device on the project |
| Firebase Auth tokens (JWTs) | **Highly sensitive** | Grant API access; managed by SDK, never exposed to app code |
| `username`, `createdAt`, `lastSeen` | **Internal** | Non-sensitive metadata |

### Encryption

**At rest:**

| Data | Encryption | Managed By |
|---|---|---|
| Firestore documents | AES-256 | Google (automatic, not configurable) |
| Firebase Storage files (videos, thumbnails) | AES-256 | Google (automatic, not configurable) |
| Firebase Auth credentials | AES-256 | Google (automatic) |
| `@capacitor/preferences` (uid, username) | Not encrypted | iOS: NSUserDefaults; Android: SharedPreferences — unencrypted. Only non-sensitive data is stored here. |

**In transit:**

All Firebase SDK communications use **TLS 1.2+ (HTTPS)**. This is enforced by the
Firebase SDK and cannot be disabled. The app makes no unencrypted network requests.
Capacitor's `WKWebView` (iOS) and `WebView` (Android API 24+) both enforce modern
TLS by default.

### Key Management

Encryption keys for Firestore and Firebase Storage are managed entirely by Google.
The application has no access to, and no responsibility for, encryption key rotation
or storage.

**Application-level secrets** (FCM server key, APK signing keystore) are managed as
described in Section 10 (Secrets Management).

---

## 6. API and Application Security

### Injection Attacks

**SQL injection:** Not applicable — Firestore is a NoSQL document store. Queries
are constructed via the Firebase SDK's typed API (`query()`, `where()`, `orderBy()`)
— never via string concatenation.

**NoSQL injection:** Firestore's SDK does not accept raw query strings. All query
conditions are typed method calls. There is no mechanism for a user to inject a
modified query through the app's input fields — wish text and admin messages are
stored as string values, never as query parameters.

**XSS injection:** Mitigated by Vue 3 auto-escaping and the prohibition of `v-html`.
See Section 3.

### Mass Assignment

Firestore `setDoc` and `updateDoc` calls specify exact field sets in the service
layer. No user-provided object is spread directly into a Firestore write:

```ts
// Safe — explicit field enumeration
await setDoc(wishRef, {
  wishId: data.wishId,
  uid: data.uid,
  wishText: data.wishText,
  videoUrl: data.videoUrl,
  thumbnailUrl: data.thumbnailUrl,
  status: 'pending',          // always set by service, never from user input
  createdAt: serverTimestamp(),
  grantedAt: null,
  adminMessage: null,
  viewed: false,
})

// Never do this — mass assignment from untrusted input
// await setDoc(wishRef, { ...userProvidedObject })
```

### Broken Access Control

The primary mitigation is Firestore security rules — server-side, non-bypassable.
Client-side access control (router guard, `isAdmin` checks in components) exists as
UX convenience only and is not relied upon for security.

### Response Filtering

Firestore returns complete documents. The security rules ensure users only receive
documents they are permitted to read — there is no server-side field-level filtering
in MVP. The `role` field and `pinHash` field on user documents are readable by the
document owner, which is acceptable since they contain no other users' data.

### Rate Limiting

No custom rate limiting is implemented in MVP. Firebase Functions (required for
custom server-side rate limiting) are not available on the free Spark plan.
Firebase Auth's platform-level rate limiting applies to authentication requests.
Storage rules enforce per-file size limits (20MB) which constrain storage abuse.

---

## 7. Client-Side Security

### XSS Prevention

| Mechanism | Detail |
|---|---|
| Vue 3 template auto-escaping | All `{{ value }}` interpolations are HTML-escaped by the Vue compiler |
| `v-html` prohibition | ESLint rule `vue/no-v-html` prevents use of raw HTML rendering |
| No `innerHTML` or `document.write` | Not used anywhere in the codebase |
| Content Security Policy | Not formally configured in MVP (Capacitor WebView). A future hardening step. |

### Unsafe Content Handling

The app renders only its own developer-controlled UI components and user-provided
text strings (wish text, admin messages). User text is always rendered as escaped
plain text. No user-provided content is ever treated as markup or code.

### Data Stored in the Browser / WebView

| Data | Storage Location | Sensitivity |
|---|---|---|
| Firebase Auth session (JWT) | Firebase SDK internal (IndexedDB) | High — managed by SDK, not app code |
| `uid`, `username`, onboarding state | `@capacitor/preferences` | Low |
| Pinia store state | In-memory (lost on app kill) | Low |
| Firestore offline cache | Firestore SDK internal (IndexedDB) | Medium — contains wish content |

The Firestore offline cache contains wish documents and user profile data. On Android,
this IndexedDB data is stored in the app's private data directory (`/data/data/com.girigo.app/`)
which requires root access to read from another app. On iOS, it is similarly protected
by the app sandbox. This is an acceptable security posture for the data sensitivity level.

### If the Client Is Fully Compromised

If an attacker has full access to the device (physical access, rooted device):
- They can read the Firestore offline cache (wish content belonging to the device's
  anonymous user only)
- They can read the `uid` and `username` from `@capacitor/preferences`
- They **cannot** read other users' data — Firestore rules enforce server-side
- They **cannot** impersonate the admin — Firestore rules check `role === 'admin'`
  on the server using the authenticated UID

A fully compromised device exposes only the data belonging to the device owner's
anonymous account — the same data the legitimate user can already access.

---

## 8. Infrastructure and Network Security

### Firebase Manages Infrastructure Security

Girigo has no custom servers, no VPCs, no load balancers, and no firewall rules to
configure. All infrastructure security is managed by Google:

| Concern | Managed By |
|---|---|
| DDoS protection | Firebase/Google infrastructure |
| Network isolation between Firebase services | Google internal network |
| Server hardening | Google |
| Physical data centre security | Google |
| TLS certificate management | Google (all Firebase endpoints) |

### What Is Exposed to the Public Internet

| Surface | Notes |
|---|---|
| Firebase Auth endpoint | Public — required for anonymous sign-in |
| Firestore read/write endpoint | Public — protected by security rules |
| Firebase Storage upload/download | Public — protected by security rules |
| FCM send endpoint | Public — protected by FCM server key |
| GitHub Pages (download site) | Public — static HTML only |
| GitHub Release APK asset | Public — APK download link |

No internal services are exposed externally. There are no internal services — all
services are Firebase-managed platform services.

---

## 9. Dependency and Supply Chain Security

### Core Dependencies

| Package | Publisher | Security Track Record |
|---|---|---|
| `firebase` (JS SDK) | Google | Actively maintained; security patches issued regularly |
| `@ionic/vue` | Ionic (Appflow) | Actively maintained; commercial backing |
| `@capacitor/core` | Ionic | Actively maintained |
| `@capacitor/camera`, `@capacitor/push-notifications` | Ionic | Actively maintained |
| `vue` | Vue core team | Actively maintained; strong security history |
| `pinia` | Vue core team | Actively maintained |
| `vite` | Evan You + community | Actively maintained; frequent releases |

### Vulnerability Tracking

- **`npm audit`** is run as a step in the GitHub Actions CI pipeline (`build.yml`)
  before every build. A high-severity vulnerability in a direct dependency blocks
  the build.
- **Dependabot** (GitHub's automated dependency scanner) is enabled on the repository
  to surface vulnerabilities in both direct and transitive dependencies.

### Dependency Update Policy

| Version Type | Update Frequency | Review Required |
|---|---|---|
| Patch (`x.x.1`) | As soon as available (Dependabot PR) | No — auto-merge if CI passes |
| Minor (`x.1.x`) | Monthly review | Yes — check changelog for breaking changes |
| Major (`1.x.x`) | Planned upgrade with testing | Yes — full compatibility review |

### If a Critical Dependency Is Compromised

For a portfolio project, the response is:
1. Identify the compromised version via `npm audit` or GitHub Security Advisory
2. Update to a patched version immediately (`npm update [package]`)
3. Rebuild and redeploy the APK via the GitHub Actions release workflow
4. Distribute the updated APK via GitHub Releases and update the download page

For the Firebase SDK specifically: Google issues security patches as patch version
updates. `npm audit` will surface any published CVEs.

---

## 10. Secrets Management

### Secrets Inventory

| Secret | Sensitivity | Storage (Local) | Storage (CI) |
|---|---|---|---|
| Firebase API Key | Low (see note) | `.env` (gitignored) | GitHub Secret |
| Firebase Auth Domain | Low | `.env` | GitHub Secret |
| Firebase Project ID | Low | `.env` | GitHub Secret |
| Firebase Storage Bucket | Low | `.env` | GitHub Secret |
| Firebase Messaging Sender ID | Low | `.env` | GitHub Secret |
| Firebase App ID | Low | `.env` | GitHub Secret |
| FCM Legacy Server Key | **High** | `.env` | GitHub Secret |
| APK Signing Keystore (base64) | **High** | Never on disk | GitHub Secret |
| Keystore Password | **High** | Never on disk | GitHub Secret |
| Keystore Alias | Medium | Never on disk | GitHub Secret |
| Admin UID list (`VITE_ADMIN_UIDS`) | Medium | `.env` | GitHub Secret |

**Note on Firebase config keys:** Firebase API keys are not authentication secrets —
they identify the Firebase project but do not grant access. Security comes from
Firestore and Storage rules. These keys are safe to expose (and will appear in
the APK bundle). They are stored in `.env` to keep configuration clean and
environment-flexible, not for security.

**The FCM legacy server key IS a real secret.** It grants the ability to send push
notifications to any device on the project. It must never be committed to the
repository and must be rotated if a compromise is suspected.

### Rules Against Hardcoding

- No secret value is ever written directly in source code
- `.env` is in `.gitignore` — verified by a CI step that checks `.env` is absent
  from the repository
- `.env.example` is committed with all key names and empty values — serves as
  documentation without exposing values

### Secret Rotation

| Secret | Rotation Trigger | Process |
|---|---|---|
| FCM Legacy Server Key | Suspected compromise or regular hygiene (annually) | Firebase Console → Project Settings → Cloud Messaging → Regenerate server key; update GitHub Secret; rebuild and redistribute APK |
| APK Signing Keystore | Only on suspected compromise | Generate new keystore; upload to GitHub Secrets; note: Android requires uninstall/reinstall from all test devices |
| Firebase API keys | Firebase does not support key rotation for client-side config keys — rolling requires creating a new Firebase project | Not rotated in MVP |

### Who Has Access

The developer is the sole person with access to all secrets. GitHub Secrets are
accessible to GitHub Actions workflows (write-only — not readable after storage)
and to the repository owner.

---

## 11. Logging and Monitoring (Security-Focused)

### Security Events Logged

| Event | Tool | Detail |
|---|---|---|
| Successful anonymous sign-in | Firebase Console → Authentication | Timestamp, UID, device info |
| New user created | Firebase Console → Authentication | Automatic |
| Auth errors (network failure, rate limiting) | Firebase Crashlytics | Caught in `AuthService`, logged with context |
| Firestore permission denied errors | Firebase Crashlytics | Caught in service layer, logged with uid and operation name |
| Upload failures | Firebase Crashlytics | Caught in `UploadService`, logged with uid and wishId |
| App crashes | Firebase Crashlytics | Automatic — stack trace, device, app version |

### What Is Not Logged

- Failed admin PIN attempts (client-side only — no server log)
- Successful admin actions (partially — wish documents carry `grantedAt` timestamp
  as a lightweight audit trail; see `database.md` Section 12)

### Log Protection

Firebase Crashlytics and Firebase Console logs are managed by Google and stored on
Google's infrastructure. They cannot be tampered with by the application. Access
requires Firebase Console credentials (the developer's Google account).

### Log Retention

Firebase Crashlytics retains crash reports for 90 days. Firebase Console auth logs
retain recent events. For a portfolio project, this retention window is sufficient.

### Alerting

No automated security alerts are configured in MVP. The developer monitors Firebase
Console manually. Firebase does not offer free-tier automated alerting for anomalous
authentication behaviour.

---

## 12. Incident Response Plan

Given the project scope (portfolio, 6 users, no commercial data, no PII beyond
video recordings of willing participants), the incident response plan is intentionally
lightweight.

### Severity Levels

| Severity | Definition | Example |
|---|---|---|
| Critical | Data exposure or unauthorised access to any user's wishes | Firestore rules misconfiguration |
| High | Ability to send spam notifications to test users | FCM key compromise |
| Medium | App unavailable for hours | Firebase service outage |
| Low | Single user cannot access their wishes | Auth token refresh failure |

### Response Steps for Critical Incident (Firestore Rules Misconfiguration)

1. **Detect:** Firebase Console → Firestore → Rules shows unrestricted rules, OR
   a test user reports seeing another user's content.
2. **Contain immediately:** Deploy the correct rules from version control:
   `firebase deploy --only firestore:rules`
3. **Assess:** Review Firestore Console audit logs for any reads that occurred
   during the exposure window.
4. **Notify:** Inform the 6 test users of the incident and approximate exposure
   window. No formal breach notification is required (no commercial relationship,
   Singapore PDPA notification requirements apply to organisations — consult if
   needed).
5. **Review:** Identify how the incorrect rules were deployed. Add a rules
   validation step to CI to prevent recurrence.

### Response Steps for High Incident (FCM Key Compromise)

1. **Detect:** Test users receive unexpected push notifications not triggered by
   the admin.
2. **Contain:** Firebase Console → Project Settings → Cloud Messaging → Regenerate
   legacy server key. The old key is immediately invalidated.
3. **Update:** Replace the key in GitHub Secrets. Trigger a new APK build and
   release. Redistribute to test users.
4. **Review:** Verify the key was not committed to the repository (`git log -S "key_value"`).

### Who Is Notified

The developer (sole admin). For test users: informal notification via the same
channel used to distribute the app (group chat, etc.).

---

## 13. Rate Limiting and Abuse Protection

### Available Limits

| Surface | Limit | Mechanism |
|---|---|---|
| Firebase anonymous sign-in | Firebase platform-level rate limiting | Google infrastructure — not configurable |
| Firestore writes | No custom per-user limit in MVP | Firebase free tier quota (20K writes/day total) acts as a natural cap |
| Firebase Storage uploads | 20MB per file | Storage security rules |
| Video duration | 30 seconds | Enforced client-side in recording UI |
| Wish text length | 280 characters | Enforced client-side in UI |

### What Is Not Rate Limited in MVP

Custom per-user rate limiting (e.g., max N wishes per hour, max uploads per day)
requires Firebase Functions. Firebase Functions are not available on the free Spark
plan. At 6 users, this is not a practical concern.

### Most Vulnerable Endpoints to Abuse

| Endpoint | Abuse Scenario | Current Protection |
|---|---|---|
| Firebase anonymous sign-in | Bot creates thousands of anonymous accounts | Firebase platform rate limiting |
| Firebase Storage upload | Anonymous user uploads many large files | Storage rules: 20MB per file, `video/*` MIME type only |
| Firestore wish creation | Spam wish documents | No per-user write rate limit — storage cost pressure (5GB free) is the practical limit |

### If Limits Are Exceeded

Firebase free tier daily quotas reset at midnight Pacific time. If exceeded (extremely
unlikely at 6 users), the app displays appropriate error states from the service
layer error catching. No automated quota monitoring alert exists in MVP.

---

## 14. Compliance and Privacy

Covered in `auth.md` Section 12. Security-specific additions:

### Data Minimisation

Girigo collects only what is functionally necessary:
- **Video** — required for the core feature
- **Wish text** — optional, user-provided
- **Anonymous UID** — required for data isolation
- **FCM push token** — required for notifications
- **Username** — cosmetic display label

No location data, contact list, clipboard content, SMS, or call logs are collected.
Firebase Analytics tracks anonymous app usage events only — no personal data is
sent to Analytics.

### User Rights Under Singapore PDPA

| Right | Status in MVP |
|---|---|
| Right to access own data | User can view all their wishes in the app |
| Right to correct data | Not implemented — wish text is immutable after submission |
| Right to withdraw consent / data deletion | No self-service deletion in MVP — user contacts the developer/admin for manual deletion via Firebase Console |
| Right to be informed | Permissions explanation screen in onboarding discloses data collection |

---

## 15. Security Testing

### OWASP Mobile Top 10 Coverage

| Risk | Relevant? | Mitigation |
|---|---|---|
| M1 — Improper Credential Usage | Yes | No credentials hardcoded; FCM key in `.env` only |
| M2 — Inadequate Supply Chain Security | Yes | `npm audit` in CI; Dependabot enabled |
| M3 — Insecure Authentication / Authorisation | Yes | Firebase rules enforce auth server-side; client guards are UX only |
| M4 — Insufficient Input/Output Validation | Yes | Vue auto-escaping; Storage rules enforce MIME/size |
| M5 — Insecure Communication | Low risk | Firebase SDK enforces HTTPS; no unencrypted calls |
| M6 — Inadequate Privacy Controls | Yes | Minimal data collection; Firestore rules enforce isolation |
| M7 — Insufficient Binary Protections | Low risk | Firebase config in APK is a known accepted exposure; no other secrets bundled |
| M8 — Security Misconfiguration | **High priority** | Firestore rules tested in CI against emulator before deploy |
| M9 — Insecure Data Storage | Low risk | Only non-sensitive data in `@capacitor/preferences`; Firebase SDK manages token storage |
| M10 — Insufficient Cryptography | Low risk | All encryption managed by Firebase/Google; admin PIN SHA-256 is a UX gate only |

### Security Tests Performed

| Test | Trigger | Tool |
|---|---|---|
| Firestore security rules integration tests | Every CI build on `main` and `dev` | Firebase Local Emulator + Vitest |
| npm dependency vulnerability scan | Every CI build | `npm audit` |
| Dependency CVE monitoring | Continuous | GitHub Dependabot |
| Manual Firestore rules testing | Before every `firebase deploy --only firestore:rules` | Firebase Console → Rules Playground |
| APK decompilation check (manual, periodic) | Before distributing each release APK | `apktool` — verify no unexpected secrets in bundle |

### Firestore Rules Test Coverage

The following rules scenarios must be covered by integration tests (running against
the Firebase Local Emulator):

| Test Case | Expected Result |
|---|---|
| User reads own wish | Allow |
| User reads another user's wish | Deny |
| User creates wish with own `uid` | Allow |
| User creates wish with another user's `uid` | Deny |
| User updates wish status | Deny |
| Admin reads all wishes | Allow |
| Admin updates wish status from `pending` to `granted` | Allow |
| Admin updates wish status from `granted` to `rejected` | Deny |
| User self-assigns `role: 'admin'` | Deny |
| Unauthenticated read of any document | Deny |
| Upload video to own Storage path | Allow |
| Upload video to another user's Storage path | Deny |
| Upload file >20MB | Deny |
| Upload non-video MIME type | Deny |

---

## 16. Trust Boundaries

### Trust Map

```
[User's Device]
    ↓ (untrusted — client code can be modified)
[Ionic Vue App + Capacitor WebView]
    ↓ (HTTPS — encrypted in transit)
[Firebase JS SDK]
    ↓ (trusted — signed JWT attached automatically)
[Firebase Infrastructure] ← [Firestore Security Rules] ← authoritative enforcement
    ├── Firebase Auth (token validation)
    ├── Firestore (rules-enforced read/write)
    ├── Firebase Storage (rules-enforced upload/download)
    └── FCM (server key-protected send)
```

**Trust changes at:** The boundary between the Ionic Vue app (untrusted client) and
Firebase's infrastructure (trusted server). Everything happening client-side
(router guards, role checks in components, PIN verification) is a UX layer only.
Trust is re-established server-side by Firebase's token validation and security
rules on every request.

### Assumptions That Could Be Wrong

| Assumption | Risk | Check |
|---|---|---|
| "Firestore security rules are deployed and correct" | If rules are not deployed or are misconfigured, data is exposed | Verify via Firebase Console → Rules after every deployment |
| "Firebase Auth tokens are always validated server-side" | If Firebase is misconfigured to allow unauthenticated access, rules relying on `request.auth` fail open | Firebase Console → Authentication → Sign-in providers — verify Anonymous is the only enabled provider |
| "The FCM server key is not in the git history" | If the key was ever committed, it may be recoverable from git history even after deletion | Run `git log --all -S "legacy_server_key_value"` to verify |
| "The APK signing keystore is only in GitHub Secrets" | If the keystore was ever on disk and committed, it could be extracted | Verify `.gitignore` includes the keystore file path; check git history |
| "Capacitor WebView enforces HTTPS" | Android API 24+ enforces modern TLS; older Android versions may not | `minSdkVersion 24` is set in the Capacitor config — this assumption holds |