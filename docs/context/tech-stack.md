# tech-stack.md — Girigo App

---

## 1. Selection Framework

### Non-Negotiable Requirements

| Requirement | Reason |
|---|---|
| Must run on Android and iOS | Core project goal — cross-platform mobile app |
| Must access device camera and microphone | Wish recording is the core feature |
| Must deliver push notifications | Users must be notified when a wish is granted or rejected |
| Must integrate with Firebase | Auth, Firestore, Storage, and FCM are all required |
| Must stay entirely on free tier | Zero budget — portfolio project |
| Must be buildable by one developer with an AI-assisted IDE | No team, no DevOps support |

### Constraints

| Constraint | Impact |
|---|---|
| Solo developer | Rules out any architecture requiring coordination, separate services, or infrastructure management |
| Developer knows Vue, JavaScript, HTML, CSS — not Flutter, Swift, or Kotlin | Framework must leverage existing knowledge; new syntax must be minimal |
| Zero budget | Every tool, platform, and service must have a free tier that covers portfolio-scale usage |
| Portfolio project timeline | Time to working demo matters more than architectural elegance |
| Maximum 6 users | No meaningful scale requirements; free tier limits will never be reached |

### What We Are Optimising For

- **Developer velocity** — get to a working, demonstrable app as fast as possible
- **Familiarity** — leverage the developer's existing Vue/JavaScript/CSS knowledge directly
- **Cost** — zero spend, free tier everything
- **Simplicity** — fewest moving parts that still produce a production-structured result

### What We Are Explicitly NOT Optimising For

- Performance at scale — 6 users will never stress any part of this stack
- Native rendering performance — Ionic's WebView is sufficient for this app's UI complexity
- Microservices or distributed architecture — a BaaS monolith is the correct choice here
- Automated server-side logic — no Firebase Functions (not available on free Spark plan)
- Fault tolerance and uptime guarantees — a few hours of downtime is acceptable

---

## 2. Decision Matrix

### Decision 1 — Mobile Framework

| Criterion | Flutter | React Native + Expo | **Ionic + Vue + Capacitor** |
|---|---|---|---|
| Uses developer's existing knowledge | None (Dart) | Partial (React differs from Vue) | Full (Vue 3, CSS, HTML) |
| Can develop and test in browser | No | No | Yes |
| Time to first working screen | High (new language + toolchain) | Medium (React familiarity partial) | Low (Vue project from day one) |
| Native device API access | Excellent (native widgets) | Excellent (Expo plugins) | Good (Capacitor plugins) |
| Firebase integration | Good | Good | Good (same JS SDK as any web project) |
| Free build tooling | Yes (but Android Studio required) | Yes (Expo Go for dev) | Yes (browser for dev, Gradle for APK) |
| Learning curve for this developer | Very high | Medium | Minimal |

**Chosen: Ionic + Vue + Capacitor**
The developer already knows Vue 3. Using Ionic means the entire app is written in a stack the developer can already read, debug, and reason about — including when AI-generated code needs fixing. The ability to develop in a browser first (with Chrome DevTools) removes the emulator/device dependency for most of the development cycle.

**Risk accepted:** Ionic renders UI in a WebView, not natively. For this app's use case (forms, cards, video upload, notifications) this makes no practical difference. It would matter for a game or highly animated experience — Girigo is neither.

---

### Decision 2 — Backend

| Criterion | Firebase (BaaS) | Supabase | Custom Node.js + PostgreSQL |
|---|---|---|---|
| Server management required | None | Minimal | Full |
| Free tier | Generous (Spark plan) | Generous | Hosting cost required |
| Mobile SDK quality | Excellent (official JS SDK) | Good | Custom — developer builds it |
| Real-time data sync | Built in (Firestore listeners) | Built in (Supabase Realtime) | Requires WebSocket implementation |
| Push notifications | Built in (FCM) | Not built in | Requires third-party service |
| Auth (including anonymous) | Built in | Built in | Requires implementation |
| File storage | Built in | Built in | Requires implementation |
| Developer's prior knowledge | Some (Firebase is widely known) | Less familiar | JavaScript known, but infra is new |
| Time to working backend | Near zero | Low | High |

