# devops.md — Girigo App DevOps

---

## Framing Note

Girigo's "infrastructure" is almost entirely managed services: Firebase (Google)
handles all backend infrastructure, and GitHub handles version control, CI/CD,
and APK distribution. The developer's DevOps responsibilities are: writing and
deploying Firebase security rules and indexes, building and signing the Android APK,
and distributing it via GitHub Releases. There is no server to provision, no
container to manage, and no cloud infrastructure to configure.

"Deployment" in this project means two distinct things:
1. **Firebase deployment** — pushing Firestore rules, Storage rules, and Firestore
   indexes to the Firebase project
2. **APK release** — building, signing, and publishing the Android APK to GitHub
   Releases for distribution

Both are automated via GitHub Actions.

---

## 1. Deployment Strategy

### Release Model

There is no server to deploy. Deployment is:

| What | How | Strategy |
|---|---|---|
| Firestore security rules | `firebase deploy --only firestore:rules` | Atomic replacement — the new rules are active immediately after deploy |
| Firebase Storage rules | `firebase deploy --only storage` | Atomic replacement |
| Firestore indexes | `firebase deploy --only firestore:indexes` | Firebase applies index builds asynchronously (index appears as "Building" then "Enabled") |
| Android APK | GitHub Release asset | Publish new version; users manually download and install the updated APK |

There is no rolling deployment, blue-green deployment, or canary release. Firebase
rules are replaced atomically — there is no gradual rollout of rule changes. The
APK is distributed as a GitHub Release; users are not auto-updated.

### Blast Radius

| Bad Deployment | Impact | Mitigation |
|---|---|---|
| Incorrect Firestore rules deployed | Potential data exposure or all writes rejected (depending on error direction) | Rules integration tests run in CI before deploy; manual Rules Playground check before merge to main |
| APK with a critical bug released | 6 test users get a broken APK | Low blast radius — small user count, informal distribution; fix and re-release |
| Missing Firestore index deployed | Queries that require the index fail until index is rebuilt | Index config is in version control (`firestore.indexes.json`); CI deploys indexes with rules |

### Deployment Triggers

**Firebase rules and indexes** are deployed automatically on merge to `main`
via GitHub Actions (`firebase deploy`).

**APK release** is triggered manually by pushing a version tag (`v0.x.x`) to
`main`.

| Trigger | Workflow | What It Does |
|---|---|---|
| Push to `dev` | `build.yml` | Type check, lint, test, build web assets, build debug APK, upload artifact |
| Push to `main` | `build.yml` + `deploy-firebase.yml` | All of the above + deploy Firestore/Storage rules and indexes |
| Push version tag `v*.*.*` | `release.yml` | Full CI suite + build signed release APK + create GitHub Release + update download page |

### What Must Pass Before Deployment

All of the following must succeed before Firebase rules are deployed or an APK is
released:

1. TypeScript type check (`vue-tsc --noEmit`) — zero type errors
2. ESLint (`eslint src/`) — zero errors (warnings allowed)
3. Unit tests (`vitest run`) — all passing
4. Firestore security rules integration tests (Firebase Local Emulator) — all passing
5. `npm audit` — no high-severity vulnerabilities in direct dependencies
6. Ionic web build (`ionic build`) — zero build errors
7. Capacitor sync (`npx cap sync android`) — zero errors

**What can block a deployment:**
Any of the above failing. Additionally: a missing or expired GitHub Secret (Firebase
CI token, keystore) will block the release workflow.

### Rollback Strategy

**Firebase rules rollback:** Manual. The previous rules file is in git history.
To rollback:
```bash
git checkout HEAD~1 -- firestore.rules storage.rules firestore.indexes.json
firebase deploy --only firestore:rules,storage,firestore:indexes
```
This takes under 60 seconds. Rules are active immediately after deploy.

**APK rollback:** The previous signed APK is always available as an asset on the
previous GitHub Release. Users can download and install the previous version manually.
Android does not prevent installing an older version of an app with the same signing
certificate as long as the version code is not lower (configure `versionCode` in
`capacitor.config.ts` to increment with each release).

