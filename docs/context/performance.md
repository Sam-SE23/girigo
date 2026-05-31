# performance.md — Girigo App Performance

---

## Framing Note

Girigo runs on Firebase free tier with a maximum of 6 users. Firebase manages
all infrastructure performance — server capacity, database throughput, CDN,
and network routing. The developer has no levers to pull on the infrastructure
side.

The performance concerns that fall to the application layer are:
- **Frontend rendering**: cold start time, scroll smoothness, transition quality
- **Upload performance**: video compression, upload progress, retry behaviour
- **Firebase operation latency**: expectations per operation type
- **Bundle size**: how fast the Ionic WebView loads the app on first launch
- **Caching**: what is served from device cache vs fetched over the network

Sections about SLAs, load testing, worker queues, horizontal scaling, CPU/memory
limits, and database connection pools are noted as not applicable and set aside.

---

## 1. Performance Philosophy

Performance is treated as a **feature constraint**, not a post-launch optimisation
step. Every screen and every Firebase operation has an expected latency defined in
this document before it is built.

### Core Rules

```
1. Cold start to Home screen: under 3 seconds on a mid-range Android device.
2. Every user-visible interaction must produce feedback within 100ms.
3. Scroll performance must maintain 60fps — layout thrash is a bug.
4. Performance regressions in the critical path (cold start, upload feedback)
   are treated as functional bugs, not cosmetic issues.
5. No complexity is added in the name of "performance" unless a measured problem
   exists. Premature optimisation is explicitly rejected.
```

### Optimise for Predictability, Not Peak Performance

The goal is **consistent, predictable performance** on a mid-range Android device
on a reasonable mobile data connection — not peak performance on a high-end device
on Wi-Fi. Design and test for the lower end of the expected device range.

---

## 2. Performance Targets

No formal SLAs or SLOs — this is a portfolio project with no commercial commitment.
The following are engineering targets that define acceptable performance:

| Metric | Target | Measurement Method |
|---|---|---|
| Cold start to Home screen (returning user) | Under 3 seconds | Chrome Remote Debugging Timeline on mid-range Android |
| Cold start to Home screen (first launch) | Under 5 seconds | Same — includes anonymous auth + Firestore user creation |
| Time to interactive after in-app navigation | Under 300ms | Chrome DevTools Performance tab |
| Button/card tap visual feedback | Under 100ms | Perceived — Ionic ripple effect is immediate |
| Wish list scroll | 60fps — no dropped frames | Chrome DevTools Performance → Frames |
| Upload progress bar visible after tap | Under 200ms | Measured from tap to modal appearance |
| Video upload (20MB on mobile data) | Under 30 seconds | Manual timing on 4G connection |
| Firestore document read (from cache) | Under 100ms | Chrome DevTools Network (during `ionic serve`) |
| Firestore document read (from network) | Under 1 second | Same |
| Auth init (returning user, from SDK cache) | Under 500ms | Performance tab — measured from app start to auth resolved |
| Lighthouse Performance score (mobile preset) | Above 80 | `ionic build` → serve `/www/` → Lighthouse in Chrome DevTools |

---

## 3. Latency Budget per User Flow

### Flow: App Cold Start → Home Screen (Returning User)

Total budget: **3 seconds**

| Layer | Operation | Expected Time | Acceptable Max |
|---|---|---|---|
| Capacitor WebView | Load HTML shell | 200ms | 400ms |
| Vite bundle | Parse and execute JS | 500ms | 800ms |
| Firebase SDK | Auth state resolved from cache | 300ms | 500ms |
| Firestore | Wish list served from offline cache | 100ms | 300ms |
| Vue rendering | Home screen first paint | 200ms | 400ms |
| **Total** | | **~1.3 seconds** | **3 seconds** |

If any layer consistently exceeds its acceptable max, investigate that layer
specifically. Do not optimise other layers to compensate.

### Flow: Tap "Make a Wish" → Camera Opens

Total budget: **500ms**

| Layer | Operation | Expected Time |
|---|---|---|
| Vue Router | Navigate to RecordView | 100ms |
| Capacitor camera plugin | Camera permission check | 100ms |
| Native OS | Camera open | 200ms |
| **Total** | | **~400ms** |

### Flow: Tap "Send My Wish" → Upload Progress Visible