**Chosen: Firebase**
Firebase provides Auth, Firestore, Storage, and FCM as a single integrated platform with a single SDK. For a solo developer building a portfolio project, eliminating the backend entirely (no server to deploy, no database to manage, no hosting to configure) is the correct trade-off. Anonymous authentication specifically is a feature Supabase does not support natively.

**Risk accepted:** Firebase vendor lock-in. All data, auth, and files live in Google's infrastructure. Migrating away would require a significant rewrite. Acceptable for a portfolio project — not acceptable for a commercial product without careful consideration.

---

### Decision 3 — State Management

| Criterion | Pinia | Vuex 4 | Zustand (React) |
|---|---|---|---|
| Vue 3 Composition API native | Yes | Partial (Options API legacy feel) | No (React only) |
| TypeScript support | Excellent (first-class) | Acceptable | Excellent |
| Boilerplate required | Minimal | High (mutations, actions, getters) | Minimal |
| Official Vue recommendation | Yes (replaced Vuex) | No (superseded) | N/A |
| DevTools support | Yes (Vue DevTools) | Yes | N/A |
| Learning curve | Low | Medium | N/A |

**Chosen: Pinia**
Pinia is the official Vue state manager since Vue 3. It uses the same Composition API patterns as `<script setup>` components — no new mental model required. Vuex 4 still works but feels architecturally mismatched with Vue 3. Pinia's stores are plain TypeScript with `ref` and `computed` — familiar immediately.

**Risk accepted:** None meaningful. Pinia is the officially recommended solution maintained by the Vue core team.

---

### Decision 4 — Local Device Storage

| Criterion | @capacitor/preferences | localStorage | expo-secure-store |
|---|---|---|---|
| Works on Android and iOS natively | Yes | WebView only (not truly native) | Expo only (not in this stack) |
| Persistent across app restarts | Yes | Yes (WebView) | Yes |
| Secure (OS keychain backed) | Partially (standard on iOS, SharedPreferences on Android) | No | Yes (but Expo only) |
| API simplicity | Simple async key/value | Synchronous, simple | Simple async |

**Chosen: @capacitor/preferences**
This is the Capacitor-native equivalent of SharedPreferences (Android) and UserDefaults (iOS). It persists correctly across app restarts on both platforms, unlike raw `localStorage` which can be cleared by the OS WebView cache. Does not store in a cryptographic keychain — acceptable for the data being stored (uid, username, onboarding state). No passwords or secrets are stored locally.

---

## 3. Frontend Stack

### Framework — Ionic Framework v7 + Vue 3

**Why Ionic + Vue over alternatives:**
Ionic provides pre-built mobile UI components (`ion-button`, `ion-card`, `ion-modal`, `ion-toast`, etc.) that look and behave natively on both Android and iOS without writing platform-specific code. Vue 3 is the developer's strongest framework — the same `<template>`, `<script setup>`, `ref`, `computed`, and composables used in web Vue projects work identically here.

**What problem it solves specifically:**
Eliminates the need to learn a new language (Dart) or a partially-familiar framework (React Native). The developer can focus on product logic rather than framework syntax.

**Known limitations:**
- UI renders in a WebView — not native widgets. Performance is excellent for this app but would degrade under heavy animation or complex canvas operations.
- Ionic's component library has opinions about layout and navigation that sometimes conflict with highly custom designs. Overriding Ionic styles requires targeting CSS variables or using `::part()` selectors.
- Debugging on a physical device requires either Capacitor's live reload or a full APK build — the browser covers most development but device-specific bugs (camera, FCM) require a real device.

---

### State Management — Pinia

**What state exists in Girigo:**

| State Type | Description | Store |
|---|---|---|
| Auth state | Current Firebase user, uid, anonymous status | `authStore` |
| User profile | Firestore user document (username, role, pushToken) | `userStore` |
| Wishes list | Array of the user's wish documents | `wishesStore` |
| Upload progress | Current upload percentage, status, error | `uploadStore` |
| Notification state | FCM token, permission status | `notificationStore` |
| Admin state | All wishes (admin only), selected wish | `adminStore` |

