# api-contracts.md — Girigo Data and Service Contracts

---

## Framing Note

Girigo has no custom REST API, no HTTP endpoints, and no OpenAPI specification.
The "API" in this project is the **service layer** — the TypeScript functions in
`/src/services/` that abstract all Firebase SDK calls. The "contracts" are the
TypeScript interfaces that define every data shape that crosses a service boundary.

This file is the single reference for:
- All TypeScript interfaces (Firestore document schemas)
- All service method signatures (inputs, outputs, error behaviour)
- The error contract (how errors are thrown and what they contain)
- Validation rules (what is enforced before a Firebase call)
- Idempotency guarantees
- Pagination and query contracts

Authoritative sources for reasoning behind these contracts:
- `backend.md` — service layer design and business rules
- `database.md` — schema design, lifecycle, and migrations

---

## 1. Contract Philosophy

Contracts in this project are **strict TypeScript interfaces**, not suggestions.
Every field has a type, a meaning, a constraint, and a lifecycle rule.

### Core Rules

```
1. Every Firestore document written by the app matches its TypeScript interface exactly.
2. No field is written to Firestore that is not defined in this file.
3. No field is read from Firestore without being typed in the relevant interface.
4. "Optional but actually required" does not exist — a field is either required
   or explicitly optional with a defined default or null value.
5. Nulls are allowed ONLY for fields explicitly typed as `field: Type | null`.
6. Fields typed as `string` must never be written as empty string unless explicitly
   documented as allowed below.
```

### Immutability Rules

| Category | Rule |
|---|---|
| Immutable after creation | `wishId`, `uid`, `username` (on wish), `createdAt`, `videoUrl`, `thumbnailUrl` |
| Mutable by user only | `lastSeen`, `pushToken` (on user document) |
| Mutable by admin only | `status`, `grantedAt`, `adminMessage` (on wish document) |
| Mutable by app on first set | `viewed` (on wish — set to `true` when user opens detail) |
| Set once at creation, never changed | `role` (only changeable manually in Firebase Console) |

---

## 2. API Versioning

There is no HTTP API versioning (`/v1`, `/v2`). The versioning strategy for this
project is **Firestore schema evolution** as defined in `database.md` Section 10.

### What Counts as a Breaking Change

| Change | Breaking? | Process |
|---|---|---|
| Adding an optional field | No | Add to interface with `?`; use `?? default` when reading |
| Adding a required field to new documents | Yes for existing documents | Add to interface; backfill existing documents before deploying |
| Renaming a field | Yes | Migration script required before code deploy |
| Removing a field | Yes | Remove all reads first; deploy; then remove from documents |
| Changing a field's type | Yes | Treat as rename — migrate to new field, remove old |
| Changing status enum values | Yes | Update rules + all UI components atomically |

---

## 3. TypeScript Interfaces (Source of Truth)

All interfaces live in `/src/types/index.ts`. This section is the authoritative
definition. Any code that reads from or writes to Firestore must use these types.

### `UserDocument`

Path: `/users/{uid}`

```ts
interface UserDocument {
  uid: string                  // Firebase Auth UID — matches document ID — IMMUTABLE
  username: string             // Generated display name, e.g. "phantom_38291" — IMMUTABLE
  createdAt: Timestamp         // Set at document creation — IMMUTABLE — serverTimestamp()
  lastSeen: Timestamp          // Updated on each app resume — serverTimestamp()
  pushToken: string            // FCM device token — updated on each launch
  role: 'user' | 'admin'      // Access level — set manually in Firebase Console — IMMUTABLE via app
  pinHash?: string             // SHA-256 hash of admin PIN — present only on admin documents
}
```

| Field | Type | Required | Constraints | Who Writes |
|---|---|---|---|---|
| `uid` | `string` | Yes | Matches Firebase Auth UID and document ID | App (AuthService) |
| `username` | `string` | Yes | Non-empty; generated format: `word_word_NNNNN` | App (AuthService, once) |
| `createdAt` | `Timestamp` | Yes | Set once; never updated | App (AuthService, once) |
| `lastSeen` | `Timestamp` | Yes | Updated on app resume | App (AuthService) |
| `pushToken` | `string` | Yes | Non-empty; FCM token format | App (NotificationService) |
| `role` | `'user' \| 'admin'` | Yes | Exactly one of two values | Firebase Console only |
| `pinHash` | `string` | No | SHA-256 hex string (64 chars); admin documents only | Firebase Console only |

