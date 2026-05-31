# testing.md — Girigo App Testing Strategy

---

## 1. Testing Philosophy

### Goal of Testing in This Project

The primary goal of testing in Girigo is **preventing regressions in critical
business rules and security invariants.** The secondary goal is **confidence when
refactoring the services layer** — since all Firebase logic is abstracted behind
services, tests make it safe to change a service implementation without breaking
the app.

This is not a safety-critical system. The app records wishes and sends push
notifications. An untested bug causes a bad experience for 6 friends — not financial
loss or personal harm. Testing effort is proportional to that reality.

### What "Tested Enough" Means for This Project

| Area | Tested Enough When... |
|---|---|
| Firestore security rules | Every rule scenario in the security matrix passes against the emulator |
| Service layer business logic | Every business rule (status transitions, uid matching, upload ordering) has a unit test |
| Critical UI components | WishCard renders correct status badge; UploadProgressModal shows correct state |
| Upload flow | All failure paths (Storage fail, Firestore fail, partial fail) have tests |

The app is "tested enough" when the critical tests in `backend.md` Section 13 and
`security.md` Section 15 all pass. Coverage percentage is not a target metric.

### What Is Explicitly NOT Worth Testing

| What | Why Not |
|---|---|
| E2e tests (full app automation) | Capacitor WebView e2e requires device/emulator setup, Appium configuration, and significant maintenance overhead. At 6 users, manual smoke testing is faster and sufficient. |
| Ionic UI component rendering | Ionic components are a mature, well-tested library. Testing that `ion-button` renders is testing someone else's code. |
| Firebase SDK behaviour | The Firebase SDK is tested by Google. Testing that `setDoc()` writes to Firestore is testing Google's code. |
| `lastSeen` timestamp updates | Low-value non-critical background operation |
| Onboarding screen rendering | Purely visual, no logic |
| Cosmetic animations and transitions | No business logic |

---

## 2. Test Pyramid Strategy

### Pyramid Ratio for This Project

```
          /\
         /  \
        / e2e \ ← None in MVP
       /────────\
      /component \ ← Small (critical UI components only)
     /────────────\
    / integration  \ ← Medium (Firestore rules + emulator)
   /────────────────\
  /    unit tests    \ ← Largest layer (service layer business logic)
 /────────────────────\
```

| Layer | Count (approximate) | Speed | What It Covers |
|---|---|---|---|
| Unit tests | ~30–40 tests | Fast (<5s total) | Service method logic, business rules, validation |
| Component tests | ~10–15 tests | Fast (<10s total) | Critical UI component rendering and state |
| Integration tests (rules) | ~20–25 tests | Moderate (requires emulator, ~30s) | Firestore and Storage security rules |
| E2e tests | None | N/A | Not implemented in MVP |

### What MUST Be Tested at Unit Level

- All business rule enforcement in service methods (status transition validation,
  uid matching, required field presence)
- Upload ordering logic (Storage before Firestore)
- Delete ordering logic (Firestore before Storage files)
- Error translation (Firebase error codes → human-readable messages)
- Admin delete calls all three delete operations
- Retry logic in `UploadService` (attempts up to 3 times with backoff)

### What MUST Be Tested at Integration Level

- Firestore security rules: every read/write permission scenario
- Firebase Storage rules: MIME type validation, file size limit, path ownership
- Full wish creation flow against the emulator (both Storage uploads + Firestore write)

### What SHOULD Be Left to Manual Testing Only

- Camera opens and records correctly (requires a physical device)
- Push notifications are delivered (requires FCM and a real device)
- Video playback in the WebView (device-specific rendering)
- iOS behaviour (requires a Mac and iOS device/simulator)
- Admin 5-tap gesture detection (touch input, requires device)
- APK install and upgrade behaviour on Android

---

## 3. Unit Testing

### What Counts as a Unit

A **unit** in this codebase is a single service method or composable function. Units
are tested in isolation with the Firebase SDK mocked via Vitest's `vi.mock()`.

Vue components are tested separately at the component layer — not at the unit layer
— because they involve rendering and are better suited to Vue Test Utils.

