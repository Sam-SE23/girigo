# errors.md — Girigo Error Handling Contract

---

## Framing Note

Girigo has no custom HTTP server and no REST API. There are no HTTP status codes,
no JSON error envelopes, and no `trace_id` system. Errors in this project flow
through three layers:

```
Firebase SDK (throws FirebaseError with .code property)
  ↓ caught in
Service Layer (/src/services/) (translates → throws plain Error with human-readable message)
  ↓ caught in
Pinia Store (stores in reactive error: string | null state)
  ↓ consumed by
Vue Component (renders toast, inline message, or retry UI)
```

Every section of this document is written in that context.

---

## 1. Error Philosophy

Errors in Girigo are part of the application contract, not exceptional events.
Every async operation can fail. Every service method has a defined error behaviour.

### Core Rules

```
1. Every error thrown by a service method is a plain JavaScript Error object
   with a human-readable, user-safe message string.

2. Raw Firebase error codes (auth/network-request-failed, permission-denied, etc.)
   MUST NEVER reach the UI layer. They are caught in services and translated.

3. Every service method has exactly one try/catch block wrapping the Firebase call.

4. "Not found" (a document does not exist) is NOT an error — it returns null.

5. Errors are predictable — every failure mode for every service method is
   documented in this file.

6. Errors are actionable — every error message tells the user what went wrong
   and what they can do about it (retry, check connection, contact admin, etc.).
```

### What Makes an Error "Good"

| Property | Definition |
|---|---|
| **Predictable** | The same failure always produces the same error message |
| **User-safe** | Contains no internal system information (project IDs, file paths, SDK codes) |
| **Actionable** | Tells the user what to do next, not just what went wrong |
| **Loggable** | Full context (service name, method name, uid, document ID) is logged separately |

---

## 2. Error Format

There is no structured error envelope. There is no error `code` field exposed to
the UI layer. There are no HTTP status codes.

All service methods throw errors in this exact format:

```ts
throw new Error('Human-readable sentence. What to do next.')
```

The error's `message` property is the only consumer-facing data. It is always:
- A complete English sentence
- Safe to display in a UI toast or error banner
- Free of system internals (no UIDs, no Firebase project names, no file paths)

### Internal Error Context (Never Shown to User)

Before throwing, full context is logged:

```ts
console.error(
  `[ServiceName.methodName] failed — uid: ${uid}, wishId: ${wishId}`,
  originalError
)
await FirebaseCrashlytics.recordException({
  message: `[ServiceName.methodName] failed — uid: ${uid}`
})
throw new Error('Human-readable user-facing message.')
```

The internal log includes:
- Service name and method name
- Relevant IDs (uid, wishId)
- The original Firebase error object (with its `.code` property)

This information is available in Firebase Crashlytics for debugging but never
surfaces to the user.

---

## 3. Error Classification Taxonomy

Every error belongs to exactly one primary category. This determines the UI
response and retry behaviour.

| Category | Definition | Retryable? | UI Response |
|---|---|---|---|
| **Network** | Device offline or Firebase temporarily unreachable | Yes | Retry button + "Check your connection" message |
| **Permission** | Firestore/Storage security rule denied the operation | No | Generic error toast — never expose that a rule was violated |
| **Validation** | Input failed client-side validation before Firebase call | No | Inline field error or toast |
| **Conflict** | Operation conflicts with current state (e.g., already reviewed) | No | Specific explanatory message |
| **Not Found** | Document does not exist | Not applicable | Return `null`; UI renders empty state |
| **Quota** | Firebase free tier limit reached | No | Generic error toast; check Firebase Console |
| **Cancelled** | User cancelled an operation (upload cancel) | Not applicable | Silent; reset UI state |
| **Auth** | Firebase Auth session invalid or expired | Auto-handled | SDK retries silently; if unrecoverable → re-init auth |
| **Unknown** | Unexpected error not matching any category | Possibly | Generic "Something went wrong" toast + retry option |

---

## 4. Firebase SDK Error Code Translation

The Firebase SDK throws `FirebaseError` objects with a `.code` string property.
These are caught in service methods and translated. This table is the authoritative
mapping for every Firebase error code the app may encounter.