---

### `WishDocument`

Path: `/wishes/{wishId}`

```ts
interface WishDocument {
  wishId: string               // Client-generated UUID — matches document ID — IMMUTABLE
  uid: string                  // Firebase Auth UID of submitting user — IMMUTABLE
  username: string             // Copied from user document at submission — IMMUTABLE
  wishText: string             // User's optional text — empty string '' if skipped — IMMUTABLE
  videoUrl: string             // Firebase Storage download URL — IMMUTABLE — must be non-empty
  thumbnailUrl: string         // Firebase Storage download URL — IMMUTABLE — must be non-empty
  status: WishStatus           // Current lifecycle state — see transitions below
  createdAt: Timestamp         // Set at creation — IMMUTABLE — serverTimestamp()
  grantedAt: Timestamp | null  // Set when status changes from pending; null while pending
  adminMessage: string | null  // Optional admin message; null until reviewed
  viewed: boolean              // Whether user has seen the status update
}

type WishStatus = 'pending' | 'granted' | 'rejected'
```

| Field | Type | Required | Constraints | Who Writes |
|---|---|---|---|---|
| `wishId` | `string` | Yes | UUID format; matches document ID | App (UploadService, before upload) |
| `uid` | `string` | Yes | Must equal `request.auth.uid` — enforced by Firestore rules | App (WishService) |
| `username` | `string` | Yes | Copied from `UserDocument.username` at submit time | App (WishService) |
| `wishText` | `string` | Yes | Empty string `''` allowed (user skipped); max 280 chars; no HTML | App (WishService) |
| `videoUrl` | `string` | Yes | Non-empty; Firebase Storage download URL | App (WishService, after upload) |
| `thumbnailUrl` | `string` | Yes | Non-empty; Firebase Storage download URL | App (WishService, after upload) |
| `status` | `WishStatus` | Yes | Always `'pending'` at creation | App (WishService) sets; Admin changes |
| `createdAt` | `Timestamp` | Yes | Set once; never updated | App (WishService, once) |
| `grantedAt` | `Timestamp \| null` | Yes | `null` at creation; set to `serverTimestamp()` when status changes | App (AdminService) |
| `adminMessage` | `string \| null` | Yes | `null` at creation; max 500 chars when set | App (AdminService) |
| `viewed` | `boolean` | Yes | `false` at creation; `true` when user opens wish detail | App (WishService) |

### `NewWish` (Input to `WishService.createWish`)

```ts
interface NewWish {
  wishId: string               // Required — generated before upload begins
  uid: string                  // Required — from authStore.user.uid
  username: string             // Required — from userStore.username
  wishText: string             // Required — empty string if user skipped
  videoUrl: string             // Required — obtained from UploadService after upload
  thumbnailUrl: string         // Required — obtained from UploadService after upload
}
```

### `StatusUpdate` (Input to `AdminService.updateWishStatus`)

```ts
interface StatusUpdate {
  wishId: string               // Required
  newStatus: 'granted' | 'rejected'  // Required — 'pending' is never a valid target
  adminMessage: string | null  // Optional — null if admin left message blank
}
```

### `WishStatus` Transition Contract

```
VALID TRANSITIONS:
  'pending' → 'granted'   ✅
  'pending' → 'rejected'  ✅

INVALID TRANSITIONS (throw error):
  'granted' → any value   ❌
  'rejected' → any value  ❌
  any → 'pending'         ❌
```

Enforced at two layers:
1. `AdminService.updateWishStatus()` — reads current status inside a Firestore
   transaction; throws `new Error('This wish has already been reviewed.')` if status
   is not `'pending'`
2. Firestore security rules — server-side enforcement using `statusTransitionValid()`
   function in `firestore.rules`

---

## 4. Firebase Storage Path Contracts