### What Is Purely Unit-Testable

| Unit | What to Test |
|---|---|
| `AuthService.signInAnonymously()` | Calls `signInAnonymously()` from Firebase; writes correct user document shape |
| `AuthService.updateLastSeen(uid)` | Calls `updateDoc` with `lastSeen: serverTimestamp()` |
| `WishService.createWish(data)` | Calls `setDoc` with correct field values; status is always `'pending'`; `uid` matches input |
| `WishService.getWishById(wishId)` | Returns `null` for non-existent document; returns typed `WishDocument` for existing |
| `AdminService.updateWishStatus()` | Calls Firestore transaction; throws if current status is not `'pending'`; sets `grantedAt` on grant |
| `AdminService.deleteWish()` | Calls `deleteDoc` before Storage `deleteObject`; calls `deleteObject` for both video and thumbnail paths |
| `UploadService` retry logic | Fails and retries up to 3 times; uses same `wishId` on retry; throws after 3 failures |
| `UploadService.cancelUpload()` | Calls `.cancel()` on the active upload task |
| Wish text validation | Rejects text over 280 chars; accepts empty string; accepts exactly 280 chars |

### What Is Forbidden From Being Untested

From `backend.md` Section 13 — these are non-negotiable:

1. Status transition enforcement (`AdminService.updateWishStatus` throws on non-pending)
2. Admin delete calls all three deletes in the correct order
3. Wish creation only proceeds after both Storage uploads succeed
4. Service methods catch Firebase errors and throw human-readable messages (never raw
   Firebase error codes)

### Pure Functions vs Side-Effect-Heavy Logic

**Pure functions** (no side effects, no Firebase calls): These are tested with plain
inputs and outputs. Example: the SHA-256 PIN hash comparison in the admin PIN flow.

**Side-effect-heavy functions** (Firebase SDK calls): These are tested by mocking
the Firebase SDK and asserting that the correct SDK methods were called with the
correct arguments. Example: `WishService.createWish` — the test mocks `setDoc` and
asserts it was called with the correct document shape.

```ts
// Example unit test pattern — WishService.createWish
import { vi, describe, it, expect } from 'vitest'
import { setDoc } from 'firebase/firestore'
import { WishService } from '@/services/WishService'

vi.mock('firebase/firestore', () => ({
  setDoc: vi.fn().mockResolvedValue(undefined),
  doc: vi.fn().mockReturnValue({}),
  serverTimestamp: vi.fn().mockReturnValue('mock-timestamp'),
  getFirestore: vi.fn(),
}))

describe('WishService.createWish', () => {
  it('writes wish document with status pending', async () => {
    await WishService.createWish({
      wishId: 'test-id',
      uid: 'user-123',
      username: 'phantom_001',
      wishText: 'Test wish',
      videoUrl: 'https://storage.example.com/video.mp4',
      thumbnailUrl: 'https://storage.example.com/thumb.jpg',
    })

    expect(setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'pending', uid: 'user-123' })
    )
  })

  it('throws human-readable error when Firestore fails', async () => {
    vi.mocked(setDoc).mockRejectedValueOnce(new Error('permission-denied'))

    await expect(WishService.createWish({ ... }))
      .rejects.toThrow('Could not save your wish')
  })
})
```

---

## 4. Integration Testing

### What Must Be Tested Together

| Integration | Why Together |
|---|---|
| Firestore security rules + Firebase emulator | Rules are only meaningful when evaluated server-side against real authentication context. Mocking rules in unit tests gives no real confidence. |
| Storage rules + Firebase emulator | Same reason — MIME type and file size rules are enforced by Firebase Storage infrastructure |
| Full wish creation flow (upload ordering) | The ordering of Storage uploads → Firestore write is a multi-step operation where partial failure must be tested |

### Real vs Mocked in Integration Tests

| Dependency | Status in Integration Tests |
|---|---|
| Firebase Local Emulator (Firestore + Auth + Storage) | **Real** — emulator runs locally, provides full rules evaluation |
| Firebase SDK | **Real** — the actual `firebase` npm package connects to the emulator |
| Vue Router | Mocked — not relevant for service/rules tests |
| Pinia stores | Mocked — stores are not tested at the integration layer |
| Capacitor plugins | Mocked — no device available in CI |
| FCM | Mocked — push notification delivery not tested in integration |