**Why Pinia fits this scale:**
Six users, one developer, no team coordination requirements. Pinia's minimal API (define a store with `ref`/`computed`/functions, use it anywhere with `useXxxStore()`) matches the scale. Each store maps cleanly to one Firebase collection or one domain.

**When it would break down:**
If the app developed a complex shared state graph with many interdependent stores or required optimistic UI updates across multiple collections simultaneously, a more structured approach (e.g. a React Query equivalent for Vue like `vue-query`) would serve better. Not relevant for this MVP.

---

### Styling System — Ionic CSS Variables + SCSS

**Approach:**
Ionic's theming system is built on CSS custom properties (variables). Global theme configuration lives in `/src/theme/variables.css` and `/src/theme/global.css`. Component-level styles are written in `.scss` files scoped to each Vue component using `<style scoped lang="scss">`.

**Why SCSS over Tailwind:**
- Ionic's own component styles use CSS variables extensively. Tailwind's base reset (`preflight`) conflicts with Ionic's component rendering — resolving this requires non-trivial configuration and per-component workarounds.
- Girigo's design is highly custom and cinematic (dark gradients, glows, ambient animations). Tailwind's utility-class model is optimised for standard layouts, not atmospheric custom aesthetics. SCSS gives precise, readable control.
- The developer already knows CSS. No new tool, no new mental model.

**Ensuring consistency across components:**

All design tokens are defined once in `/src/theme/variables.css`:

```css
:root {
  --color-bg-base: #0a0a0a;
  --color-bg-surface: #1a1a1a;
  --color-bg-elevated: #242424;
  --color-border: #2a2a2a;
  --color-text-primary: #e8e8e8;
  --color-text-muted: #888888;
  --color-accent: #6C3DE8;
  --color-status-pending: #F59E0B;
  --color-status-granted: #10B981;
  --color-status-rejected: #EF4444;
  --font-heading: 'Cormorant Garamond', serif;
  --font-body: 'DM Sans', sans-serif;
}
```

Components reference these variables — never hardcode color values. A design change requires editing one file.

**Preventing style conflicts:**
All component styles use `<style scoped>` — Vue's scoped CSS ensures styles never leak between components. Global styles in `global.css` are limited to typography resets, scrollbar styling, and utility classes used across the whole app.

---

### Routing — Vue Router (Ionic Vue)

**Strategy:**
Standard Vue Router with Ionic's navigation stack (handles iOS swipe-back and Android back button natively). Routes are defined in `/src/router/index.ts`.

**Protected routes:**
A navigation guard in the router checks:
1. Is the user authenticated? If not → redirect to `/onboarding`
2. Is the route marked `requiresAdmin`? If yes → check `userStore.role === 'admin'`; if not admin → redirect to `/home`

```ts
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.user) return '/onboarding'
  if (to.meta.requiresAdmin && !auth.isAdmin) return '/home'
})
```

**Code splitting:**
All routes except `/` (splash) and `/onboarding` use lazy loading:

```ts
{ path: '/home', component: () => import('@/views/HomeView.vue') }
```

Vite handles the bundle splitting automatically.

**Forms and validation:**
No form library is needed. The app has two text inputs: wish text (max 280 chars) and admin message. These are handled with Vue's `v-model` and inline validation using `computed` properties. Adding VeeValidate or Zod would be over-engineering for two fields.

**API integration and caching:**
There is no REST API. The Firebase JS SDK is the data layer. Pinia stores act as the in-memory cache. Firestore real-time listeners (`onSnapshot`) keep stores automatically updated — no manual cache invalidation or polling required.

---

## 4. Backend Stack

### No Custom Backend

Girigo has no custom server, API, or backend language. Firebase is the backend. This is an intentional architectural decision — see `design.md` ADR section for the full rationale.

### Firebase as the API Layer