```
/wishVideos/{uid}/{wishId}.mp4    — video file
/thumbnails/{uid}/{wishId}.jpg   — thumbnail image
```

| Path Component | Constraint |
|---|---|
| `{uid}` | Must equal `request.auth.uid` of the uploading user — enforced by Storage rules |
| `{wishId}` | UUID — must match the `wishId` used in the Firestore document |
| File extension `.mp4` | MIME type `video/*` enforced by Storage rules |
| File extension `.jpg` | No MIME type enforcement (thumbnail is app-generated) |
| Video file size | Maximum 20MB — enforced by Storage rules |
| Thumbnail file size | Not formally limited — app generates from canvas at low quality |

---

## 5. Service Method Contract Catalog

Full catalog of all service method signatures. These are the "endpoints" of the
internal API. No Firebase SDK operation should occur outside these methods.

### `AuthService`

```ts
// Initialise auth on app launch. Subscribes to Firebase auth state.
// Creates anonymous user if none exists. Returns unsubscribe function.
initAuth(): () => void

// Creates a new anonymous Firebase user.
// Writes user document to Firestore /users/{uid}.
// Returns the created UserDocument.
// Throws: 'Could not connect. Please check your internet connection.'
signInAnonymously(): Promise<UserDocument>

// Updates lastSeen field on /users/{uid} to serverTimestamp().
// Throws: human-readable error on Firestore failure.
updateLastSeen(uid: string): Promise<void>
```

### `WishService`

```ts
// Creates a wish document at /wishes/{wishId}.
// ONLY called after both Storage uploads succeed.
// Throws: 'Could not save your wish. Please check your connection and try again.'
createWish(data: NewWish): Promise<void>

// Real-time listener for the current user's wishes, newest first.
// Returns an unsubscribe function. Updates are pushed via the callback.
// Throws: human-readable error if Firestore listener fails to establish.
getUserWishes(
  uid: string,
  callback: (wishes: WishDocument[]) => void
): () => void

// Fetches a single wish document by ID.
// Returns null if the document does not exist.
// Throws: human-readable error on Firestore failure.
getWishById(wishId: string): Promise<WishDocument | null>

// Marks a wish as viewed by setting viewed: true.
// Throws: human-readable error on Firestore failure.
markWishViewed(wishId: string): Promise<void>
```

### `UploadService`

```ts
// Uploads a compressed video file to Firebase Storage.
// Returns an observable progress value (0–100) via the callback.
// Returns the download URL on completion.
// Throws: human-readable error after 3 failed retry attempts.
uploadVideo(
  file: Blob,
  uid: string,
  wishId: string,
  onProgress: (progress: number) => void
): Promise<string>  // returns download URL

// Uploads a thumbnail image to Firebase Storage.
// Returns the download URL on completion.
// Throws: human-readable error on upload failure.
uploadThumbnail(
  blob: Blob,
  uid: string,
  wishId: string
): Promise<string>  // returns download URL

// Cancels the currently active upload task.
// No-op if no upload is in progress.
cancelUpload(): void
```

### `NotificationService`

```ts
// Registers the device for FCM push notifications.
// Saves the FCM token to Firestore /users/{uid}.pushToken.
// Throws: human-readable error if registration fails.
registerToken(uid: string): Promise<void>

// Updates the stored FCM token in Firestore when FCM rotates it.
// Throws: human-readable error on Firestore failure.
savePushToken(uid: string, token: string): Promise<void>

// Sends a push notification to the target device.
// Admin only — called from AdminWishDetailView via adminStore.
// Throws: human-readable error if FCM send fails.
sendNotification(
  pushToken: string,
  wishId: string,
  message: string
): Promise<void>
```

### `AdminService`

```ts
// Real-time listener for all wishes, optionally filtered by status.
// Returns an unsubscribe function. Updates pushed via callback.
// Admin only — Firestore rules enforce this.
getAllWishes(
  statusFilter: WishStatus | null,
  callback: (wishes: WishDocument[]) => void
): () => void

// Updates a wish's status using a Firestore transaction.
// Validates current status is 'pending' before writing.
// Throws: 'This wish has already been reviewed.' if not pending.
// Throws: human-readable error on transaction failure.
updateWishStatus(update: StatusUpdate): Promise<void>

// Deletes a wish: Firestore document first, then both Storage files.
// Firestore delete is authoritative — Storage failures are logged but do not throw.
// Throws: human-readable error if Firestore delete fails.
deleteWish(wishId: string, uid: string): Promise<void>
```