**Rollback failure:** If rolling back the rules also fails (e.g., a rules syntax
error was introduced in an earlier version), use the Firebase Console's Rules editor
to revert to a safe default state manually. The absolute safe default is:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```
This locks out all access (including legitimate users) until correct rules are
deployed — preferable to an open database.

---

## 2. Environments and Parity

### One Environment by Design

There is one Firebase project used for all purposes: local development, device
testing, and production distribution. This is a deliberate trade-off documented
in `design.md` ADR and `tech-stack.md` Section 12.

| Purpose | Environment | Firebase Project |
|---|---|---|
| Local development | `ionic serve` in Chrome | Same Firebase project |
| Device testing | APK installed on developer's device | Same Firebase project |
| Production (6 test users) | GitHub Release APK | Same Firebase project |

### Differences Between Development and "Production"

| Difference | Why |
|---|---|
| Firebase Local Emulator used for integration tests only | Real Firebase project is used for all manual development and testing |
| `VITE_USE_EMULATOR=true` only in test runs | Production builds never point to the emulator |
| Developer's anonymous UID (from browser) ≠ Developer's UID on device | Two separate anonymous sessions exist; both show up in Firebase Console |

### Preventing "Works in Dev, Breaks on Device"

- The CI pipeline builds the actual Capacitor Android project (not just the web
  assets) on every push. A build that fails to compile for Android is caught before
  it reaches a device.
- The Firestore security rules integration tests run against the Firebase Local
  Emulator in CI — rule changes are validated before being deployed to the real
  Firebase project.
- `ionic serve` (browser) is used for rapid iteration; device testing via
  `ionic cap run android` is done before tagging a release.

### Production Data in Development

Development sessions use the same Firebase database as production. The developer's
test wishes and user documents coexist with any wishes submitted by the 6 test
users. The developer can identify and delete their own test data via the in-app
admin panel.

No production data separation mechanism exists in MVP. For a 6-user portfolio
project, this is acceptable.

---

## 3. Infrastructure Design

### Cloud Provider: Google Firebase + GitHub

| Service | Provider | What It Hosts |
|---|---|---|
| Firebase Auth | Google | Anonymous user identity |
| Cloud Firestore | Google | All structured data |
| Firebase Storage | Google | Video files and thumbnails |
| Firebase Cloud Messaging | Google | Push notification delivery |
| Firebase Crashlytics | Google | Crash reports and error tracking |
| Firebase Analytics | Google | Usage event tracking |
| GitHub Actions | Microsoft (GitHub) | CI/CD pipelines |
| GitHub Releases | Microsoft (GitHub) | APK artifact storage and distribution |
| GitHub Pages | Microsoft (GitHub) | Static APK download site (`/docs/index.html`) |

### What Runs Where

| Component | Where It Runs | Category |
|---|---|---|
| Ionic Vue app | User's Android/iOS device (Capacitor WebView) | Client app |
| Firebase Auth | Google-managed servers | Managed service |
| Firestore | Google-managed servers | Managed service |
| Firebase Storage | Google-managed CDN + storage | Managed service |
| FCM | Google-managed servers | Managed service |
| CI/CD pipelines | GitHub Actions `ubuntu-latest` runners | Managed CI |
| APK download page | GitHub Pages (static file hosting) | Managed hosting |

**No containers.** No Docker. No Kubernetes. No VMs. No managed Node.js servers.
GitHub Actions uses plain Node.js steps on ephemeral `ubuntu-latest` runners — see
`tech-stack.md` Section 6 for the rationale.

### Infrastructure as Code

All configurable Firebase and Capacitor infrastructure is defined in versioned files
committed to the repository:

| File | What It Configures |
|---|---|
| `firestore.rules` | Firestore security rules |
| `storage.rules` | Firebase Storage security rules |
| `firestore.indexes.json` | Firestore compound indexes |
| `firebase.json` | Firebase CLI project configuration |
| `.firebaserc` | Firebase project alias mapping |
| `capacitor.config.ts` | App ID, app name, Android/iOS settings |
| `eas.json` | EAS Build configuration (if used) |
| `.github/workflows/build.yml` | CI build pipeline |
| `.github/workflows/deploy-firebase.yml` | Firebase rules deployment pipeline |
| `.github/workflows/release.yml` | APK release pipeline |

**Preventing configuration drift:** All Firebase configuration changes must be made
through these versioned files and deployed via `firebase deploy`. Manual edits in
the Firebase Console (other than one-time admin setup) are discouraged — they create
configuration drift that is not tracked in git.

**Exceptions** (one-time manual configuration via Firebase Console):
- Setting `role: 'admin'` on the admin user document (done once, not automated)
- Creating the Firebase project itself (one-time setup)
- Enabling anonymous authentication (one-time setup in Firebase Console →
  Authentication → Sign-in methods)

---

## 4. Scalability and Reliability

This section is brief by design. Firebase scales automatically. There are no scaling
decisions to make at the application layer.

### Scaling Model

Firebase services scale horizontally by Google's infrastructure. There is no
configuration required to handle increased load — Firebase adds capacity automatically.

For Girigo at 6 users, there is no meaningful load. The free Spark plan's daily
quotas (50,000 Firestore reads, 20,000 writes, 1GB Storage downloads) represent a
ceiling, not a scale concern. At 6 users, these limits will never be reached.

### High Availability

Firebase operates across multiple Google data centres per region with automatic
failover. The developer does not configure or manage availability zones.

**Chosen Firebase region:** `asia-southeast1` (Singapore) — set at project creation
time. This minimises latency for Singapore-based users.

If Google's `asia-southeast1` region experiences an outage:
- Firestore reads are served from the SDK's offline persistence cache on each device
- Writes are queued locally and synced when the region recovers
- New users cannot authenticate until the region recovers
- Acceptable — this is a portfolio project with no SLA

### Maximum Expected Load

| Metric | Value |
|---|---|
| Concurrent active users | Maximum 6 |
| Daily Firestore reads | Under 500 |
| Daily Firestore writes | Under 50 |
| Video uploads per day | Under 10 |
| Push notifications per day | Under 10 |

None of these figures approach Firebase's free tier limits.

---

## 5. Observability

### Key Metrics

| Metric | Tool | Where to View |
|---|---|---|
| App crash rate | Firebase Crashlytics | Firebase Console → Crashlytics |
| Daily active users | Firebase Analytics | Firebase Console → Analytics |
| Firestore read/write usage | Firebase Console | Usage tab → Cloud Firestore |
| Storage usage | Firebase Console | Usage tab → Storage |
| Auth user count | Firebase Console | Authentication → Users |
| FCM delivery rate | Firebase Console | Cloud Messaging |
| Free tier quota utilisation | Firebase Console | Usage and billing |

### SLOs / SLAs

No SLOs or SLAs are defined for this portfolio project. Informal targets:
- App cold start: under 3 seconds (from `frontend.md` Section 8)
- Firebase service availability: reliant on Google's infrastructure — no custom SLO

### Logging

| Log Type | Tool | What Is Captured |
|---|---|---|
| Crash reports | Firebase Crashlytics | Stack trace, device model, OS version, app version, custom log context |
| Custom error logs | Firebase Crashlytics | Service layer errors with operation name, uid, and document ID context |
| Auth events | Firebase Console → Authentication | Sign-in timestamps, user creation, device info |
| Usage events | Firebase Analytics | App opens, wish submissions, notification taps |
| Build logs | GitHub Actions | Full CI pipeline output — retained for 90 days |

**Context included in error logs:** Every service layer error log includes the
operation name, Firebase UID, and relevant document ID:
```ts
console.error(`WishService.createWish — uid: ${uid}, wishId: ${wishId}`, error)
await FirebaseCrashlytics.recordException({
  message: `WishService.createWish failed — uid: ${uid}`
})
```

### Tracing

There are no distributed services to trace — all backend operations go through
the Firebase JS SDK to Firebase's infrastructure. Debugging a specific failure
means:
1. Firebase Crashlytics → find crash report with relevant uid/operation context
2. Firebase Console → Firestore Data Viewer → inspect the document state
3. Reproduce locally with `ionic serve` + Chrome DevTools

No distributed tracing tooling (Jaeger, Zipkin, OpenTelemetry) is needed or
configured.

---

## 6. Alerting

### Alerting in MVP: Manual Monitoring Only

No automated alerting is configured for this portfolio project. Alert tooling
(Firebase Performance Monitoring alerts, Uptime checks, PagerDuty integration)
is available on Firebase's Blaze plan but is over-engineering for a 6-user portfolio.

**Manual monitoring approach:**
- Check Firebase Console → Crashlytics after distributing a new APK to test users
- Check Firebase Console → Usage tab weekly to verify free tier limits are not
  being approached
- GitHub Actions sends email notifications to the repository owner when a workflow
  fails (GitHub default behaviour — no configuration required)

### What Would Trigger Action

| Condition | How Detected | Response |
|---|---|---|
| CI pipeline fails | GitHub email notification | Fix the failing check, re-push |
| Crash rate spike after a new release | Crashlytics dashboard | Investigate crash report, patch and re-release |
| Firebase free tier quota approaching 80% | Manual check | Review usage; consider whether quota is due to legitimate use or an issue |
| Firebase rules misconfiguration | Crashlytics permission-denied errors spiking | See incident response in `security.md` |

---

## 7. Incident Response

Covered in full in `security.md` Section 12. DevOps-specific additions:

### Production Issue Detection Sources

| Source | What It Catches |
|---|---|
| Firebase Crashlytics | App crashes, unhandled exceptions, service layer errors |
| Test user reports | UX bugs, notification failures, upload failures |
| GitHub Actions failure email | CI pipeline breaks |
| Firebase Console manual check | Rules misconfiguration, quota issues |

### Step-by-Step Response (App Bug in Released APK)

1. Reproduce the issue locally with `ionic serve` and Chrome DevTools
2. Identify the failing service method or component from the Crashlytics stack trace
3. Fix the issue on the `dev` branch; verify with `ionic serve` and on-device testing
4. Merge `dev` → `main`
5. Push a new patch version tag (`v0.x.1`) to trigger the release workflow
6. Verify the new APK builds successfully in GitHub Actions
7. Distribute the new APK link to test users via the GitHub Releases page
8. Confirm the fix resolved the issue

### Postmortems

No formal postmortem process for a portfolio project. For significant issues (e.g.,
Firestore rules misconfiguration that exposed data), write a brief note in the
GitHub issue or commit message documenting: what happened, why, and what was changed
to prevent recurrence.

---

## 8. Configuration and Secrets Management

Covered in full in `tech-stack.md` Section 6 and `security.md` Section 10.

### Summary

| Secret | Local | CI |
|---|---|---|
| Firebase config values | `.env` (gitignored) | GitHub Secrets |
| FCM legacy server key | `.env` | GitHub Secret |
| APK signing keystore | Never on disk | GitHub Secret (base64 encoded) |
| Keystore password and alias | Never on disk | GitHub Secrets |

**Secrets in logs:** GitHub Actions masks all values stored as GitHub Secrets —
they are never printed in workflow logs. `console.log` statements in the app code
must never log `.env` values. ESLint is configured to warn on `console.log` calls
in production builds.

**Firebase CI Authentication:** The `deploy-firebase.yml` and `release.yml`
workflows authenticate to Firebase CLI using a **Firebase service account** stored
as a GitHub Secret (`FIREBASE_SERVICE_ACCOUNT_JSON`). This allows the CI runner
to deploy rules without interactive login.

Setup (one-time):
```bash
# Generate service account credentials
firebase init
# Download the service account JSON from Firebase Console →
# Project Settings → Service Accounts → Generate new private key
# Base64-encode and store as FIREBASE_SERVICE_ACCOUNT_JSON GitHub Secret
```

---

## 9. Build and Artifact Management

### Build Process

| Stage | Command | Output |
|---|---|---|
| Web asset build | `ionic build` | `/www/` directory (compiled Vue app) |
| Capacitor sync | `npx cap sync android` | Android project updated with latest web assets |
| Debug APK | `cd android && ./gradlew assembleDebug` | `app-debug.apk` |
| Release APK | `cd android && ./gradlew assembleRelease` | `app-release-unsigned.apk` |
| APK signing | `jarsigner` or `apksigner` (via Gradle signing config) | `app-release.apk` (signed) |

**iOS builds:** iOS builds require a macOS runner with Xcode. The GitHub Actions
free tier's macOS runners consume 10× more CI minutes than Linux runners (2,000
free minutes/month shared). iOS CI builds are **not included in the MVP CI pipeline**.
iOS APKs are built locally on a Mac when needed. The repository documents the local
build steps in `README.md`.

### Artifact Versioning

Versions follow **semantic versioning** (`vMAJOR.MINOR.PATCH`):
- `MAJOR`: significant feature additions (0 → 1 = first full MVP)
- `MINOR`: new features or screens added
- `PATCH`: bug fixes

The Android `versionCode` (integer, must increment with each release) and
`versionName` (human-readable string) are configured in `capacitor.config.ts` and
must be updated before pushing a release tag.

```ts
// capacitor.config.ts
const config: CapacitorConfig = {
  android: {
    versionCode: 4,          // increment for every release APK
    versionName: '0.2.1',    // matches the git tag
  }
}
```

### Where Artifacts Are Stored

| Artifact | Storage | Retention |
|---|---|---|
| Debug APK (from CI builds) | GitHub Actions artifact (uploaded by workflow) | 90 days (GitHub default) |
| Signed release APK | GitHub Release asset | Permanent (GitHub Releases) |
| Web build output (`/www/`) | Not stored — regenerated on every build | N/A |
| GitHub Pages download site | `/docs/` folder in repository | Permanent (in git history) |

### GitHub Release Process

The `release.yml` workflow:
1. Runs the full CI suite
2. Builds the signed release APK
3. Creates a GitHub Release tagged with the version number
4. Uploads the signed APK as a release asset
5. Updates `/docs/index.html` with the new download link and version notes
6. GitHub Pages automatically serves the updated download page within minutes

---

## 10. Security in DevOps (DevSecOps)

### Security Checks in CI Pipeline

| Check | Tool | When | Failure Behaviour |
|---|---|---|---|
| TypeScript type check | `vue-tsc --noEmit` | Every build | Blocks build |
| Linting (includes `vue/no-v-html`) | ESLint | Every build | Blocks build |
| Dependency vulnerability scan | `npm audit --audit-level=high` | Every build | High-severity CVE blocks build |
| Firestore rules integration tests | Vitest + Firebase Local Emulator | Every build | Failing rules tests block Firebase deployment |
| Secret presence check | `grep -r "VITE_FIREBASE_API_KEY" .env` in CI | Verify `.env` is absent | Would fail if `.env` was accidentally committed |

### What Fails the Pipeline from a Security Standpoint

| Failure | Effect |
|---|---|
| `npm audit` reports high-severity vulnerability | Build blocked — must update the affected package |
| Firestore rules integration tests fail | Firebase deployment blocked — rules are not pushed to production |
| ESLint `vue/no-v-html` violation | Build blocked — XSS risk |
| TypeScript type error on a Firestore write object | Build blocked — prevents malformed data from reaching production |

### Dependency Vulnerability Process

1. GitHub Dependabot creates a PR when a CVE is published for a direct dependency
2. CI runs `npm audit` on the PR — high/critical severity blocks merge
3. Developer reviews the Dependabot PR changelog for breaking changes
4. Patch and minor version updates are merged if CI passes
5. Major version updates are reviewed manually before merging

---

## 11. Cost Management

### Current Cost: Zero

Every service used by Girigo is on a free tier.

| Service | Free Tier | Cost at 6 Users |
|---|---|---|
| Firebase Spark (Auth, Firestore, Storage, FCM, Crashlytics, Analytics) | See `database.md` Section 8 | $0 |
| GitHub (Actions, Pages, Releases) | 2,000 CI minutes/month, unlimited public repos | $0 |
| Ionic Framework | Open source | $0 |
| Capacitor | Open source | $0 |

### CI Minutes Usage Estimate

| Workflow | Estimated Duration | Frequency | Monthly Minutes |
|---|---|---|---|
| `build.yml` (push to dev/main) | ~8 minutes | ~20 pushes/month | ~160 minutes |
| `release.yml` (version tag) | ~12 minutes | ~4 releases/month | ~48 minutes |
| **Total** | | | **~208 minutes** |

Well within the 2,000 free minutes/month. 90% headroom.

### What Scales Cost

| Scenario | Cost Impact |
|---|---|
| Video storage accumulates | Firebase Storage: 5GB free, then $0.026/GB/month on Blaze plan |
| Video downloads increase | Firebase Storage egress: 1GB/day free, then $0.12/GB on Blaze plan |
| Firebase Functions added | Requires Blaze plan upgrade (pay-as-you-go, minimum billing enabled) |
| macOS CI runners added (for iOS) | Consumes 10× more GitHub Actions minutes than Linux |

### Cost Alerts

No automated cost alerts in MVP. Manual check: Firebase Console → Usage and billing
weekly. If Storage usage approaches 4GB (80% of free 5GB), review whether old test
videos should be deleted via the admin panel.

---

## 12. Backup and Disaster Recovery

Covered in full in `database.md` Section 13. Summary for DevOps context:

| Asset | Backup Method | Recovery Method |
|---|---|---|
| Firestore documents | Manual export via Firebase Console | Import via Firebase Console |
| Firebase Storage files (videos) | No automated backup — manual download | Not recoverable without prior download |
| Firestore security rules | Version-controlled in `firestore.rules` | `firebase deploy --only firestore:rules` |
| Firebase Storage rules | Version-controlled in `storage.rules` | `firebase deploy --only storage` |
| App source code | GitHub repository | `git clone` |
| Signed release APK | GitHub Release asset | Download from GitHub Releases |
| APK signing keystore | GitHub Secret | Must be regenerated if lost (users reinstall) |

**The most important backup action:** Export Firestore data before any significant
schema migration or rules change. Takes 2 minutes via Firebase Console.

---

## 13. Feature Rollouts and Experimentation

Covered in `frontend.md` Section 14. Summary:

No feature flags are implemented in MVP. New features are shipped as APK releases
(version-tagged). Unreleased features have no code in the repository — they are not
behind a flag.

**Safe feature rollout for a 6-user portfolio project:**
1. Build and test the feature on `dev` branch with `ionic serve`
2. Install debug APK on developer's device for device-level testing
3. Merge to `main` when satisfied
4. Tag the release (`v0.x.0`) to trigger the release pipeline
5. Share the new GitHub Release download link with test users

The small user count means any breaking change affects a maximum of 6 people who
can immediately be directed to the previous APK version on the GitHub Releases page.

---

## 14. Developer Experience

### Local Development Setup (From Zero)

Expected time from `git clone` to running app in browser: **under 5 minutes**.

```bash
# 1. Clone the repository
git clone https://github.com/[username]/girigo.git
cd girigo