### Firebase Auth Errors

| Firebase Code | Category | User Message | Retryable |
|---|---|---|---|
| `auth/network-request-failed` | Network | `'Could not connect. Please check your internet connection.'` | Yes |
| `auth/too-many-requests` | Quota | `'Too many attempts. Please wait a moment and try again.'` | No (wait) |
| `auth/operation-not-allowed` | Permission | `'Sign-in is currently unavailable. Please try again later.'` | No |
| `auth/app-deleted` | Unknown | `'Something went wrong. Please restart the app.'` | No |
| Any other `auth/*` | Unknown | `'Could not sign in. Please check your internet connection.'` | Yes |

### Firestore Errors

| Firebase Code | Category | Service Response | Retryable |
|---|---|---|---|
| `permission-denied` | Permission | Throw: `'You do not have permission to do that.'` | No |
| `unavailable` | Network | Throw: `'Could not reach the server. Please check your connection.'` | Yes |
| `deadline-exceeded` | Network | Throw: `'The request timed out. Please try again.'` | Yes |
| `not-found` | Not Found | Return `null` — do not throw | N/A |
| `already-exists` | Not applicable | Handled by `setDoc` idempotency — not an error in this codebase | N/A |
| `resource-exhausted` | Quota | Throw: `'Service temporarily unavailable. Please try again later.'` | No |
| `failed-precondition` | Conflict | Throw: `'This action cannot be completed right now. Please try again.'` | No |
| `aborted` (transaction) | Conflict | Transaction auto-retried by Firestore SDK (up to 5× before throwing) | Auto |
| Any other `firestore/*` | Unknown | Throw: `'Something went wrong. Please try again.'` | Possibly |

### Firebase Storage Errors

| Firebase Code | Category | User Message | Retryable |
|---|---|---|---|
| `storage/unauthorized` | Permission | `'Upload failed. You do not have permission to upload this file.'` | No |
| `storage/object-not-found` | Not Found | Return `null` — do not throw | N/A |
| `storage/quota-exceeded` | Quota | `'Storage limit reached. Please contact support.'` | No |
| `storage/retry-limit-exceeded` | Network | `'Upload failed. Please check your connection and try again.'` | Yes |
| `storage/invalid-checksum` | Network | `'Upload failed. Please try again.'` | Yes |
| `storage/canceled` | Cancelled | Silent — reset upload state | N/A |
| `storage/unauthenticated` | Auth | `'Upload failed. Please restart the app.'` | No |
| `storage/server-file-wrong-size` | Network | `'Upload failed. Please try again.'` | Yes |
| Any other `storage/*` | Unknown | `'Upload failed. Please try again.'` | Possibly |

### Determining Retry Eligibility in Service Code

```ts
function isRetryableFirebaseError(error: FirebaseError): boolean {
  const retryableCodes = [
    'unavailable',
    'deadline-exceeded',
    'storage/retry-limit-exceeded',
    'storage/invalid-checksum',
    'storage/server-file-wrong-size',
    'auth/network-request-failed',
  ]
  return retryableCodes.includes(error.code)
}
```

---

## 5. Error Messages by Service Method

Authoritative list of every error message each service method can throw.
This is the definitive contract — the messages in this table must match the
messages in the code exactly.

### `AuthService`

| Method | Condition | Error Message |
|---|---|---|
| `signInAnonymously()` | Network failure | `'Could not connect. Please check your internet connection.'` |
| `signInAnonymously()` | Too many requests | `'Too many attempts. Please wait a moment and try again.'` |
| `signInAnonymously()` | Any other error | `'Could not sign in. Please check your internet connection.'` |
| `updateLastSeen()` | Any Firestore error | Logged to Crashlytics; swallowed — non-critical |

### `WishService`

| Method | Condition | Error Message |
|---|---|---|
| `createWish()` | Permission denied | `'Could not save your wish. Please try again.'` |
| `createWish()` | Network failure | `'Could not save your wish. Please check your connection and try again.'` |
| `createWish()` | Any other Firestore error | `'Could not save your wish. Please try again.'` |
| `getUserWishes()` | Listener fails to establish | `'Could not load your wishes. Please check your connection.'` |
| `getWishById()` | Document not found | Returns `null` — no error thrown |
| `getWishById()` | Permission denied | `'Could not load this wish.'` |
| `markWishViewed()` | Any error | Logged; swallowed — non-critical |