| Concern | How Firebase Handles It |
|---|---|
| Authentication | Firebase Auth SDK — `signInAnonymously()` |
| Data reads and writes | Firestore SDK — `getDoc()`, `setDoc()`, `onSnapshot()` |
| File storage | Firebase Storage SDK — `uploadBytesResumable()`, `getDownloadURL()` |
| Push notifications | FCM via `@capacitor/push-notifications` plugin |
| Authorization | Firestore and Storage security rules (server-enforced) |
| Rate limiting | Firebase platform-level (not configurable in MVP) |

### Background Processing

There are no background jobs in the MVP. The only async operation is video upload, which runs in the foreground with a visible progress bar. If the app is backgrounded during an upload, Capacitor's background task API can be used to keep the upload alive briefly — not implemented in MVP, structure exists in `UploadService.ts` for future addition.

**Firebase Functions are explicitly excluded** from the MVP. The Spark (free) plan does not support Cloud Functions. All admin actions (status changes, notification triggers) are performed manually through the in-app admin panel.

**Idempotency:**
Wish documents use a client-generated UUID as the `wishId`. Writing the same wish document twice (e.g. on retry after a network failure) is safe — Firestore's `setDoc()` with a known document ID is idempotent.

---

## 5. Database and Data Layer

### Why Firestore (NoSQL Document Store)

| Consideration | Assessment |
|---|---|
| Data model fit | Each wish is a self-contained document with no joins required. Users read only their own wishes. The document model is a natural fit. |
| Access patterns | Primary pattern: "get all wishes for this uid, ordered by createdAt". Firestore handles this with a simple compound query. |
| Real-time requirements | Firestore's `onSnapshot` listener pushes updates to the app in real time — no polling required. Essential for status updates. |
| Relational needs | None. There are no complex joins, no aggregations, no many-to-many relationships. SQL's strengths are not needed here. |
| Free tier | 50,000 reads/day, 20,000 writes/day, 1GB storage — will never be reached by 6 users. |

### Schema Strategy

Firestore does not enforce schema at the database level. Schema is enforced at the application level via TypeScript interfaces in `/src/types/index.ts`. Every Firestore read is cast to a typed interface. Every Firestore write validates shape before submission.

**Schema rigidity:** Semi-flexible. TypeScript enforces shape at compile time. Firestore accepts any valid JSON at runtime. The security rules add a layer of structural validation (e.g. required fields on write).

### Handling Schema Evolution

| Change Type | Safety | Process |
|---|---|---|
| Adding an optional field | Safe | Add to TypeScript interface with `?`, deploy |
| Renaming a field | Breaking | Write a migration script to update all existing documents before deploying |
| Removing a field | Breaking | Ensure no code reads the field before removing from schema |
| Changing a field's type | Breaking | Migration required — treat as rename |

For this portfolio project, only additive changes are expected. No migration tooling is needed.

### Indexes

Firestore creates single-field indexes automatically. The following compound index must be created manually in the Firebase Console:

| Collection | Fields | Used By |
|---|---|---|
| `wishes` | `uid` ASC, `createdAt` DESC | User's wish list, ordered by newest first |
| `wishes` | `status` ASC, `createdAt` ASC | Admin pending queue, ordered by oldest first |

### Backups

Firestore automated backups are not available on the free Spark plan. For a portfolio project, data loss is acceptable. Manual exports can be triggered from the Firebase Console if needed.

---

## 6. DevOps and Tooling

### Version Control

**Branching strategy:** Two-branch model (not GitFlow — too heavy for a solo developer).

| Branch | Purpose |
|---|---|
| `main` | Stable, tagged releases only. APK builds are triggered from here. |
| `dev` | Active development. All work happens here. Merged to `main` when a version is ready. |

**PR reviews:** Solo developer — self-merge. Commit messages follow Conventional Commits format (`feat:`, `fix:`, `chore:`) for readable history.

**What blocks merging to `main`:**
- GitHub Actions CI must pass (type check + lint + tests + build)
- A version tag must be applied (`v0.x.0`)

### CI/CD — GitHub Actions, Plain Node.js