### `StorageService` (Local Preferences)

```ts
// Reads a value from @capacitor/preferences. Returns null if key not found.
get(key: string): Promise<string | null>

// Writes a value to @capacitor/preferences.
set(key: string, value: string): Promise<void>

// Removes a value from @capacitor/preferences.
remove(key: string): Promise<void>
```

**Preference keys used by the app:**

| Key | Value Type | Set By | Purpose |
|---|---|---|---|
| `'uid'` | `string` | AuthService | Firebase anonymous UID |
| `'username'` | `string` | AuthService | Generated display name |
| `'onboardingComplete'` | `'true'` | OnboardingView | Skip onboarding on relaunch |

---

## 6. Error Contract

All service methods follow a single, consistent error contract. This is the
authoritative definition.

### Error Format

All service errors are plain JavaScript `Error` objects with a human-readable
`message` string. No custom error classes. No error codes exposed to the UI.

```ts
// Always thrown as:
throw new Error('Human-readable sentence describing what failed and what the user can do.')

// Never thrown as:
throw new Error('permission-denied')          // ❌ raw Firebase error code
throw new Error('Error code 403')             // ❌ HTTP status
throw firebaseError                           // ❌ raw re-throw
```

### Error Logging

Before throwing, every service method logs the error with context:

```ts
console.error(`ServiceName.methodName failed — context: ${relevantId}`, error)
await FirebaseCrashlytics.recordException({
  message: `ServiceName.methodName failed — context: ${relevantId}`
})
throw new Error('Human-readable message for UI.')
```

### Standard Error Messages by Category

| Category | Message Pattern |
|---|---|
| Network / connectivity | `'Could not connect. Please check your internet connection.'` |
| Firestore write failure | `'Could not save your [entity]. Please try again.'` |
| Firestore read failure | `'Could not load your [entity]. Please try again.'` |
| Upload failure (retries exhausted) | `'Upload failed. Your wish is saved — tap to try again.'` |
| Permission denied | `'You do not have permission to do that.'` |
| Not found | Return `null` — do not throw for 404-equivalent |
| Status transition violation | `'This wish has already been reviewed.'` |
| Auth failure | `'Could not sign in. Please check your internet connection.'` |

### Which Errors Are User-Safe vs Internal-Only

| Error | User-Safe? | Handling |
|---|---|---|
| Human-readable messages above | Yes — shown in UI toast | Surface via `error` state in Pinia store |
| Raw Firebase error codes | No — never shown | Caught in service; logged to Crashlytics; rethrown as human-readable |
| Stack traces | No — never shown | Console + Crashlytics only |
| Firebase project ID or config values | No — never shown | Never included in error messages |

---

## 7. Validation Contract

Validation happens at two layers. This is the definitive reference for both.

### Service Layer Validation (Application-Side)

Enforced in service methods before any Firebase call:

| Field | Validation | Error Thrown On Failure |
|---|---|---|
| `wishText` | Max 280 characters | `'Your wish text is too long. Maximum 280 characters.'` |
| `adminMessage` | Max 500 characters | `'Your message is too long. Maximum 500 characters.'` |
| `NewWish.videoUrl` | Non-empty string | `'Video upload must complete before saving wish.'` |
| `NewWish.thumbnailUrl` | Non-empty string | `'Thumbnail upload must complete before saving wish.'` |
| `NewWish.uid` | Must equal `authStore.user.uid` | Throw — this is a code error, not a user error |
| `StatusUpdate.newStatus` | Must be `'granted'` or `'rejected'` | `'Invalid status value.'` |
| Current wish status | Must be `'pending'` for status update | `'This wish has already been reviewed.'` |
| `wishId` in deleteWish | Non-empty string | Throw — code error |

### Firestore Security Rules Validation (Server-Side)

Enforced by Firebase on every write — cannot be bypassed by the client:

| Rule | What It Enforces |
|---|---|
| `request.auth != null` | All operations require authentication |
| `request.resource.data.uid == request.auth.uid` | Wish `uid` must match authenticated user |
| `request.resource.data.videoUrl != ''` | Video URL must be non-empty on wish creation |
| `request.resource.data.thumbnailUrl != ''` | Thumbnail URL must be non-empty on wish creation |
| `statusTransitionValid()` | Status can only change from `'pending'` |
| `isAdmin()` | Admin operations require `role: 'admin'` in user document |

### Firebase Storage Rules Validation (Server-Side)

| Rule | What It Enforces |
|---|---|
| `request.auth.uid == uid` | Upload path must match authenticated user's UID |
| `request.resource.size < 20 * 1024 * 1024` | Video file must be under 20MB |
| `request.resource.contentType.matches('video/.*')` | Upload to video path must be video MIME type |

---

## 8. Idempotency Contract

| Operation | Idempotent? | Mechanism |
|---|---|---|
| `WishService.createWish` | Yes | `setDoc` with a known `wishId` (UUID) — retrying overwrites with identical data |
| `UploadService.uploadVideo` | Yes | Upload to same Storage path overwrites previous file |
| `UploadService.uploadThumbnail` | Yes | Same as above |
| `AuthService.signInAnonymously` | Yes | If user already exists in SDK cache, returns existing user |
| `AuthService.updateLastSeen` | Yes | `updateDoc` on same field — last write wins |
| `NotificationService.registerToken` | Yes | `updateDoc` on `pushToken` — last write wins |
| `AdminService.updateWishStatus` | No — protected by transaction | Second call with same values throws `'already reviewed'` if status is no longer `'pending'` |
| `AdminService.deleteWish` | Yes | Deleting a non-existent Firestore document or Storage object does not throw |

### Retry Safety

The upload retry flow relies on idempotency. When `UploadService` retries after
a network failure:
- The same `wishId` is used on every retry attempt
- The same Storage paths are used — the file is overwritten, not duplicated
- `WishService.createWish` is only called after all uploads succeed — it is never
  called mid-upload

---

## 9. Pagination and Query Contract

### User Wish List Query

```ts
// First page
query(
  collection(db, 'wishes'),
  where('uid', '==', uid),
  orderBy('createdAt', 'desc'),
  limit(10)
)

// Subsequent pages (cursor-based)
query(
  collection(db, 'wishes'),
  where('uid', '==', uid),
  orderBy('createdAt', 'desc'),
  startAfter(lastDocumentSnapshot),
  limit(10)
)
```

| Property | Value |
|---|---|
| Pagination type | Cursor-based (`startAfter`) |
| Page size | 10 documents |
| Sort order | `createdAt` descending (newest first) |
| Required index | Compound index: `uid` ASC + `createdAt` DESC |
| Stability | Firestore cursor pagination is stable — new documents added after the first page load do not shift existing pages |

### Admin Pending Queue Query

```ts
query(
  collection(db, 'wishes'),
  where('status', '==', 'pending'),
  orderBy('createdAt', 'asc'),
  limit(20)
)
```

| Property | Value |
|---|---|
| Pagination type | Cursor-based (`startAfter`) |
| Page size | 20 documents |
| Sort order | `createdAt` ascending (oldest first — review oldest wishes first) |
| Required index | Compound index: `status` ASC + `createdAt` ASC |

### What Is Not Supported

- Filtering wishes by text content (Firestore has no full-text search)
- Sorting by any field other than `createdAt` in the current index setup
- Offset-based pagination (`offset()`) — not used; cursor-based is more efficient
  and stable in Firestore

---

## 10. Update Semantics

There is no REST API and no HTTP PUT or PATCH. All updates use Firestore's
`updateDoc()` which is a partial update by default — only specified fields are
modified, all other fields are untouched.

### Update Rules

```ts
// CORRECT — partial update of specific fields only
await updateDoc(wishRef, {
  status: 'granted',
  grantedAt: serverTimestamp(),
  adminMessage: message ?? null,
})

// NEVER — full document replacement that could wipe unspecified fields
await setDoc(wishRef, { status: 'granted' })  // ❌ wipes all other fields
```