### `UploadService`

| Method | Condition | Error Message |
|---|---|---|
| `uploadVideo()` | 3 retries exhausted (network) | `'Upload failed. Your wish is saved — tap to try again.'` |
| `uploadVideo()` | Permission denied (storage rules) | `'Upload failed. You do not have permission to upload this file.'` |
| `uploadVideo()` | File too large | `'Your video is too large. Maximum size is 20MB.'` |
| `uploadVideo()` | Quota exceeded | `'Storage limit reached. Please contact support.'` |
| `uploadVideo()` | Cancelled by user | Silent — reset upload state, no error shown |
| `uploadThumbnail()` | Any upload error | `'Upload failed. Please try again.'` |

### `AdminService`

| Method | Condition | Error Message |
|---|---|---|
| `updateWishStatus()` | Current status is not pending | `'This wish has already been reviewed.'` |
| `updateWishStatus()` | Transaction fails (network) | `'Could not update this wish. Please check your connection.'` |
| `updateWishStatus()` | Permission denied | `'You do not have permission to update this wish.'` |
| `deleteWish()` | Firestore delete fails | `'Could not delete this wish. Please try again.'` |
| `deleteWish()` | Storage delete fails | Logged to Crashlytics; swallowed — document already deleted |
| `getAllWishes()` | Permission denied | `'Could not load wishes. Please check your admin access.'` |

### `NotificationService`

| Method | Condition | Error Message |
|---|---|---|
| `registerToken()` | Permission denied by user | Silent — notifications are optional; FCM registration not forced |
| `registerToken()` | Network failure | Logged; swallowed — retried on next app launch |
| `sendNotification()` | FCM API failure | `'Notification could not be sent. Please try again.'` |
| `savePushToken()` | Firestore write failure | Logged; swallowed — push token update is non-critical |

---

## 6. User-Safe vs Internal Errors

### What Is Safe to Show Users

| Safe to Show | Example |
|---|---|
| The error `message` string from the service method | `'Could not save your wish. Please try again.'` |
| Connection state indicator (offline banner) | "You're offline. Some features may be unavailable." |
| Empty state copy (when data returns null) | "You haven't made a wish yet. Will you dare?" |

### What Must Never Be Shown to Users

| Must Never Show | Why |
|---|---|
| Firebase error codes (`permission-denied`, `auth/network-request-failed`) | Exposes internal system structure |
| Firebase project ID or Storage bucket name | Security exposure |
| Stack traces | Exposes implementation details |
| User UIDs or document IDs | Privacy; exposes internal identifiers |
| "Security rules rejected your request" | Tells attacker which security layer was hit |
| "No document found at /wishes/abc123" | Exposes internal path structure |

### How Sanitisation Is Enforced

Every Firebase error is caught in the service method before it reaches the store.
The original `FirebaseError` object is logged to Crashlytics (internal) and a new
plain `Error` with a sanitised message is thrown (external).

```ts
// CORRECT
try {
  await setDoc(wishRef, wishData)
} catch (error) {
  console.error('[WishService.createWish]', error)  // full error logged internally
  throw new Error('Could not save your wish. Please try again.')  // sanitised
}

// NEVER
throw error  // ❌ raw FirebaseError with .code reaches the store
throw new Error(error.code)  // ❌ exposes 'permission-denied' to UI
throw new Error(error.message)  // ❌ exposes Firebase internal message
```

---

## 7. Validation Error Structure

Girigo has minimal user-input forms: wish text (max 280 chars) and admin message
(max 500 chars). Validation errors are simple and handled before any service call.

### Client-Side Validation Pattern

```ts
// In service method — before Firebase call
if (data.wishText.length > 280) {
  throw new Error('Your wish text is too long. Maximum 280 characters.')
}
if (!data.videoUrl) {
  throw new Error('Video upload must complete before saving your wish.')
}
```

Validation errors are thrown from the service method the same way as Firebase
errors — the Pinia store and UI cannot distinguish them by type, only by message.