### What Counts as a "Real Integration"

A test counts as a real integration test only if it uses the **Firebase Local
Emulator** and exercises the actual Firestore security rules against a real (emulated)
authenticated user context. A test that mocks `getDoc` and `setDoc` at the SDK level
is a unit test, not an integration test.

### Firestore Rules Integration Tests

Full test matrix (also in `security.md` Section 15):

```ts
// Example integration test pattern — Firestore rules
import { initializeTestEnvironment, assertFails, assertSucceeds }
  from '@firebase/rules-unit-testing'

describe('Firestore security rules — wishes collection', () => {
  let testEnv

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'girigo-test',
      firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    })
  })

  afterAll(() => testEnv.cleanup())

  it('user can read own wish', async () => {
    const userDb = testEnv.authenticatedContext('user-123').firestore()
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'wishes/wish-1'), {
        uid: 'user-123', status: 'pending', videoUrl: 'https://...', ...
      })
    })
    await assertSucceeds(getDoc(doc(userDb, 'wishes/wish-1')))
  })

  it('user cannot read another user\'s wish', async () => {
    const otherDb = testEnv.authenticatedContext('user-456').firestore()
    await assertFails(getDoc(doc(otherDb, 'wishes/wish-1')))
  })

  it('admin can update wish status from pending to granted', async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid').firestore()
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/admin-uid'), { role: 'admin' })
    })
    await assertSucceeds(
      updateDoc(doc(adminDb, 'wishes/wish-1'), { status: 'granted' })
    )
  })

  it('admin cannot update wish status from granted to rejected', async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid').firestore()
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'wishes/wish-1'), { status: 'granted' })
    })
    await assertFails(
      updateDoc(doc(adminDb, 'wishes/wish-1'), { status: 'rejected' })
    )
  })
})
```

---

## 5. End-to-End Testing

### Not Implemented in MVP

E2e testing is explicitly excluded from the MVP. Reasons:

| Reason | Detail |
|---|---|
| Device requirement | Capacitor features (camera, FCM, `@capacitor/preferences`) require a real device or emulator — e2e automation requires Appium or Detox configured for Capacitor apps |
| Maintenance overhead | E2e tests for mobile apps are brittle — UI layout changes break selectors frequently |
| Disproportionate effort | At 6 users, the cost of writing and maintaining e2e tests exceeds the value |
| Manual testing is sufficient | The developer runs the app on device before every release tag — this is the effective e2e check |

### Manual Smoke Test Checklist (Pre-Release)

Performed by the developer on a physical Android device before pushing any version
tag:

```
[ ] App launches and splash screen displays correctly
[ ] Onboarding screens display in sequence
[ ] Camera opens when "Make a Wish" is tapped
[ ] Video records and preview displays correctly
[ ] Upload progress bar appears and completes
[ ] Wish card appears in home screen list with "Pending" status
[ ] Admin panel accessible via 5-tap gesture + correct PIN
[ ] Admin can view wish video in admin panel
[ ] Admin can change wish status to "Granted"
[ ] Push notification appears on test user device
[ ] Tapping notification navigates to correct wish detail
[ ] Wish detail shows "Granted" status and admin message
```

This checklist is stored in `docs/smoke-test.md` and run before every release.

### What Would Trigger Adding E2e Tests

If the app ever gained real users (beyond the 6-person portfolio group) or added
complex new flows (live chat, user profiles), a Detox or Maestro e2e suite would
be justified. The architecture does not prevent adding e2e tests later.

---

## 6. Critical Test Coverage

### Risk Classification