The only time `setDoc` is used is for **document creation** (wish creation, user
creation) where the full document shape is provided and the document is known to
not exist yet (or it is safe to overwrite with identical data on retry).

### Partial Update Failure

If `updateDoc` fails (network error, permission denied):
- `AdminService.updateWishStatus` catches the error inside the Firestore transaction
- The transaction is automatically retried by Firestore (up to 5 times)
- On final failure, a human-readable error is thrown to the store
- The Firestore document is unchanged — no partial state corruption is possible
  within a single `updateDoc` call (Firestore writes are atomic at the document level)

---

## 11. Authentication in the Service Layer

Every service method that calls Firestore or Storage implicitly requires an active
Firebase Auth session. The Firebase SDK automatically attaches the current user's
ID token to every request.

### Auth Requirements Per Service

| Service | Auth Required | Role Required |
|---|---|---|
| `AuthService` | No (it establishes auth) | None |
| `WishService` | Yes — any authenticated user | None beyond auth |
| `UploadService` | Yes — authenticated user's uid must match Storage path | None beyond auth |
| `NotificationService` | Yes | None beyond auth |
| `AdminService` | Yes | `role: 'admin'` — enforced by Firestore rules |
| `StorageService` (preferences) | No — device-local | None |

### On Missing or Invalid Auth

If `initAuth()` has not been called or has failed, any Firestore or Storage
operation throws a permission-denied error from Firebase. `AuthService.initAuth()`
is called before any navigation to authenticated routes — see `auth.md` Section 9
and the Vue Router guard in `frontend.md` Section 11.

---

## 12. Rate Limits and Quotas

There are no custom per-endpoint or per-user rate limits implemented in the
application layer. Firebase Functions (required for custom rate limiting) are not
available on the free Spark plan.

### Firebase Platform-Level Limits (Not Configurable)

| Limit | Value |
|---|---|
| Firestore reads | 50,000 per day (free tier) |
| Firestore writes | 20,000 per day (free tier) |
| Firestore deletes | 20,000 per day (free tier) |
| Firebase Storage | 5GB total, 1GB/day download (free tier) |
| FCM notifications | Unlimited |
| Anonymous auth | Firebase platform rate limits (not configurable) |

At 6 users, none of these limits will be reached. See `database.md` Section 8.

---

## 13. Backward Compatibility Contract

See `database.md` Section 10 for full migration process. Summary:

| Change | Backward Compatible? |
|---|---|
| Adding optional field (`field?: Type`) | Yes — existing documents handled with `?? defaultValue` |
| Adding required field to new documents | Partially — existing documents need backfill |
| Renaming field | No — migration script required |
| Removing field | No — remove all reads first |
| Adding a new `WishStatus` value | No — update rules, TypeScript type, and all UI simultaneously |

### Defensive Read Pattern

All service reads use nullish coalescing for fields that may have been added after
initial document creation:

```ts
// Defensive read — handles documents created before 'viewed' field existed
const viewed = wishData.viewed ?? false
const adminMessage = wishData.adminMessage ?? null
```

---

## 14. Data Ownership Contract

| Data | Owned By | Written By | Read By |
|---|---|---|---|
| User document (`/users/{uid}`) | `AuthService` / `NotificationService` | App (own fields), Firebase Console (role, pinHash) | App (own document), Admin |
| Wish document (`/wishes/{wishId}`) | `WishService` / `AdminService` | App (creation), Admin (status update), App (viewed flag) | App (own wishes), Admin (all wishes) |
| Video file (`/wishVideos/...`) | `UploadService` | App (own uid path) | App (own), Admin |
| Thumbnail file (`/thumbnails/...`) | `UploadService` | App (own uid path) | App (own), Admin |
| Local preferences | `StorageService` | App | App |

**If two sources disagree on data:**
Firestore is the single source of truth for all persistent data. Pinia stores are
an in-memory cache. If a Pinia store and Firestore disagree, Firestore wins — the
`onSnapshot` listener will correct the Pinia store within seconds.

---

## 15. Synchronous vs Asynchronous Operations