### How Validation Errors Map to UI

| Validation Error | UI Response |
|---|---|
| Wish text too long | Character counter turns red; submit button disabled; no toast needed |
| Video not uploaded | Upload button disabled until upload completes; no form submit possible |
| Admin message too long | Character counter turns red in admin panel |
| Admin PIN incorrect | Inline error below PIN input: `'Incorrect PIN. Please try again.'` |

Character limit errors are prevented by the UI (input becomes disabled at the
limit) rather than surfaced as errors after submission. The service-layer validation
is a safety net, not the primary user-facing mechanism.

### Multiple Validation Errors

Girigo's forms are too simple to require multi-error validation. Each form has one
validatable field. One error is surfaced at a time.

---

## 8. Authentication and Authorisation Errors

### Auth Error Handling

Firebase Auth token refresh is fully automatic — the SDK handles expiry and
renewal without the app knowing. The only auth errors the app sees are:

| Scenario | How Detected | App Response |
|---|---|---|
| `signInAnonymously` fails on first launch | `AuthService.signInAnonymously` throws | Error state shown with retry option on onboarding screen |
| Auth state fires `null` (session unrecoverably lost) | `onAuthStateChanged` callback receives `null` | `AuthService.initAuth` calls `signInAnonymously` again — new anonymous UID created |
| Token refresh fails due to prolonged offline | Firestore SDK queues operations | Firestore SDK automatically retries when connectivity returns |

### Differentiation of Auth vs Permission Errors

In Girigo's service layer, auth errors (`auth/*` codes) and Firestore permission
errors (`permission-denied` code) produce different internal log context but the
same user-facing message:

| Error Type | Internal Log | User Message |
|---|---|---|
| Auth: not signed in | `[AuthService] User is not authenticated` | `'Could not connect. Please restart the app.'` |
| Firestore: permission denied | `[WishService.createWish] permission-denied` | `'Could not save your wish. Please try again.'` |
| Storage: unauthorized | `[UploadService.uploadVideo] storage/unauthorized` | `'Upload failed. You do not have permission to upload this file.'` |

**Security note:** The app does not differentiate between "not logged in",
"token expired", and "insufficient permissions" in user-facing messages. All three
produce generic messages. This prevents attackers from using error messages to probe
the auth and rules system. See `security.md` Section 6.

---

## 9. Retryable vs Non-Retryable Errors

### Classification

| Error Category | Retryable? | Reason |
|---|---|---|
| Network / connectivity | **Yes** | Transient — the operation will succeed once connectivity returns |
| Firebase `unavailable` | **Yes** | Temporary service disruption |
| Firebase `deadline-exceeded` | **Yes** | Timeout — retry is safe |
| Storage `retry-limit-exceeded` | **Yes** | Network-related upload failure |
| Permission denied | **No** | Retrying will produce the same result; requires rule or role fix |
| Validation error | **No** | Bad input — retrying with the same input will fail again |
| Conflict (already reviewed) | **No** | State has changed; retry is semantically wrong |
| Quota exceeded | **No** | Retrying immediately makes the problem worse |
| Auth `too-many-requests` | **No** (wait) | Rate limited — retry after a delay |
| User cancelled upload | **Not applicable** | Intentional action |
| Not found (returns null) | **Not applicable** | Not an error |

### Retry Logic in `UploadService`

```ts
const MAX_RETRIES = 3
const RETRY_DELAYS_MS = [1000, 2000, 4000]  // exponential backoff

async function uploadWithRetry(
  uploadFn: () => Promise<string>,
  attempt = 0
): Promise<string> {
  try {
    return await uploadFn()
  } catch (error) {
    const isFirebaseError = error instanceof FirebaseError
    const canRetry = isFirebaseError && isRetryableFirebaseError(error)

    if (canRetry && attempt < MAX_RETRIES) {
      await delay(RETRY_DELAYS_MS[attempt])
      return uploadWithRetry(uploadFn, attempt + 1)
    }

    // Retries exhausted or non-retryable error
    console.error(`[UploadService] failed after ${attempt + 1} attempt(s)`, error)
    throw new Error('Upload failed. Your wish is saved — tap to try again.')
  }
}
```