| Module | Risk Level | Why |
|---|---|---|
| Firestore security rules | **High** | Misconfiguration exposes all user data |
| `AdminService.updateWishStatus` | **High** | Business invariant (one-way status transition) must never regress |
| `AdminService.deleteWish` | **High** | Must delete Firestore + both Storage files — partial delete is a data integrity issue |
| `UploadService` (ordering + retry) | **High** | Wrong ordering could create wish documents without videos |
| `WishService.createWish` validation | **High** | Must never write a wish with another user's `uid` |
| `AuthService` error handling | **Medium** | Auth failure must not crash the app; must show a usable error state |
| `WishCard` status badge rendering | **Medium** | Users trust the status display |
| `UploadProgressModal` state transitions | **Medium** | Upload UX depends on correct modal state |
| `NotificationService.registerToken` | **Medium** | Incorrect token registration = no notifications |
| Onboarding screens | **Low** | Purely visual; no business logic |
| `lastSeen` updates | **Low** | Background operation with no user impact if it fails |
| Animation and transition timing | **Low** | Visual only |

### What Happens If a Critical Path Is Untested

| Critical Path | If Untested and Broken |
|---|---|
| Firestore rules misconfigured | All user data exposed — catastrophic, silent failure |
| Status transition not enforced | Admin can change status to anything; user receives duplicate notifications |
| Upload ordering wrong | Wish documents created without videos; admin sees blank video player |
| Wrong uid on wish creation | User's wishes not visible to them; admin sees misattributed wishes |

All high-risk items have corresponding tests in the test suite and are part of the
deployment gates in `devops.md` Section 10.

---

## 7. Edge Case Strategy

### Known Edge Cases Per Module

**`WishService` / `UploadService`:**

| Edge Case | Category | Test |
|---|---|---|
| User skips wish text (empty string) | Empty data | `createWish` with `wishText: ''` — must succeed |
| Wish text exactly 280 characters | Extreme value | Validation accepts 280 chars |
| Wish text 281 characters | Boundary violation | Validation rejects — throws before Firestore call |
| Storage upload 1 succeeds, upload 2 fails | Partial failure | `uploadStore` surfaces retry; no Firestore document created |
| Storage upload 2 succeeds, Firestore write fails | Partial failure | Retry uses same `wishId` — idempotent overwrite |
| Upload cancelled mid-progress | User action | `cancelUpload()` calls `.cancel()` on upload task |
| Upload retried after 3 failures | Retry exhaustion | Throws after 3 attempts; error surfaced to user |
| `getWishById` for non-existent document | Not found | Returns `null`; detail screen shows not-found state |

**`AdminService`:**

| Edge Case | Category | Test |
|---|---|---|
| Update status on wish that is already `'granted'` | Invalid transition | Throws "already reviewed" |
| Update status on wish that is already `'rejected'` | Invalid transition | Throws "already reviewed" |
| Delete wish where Storage file was already deleted | Idempotent operation | Storage `deleteObject` on non-existent path does not throw |
| Delete wish where Firestore document does not exist | Not found | `deleteDoc` on non-existent document does not throw |

**`AuthService`:**

| Edge Case | Category | Test |
|---|---|---|
| `signInAnonymously` fails (network error) | External failure | Catches and throws human-readable error |
| `onAuthStateChanged` fires with `null` (session lost) | State reset | `initAuth` calls `signInAnonymously` to re-establish session |

**Security rules:**

| Edge Case | Category | Test |
|---|---|---|
| Unauthenticated read of any document | No auth | Denied |
| Write wish with `videoUrl: ''` | Empty required field | Denied by rules |
| Write wish with `status: 'granted'` at creation | Invalid initial state | Denied (only `'pending'` at creation) — enforced at service layer; rules do not explicitly check initial status value on create, but service layer always sets `'pending'` |
| Write to another user's Storage path | Path mismatch | Denied by Storage rules |
| Upload file with MIME type `image/jpeg` | Wrong type | Denied by Storage rules |
| Upload file of exactly 20MB | Boundary value | Allowed |
| Upload file of 20MB + 1 byte | Over limit | Denied by Storage rules |

### How Edge Cases Are Identified

1. **Boundary analysis**: For every numeric constraint (280 chars, 20MB, 30-second
   video), test at-limit, over-limit, and under-limit values
2. **Failure injection**: For every multi-step operation (upload flow, delete flow),
   test failure at each step
3. **State machine analysis**: For every entity with a state machine (wish status),
   test every valid and invalid transition