**Why plain Node.js steps over Docker:**
GitHub Actions' `ubuntu-latest` runner includes Node.js, npm, and Java (required for Android Gradle builds). Docker containers for Android SDK builds require maintaining a custom image with `ANDROID_HOME`, SDK version management, and build tools — significant complexity with no benefit for a single-developer portfolio project.

**Build trigger — `build.yml`** (runs on push to `main` or `dev`):

```
1. Checkout code
2. Set up Node.js (version from .nvmrc)
3. npm ci (clean install from lockfile)
4. vue-tsc --noEmit (TypeScript type check)
5. eslint src/ (lint check)
6. vitest run (unit tests)
7. ionic build (Vite production build of web assets)
8. npx cap sync android (sync web assets to Android project)
9. Set up Java (for Gradle)
10. Build debug APK (./gradlew assembleDebug)
11. Upload APK as GitHub Actions artifact
```

**Release trigger — `release.yml`** (runs on version tag push `v*.*.*`):

```
1. All steps above with release build (assembleRelease)
2. Sign APK using keystore stored as GitHub Secret
3. Create GitHub Release
4. Upload signed APK to GitHub Release assets
5. Update /docs/index.html with new version link
```

### Secrets Management

| Secret | Storage | Used By |
|---|---|---|
| Firebase config values | `.env` file (local, gitignored) + GitHub Secrets (CI) | App at runtime via `import.meta.env.VITE_*` |
| Android signing keystore | GitHub Secret (base64 encoded) | `release.yml` only |
| Keystore password | GitHub Secret | `release.yml` only |

**`.env.example`** is committed to the repository with all keys present and values blank — serves as documentation of required configuration for anyone setting up the project.

### Code Quality Tools

| Tool | Purpose | Config file |
|---|---|---|
| ESLint | JavaScript/TypeScript linting | `.eslintrc.cjs` |
| Prettier | Code formatting | `.prettierrc` |
| vue-tsc | TypeScript type checking for Vue files | `tsconfig.json` (strict mode enabled) |
| Vitest | Unit and component testing | `vite.config.ts` |

Prettier and ESLint are configured to work together (`eslint-config-prettier` disables ESLint formatting rules that conflict with Prettier).

---

## 7. Observability Tooling

For a portfolio project with 6 users, observability is intentionally lightweight and relies entirely on free tools.

### Logging

| Environment | Tool | Detail |
|---|---|---|
| Development | `console.log` / `console.error` in services | Chrome DevTools console via `ionic serve` |
| Device testing | Capacitor live reload + Chrome Remote Debugging | Connect device via USB, inspect in `chrome://inspect` |
| Production | Firebase Crashlytics (free) | Automatic crash reporting with stack traces |

All service methods log errors with context:
```ts
console.error(`WishService.createWish failed for uid: ${uid}`, error)
```

### Monitoring

| Concern | Tool |
|---|---|
| Firestore usage (reads/writes/storage) | Firebase Console → Usage tab |
| Active users and auth events | Firebase Console → Authentication |
| Push notification delivery rates | Firebase Console → Cloud Messaging |
| App crash rates | Firebase Crashlytics (free) |
| Free tier quota proximity | Firebase Console → Usage and billing |

### Error Tracking

**Firebase Crashlytics** is the chosen tool. It is free, integrates with Capacitor via `@capacitor-firebase/crashlytics`, and automatically captures unhandled exceptions with device context, app version, and stack traces. No account or billing setup beyond the Firebase project.

### Tracing Requests

There are no distributed services to trace — all backend logic is Firebase. Debugging a data issue means:
1. Checking the Firestore Data Viewer for document state
2. Checking the Firebase Storage browser for file presence
3. Reproducing locally with `ionic serve` and Chrome DevTools

---

## 8. External Services and Dependencies