Retry is **only implemented in `UploadService`**. All other service methods throw
immediately on failure — retry is handled at the UI layer (the user taps a retry
button), not automatically.

---

## 10. External Service (Firebase) Error Handling

Firebase is the only external dependency. When Firebase is unavailable:

| Firebase Service | Failure Mode | App Behaviour |
|---|---|---|
| Firebase Auth | Unavailable | `signInAnonymously` throws network error; shown to user with retry |
| Firestore | Unavailable | Reads served from offline cache; writes queued by SDK; reconnects automatically |
| Firebase Storage | Unavailable | Upload fails; `UploadService` retry logic kicks in; after max retries, user sees retry button |
| FCM | Unavailable | Notification not sent; admin sees failure toast; user still sees status via Firestore listener |

### Normalisation of Firebase Errors

Firebase SDK errors are always normalised before leaving the service layer.
The internal structure of `FirebaseError` (`.code`, `.message`, `.name`) is never
exposed to Pinia stores or Vue components. All external errors are translated to
plain `Error` objects with human-readable messages.

---

## 11. Error Propagation Rules

The error propagation chain is fixed and must not be violated:

```
Firebase SDK throws FirebaseError
  ↓
Service method catch block
  ↓ logs full error to console + Crashlytics
  ↓ throws new Error('human-readable message')
  ↓
Pinia Store catch block
  ↓ sets store.error = error.message (the string)
  ↓ sets store.isLoading = false
  ↓
Vue Component
  ↓ renders error message from store.error
  ↓ shows toast, inline message, or retry button
```

### Rules

```
1. Services transform errors — they catch FirebaseError and throw plain Error.
2. Stores store errors — they catch Error from services and store the message string.
3. Components display errors — they read store.error and render appropriate UI.
4. No layer skips the next layer — services never write to stores directly;
   components never catch service errors directly.
```

### How Stores Handle Errors

```ts
// Standard error handling pattern in all Pinia stores
const error = ref<string | null>(null)
const isLoading = ref(false)

async function createWish(data: NewWish) {
  isLoading.value = true
  error.value = null
  try {
    await WishService.createWish(data)
  } catch (e) {
    // e is a plain Error with a human-readable message
    error.value = e instanceof Error ? e.message : 'Something went wrong.'
  } finally {
    isLoading.value = false
  }
}
```

The store exposes `error: string | null` (the message) not the `Error` object itself.

---

## 12. Logging and Debug Correlation

### What Is Logged

Every service error log includes:

```
[ServiceName.methodName] failed — {relevant context}
```

Context always includes at minimum:
- Firebase UID (`uid`)
- Document ID (`wishId`) when applicable
- The original Firebase error object (with `.code` property)

### Correlation in Firebase Crashlytics

Firebase Crashlytics automatically assigns a session ID to each app session.
All `recordException` calls within a session are grouped under that session ID
in the Crashlytics dashboard. To correlate a user report with a Crashlytics entry:

1. Ask the user: approximately when did it happen? (date + time)
2. Firebase Console → Crashlytics → Filter by date
3. Find the exception matching `[ServiceName.methodName] failed`
4. Click the event to see device info, OS version, app version, and the
   log context string (uid, wishId)

There is no custom `trace_id` system. Crashlytics session IDs serve this function.

---

## 13. Frontend Error Handling Contract

How Vue components respond to errors from Pinia stores:

| Error Type | UI Response | Component |
|---|---|---|
| `wishesStore.error` is set | Toast notification at top: `store.error` message + dismiss button | `HomeView` |
| `uploadStore.error` is set | `UploadProgressModal` switches to error state: error message + retry button | `UploadProgressModal` |
| `authStore.error` is set | Full-screen error state on onboarding: message + retry button | `OnboardingView` |
| `adminStore.error` is set | Toast notification in admin panel | `AdminView` |
| `WishDetailView`: wish returns null | Not-found empty state: "This wish could not be found." | `WishDetailView` |
| `notificationStore.error` | Silently logged — FCM errors are not user-visible | None |
| Network offline detected | Persistent banner: "You're offline. Some features may be unavailable." | `App.vue` |

### Error → UI State Mapping