4. **Empty state analysis**: For every operation that reads data, test the case where
   no data exists

---

## 8. Failure Testing

### Failures That Must Be Explicitly Tested

| Failure | How It Is Tested | What Is Verified |
|---|---|---|
| Firebase Storage upload fails | Unit test — `vi.mocked(uploadBytesResumable).mockRejectedValueOnce(...)` | Service retries; no Firestore document created |
| Firestore write fails after successful uploads | Unit test — `vi.mocked(setDoc).mockRejectedValueOnce(...)` | Human-readable error thrown; retry preserves same `wishId` |
| `signInAnonymously` fails | Unit test — mock `signInAnonymously` to throw | `AuthService` catches and throws human-readable error |
| Firestore `getDoc` returns non-existent document | Unit test — mock `getDoc` to return `{ exists: false }` | Service returns `null`; store handles empty state |
| Admin transaction fails (wish already reviewed) | Unit test — emulator integration test | Transaction throws "already reviewed" |

### Simulated vs Real Failures

| Failure Type | Approach |
|---|---|
| Firebase SDK operation failures | **Simulated** — `vi.mock()` in unit tests rejects specific calls |
| Firestore rules violations | **Real** — Firebase Local Emulator enforces actual rules |
| Network offline | **Manual testing** — Chrome DevTools → Network → Offline during `ionic serve` |
| Firebase platform outage | Not tested — external dependency; handled by Firestore SDK's offline cache |

---

## 9. Regression Testing Strategy

### How Regressions Are Prevented

Every bug fix must include a new test that reproduces the original failure before
the fix is applied, confirming the test fails, then confirming it passes after the
fix. This is the minimal regression prevention contract for a solo developer.

All tests run on every push to `dev` and `main` via GitHub Actions — regressions
are caught before they reach production.

### The Critical Test Suite

The following tests are the "never break" list — these must always pass:

1. User cannot read another user's wish (Firestore rules)
2. User cannot create wish with another user's `uid` (Firestore rules)
3. Admin can read all wishes (Firestore rules)
4. Status transition from `granted` to `rejected` is denied (Firestore rules)
5. `updateWishStatus` throws when wish status is not `'pending'` (unit)
6. `deleteWish` calls Firestore delete before Storage deletes (unit)
7. `createWish` never calls `setDoc` if a Storage upload fails (unit)
8. Wish text over 280 chars is rejected before Firestore call (unit)
9. Firebase errors are never re-thrown as raw error codes (unit, per service)

These 9 test cases represent the "critical path" of the test suite. If any of these
fail, the CI pipeline blocks the merge.

---

## 10. Mocking and Test Data Strategy

### What Is Mocked

| Dependency | Unit Tests | Integration Tests |
|---|---|---|
| Firebase JS SDK (`firebase/firestore`, `firebase/storage`, `firebase/auth`) | **Mocked** with `vi.mock()` | **Real** (connects to Local Emulator) |
| `@capacitor/preferences` | **Mocked** with `vi.mock()` | **Mocked** |
| `@capacitor/push-notifications` | **Mocked** with `vi.mock()` | **Mocked** |
| `@capacitor/camera` | **Mocked** with `vi.mock()` | **Mocked** |
| Firebase Crashlytics | **Mocked** | **Mocked** |
| Vue Router | **Mocked** (not relevant for service tests) | **Mocked** |
| Pinia stores | **Mocked** (for component tests) | **Mocked** |

### Ensuring Mocks Don't Diverge From Reality

- All Firebase SDK mock factories mirror the **actual SDK function signatures**
  defined in the TypeScript types from the `firebase` npm package. TypeScript will
  surface a type error if the mock returns a shape that doesn't match the real SDK.
- Integration tests (against the emulator) test the same code paths that unit tests
  mock — if a mock drifts from reality, the integration test will catch it.
- When upgrading the Firebase SDK version, re-run the full test suite. Type errors
  in mocks indicate API drift.

### Mock Factory Pattern

Centralise all Firebase SDK mocks in `/tests/mocks/firebase.ts` to avoid
duplicating mock definitions across test files:

```ts
// tests/mocks/firebase.ts
export const mockSetDoc = vi.fn().mockResolvedValue(undefined)
export const mockGetDoc = vi.fn()
export const mockUpdateDoc = vi.fn().mockResolvedValue(undefined)
export const mockDeleteDoc = vi.fn().mockResolvedValue(undefined)
export const mockDeleteObject = vi.fn().mockResolvedValue(undefined)

vi.mock('firebase/firestore', () => ({
  setDoc: mockSetDoc,
  getDoc: mockGetDoc,
  updateDoc: mockUpdateDoc,
  deleteDoc: mockDeleteDoc,
  doc: vi.fn().mockReturnValue({ id: 'mock-doc-ref' }),
  collection: vi.fn(),
  serverTimestamp: vi.fn().mockReturnValue('mock-timestamp'),
  runTransaction: vi.fn().mockImplementation(async (db, fn) => fn({ get: mockGetDoc, update: mockUpdateDoc })),
  getFirestore: vi.fn(),
}))

vi.mock('firebase/storage', () => ({
  deleteObject: mockDeleteObject,
  ref: vi.fn().mockReturnValue({ fullPath: 'mock/path' }),
  uploadBytesResumable: vi.fn(),
  getDownloadURL: vi.fn().mockResolvedValue('https://mock-url.com/file'),
  getStorage: vi.fn(),
}))
```

---

## 11. Test Data Management

### How Test Data Is Created

**Unit tests:** Test data is created inline as plain TypeScript objects matching
the `WishDocument` and `UserDocument` interfaces. No factories or fixtures needed
at this scale.

```ts
const mockWish: WishDocument = {
  wishId: 'wish-test-001',
  uid: 'user-test-001',
  username: 'phantom_test',
  wishText: 'Test wish text',
  videoUrl: 'https://storage.example.com/video.mp4',
  thumbnailUrl: 'https://storage.example.com/thumb.jpg',
  status: 'pending',
  createdAt: Timestamp.now(),
  grantedAt: null,
  adminMessage: null,
  viewed: false,
}
```

**Integration tests (Firebase Local Emulator):** Test documents are written to the
emulator using `withSecurityRulesDisabled()` (a testing utility that bypasses rules
for setup only) before each test, then the test exercises the rules.

Each test suite clears the emulator state with `testEnv.clearFirestore()` in
`beforeEach` or `afterEach` to ensure test isolation.

### How Test Data Is Seeded

No pre-seeded fixture files. Test data is created programmatically at the start
of each test or `beforeEach` block. This ensures tests are self-contained and
independent of each other.

### Preventing Test Data From Reaching Production

The Firebase Local Emulator uses a completely isolated in-memory database. It never
connects to the real Firebase project. No test data can leak to production.

The environment variable `VITE_USE_EMULATOR=true` is only set in the CI test
environment (via `.env.test`, gitignored) and in local test runs. Production builds
never have this variable set. The connection to the emulator is gated:

```ts
if (import.meta.env.VITE_USE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099')
  connectFirestoreEmulator(db, 'localhost', 8080)
  connectStorageEmulator(storage, 'localhost', 9199)
}
```

---

## 12. Automation Strategy

### When Tests Run

| Stage | Tests Run | Command |
|---|---|---|
| Local development (on-demand) | Unit tests only | `vitest run` |
| Local development (watch mode) | Unit tests (affected files) | `vitest watch` |
| Pre-commit hook (Husky) | TypeScript check + ESLint only (fast) | `vue-tsc --noEmit && eslint src/` |
| CI push to `dev` or `main` | Full suite (unit + component + integration) | GitHub Actions `build.yml` |
| Pre-Firebase-deploy (in CI) | Integration tests (rules) must pass | Part of `deploy-firebase.yml` |
| Pre-release (version tag) | Full suite + smoke test checklist (manual) | GitHub Actions `release.yml` |

### Fast Feedback Loop

```
Developer saves a file
  → Vitest watch mode re-runs affected unit tests
  → Result in <3 seconds in terminal
```

This is the primary development loop. Unit tests run in watch mode provide
sub-3-second feedback on logic changes without starting the Firebase emulator.