| Operation | Type | Client Feedback |
|---|---|---|
| Auth initialisation | Async (awaited) | App waits on splash screen |
| Firestore single document read | Async (awaited) | Loading skeleton shown |
| Firestore real-time listener | Async (event-driven) | Store updated via callback; UI re-renders reactively |
| Video upload | Async (progress observable) | Progress bar in `UploadProgressModal` |
| Thumbnail upload | Async (awaited) | Part of upload sequence; no separate UI |
| Admin status update | Async (awaited) | Button shows loading state |
| Admin wish delete | Async (awaited) | Card removed from list on success |
| FCM push notification send | Fire-and-forget | Admin sees success/failure toast |
| Push notification delivery | Async (FCM-managed) | No delivery confirmation in MVP |

### Client Knowledge of Async Operation Success

For operations where the client sends a request and waits:
- All `UploadService`, `WishService`, and `AdminService` methods return Promises
- The Pinia `uploadStore`, `wishesStore`, and `adminStore` expose `isLoading` and
  `error` reactive state
- UI components bind to these states to show loading indicators and error messages

For push notification delivery: the admin UI confirms that the FCM send request
was made (fire-and-forget). Delivery to the device is handled by FCM and is not
confirmed back to the app.

---

## 16. Security Constraints on Contracts

### Data Never Exposed Through Any Interface

| Data | Why Protected |
|---|---|
| Other users' `uid` values | Cross-user reads blocked by Firestore rules |
| Other users' wish content | Cross-user reads blocked by Firestore rules |
| Other users' push tokens | User document only readable by owner and admin |
| Admin `pinHash` value | Only readable by the admin user themselves |
| Firebase Auth tokens | Managed by Firebase SDK; never exposed to app code |
| Firebase project secrets | In `.env` only; never returned by any service method |
| Raw Firebase error codes | Caught in services; translated to human-readable messages |

### No Accidental Data Leakage in Responses

Service methods return only the data needed by the caller. They never return a
raw Firestore `DocumentSnapshot` — they always call `.data()` and cast to the
correct TypeScript interface before returning.

```ts
// CORRECT — typed, validated return
const snap = await getDoc(wishRef)
if (!snap.exists()) return null
return snap.data() as WishDocument

// NEVER — raw snapshot returned to calling code
return snap  // ❌ exposes Firestore internals
```

---

## 17. Contract Testing

See `testing.md` for the full testing strategy. Contract-specific tests:

### What Is Tested

| Contract | Test Type | Where |
|---|---|---|
| Firestore document schemas | Integration (emulator) — write and read back, assert shape | `/tests/integration/` |
| Firestore security rules | Integration (emulator) — assert allow/deny per rule | `/tests/integration/` |
| Service method error translation | Unit — mock Firebase to throw; assert human-readable error is thrown | `/tests/unit/` |
| Status transition enforcement | Unit + Integration | Both layers tested independently |
| Upload ordering (Storage before Firestore) | Unit — mock Storage to fail; assert Firestore is never called | `/tests/unit/` |
| Idempotency of createWish | Unit — call twice with same wishId; assert setDoc called with same args | `/tests/unit/` |

### What Breaks If Contract Tests Fail

A failing contract test means either:
1. A service method no longer matches its documented signature
2. A Firestore document is being written with fields that don't match the interface
3. A security rule allows an operation it should deny (or vice versa)

Any of these block the CI pipeline. No deployment proceeds with a failing
contract test.

---

## 18. Documentation Source of Truth

This file is the **single reference for all data contracts in Girigo**. It
consolidates the TypeScript interfaces, service signatures, and validation rules
that are described in more detail (with rationale) in:

- `backend.md` — the reasoning behind service design
- `database.md` — the reasoning behind schema design and lifecycle decisions

**If this file and another file conflict**, this file takes precedence for the
contract definition (types, field names, constraints). The other file takes
precedence for the reasoning (why the contract is designed this way).

There is no OpenAPI, no Swagger, and no auto-generated schema documentation.
This file is maintained manually and updated whenever a schema change is made.
Updating this file is part of the Definition of Done in `process.md` Section 6.