Total budget: **200ms to progress bar appearing** (upload itself is separate)

| Layer | Operation | Expected Time |
|---|---|---|
| Button press handler | Disable button, trigger store action | 50ms |
| Store action | Set `isLoading: true`, show modal | 50ms |
| UploadProgressModal | Render with 0% progress | 50ms |
| **Total to visible feedback** | | **~150ms** |

---

## 4. Firebase Operation Latency Expectations

These are expected latencies under normal conditions for Singapore-based users
connecting to the `asia-southeast1` Firebase region.

| Operation | Expected Latency | Notes |
|---|---|---|
| `signInAnonymously()` (first time) | 500ms–1.5s | Network round-trip to Firebase Auth |
| `signInAnonymously()` (returning, from cache) | Under 100ms | SDK resolves from local cache |
| Firestore `getDoc()` (cached, offline persistence) | Under 50ms | Served from on-device IndexedDB |
| Firestore `getDoc()` (network fetch) | 300ms–800ms | Network round-trip |
| Firestore `setDoc()` / `updateDoc()` (online) | 300ms–800ms | Write acknowledged |
| Firestore `setDoc()` / `updateDoc()` (offline) | Under 10ms | Queued locally; syncs on reconnect |
| Firestore `onSnapshot` first event (online) | 300ms–800ms | Initial data delivery |
| Firestore `onSnapshot` subsequent events | Under 200ms | Incremental update |
| Firebase Storage upload (1MB file) | 2–5 seconds (4G) | Variable by network conditions |
| Firebase Storage upload (20MB file) | 20–60 seconds (4G) | Show progress bar; not a blocking operation |
| Firebase Storage `getDownloadURL()` | 200ms–500ms | Metadata fetch |
| FCM push notification delivery | 1–5 seconds | Best-effort; no hard SLA |

### Timeout Policy

| Operation | Timeout | On Timeout |
|---|---|---|
| Video upload | 60 seconds per attempt | Treated as a retryable failure; `UploadService` retries up to 3 times |
| Firestore single read | No explicit timeout | Firebase SDK handles internally; `unavailable` error surfaced if prolonged |
| Auth init | 10 seconds | If unresolved, show retry option on onboarding screen |

---

## 5. Scaling Assumptions

Not applicable in the traditional sense. Firebase scales automatically.
The only scaling constraint is the **Firebase free tier quota**, which acts as
a ceiling, not a bottleneck.

| Metric | Current (6 users) | Free Tier Limit | Headroom |
|---|---|---|---|
| Firestore reads/day | Under 500 | 50,000 | 99% |
| Firestore writes/day | Under 50 | 20,000 | 99.75% |
| Storage used | ~1.2GB | 5GB | 76% |
| Storage downloads/day | Under 100MB | 1GB | 90% |

The first limit likely to be hit at scale would be **Storage egress (video downloads)**
— 1GB/day free is consumed quickly if many users watch each other's videos. Girigo
users only watch their own videos, so this risk is low.

---

## 6. Database Performance

Firestore query performance is determined by index availability.
Without the required compound indexes, Firestore rejects compound queries entirely.

| Query | Index Required | Expected Latency (with index) |
|---|---|---|
| User's wish list (`uid` + `createdAt DESC`) | ✅ Compound index | Under 300ms from network |
| Admin pending queue (`status` + `createdAt ASC`) | ✅ Compound index | Under 300ms from network |
| Single wish by ID | Auto (document ID lookup) | Under 200ms from network |
| User profile by UID | Auto (document ID lookup) | Under 200ms from network |

**Queries that are forbidden due to performance or cost:**
- Full collection scan of all wishes without a `uid` filter (no index, full scan)
- Text search within `wishText` content (Firestore has no full-text search)
- Sorting by any field without an index (Firestore rejects the query)

See `database.md` Section 7 for index definitions.

---

## 7. Caching Strategy

Caching is defined in full in `design.md` Section 9, `database.md` Section 9,
and `frontend.md` Section 10. Summary for performance context:

| Data | Cache Location | Latency Benefit |
|---|---|---|
| Firebase Auth session | Firebase SDK internal (IndexedDB) | Auth resolves from cache on every launch — no network call for returning users |
| Firestore documents (wish list, user profile) | Firestore SDK offline persistence (IndexedDB) | Home screen loads instantly from cache; network update arrives in background |
| Pinia store data | In-memory (session lifetime) | Sub-millisecond reads after first load |
| Video thumbnails | Firebase Storage CDN + WebView HTTP cache | Images load from cache on subsequent views |
| uid and username | `@capacitor/preferences` | Available synchronously on app start |

**The most impactful caching behaviour**: Firestore offline persistence means the
Home screen loads with cached wish data in under 100ms even on a slow connection.
The network fetch updates the UI in the background. Users never see a blank screen
while waiting for data.

---

## 8. External Dependency Performance

Firebase is the only external dependency. Performance tolerance:

| Concern | Tolerance | Handling |
|---|---|---|
| Firebase Auth slow response | Up to 3 seconds | Show loading state; retry on timeout |
| Firestore slow first read | Up to 2 seconds | Serve from offline cache immediately; network data updates in background |
| Firebase Storage slow upload | Up to 60 seconds per attempt | Show progress bar; allow cancel; retry on timeout |
| FCM slow delivery | Up to 60 seconds | Acceptable — push is best-effort; Firestore listener is the reliable status update mechanism |
| Firebase platform outage | Minutes to hours | Firestore offline cache serves reads; writes queue; auth fails for new sessions |

**Fallback for each:**
- Firestore outage → offline cache serves reads; writes queue and retry automatically
- Storage outage → upload fails after timeout; user retries manually
- FCM outage → no push notifications; user sees status via Firestore listener when they open the app
- Auth outage → returning users unaffected (SDK cache); new users cannot authenticate

---

## 9. Frontend Performance Constraints

### Bundle Size

| Bundle | Target Size (gzipped) | Notes |
|---|---|---|
| Initial JS bundle | Under 300KB | Vite tree-shakes Firebase SDK to only imported modules |
| Per-route lazy chunk | Under 50KB each | Routes loaded via dynamic `import()` |
| CSS | Under 30KB | Ionic base + custom SCSS |
| Total initial download | Under 400KB | Sum of HTML + CSS + initial JS chunk |

**How to measure**: `ionic build` → inspect `/www/` directory → check `.js` file sizes
with `gzip -l filename.js`.

**What keeps bundle size controlled:**
- Firebase SDK v9 modular imports — only `firebase/auth`, `firebase/firestore`,
  `firebase/storage`, `firebase/analytics` are imported; the full SDK is not bundled