### Full Validation Pipeline (GitHub Actions)

```
1. npm ci
2. vue-tsc --noEmit          (~10s) — zero type errors
3. eslint src/               (~5s)  — zero lint errors
4. vitest run                (~10s) — all unit + component tests pass
5. firebase emulators:exec   (~30s) — all integration (rules) tests pass
   "vitest run --config vitest.integration.config.ts"
6. npm audit --audit-level=high (~5s) — no high-severity CVEs
7. ionic build               (~30s) — production build succeeds
8. npx cap sync android      (~10s) — Android project sync succeeds
9. ./gradlew assembleDebug   (~3m)  — APK compiles
```

Total CI time: ~5–6 minutes.

---

## 13. Deployment Gates

### Hard Blocks (Must Pass — Cannot Be Bypassed)

| Gate | Why It's a Hard Block |
|---|---|
| TypeScript type check passes | Type errors indicate broken contracts between service layer and Firebase SDK |
| All unit tests pass | Business rules must not regress |
| All integration (rules) tests pass | Security rules must not be misconfigured before deploy |
| `npm audit` — no high/critical CVEs | Known vulnerability in a direct dependency must not ship |
| `ionic build` succeeds | A build that fails is not deployable |

### Soft Warnings (Do Not Block)

| Warning | Response |
|---|---|
| `npm audit` — moderate CVEs | Logged in CI output; developer reviews during next dependency update cycle |
| ESLint warnings (not errors) | Logged but do not block — warnings indicate style issues, not bugs |
| Android Gradle build warnings | Logged but do not block if APK is produced |

### Can Tests Be Bypassed?

**No test gate can be bypassed in the automated pipeline.** GitHub branch protection
on `main` requires all status checks to pass before merge. Direct pushes to `main`
are disabled.

In an emergency (e.g., critical security hotfix): the developer can temporarily
disable branch protection, deploy the fix, and re-enable protection. This is a
manual override documented in a commit message and never done for non-emergency
reasons.

---

## 14. Flaky Test Handling

### Most Likely Sources of Flakiness

| Source | Why Flaky | Mitigation |
|---|---|---|
| Firebase Local Emulator startup timing | Integration tests run before the emulator is ready | Use `firebase emulators:exec` which waits for emulator readiness before running tests |
| Emulator port conflicts | Emulator port already in use from a previous run | Emulator is started fresh in each CI run (ephemeral `ubuntu-latest` runner) |
| `serverTimestamp()` in assertions | Timestamp values are non-deterministic | Mock `serverTimestamp()` to return a fixed value in unit tests; assert `expect.any(Object)` for timestamp fields in integration tests |
| Async timing in component tests | `nextTick()` not awaited before asserting DOM state | Always `await nextTick()` after state changes in component tests |

### What Happens When a Test Is Flaky

1. Run the test 3 times in a row locally — if it sometimes passes and sometimes
   fails without code changes, it is flaky
2. Open a GitHub issue labelled `flaky-test` with the test name and failure log
3. Fix the flakiness (usually an async timing issue or emulator setup race) before
   the next release
4. **Flaky tests do not block deployment** if they pass consistently in CI — CI runs
   are deterministic (ephemeral runners, fresh emulator). Flakiness that only appears
   locally is tracked but not a blocker.

---

## 15. Performance Testing

### Not Formally Implemented in MVP

At 6 users, load testing is not relevant. No Lighthouse CI, no k6, no Gatling.

**What "performance testing" means for this project:**

| Check | Tool | When |
|---|---|---|
| Cold start time under 3 seconds | Manual measurement on device + Chrome DevTools Timeline | Before each release tag |
| Wish list scroll at 60fps | Chrome DevTools Performance tab (during `ionic serve`) | When adding list rendering changes |
| Upload progress UI responsiveness | Manual test during upload | When changing `UploadProgressModal` |

**Lighthouse audit:** Run `ionic build` → serve the `/www/` directory locally →
run Lighthouse in Chrome DevTools → target Performance score >80 on Mobile preset.
Run this when significant UI changes are made, not on every commit.