| Service | Provider | Purpose | Why Not Build In-House |
|---|---|---|---|
| Authentication | Firebase Auth (Google) | Anonymous user identity and token issuance | Building auth from scratch requires a server, session management, token signing — weeks of work |
| Database | Cloud Firestore (Google) | Structured data storage with real-time sync | A self-hosted database requires a server, deployment, backups, and security hardening |
| File storage | Firebase Storage (Google) | Video and thumbnail blob storage | S3-compatible storage requires AWS/GCS account and a server to generate signed URLs |
| Push notifications | Firebase Cloud Messaging (Google) | Device push delivery | FCM is the required intermediary for both Android (GCM) and iOS (APNs) — there is no alternative |
| Version control + CI + hosting | GitHub (Microsoft) | Code, builds, APK distribution, download page | Industry standard, free, no alternative needed |

### Risks and Fallbacks

| Service | Risk | Fallback |
|---|---|---|
| Firebase (all services) | Google deprecates or changes pricing | No fallback in MVP — acceptable for a portfolio project; migration to Supabase + custom storage is architecturally possible but non-trivial |
| FCM | Notification delivery delayed or failed | Firestore real-time listener provides status updates in-app without push |
| GitHub | Outage during CI build or APK download | Wait for recovery; no alternative hosting for APK in MVP |
| Firebase free tier quota | Exceeded (extremely unlikely at 6 users) | Quota resets daily; upgrade to Blaze plan is always an option |

---

## 9. Security Considerations

### Stack-Level Vulnerabilities

| Component | Known Risk | Mitigation |
|---|---|---|
| Firebase JS SDK | Exposes Firebase config in client bundle | Firebase config is not secret — it identifies the project, not authorises access. Security rules are the actual access control layer. |
| Capacitor WebView | XSS attacks via injected content | App renders only developer-controlled content — no user-generated HTML is rendered as markup |
| npm dependencies | Supply chain attacks via malicious packages | Use only well-maintained packages with large download counts (Ionic, Vue, Firebase, Capacitor). Run `npm audit` in CI. |
| Android APK | APK can be decompiled | Firebase config visible in decompiled APK — expected and acceptable (see row 1 above). No secrets are bundled. |

### Maintenance Status

| Dependency | Maintained By | Release Cadence |
|---|---|---|
| Ionic Framework | Ionic team (Appflow) | Active, major version ~yearly |
| Vue 3 | Vue core team | Active, frequent minor releases |
| Capacitor | Ionic team | Active, major version ~yearly |
| Firebase JS SDK | Google | Active, frequent patch releases |
| Pinia | Vue core team | Active |
| Vite | Evan You + community | Active, fastest-moving tool in the stack |

All core dependencies are actively maintained by well-resourced organisations. Supply chain risk is low when using official packages only.

---

## 10. Cost Analysis

### Current Cost: Zero

Every component of this stack is on a free tier.

| Service | Free Tier Limit | Expected Usage (6 users) | Headroom |
|---|---|---|---|
| Firestore reads | 50,000 / day | < 500 / day | 99% headroom |
| Firestore writes | 20,000 / day | < 50 / day | 99.75% headroom |
| Firebase Storage | 5 GB total | < 200 MB (10 videos × 20MB) | 96% headroom |
| Firebase Storage downloads | 1 GB / day | < 10 MB / day | 99% headroom |
| FCM notifications | Unlimited | < 20 / day | No limit |
| Firebase Auth | Unlimited | 6 users | No limit |
| GitHub Actions | 2,000 min / month | < 100 min / month | 95% headroom |
| GitHub Pages | 1 GB storage, 100 GB bandwidth/month | Negligible | No concern |

### What Scales Cost Linearly

- **Firebase Storage**: each video is up to 20MB. At 6 users each submitting 10 wishes, total storage is ~1.2GB — within free tier. Cost scales directly with number of videos stored.
- **Firestore reads**: scales with user count and app opens. Negligible at this scale.

### What Becomes Expensive at Scale

- **Firebase Storage egress (downloads)**: video streaming is expensive at scale. The free tier gives 1GB/day outbound. At hundreds of users watching videos, this would exceed free limits quickly.
- **Firebase Functions**: require upgrading to the Blaze (pay-as-you-go) plan — any server-side logic at all triggers this cost tier change.