- Vite code splitting — admin route chunk is never loaded for regular users
- No Tailwind (removing Tailwind's unused CSS via PurgeCSS is a known maintenance burden)

### First Contentful Paint (FCP)

**Target: Under 2 seconds** on a mid-range Android device on 4G.

FCP is primarily determined by the Capacitor WebView's time to render the first
visible content. The Ionic splash screen (native, not WebView) appears immediately
while the WebView loads, masking the JS parse time.

### Time to Interactive (TTI)

**Target: Under 3 seconds** — matches the cold start target. TTI is when the user
can meaningfully interact with the Home screen (tap a wish card, tap the CTA button).

### Critical Render Path

The following must be present in the initial bundle (not lazy-loaded):
- `SplashView.vue`
- `App.vue`
- Pinia store registration
- Vue Router registration
- Firebase SDK initialisation (`firebase/app`, `firebase/auth`)
- Design token CSS variables (`/src/theme/variables.css`)

The following are lazy-loaded (not in initial bundle):
- All views except `SplashView`
- `firebase/firestore` (loaded after auth resolves)
- `firebase/storage` (loaded on Record flow entry)
- `firebase/analytics`
- Admin bundle (`AdminView`, `AdminWishDetailView`, `AdminService`, `adminStore`)

### What Is Lazy-Loaded

From `frontend.md` Section 8:

```ts
// Lazy-loaded routes — Vite creates separate chunks for each
{ path: '/onboarding', component: () => import('@/views/OnboardingView.vue') }
{ path: '/home',       component: () => import('@/views/HomeView.vue') }
{ path: '/record',     component: () => import('@/views/RecordView.vue') }
{ path: '/preview',    component: () => import('@/views/PreviewView.vue') }
{ path: '/wish/:id',   component: () => import('@/views/WishDetailView.vue') }
{ path: '/admin',      component: () => import('@/views/AdminView.vue') }
```

### 60fps Scroll Contract

The wish list on the Home screen must scroll at 60fps. The rules that enforce this:

```
1. No layout-triggering CSS properties in animation (no animating width, height,
   top, left — only transform and opacity).
2. Thumbnail images use loading="lazy" — off-screen images do not block scroll.
3. WishCard component uses CSS variables for all styling — no JS-driven style
   calculation on scroll.
4. Wish list does not re-render the full list on each Firestore update — Pinia
   reactive arrays trigger only the changed items to re-render.
```

---

## 10. Upload Performance

Video upload is the most performance-sensitive user-facing operation.

### Compression Target

Before upload, video is compressed client-side:

| Property | Target | Notes |
|---|---|---|
| Resolution | Maximum 720p | Downsampled if recorded at higher resolution |
| File size | Under 20MB | Hard limit enforced by Storage rules |
| Format | MP4 (H.264) | Capacitor camera outputs MP4 by default |

Compression is handled by `capacitor-video-compressor`. Compression time is
typically 5–15 seconds for a 30-second video on a mid-range Android device.
A compression progress indicator is shown during this step.

### Upload Feedback Timing

| Event | Must Happen Within |
|---|---|
| Upload overlay appears | 200ms of "Send My Wish" tap |
| Progress bar reaches 10% | 3 seconds of upload start |
| Progress updates | Every 5% increment, or at most every 500ms |
| Success animation | Within 500ms of Firestore write confirming |

### Upload Performance on Slow Connections

The upload is not cancelled on slow connections — the `UploadService` has a 60-second
timeout per attempt. On a slow connection (2G/3G), a 20MB file may take over 60
seconds and trigger a retry. Users can also cancel the upload manually.

There is no upload size optimisation beyond the 720p/20MB constraint — higher
compression ratios would noticeably degrade video quality for this aesthetic.

---

## 11. Background Jobs and Async Performance

There are no background workers in this project. Firebase Functions are not
available on the free Spark plan.

The only background-adjacent operation is **FCM push notification delivery**, which
is handled entirely by Google's FCM infrastructure. The app has no control over
delivery timing.

When the app is backgrounded during a video upload:
- Capacitor's background task API keeps the upload alive for a short OS-permitted
  window (typically 30 seconds on Android, 3 minutes on iOS)
- If the upload is interrupted by OS task-killing, the user is shown a retry option
  when they reopen the app
- The recorded video is preserved in component state until successfully uploaded or
  explicitly discarded by the user

---

## 12. Performance Testing Strategy

### What Is Tested and How

| Test | Tool | Trigger |
|---|---|---|
| Lighthouse Performance score (mobile) | Chrome DevTools Lighthouse | Before each release tag |
| Cold start timing | Chrome Remote Debugging Timeline on Android | Before each release tag |
| Wish list scroll FPS | Chrome DevTools Performance tab → Frames | When list rendering changes |
| Bundle size check | Inspect `/www/` after `ionic build` | After adding any new dependency |
| Upload progress responsiveness | Manual on physical device | When UploadService changes |

### Lighthouse Audit Process

```bash
ionic build
cd www && npx serve -p 8080 &    # serve the production build locally
# Open Chrome → localhost:8080 → DevTools → Lighthouse
# Settings: Mobile, simulated throttling (3G), Performance only
# Target: score > 80
```

Run Lighthouse against the **production build** (`ionic build`), not the dev server
(`ionic serve`). Dev server includes development tooling that inflates bundle size.

### What Is Not Performance Tested

- Load testing (not applicable — 6 users, Firebase handles scale)
- API endpoint response time (no custom API)
- Database query benchmarking (Firestore query performance is determined by index
  presence, not query optimisation)
- Stress testing (not applicable)

---

## 13. Monitoring and Metrics

Covered in `devops.md` Section 5. Performance-specific additions:

### What to Watch in Firebase Console

| Metric | Where | Check Frequency |
|---|---|---|
| Storage usage approaching 4GB (80% of 5GB free) | Console → Storage | Weekly |
| Firestore read count approaching 40K/day (80% of 50K) | Console → Usage | Weekly |
| Crash rate increase after new release | Crashlytics | After each release |

### Performance Degradation Detection

Performance degradation in this app manifests as:
1. **Increased cold start time**: usually caused by a larger initial bundle or
   a slow Firebase Auth cache miss
2. **Laggy scroll**: usually caused by adding non-GPU-composited animations or
   rendering too many items without virtualisation
3. **Upload timeouts increasing**: usually caused by larger video files or the
   target device being slower than expected

All three are detected manually via the pre-release smoke test and Lighthouse audit.
There is no automated performance regression detection in CI for this project.

---

## 14. Degradation Strategy

The only realistic degradation scenario for Girigo is **Firebase free tier quota
exhaustion**. Firebase does not gracefully throttle — it rejects operations after
the daily quota is reached.

| Quota Reached | App Behaviour | User Experience |
|---|---|---|
| Firestore reads exhausted | `getDoc` and `onSnapshot` fail | Error toasts; wish list shows cached data only |
| Firestore writes exhausted | `setDoc` and `updateDoc` fail | New wish submissions fail; user sees retry option |
| Storage downloads exhausted | Video playback URLs return 403 | Video player shows error; thumbnails may fail to load |
| Storage quota (5GB) full | Uploads fail | Upload fails; user sees error; admin must delete old wishes |

**When this happens**: Reset is daily at midnight Pacific Time. The practical
response is to wait for the quota to reset. At 6 users, hitting any quota limit
would require an unusually high volume of activity and is not expected.

No features are designed to be "disabled under load" — at this scale, graceful
degradation means showing an error state and a retry option.

---

## 15. Performance Regression Rules

### What Counts as a Performance Regression

| Regression | Severity |
|---|---|
| Cold start exceeds 3 seconds (previously under 3) | High — must fix before release |
| Wish list drops below 60fps on scroll | High — must fix before release |
| Lighthouse Performance score drops below 80 | Medium — investigate before release |
| Initial JS bundle exceeds 300KB gzipped | Medium — investigate; may be justified by new dependency |
| Upload progress bar appears after 500ms | Low — investigate |

### Is Performance Tested in CI?

Not automated. The Lighthouse audit and cold start timing are **manual pre-release
checklist items** — run by the developer before pushing a version tag.

Automating Lighthouse in CI requires a headless browser configured for mobile
simulation, which adds pipeline complexity disproportionate to the value at this
scale. The pre-release checklist is sufficient.

### What Blocks Deployment Due to Performance

A release is blocked if the pre-release smoke test reveals:
- Cold start consistently exceeds 3 seconds on the test device
- Wish list scroll consistently drops frames visibly
- Lighthouse score is below 70 (not 80 — the 80 target is a goal, not a hard gate)

---

## 16. Known Performance Tradeoff: Ionic WebView vs Native

The most significant performance decision in the Girigo stack is using Ionic's
WebView rendering model instead of native widgets (Flutter, React Native).

| Tradeoff | Detail |
|---|---|
| **What was gained** | Developer uses Vue 3 — full existing knowledge; browser DevTools for debugging; faster iteration cycle |
| **What was sacrificed** | Native rendering performance — WebView has higher memory usage and slightly slower animation than native |
| **Impact on Girigo** | Negligible — the app is UI-light (cards, forms, a video player). Heavy animation (60+ animated elements, physics, games) would be affected; simple scroll and transition are not. |
| **When this tradeoff would hurt** | A complex gesture-driven UI, a game, or a canvas-heavy experience would be noticeably slower in WebView |

This tradeoff is documented in `tech-stack.md` Section 2 (Decision 1) and is an
accepted, locked decision. Do not attempt to "fix" it by moving to React Native
or Flutter — that would be a full project rewrite.

### Ionic Performance Optimisation Conventions

To stay within acceptable performance bounds in a WebView:

```
1. Animate ONLY transform and opacity — never animate width, height, top, left,
   margin, or padding. These trigger layout recalculation and cause frame drops.

2. Use CSS animations (keyframes) over JS-driven animations wherever possible.
   CSS animations run on the compositor thread, not the main thread.

3. Avoid synchronous JS on scroll events. Use Intersection Observer for
   lazy-loading — it runs off the main thread.

4. Ionic's ion-virtual-scroll (or a manual Intersection Observer approach) for
   lists longer than 20 items — do not render all items in the DOM simultaneously.

5. Images must always have explicit width and height attributes to prevent
   Cumulative Layout Shift (CLS), which degrades Lighthouse score and user experience.
```