### Performance Regression Prevention

If a future change slows the cold start or scrolling, it will be caught during the
manual smoke test (pre-release checklist). No automated performance regression gates
exist in the CI pipeline for MVP.

---

## 16. Testing Environments

| Test Type | Environment | Firebase Connection |
|---|---|---|
| Unit tests | Node.js (Vitest, no browser) | Firebase SDK fully mocked — no network calls |
| Component tests | jsdom (via Vitest + Vue Test Utils) | Firebase SDK fully mocked — no network calls |
| Integration tests (rules) | Node.js (Vitest) | Firebase Local Emulator — isolated, in-memory |
| Manual smoke tests | Physical Android device | Real Firebase project |

### How Close Is the Test Environment to Production?

| Layer | Parity |
|---|---|
| Unit tests | Low parity — Firebase fully mocked. Tests correctness of logic only, not Firebase behaviour. |
| Integration tests | High parity — Firebase Local Emulator evaluates the same security rules engine as production. Rules that pass the emulator will pass in production. |
| Manual smoke test | Full parity — real device, real Firebase project, real APK. |

The gap between integration tests and production is intentionally addressed by the
manual smoke test checklist — device-specific behaviour (camera, FCM, Capacitor
plugins) cannot be covered by automated tests and must be verified manually.

---

## 17. Observability in Testing

### How Tests Report Failures

- **Vitest output:** Failed tests print the assertion that failed, the received value,
  the expected value, and a stack trace pointing to the exact test line. Displayed
  in the terminal (locally) and in the GitHub Actions step log (CI).
- **Firebase Emulator:** The emulator logs rule evaluation results. If a rule
  unexpectedly denies or allows a request, the emulator log shows which rule matched.
  Access during local runs: `http://localhost:4000` (Emulator UI).

### Logs Captured During Test Runs

In CI (`build.yml`):
- Full Vitest output (stdout) — retained in GitHub Actions run log for 90 days
- Firebase Emulator stdout — captured by `firebase emulators:exec` and included in
  the CI log

In local runs:
- Vitest terminal output
- Firebase Emulator UI at `localhost:4000` for Firestore and Auth state inspection

### Reproducing Failures

**Unit test failures:** Always reproducible — tests are deterministic with mocked
dependencies. Run the failing test in isolation: `vitest run --reporter=verbose
tests/unit/WishService.test.ts`.

**Integration test failures:** Reproducible by starting the emulator locally and
running the integration test suite: `firebase emulators:exec "vitest run --config
vitest.integration.config.ts"`.

**CI-only failures:** Check the full GitHub Actions log. The most common CI-only
failure is the emulator not being ready before tests start — `firebase emulators:exec`
handles this but verify the CI step order.

---

## 18. Developer Workflow Integration

### When Developers Run Tests

| Situation | Tests to Run | Command |
|---|---|---|
| Writing a new service method | Unit tests in watch mode | `vitest watch` |
| Changing Firestore security rules | Integration tests against emulator | `firebase emulators:exec "vitest run --config vitest.integration.config.ts"` |
| Before committing | TypeScript + lint (pre-commit hook) | Automatic via Husky |
| Before pushing to `dev` | Full unit + component test suite | `vitest run` |
| Before tagging a release | Full suite + manual smoke test | CI pipeline + device |

### Local Test Strategy

The developer keeps Vitest in watch mode (`vitest watch`) while writing service
logic. The watch mode re-runs only affected tests on file save, giving sub-3-second
feedback without starting the emulator.

Integration tests (emulator-dependent) are run deliberately, not in watch mode —
starting and stopping the emulator for every file save is too slow.

### What Prevents Skipping Tests

1. **Pre-commit hook (Husky):** TypeScript check and ESLint run automatically on
   `git commit`. Cannot be skipped without `--no-verify` (which leaves a record
   in the commit).
2. **GitHub Actions CI:** The full test suite runs on every push to `dev` and `main`.
   A failed test prevents the merge via GitHub branch protection rules.
3. **Deployment gate:** Firebase rules are only deployed if the rules integration
   tests pass. A developer cannot deploy misconfigured rules without the tests passing.