# 2. Install dependencies
npm install

# 3. Copy environment template and fill in Firebase config values
cp .env.example .env
# Edit .env with Firebase Console values

# 4. Run in browser
ionic serve
```

No Docker installation required. No local database required. No backend to start.
The only prerequisite beyond Node.js is a Firebase project with the values from
the Firebase Console.

### Running on Android Device

Additional time: ~10 minutes for first setup (Android Studio required for device
drivers and emulator, or a physical device with USB debugging enabled).

```bash
ionic build
npx cap sync android
ionic cap run android --livereload --external
```

Live reload allows CSS and Vue component changes to update on the device instantly
without a full APK rebuild.

### Build and Deploy Duration

| Action | Duration |
|---|---|
| `ionic serve` hot reload (CSS/component change) | <1 second |
| `ionic serve` full reload (route change) | 1–2 seconds |
| `ionic build` (Vite production build) | ~30 seconds |
| Android debug APK build | ~3 minutes |
| Full CI pipeline (`build.yml`) | ~8 minutes |
| Full release pipeline (`release.yml`) | ~12 minutes |
| `firebase deploy --only firestore:rules` | ~10 seconds |

### What Slows Developers Down Most

| Bottleneck | Mitigation |
|---|---|
| Android APK build time (~3 minutes) | Use `ionic serve` in browser for most development; only build APK to test Capacitor-specific features (camera, FCM, preferences) |
| First-time Android Studio / SDK setup | Document exact SDK version in `README.md`; use the exact version that the CI pipeline uses |
| FCM notification testing requires a physical device | Test in-app notification handling (foreground toasts) with `ionic serve`; test background notifications on a device only when the FCM flow is being built |
| Firebase Emulator startup (~15 seconds) | Only required for rules integration tests; not needed for normal development |

---

## 15. Compliance and Auditability

### Deployment Auditability

| Action | Audit Trail |
|---|---|
| APK release published | GitHub Release — timestamp, tag, release notes, APK asset |
| CI pipeline run | GitHub Actions run log — full step-by-step output, retained 90 days |
| Firebase rules deployed | `firebase.json` and rules files in git history — every change is a commit |
| Git history | Full commit history with author, timestamp, and message on `main` and `dev` |

### Who Can Deploy

Solo developer. The repository owner is the only person with:
- Access to GitHub Secrets (keystore, Firebase service account)
- Write access to the `main` branch
- Firebase project owner access

No branch protection rules are strictly required for a solo project, but
configuring `main` to require CI to pass before merging from `dev` is recommended
as a quality gate — it prevents accidentally merging broken code.

**GitHub branch protection settings for `main`** (recommended):
- Require status checks to pass before merging
- Required status checks: `build`, `test`, `deploy-firebase`
- Disallow force pushes to `main`

### Preventing Unauthorised Changes

- The GitHub repository is the authoritative source for all configuration
- All Firebase configuration changes (rules, indexes) go through git and are
  deployed via CI, not manually via the Firebase Console
- GitHub Secrets are write-only after creation — they cannot be read back from the
  GitHub UI, only used in workflow runs
- The Firebase service account used by CI has the minimum required permissions:
  Firestore Rules Deployer, Storage Rules Deployer role only — not Firebase project
  owner