### Cheapest Viable Setup for V1

Current setup is already the cheapest viable setup. No changes needed.

---

## 11. Developer Experience and Maintainability

### Onboarding a New Developer

Since this is a solo portfolio project, onboarding means "the developer returning to this project after six months." The `README.md` covers:
1. Clone the repo
2. `cp .env.example .env` and fill in Firebase config values
3. `npm install`
4. `ionic serve` — running in browser immediately

No Docker, no local database setup, no environment configuration beyond `.env`. Time from clone to running app: under 5 minutes.

### Tooling Ecosystem

| Task | Tool | Quality |
|---|---|---|
| Development server | `ionic serve` (Vite under the hood) | Excellent — hot reload, fast |
| State inspection | Pinia DevTools (Vue DevTools extension) | Excellent |
| Network inspection | Chrome DevTools (during `ionic serve`) | Excellent |
| TypeScript errors | VS Code + Volar extension | Excellent |
| Component debugging | Vue DevTools | Excellent |
| Device debugging | Chrome Remote Debugging via USB | Good |

### Parts Likely to Slow Development Later

| Area | Why | Mitigation |
|---|---|---|
| Capacitor version upgrades | Ionic and Capacitor major versions sometimes have breaking changes between each other | Pin versions in `package.json`, upgrade deliberately with testing |
| Firebase SDK major upgrades | v9 modular SDK was a significant breaking change from v8 | Project starts on v9 — no legacy debt |
| Android Gradle build issues | Android SDK and Gradle version mismatches are common | Document exact working SDK version in `README.md` |
| iOS builds | Requires a Mac and Xcode — cannot build iOS on Windows or Linux | For portfolio: test on Android, document iOS build requirements separately |

---

## 12. Upgrade and Longevity Strategy

### Dependency Upgrade Approach

Run `npm outdated` periodically. Upgrade in this order of safety:
1. **Patch versions** (`x.x.1` → `x.x.2`) — upgrade freely, no breaking changes by convention
2. **Minor versions** (`x.1.x` → `x.2.x`) — upgrade with brief review of changelog
3. **Major versions** (`1.x.x` → `2.x.x`) — upgrade deliberately, read migration guide, test on device before merging to `main`

### Tightly Coupled Components

| Coupling | Risk |
|---|---|
| Ionic version ↔ Capacitor version | Must be upgraded together — they have a compatibility matrix |
| Capacitor version ↔ Capacitor plugins (`@capacitor/camera`, `@capacitor/push-notifications`) | Plugin major versions must match Capacitor core major version |
| Firebase SDK version | Generally backward compatible; major version changes require migration (v8 → v9 was significant; v9 → v10 was minor) |
| Vue 3 ↔ Pinia | Both maintained by the same team — compatibility is guaranteed |

### If a Core Dependency Is Deprecated

| Dependency | Deprecation Risk | Alternative |
|---|---|---|
| Ionic Framework | Low — actively developed, commercial backing | Quasar Framework (also Vue-based) |
| Capacitor | Low — maintained by Ionic, widely adopted | React Native (would require framework rewrite) |
| Firebase | Low — core Google infrastructure product | Supabase (PostgreSQL-based, significant migration effort) |
| Pinia | Very low — official Vue state manager | Zustand (if moving to React), or plain `reactive()` composables |
| Vue 3 | Very low — stable, widely adopted | N/A — no practical alternative in this stack |

### Known Shortcuts Taken That Must Be Revisited

| Shortcut | When to Revisit |
|---|---|
| No Firebase Functions | If any server-side logic is ever needed (AI moderation, automated notifications, scheduled tasks) — requires upgrading to Blaze plan |
| Single Firebase project for all environments | If the app moves toward a real user base — create separate dev/staging/production Firebase projects |
| Manual APK signing | If build frequency increases — consider EAS Build or Fastlane for automated signing |
| No structured logging | If crash reports are insufficient for debugging — add Sentry for richer error context |
| No e2e testing | If the app grows in complexity — add Playwright or Cypress for critical flow coverage |