| Error Triggers | UI State |
|---|---|
| `uploadStore.error` set | Retry button in upload modal |
| `authStore.error` set after all retries | Retry button on onboarding screen |
| `wishesStore.error` set | Toast; pull-to-refresh still available |
| `adminStore.error` on `updateWishStatus` | Toast; status reverts to previous value visually |
| `adminStore.error` on `deleteWish` | Toast; card remains in list |

### Errors That Trigger Specific Flows

| Condition | Flow |
|---|---|
| Auth unrecoverable (session null) | `AuthService.initAuth` re-runs `signInAnonymously`; if that fails → error on onboarding with retry |
| Upload max retries exhausted | Show retry button in modal; preserve recorded video in component state (do not discard) |
| Admin "already reviewed" error | Show specific toast: `'This wish has already been reviewed.'`; reload wish to show current status |

### Errors That Do NOT Trigger Navigation or Logout

None. Girigo does not redirect or log out users based on errors. The only
navigation that happens automatically is the onboarding redirect when auth
is not established — which is not an error state, it is normal flow.

---

## 14. Error Evolution Rules

### What Can Change Without Impact

| Change | Safe? |
|---|---|
| Changing the wording of a user-facing error message | Yes — messages are displayed, not parsed |
| Adding a new error case for a new service method | Yes — additive change |
| Logging more context in the internal error log | Yes — internal only |

### What Counts as a Breaking Error Change

| Change | Breaking? | Consequence |
|---|---|---|
| Changing the error propagation chain structure | Yes | Components may no longer display errors correctly |
| Storing `Error` object in store instead of `error.message` string | Yes | Component templates bind to `store.error` as a string |
| Throwing a non-`Error` object from a service method | Yes | `e instanceof Error` check in stores produces `'Something went wrong.'` fallback |
| Removing the `error` reactive state from a store | Yes | Components that bind to it render nothing |

The `error: string | null` contract in Pinia stores is stable. It must not change.

---

## 15. System Failure Fallback

When an error cannot be classified (no Firebase error code matched, unexpected
exception type), the fallback message is:

```
'Something went wrong. Please try again.'
```

This is the last-resort message. It is shown when:
- A non-Firebase error is thrown (e.g., a JavaScript `TypeError`)
- A Firebase error code not listed in Section 4 is encountered
- An error is thrown outside a service method and caught by the store's
  `catch (e)` block

The store's catch block handles this:

```ts
error.value = e instanceof Error ? e.message : 'Something went wrong. Please try again.'
```

`e instanceof Error` ensures that even if something throws a non-Error value
(string, undefined), the fallback message is shown rather than crashing.

---

## 16. Error Testing Contract

See `testing.md` Section 8 for the full failure testing strategy. Error-specific
additions:

### What Must Be Tested

| Test | Type | What to Assert |
|---|---|---|
| Each service method catches Firebase error and throws human-readable Error | Unit | `vi.mocked(firebaseOperation).mockRejectedValueOnce(new FirebaseError(...))` → `expect(...).rejects.toThrow('human-readable message')` |
| Raw Firebase error codes do not reach the store | Unit | Assert that the error thrown by the service does NOT contain `permission-denied`, `auth/*`, or `storage/*` |
| `error.value` in store is set to error message string on service failure | Unit (store) | Mock service to throw → assert `store.error === 'human-readable message'` |
| `isLoading` is reset to `false` after error | Unit (store) | Assert `store.isLoading === false` in the `catch` and `finally` block |
| "Already reviewed" conflict error is correctly thrown | Unit + Integration | Attempt `updateWishStatus` on a non-pending wish → assert the correct message |
| Not-found case returns `null` (not an error) | Unit | Mock `getDoc` to return non-existent doc → assert return value is `null`, no error thrown |

### What Breaks If Error Format Changes

If the `error` state in a Pinia store changes from `string | null` to `Error | null`:
- Every Vue component template that uses `{{ store.error }}` would render
  `[object Error]` instead of the message
- Every conditional that checks `if (store.error)` would still work
- Every toast that renders `store.error` directly would break

The `string | null` contract for store error state is protected by this file.
Any change to it requires updating this file AND all affected component templates.