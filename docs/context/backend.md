# backend.md — Girigo App Backend

---

## Framing Note

Girigo has no custom backend server, no REST API, and no custom API endpoints.
**Firebase is the backend.** This document covers the backend as it actually exists:
Firestore security rules as the authorization layer, the Firebase JS SDK as the API
layer, and the services layer in the app as the business logic layer. Every section
of this document is written in that context.

---

## 1. API Design

### API Philosophy

Girigo's "API" is a **resource-oriented SDK interface** provided by the Firebase JS
SDK. Operations map directly to Firestore documents and Firebase Storage paths. There
is no action-oriented RPC layer and no custom HTTP server.

The guiding principles are:

| Principle | Implementation |
|---|---|
| **Consistency** | All data operations go through the services layer using the same TypeScript interfaces — no ad-hoc Firestore calls in components or stores |
| **Idempotency** | Write operations use client-generated UUIDs as document IDs — retrying a failed write with the same ID is always safe |
| **Least privilege** | Every Firestore and Storage operation is permitted only for the minimum required identity — security rules enforce this server-side |
| **Single responsibility** | Each service method does one thing — `createWish` creates a wish, `updateWishStatus` updates status; no method combines unrelated operations |

### "Endpoints" — Firebase Operations Exposed by the Services Layer

There are no HTTP endpoints. The following table maps service methods to their
underlying Firebase operation — this is the contract boundary of the backend.

| Service Method | Firebase Operation | Caller | Description |
|---|---|---|---|
| `AuthService.initAuth()` | `onAuthStateChanged` | App init | Subscribes to auth state; signs in anonymously if no user |
| `AuthService.signInAnonymously()` | `signInAnonymously()` | First launch | Creates an anonymous Firebase user |
| `AuthService.updateLastSeen(uid)` | `updateDoc /users/{uid}` | App resume | Updates `lastSeen` timestamp |
| `WishService.createWish(data)` | `setDoc /wishes/{wishId}` | `uploadStore` | Writes wish document after successful upload |
| `WishService.getUserWishes(uid)` | `onSnapshot` query on `wishes` where `uid ==` | `wishesStore` | Real-time listener for user's wish list |
| `WishService.getWishById(wishId)` | `getDoc /wishes/{wishId}` | `WishDetailView` | Single wish fetch for detail screen |
| `UploadService.uploadVideo(file, uid, wishId)` | `uploadBytesResumable /wishVideos/{uid}/{wishId}.mp4` | `uploadStore` | Uploads compressed video with progress |
| `UploadService.uploadThumbnail(blob, uid, wishId)` | `uploadBytesResumable /thumbnails/{uid}/{wishId}.jpg` | `uploadStore` | Uploads generated thumbnail |
| `UploadService.getDownloadUrl(ref)` | `getDownloadURL` | `uploadStore` | Gets public download URL after upload |
| `UploadService.cancelUpload()` | `.cancel()` on upload task | `UploadProgressModal` | Cancels an in-progress upload |
| `NotificationService.registerToken(uid)` | `PushNotifications.register()` + `updateDoc /users/{uid}` | App init | Registers FCM token and saves to Firestore |
| `AdminService.getAllWishes(status?)` | `onSnapshot` query on `wishes` (optionally filtered by status) | `adminStore` | Real-time listener for admin wish queue |
| `AdminService.updateWishStatus(wishId, status, message?)` | Firestore transaction on `/wishes/{wishId}` | `AdminWishDetailView` | Updates status with invariant enforcement |
| `AdminService.deleteWish(wishId, uid)` | `deleteDoc /wishes/{wishId}` + Storage `deleteObject` × 2 | `AdminWishDetailView` | Deletes document then Storage files |
| `AdminService.sendNotification(pushToken, wishId)` | Firebase Admin SDK via FCM HTTP v1 API | `AdminWishDetailView` | Sends push notification to user device |

### What Is Intentionally Not Exposed

| Operation | Reason Not Exposed |
|---|---|
| Read another user's wishes | Firestore rules block cross-user reads at the server level — no service method exists for it |
| Update a wish's `uid` or `videoUrl` | These fields are immutable after creation — no service method exposes them as writable |
| Delete a wish (user-facing) | Users cannot delete their own wishes — the "irreversible wish" mental model is intentional |
| Assign admin role | No service method for self-assigning or granting admin role — this is set manually in Firebase Console |
| Direct FCM broadcast | Notifications are per-wish only — no bulk notification method exists in MVP |

### Request and Response Contracts

Contracts are defined as TypeScript interfaces in `/src/types/index.ts`. These are
the single source of truth for data shape across the entire app.

**`NewWish`** — input to `WishService.createWish()`
```ts
interface NewWish {
  wishId: string          // required — client-generated UUID
  uid: string             // required — from authStore
  username: string        // required — from userStore
  wishText: string        // required — empty string if user skipped text input
  videoUrl: string        // required — Firebase Storage download URL
  thumbnailUrl: string    // required — Firebase Storage download URL
}
```

**`WishDocument`** — shape of a Firestore `/wishes/{wishId}` document
```ts
interface WishDocument {
  wishId: string
  uid: string
  username: string
  wishText: string
  videoUrl: string
  thumbnailUrl: string
  status: 'pending' | 'granted' | 'rejected'
  createdAt: Timestamp
  grantedAt: Timestamp | null
  adminMessage: string | null
  viewed: boolean
}
```

**`UserDocument`** — shape of a Firestore `/users/{uid}` document
```ts
interface UserDocument {
  uid: string
  username: string
  createdAt: Timestamp
  lastSeen: Timestamp
  pushToken: string
  role: 'user' | 'admin'
}
```

**`StatusUpdate`** — input to `AdminService.updateWishStatus()`
```ts
interface StatusUpdate {
  wishId: string
  newStatus: 'granted' | 'rejected'   // 'pending' is never a valid target status
  adminMessage: string | null
}
```

### What Happens if a Contract Is Violated

Violations are caught at two layers:

1. **TypeScript (compile time)**: Passing a malformed object to a service method
   produces a type error before the code runs. This is the primary defence.
2. **Firestore security rules (runtime)**: If a write reaches Firestore with missing
   or mistyped required fields, the security rules reject it. The SDK throws an error
   which the service catches and rethrows as a human-readable message.

No raw Firebase error codes are ever surfaced to the UI.

### Error Handling

**Standard error categories:**

| Category | Example | Handling |
|---|---|---|
| Validation error | Missing required field, exceeded character limit | Caught at service layer before Firebase call; human-readable message returned |
| Auth error | Token expired, anonymous auth failed | `AuthService` catches and retries sign-in; if unrecoverable, redirects to `/onboarding` |
| Permission error | Security rule denied a read/write | Caught in service; surfaces as "You don't have permission to do that" |
| Network error | Device offline during write | Firestore SDK queues the write offline; surfaces a warning banner; retried automatically on reconnect |
| Storage error | Upload failed, file too large | `UploadService` catches; returns retry-able error to `uploadStore` |
| Not found | `getDoc` returns no document | Service returns `null`; calling store handles empty state |

**Error format** — all service methods throw plain `Error` objects with human-readable messages:

```ts
throw new Error('Could not save your wish. Please check your connection and try again.')
```

Firebase SDK error objects are always caught and never re-thrown raw. The original
error is logged to Crashlytics with full context before the sanitised error is thrown.

**No HTTP status codes exist** — this is a client SDK, not an HTTP API. Error
semantics are communicated via thrown `Error` instances and store `error` state.

### Idempotency

| Operation | Idempotent? | Mechanism |
|---|---|---|
| `createWish` | Yes | `wishId` is a client-generated UUID; `setDoc` with a known ID overwrites safely |
| `uploadVideo` | Yes | Storage path includes `wishId`; re-uploading to the same path overwrites the file |
| `updateWishStatus` | Yes | Setting status to `granted` when it is already `granted` is a no-op |
| `registerToken` | Yes | `updateDoc` on the same field with the same value is safe to repeat |
| `deleteWish` | Yes | Deleting a non-existent document or Storage object does not throw — SDK handles gracefully |

All mutating operations are safe to retry. The upload retry flow in `UploadService`
relies on this — the same `wishId` is reused across retry attempts.

---

## 2. Domain Model and Business Logic

### Core Entities

**User**
Represents any person who has opened the app. Always anonymous in MVP. Created
automatically on first launch.

**Wish**
The core domain object. Represents a single recorded video wish submitted by a user.
A wish moves through a defined lifecycle and is permanently owned by the user who
created it.

### Entity Invariants

Invariants are rules that must always be true. Violating them means the system is
in an invalid state.

**User invariants:**
- A user document must have a `uid` matching their Firebase Auth UID
- `role` must be exactly `'user'` or `'admin'` — no other value is valid
- A user can never assign their own `role` — this field is set manually in Firebase
  Console or by a future admin-only operation

**Wish invariants:**
- `uid` on the wish document must match the `uid` of the authenticated user who
  created it — a user can never create a wish attributed to another user
- `videoUrl` and `thumbnailUrl` must be present and non-empty at document creation
  time — a wish without a video is invalid
- `status` must be one of `'pending'`, `'granted'`, `'rejected'`
- Status transitions are **one-way**: `pending → granted` or `pending → rejected`
  only. A granted or rejected wish cannot be moved back to pending, and a granted
  wish cannot be rejected (or vice versa). This is enforced at the service layer
  and the Firestore security rules layer.
- `wishId` on the document must match the document's Firestore ID
- A wish belongs to exactly one user and can never be reassigned

### Status Transition Rules

```
pending ──→ granted
pending ──→ rejected

granted ──→ ✗ (no further transitions)
rejected ──→ ✗ (no further transitions)
```

**Enforcement locations:**
1. `AdminService.updateWishStatus()` — reads current status before writing;
   throws if the current status is not `'pending'`
2. Firestore security rules — the `update` rule for wishes checks that the incoming
   `status` value is only set when the current value is `'pending'`

### Business Rules

| Rule | Enforced At | What Happens If Violated |
|---|---|---|
| A user can only read their own wishes | Firestore security rules (server) | Permission denied error — read is rejected |
| A user can only create wishes with their own `uid` | Firestore security rules (server) | Permission denied error — write is rejected |
| Status transitions are one-way | Service layer + Firestore rules | Service throws before Firebase call; rules reject the write as a second layer |
| Video must be present before wish document is written | Service layer (upload-first ordering) | `createWish` is only called after both Storage uploads succeed |
| Admin can only be identified by Firestore `role` field | Firestore security rules (server) | Elevated reads/writes rejected for non-admin uid |
| Video file size maximum 20MB | Firebase Storage security rules (server) | Storage write rejected; `UploadService` also validates client-side before attempting upload |
| Video MIME type must be `video/*` | Firebase Storage security rules (server) | Storage write rejected |
| Wish text maximum 280 characters | Service layer validation | `createWish` throws before Firebase call |

### Where Business Logic Lives

```
UI Components       → render state, handle user input
     ↓
Pinia Stores        → coordinate state, call service methods
     ↓
Services Layer      → ALL business rules enforced here
     ↓
Firebase SDK        → data persistence only
     ↓
Firestore Rules     → server-side invariant enforcement (second layer)
```

**What is forbidden in components and stores:**
- No validation logic in Vue components — validation belongs in the service layer
- No Firebase SDK calls in Vue components or Pinia stores — only service method calls
- No business rule checks in Pinia stores — stores coordinate, services decide

This prevents "fat components" and keeps business rules testable in isolation.

---

## 3. Data Handling and Transactions

### The Upload-First Ordering Problem

Creating a wish involves three sequential async operations that cannot be wrapped in
a single atomic transaction:

```
1. Upload video   → Firebase Storage  (/wishVideos/{uid}/{wishId}.mp4)
2. Upload thumbnail → Firebase Storage (/thumbnails/{uid}/{wishId}.jpg)
3. Write document  → Firestore        (/wishes/{wishId})
```

Firebase Storage and Firestore are separate services — there is no cross-service
transaction primitive. The **deliberate ordering** is the consistency strategy:

**Storage uploads first, Firestore write last.**

| Failure Scenario | Result | Acceptability |
|---|---|---|
| Storage upload 1 fails | No Storage files, no Firestore document. Retry is clean. | Acceptable |
| Storage upload 2 fails | Video file exists in Storage orphaned, no Firestore document. Orphan is invisible to users. | Acceptable |
| Both Storage uploads succeed, Firestore write fails | Both Storage files exist orphaned, no Firestore document. Wish is not visible. User retries — same `wishId` overwrites the Storage files safely. | Acceptable |
| All three succeed, then network drops | Firestore SDK offline cache holds the write; syncs when reconnected. | Handled by SDK |

The Firestore document is treated as the **authoritative commit point**. A wish only
"exists" from the app's perspective once the Firestore document is written. Orphaned
Storage files from failed writes are invisible to users and acceptable at this scale.

### Firestore Transactions

Firestore transactions are used for operations that require a **read-before-write**
to enforce invariants under concurrent access.

**`AdminService.updateWishStatus()`** uses a Firestore transaction:

```ts
await runTransaction(db, async (transaction) => {
  const wishRef = doc(db, 'wishes', wishId)
  const wishSnap = await transaction.get(wishRef)

  if (!wishSnap.exists()) throw new Error('Wish not found.')

  const currentStatus = wishSnap.data().status
  if (currentStatus !== 'pending') {
    throw new Error('This wish has already been reviewed and cannot be changed.')
  }

  transaction.update(wishRef, {
    status: newStatus,
    adminMessage: adminMessage ?? null,
    grantedAt: newStatus === 'granted' ? serverTimestamp() : null,
  })
})
```

The transaction ensures that if two admin sessions somehow both attempt to update
the same wish simultaneously (extremely unlikely — there is one admin — but handled
correctly regardless), only the first write succeeds.

### Admin Wish Deletion — Ordering

Deleting a wish involves three sequential operations. The deliberate ordering is:

```
1. Delete Firestore document (/wishes/{wishId})
2. Delete video from Storage  (/wishVideos/{uid}/{wishId}.mp4)
3. Delete thumbnail from Storage (/thumbnails/{uid}/{wishId}.jpg)
```

**Firestore document deleted first.** Rationale: once the document is gone, the wish
is invisible to all users and the admin immediately. Orphaned Storage files that
remain after a Storage delete failure are invisible (no document references them)
and can be manually cleaned up from the Firebase Console if needed. The alternative
ordering (Storage first) risks a state where files are deleted but the document
still shows in the admin queue, which is worse UX.

| Failure Scenario | Result |
|---|---|
| Firestore delete fails | Nothing is deleted. Admin sees retry option. |
| Firestore delete succeeds, Storage deletes fail | Document gone, Storage files orphaned. Invisible to users. Manually cleanable. |
| All three succeed | Clean deletion. |

### Data Corruption Prevention

- All writes go through typed TypeScript interfaces — malformed data is caught at
  compile time before reaching Firebase
- Service methods validate required fields before making any Firebase call
- Firestore security rules provide a server-side validation layer independent of
  the client
- No write ever partially updates a wish's core identity fields (`wishId`, `uid`,
  `videoUrl`, `thumbnailUrl`) after creation — these are set once and never touched

---

## 4. Concurrency and Consistency

### Consistency Model

Firestore uses **strong consistency for single-document reads** and
**eventual consistency for multi-document queries**. For Girigo:

- Single wish detail reads (`getDoc`) are strongly consistent
- The wish list query (`onSnapshot` on the `wishes` collection) is eventually
  consistent — a newly created wish may take a moment to appear in a listener
  on another device. Acceptable for this use case.

### Concurrent Update Scenarios

| Scenario | Risk Level | Handling |
|---|---|---|
| Admin updates wish status while user is viewing it | Low | User's `onSnapshot` listener on the wish detail screen receives the update automatically within seconds |
| Two admin sessions update the same wish simultaneously | Extremely low (one admin) | Firestore transaction in `updateWishStatus` ensures only the first write succeeds; second throws a readable error |
| User submits two wishes simultaneously | Not possible | "Send My Wish" button is disabled immediately on first tap; re-enabled only after success or failure |
| User retries an upload with the same `wishId` | Safe | `setDoc` with a known ID overwrites the previous document; Storage upload to the same path overwrites the file |

### Race Conditions

**The only meaningful race condition** in this architecture is the admin updating a
wish status at the exact moment the user navigates to the wish detail screen. This
is handled automatically:

1. The Firestore `onSnapshot` listener on the wish detail screen receives the status
   change and re-renders the UI
2. No manual polling or cache invalidation is needed
3. The user sees the correct status within the Firestore SDK's propagation time
   (typically under one second on a good connection)

### Where Eventual Consistency Is Tolerated

| Data | Tolerance |
|---|---|
| Wish list on Home screen | A few seconds — real-time listener keeps it near-current |
| Wish status on detail screen | A few seconds — real-time listener |
| Admin wish queue | A few seconds — real-time listener |
| User profile (lastSeen, pushToken) | Minutes — these are background updates, not user-facing |

---

## 5. Security

### Input Validation

Validation is performed at **two independent layers**:

| Layer | Responsibility | What It Catches |
|---|---|---|
| Service layer (TypeScript) | Validates shape and business rules before any Firebase call | Empty required fields, exceeded character limits, invalid status transitions |
| Firestore security rules | Server-side invariant enforcement | Cross-user writes, role escalation, missing required fields, invalid status values |
| Storage security rules | File-level constraints | Exceeded file size (20MB), non-video MIME type |

The service layer is the **primary validation layer** — it provides user-facing error
messages. The security rules are the **enforcement layer** — they cannot be bypassed
regardless of what the client does.

No validation library (Zod, Yup, etc.) is used. The TypeScript type system and
explicit guard checks in service methods are sufficient for this data volume.

### Authentication

Firebase anonymous authentication is used. Every user — including anonymous users —
has a valid Firebase Auth UID and receives a signed JWT that is automatically
attached to every Firestore and Storage request by the Firebase JS SDK.

There is no unauthenticated state after first launch. `AuthService.initAuth()`
ensures a Firebase user exists before any other operation is attempted.

**Token lifecycle:**
- Firebase anonymous auth tokens expire after one hour
- The Firebase JS SDK automatically refreshes tokens silently — the app never
  handles token refresh manually
- If token refresh fails (prolonged offline), Firestore SDK queues operations and
  retries on reconnect

### Authorization

Authorization is enforced by **Firestore security rules** and
**Firebase Storage security rules** — both are server-side and cannot be bypassed
by a modified client.

**Firestore rules summary:**

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAdmin() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid))
               .data.role == 'admin';
    }

    function isOwner(uid) {
      return request.auth != null && request.auth.uid == uid;
    }

    function statusTransitionValid() {
      // Only allow pending → granted or pending → rejected
      return resource.data.status == 'pending'
          && request.resource.data.status in ['granted', 'rejected'];
    }

    match /users/{uid} {
      allow read, write: if isOwner(uid);
      allow read, write: if isAdmin();
    }

    match /wishes/{wishId} {
      // Users can create their own wishes
      allow create: if request.auth != null
                    && request.resource.data.uid == request.auth.uid
                    && request.resource.data.videoUrl != ''
                    && request.resource.data.thumbnailUrl != '';

      // Users can only read their own wishes
      allow read: if isOwner(resource.data.uid);

      // Admins can read all wishes and update status (one-way transition only)
      allow read: if isAdmin();
      allow update: if isAdmin() && statusTransitionValid();

      // Admins can delete wishes
      allow delete: if isAdmin();
    }
  }
}
```

**Storage rules summary:**

```js
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    match /wishVideos/{uid}/{wishId} {
      allow write: if request.auth != null
                   && request.auth.uid == uid
                   && request.resource.size < 20 * 1024 * 1024
                   && request.resource.contentType.matches('video/.*');
      allow read:  if request.auth.uid == uid;
    }

    match /thumbnails/{uid}/{wishId} {
      allow write: if request.auth != null && request.auth.uid == uid;
      allow read:  if request.auth.uid == uid;
    }

    // Admins can read all files (for video playback in admin panel)
    match /{allPaths=**} {
      allow read: if firestore.get(
        /databases/(default)/documents/users/$(request.auth.uid)
      ).data.role == 'admin';
    }
  }
}
```

### Admin PIN

The admin panel's 5-tap-logo entry is protected by a PIN as a UX gate. The PIN is:

- Stored as a **SHA-256 hash** in the admin's Firestore user document
  (`/users/{adminUid}.pinHash`)
- Verified **client-side** by hashing the entered PIN with the Web Crypto API and
  comparing to the stored hash
- Never stored or transmitted in plain text

The PIN is a convenience gate only — it prevents accidental access to the admin
panel. The real authorisation enforcement is the server-side Firestore security rules
which check `role === 'admin'` on every admin read or write. A user who bypasses the
PIN check client-side still cannot read other users' data or update wish statuses
because the Firestore rules block it server-side.

### Abuse Protection

No automated rate limiting or anti-spam system exists in the MVP. Firebase Functions
(which would enable server-side rate limiting) are not available on the free Spark
plan.

Practical protections that exist within the current architecture:

| Threat | Protection |
|---|---|
| User reading other users' wishes | Firestore rules block cross-user reads at server level |
| User writing to another user's Storage path | Storage rules enforce `uid` path matching |
| User self-assigning admin role | `role` field update is not permitted by security rules for non-admin users |
| Excessive wish submissions | No hard limit in MVP — acceptable at 6 users; enforced by Storage cost pressure (free 5GB limit) |
| Brute-force admin PIN | No server-side enforcement — PIN is a UX gate; the real security is Firestore rules |

If the project ever moved to real users, rate limiting would require upgrading to
the Blaze plan and implementing Firebase Functions with IP-based or UID-based
request throttling.

---

## 6. Scalability and System Behaviour

This section is brief by design. Girigo is a portfolio project with a maximum of six
users. Scalability is not a current requirement — Firebase's infrastructure scales
automatically and the free tier limits will never be reached at this scale.

### What Is Stateless

The Ionic Vue app is entirely stateless between sessions. All persistent state lives
in Firebase (Firestore, Storage, Auth) or `@capacitor/preferences`. Any device can
run the app and access the same data by authenticating as the same Firebase user.

### What Requires Shared State

Firestore is the shared state layer. All users read from and write to the same
Firestore database. The security rules ensure each user only accesses their own
partition of that state.

### Future Scaling Path

If the app ever needed to scale beyond the free tier:
1. Upgrade to Firebase Blaze (pay-as-you-go) — removes all quota limits
2. Add Firebase Functions for server-side logic (rate limiting, automated
   notifications, AI moderation)
3. Enable Firestore multi-region replication for global latency reduction

No architectural changes to the app's service/store structure would be required —
the services layer already abstracts all Firebase calls cleanly.

---

## 7. Background Jobs and Async Processing

### No Background Jobs in MVP

The free Firebase Spark plan does not support Cloud Functions. There are no
background workers, job queues, or scheduled tasks in the MVP. Every operation is
either:

- **Synchronous** (Firestore reads, document creation) — triggered by user action,
  completes in the foreground
- **Client-initiated async** (video upload) — runs asynchronously on the device,
  progress reported to the UI, no server-side worker involved
- **Fire-and-forget** (FCM push notification) — admin manually triggers from the
  in-app panel; FCM delivery is handled entirely by Google's infrastructure with
  no app-side job tracking

### Async Operations and Failure Handling

| Operation | Async? | Failure Handling |
|---|---|---|
| Video upload | Yes | `UploadService` catches failures; retry with exponential backoff (max 3 attempts); user-facing retry button after max retries |
| Thumbnail upload | Yes | Same as video upload |
| Firestore document write | Effectively sync (SDK handles offline queuing) | Firestore SDK queues if offline; syncs on reconnect |
| FCM push notification send | Fire-and-forget | No delivery confirmation in MVP; Firestore real-time listener is the fallback for status visibility |

### Future: Firebase Functions

When the project moves to the Blaze plan, the following background jobs would be
implemented as Firebase Functions:

- **Automated notifications**: Trigger on Firestore write to `/wishes/{wishId}`
  when `status` changes — replace the manual admin notification step
- **Storage cleanup**: Trigger on Firestore document delete to automatically
  remove orphaned Storage files
- **Rate limiting**: HTTP callable function to enforce per-user wish submission
  rate limits

---

## 8. External Integrations

### Firebase Platform (All Services)

Firebase is the only external dependency. It is not a single service but a platform
of integrated services:

| Service | Integration Method | Used For |
|---|---|---|
| Firebase Auth | Firebase JS SDK (`firebase/auth`) | Anonymous user identity |
| Cloud Firestore | Firebase JS SDK (`firebase/firestore`) | All structured data |
| Firebase Storage | Firebase JS SDK (`firebase/storage`) | Video and thumbnail files |
| Firebase Cloud Messaging | `@capacitor/push-notifications` plugin | Push notification delivery |
| Firebase Analytics | Firebase JS SDK (`firebase/analytics`) | Usage tracking |
| Firebase Crashlytics | `@capacitor-firebase/crashlytics` | Crash and error reporting |

**Why not build in-house:** Building equivalent infrastructure (auth service,
document database with real-time sync, file storage with access control, push
notification delivery) would require months of development and ongoing server
infrastructure costs. Firebase provides all of this on a generous free tier with
a single SDK.

**Risk of reliance:** Google could deprecate Firebase or change its pricing model.
This risk is low — Firebase is a core Google infrastructure product used by millions
of apps. For a portfolio project the risk is entirely acceptable. For a commercial
product, a migration plan to Supabase + custom storage would be worth documenting.

### FCM Push Notification Flow

The admin manually sends push notifications from the in-app admin panel. The flow:

```
Admin taps "Send Notification"
  → App reads target user's pushToken from Firestore
  → App calls FCM HTTP v1 API directly with the device token
  → FCM delivers to the target device via Android GCM or iOS APNs
  → Device OS delivers the notification to the notification tray
```

**Note on FCM HTTP v1 API from the client:** Calling the FCM send API directly from
the app requires a server access token, which is a security concern (the token would
be exposed in the client). The correct implementation uses a Firebase Function as
a proxy. Since Firebase Functions are unavailable on the free Spark plan, the
alternative is to use the **Firebase Admin SDK via a service account** stored
server-side — which also requires Functions.

**Practical resolution for MVP:** Use the **legacy FCM server key** approach (being
deprecated by Google but still functional) stored as an environment variable in the
app's `.env`, accessed only from within the admin panel flow. This is acceptable for
a portfolio project where the admin is the developer. Document this as a known
limitation requiring Firebase Functions when moving to production.

**What happens if FCM is down:** The Firestore real-time listener on the user's
device updates the wish status automatically regardless of push notification delivery.
Users who have the app open or reopen it will always see the correct status. Push
notifications are a convenience enhancement, not the authoritative delivery mechanism.

---

## 9. Observability and Debugging

This section summarises the observability approach — covered in full detail in
`design.md` (Section 13) and `tech-stack.md` (Section 7).

### Per-Operation Logging

Every service method logs errors before rethrowing:

```ts
// Standard pattern in all service methods
try {
  await setDoc(wishRef, wishData)
} catch (error) {
  console.error(`WishService.createWish failed — uid: ${uid}, wishId: ${wishId}`, error)
  await FirebaseCrashlytics.recordException({
    message: `WishService.createWish failed for uid: ${uid}`
  })
  throw new Error('Could not save your wish. Please check your connection and try again.')
}
```

Context always included in error logs: operation name, uid, relevant document ID.

### Debugging a Backend Issue in Production

1. **Firebase Console → Firestore**: Inspect the relevant document directly
2. **Firebase Console → Storage**: Verify file exists at expected path
3. **Firebase Console → Authentication**: Verify user exists and is not disabled
4. **Firebase Crashlytics**: Check for exception reports with operation context
5. **Reproduce locally**: `ionic serve` + Chrome DevTools → Network tab shows all
   Firebase SDK requests and responses
6. **Firestore Rules Playground**: Test a failing security rule in the Firebase
   Console without deploying code changes

---

## 10. Configuration and Environment Management

Covered in full in `tech-stack.md` (Section 6 — Secrets Management and Section 10).

**Summary:**

- All Firebase config values live in `.env` (gitignored locally) and GitHub Secrets
  (for CI builds)
- Accessed in app code via `import.meta.env.VITE_*` (Vite standard)
- `.env.example` is committed with all keys present and values blank
- There is one Firebase project for all environments (dev, test, production) in MVP
- No config changes require redeployment — config is baked into the Vite build at
  build time

---

## 11. API Versioning and Schema Evolution

There is no REST API to version. Schema evolution means **Firestore document schema
changes**.

### Schema Change Policy

| Change Type | Safe? | Process |
|---|---|---|
| Add optional field to existing document | Yes | Add to TypeScript interface with `?`, deploy |
| Add required field to new documents only | Yes | Set in `createWish` / `createUser` service methods; existing documents won't have it — handle with nullish coalescing in reads |
| Rename a field | No | Write a migration script; deploy script before deploying app code that reads the new field name |
| Remove a field | No | Remove all code that reads the field first; deploy; then remove from documents |
| Change a field's type | No | Treat as rename — migrate data, deploy new field, remove old field in separate steps |
| Change status enum values | No | Update security rules + all UI components atomically |

### Handling Existing Documents During Schema Changes

If a new required field is added (e.g. a future `category` field on wishes), existing
documents will not have it. Reads must handle this:

```ts
// Defensive read pattern for fields added after initial schema
const category = wishData.category ?? 'uncategorised'
```

No automated migration tooling is implemented in MVP. Migrations are run manually
via a one-off script executed against the Firebase Admin SDK from a local machine.

---

## 12. Performance Optimisation

### Latency-Critical Operations

| Operation | Target | Approach |
|---|---|---|
| Auth initialisation on app launch | Under 500ms | Firebase SDK caches auth state locally — `onAuthStateChanged` resolves from cache on returning users |
| Home screen wish list load | Under 1 second | Firestore offline persistence serves cached data instantly; network fetch updates in background |
| Wish detail load | Under 500ms | Single `getDoc` call; cached by Firestore offline persistence |
| Upload start feedback | Under 200ms | Upload overlay appears immediately on button tap; actual upload starts asynchronously |

### Expensive Operations

| Operation | Why Expensive | Mitigation |
|---|---|---|
| Video upload (up to 20MB) | Large file over mobile data | Compress to under 20MB before upload; show progress bar; allow cancel |
| Admin full wish list load | Could be a large Firestore query if many wishes accumulate | Paginate at 20 wishes per page; filter by status to reduce result set |
| Thumbnail generation | CPU-intensive canvas operation on the device | Run in a short `setTimeout` to yield to the UI thread before starting |

### Query Optimisation

Two compound Firestore indexes are required and must be created in the Firebase
Console before deploying:

| Collection | Fields Indexed | Used By |
|---|---|---|
| `wishes` | `uid` ASC + `createdAt` DESC | User home screen wish list |
| `wishes` | `status` ASC + `createdAt` ASC | Admin pending queue (oldest first) |

Without these indexes, Firestore will reject the compound queries and log an error
with a direct link to create the missing index.

### Pagination

The wish list uses Firestore cursor-based pagination:

```ts
// Load first page
const first = query(
  collection(db, 'wishes'),
  where('uid', '==', uid),
  orderBy('createdAt', 'desc'),
  limit(10)
)

// Load next page (pass last document snapshot as cursor)
const next = query(
  collection(db, 'wishes'),
  where('uid', '==', uid),
  orderBy('createdAt', 'desc'),
  startAfter(lastDocumentSnapshot),
  limit(10)
)
```

At 6 users submitting a few wishes each, pagination is not practically needed but
is implemented correctly from the start — it costs nothing and demonstrates
production-aware thinking in the portfolio.

---

## 13. Testing Strategy

### What Requires Unit Tests

Unit tests live in `/tests/unit/` and use **Vitest** with the **Firebase JS SDK
mocked** (using `vitest-mock-firebase` or manual mock factories).

| Test Target | What to Test |
|---|---|
| `AuthService` | `signInAnonymously` creates user document with correct shape; `updateLastSeen` writes correct timestamp |
| `WishService` | `createWish` writes correct Firestore document; `getUserWishes` listener returns typed documents; `getWishById` returns null for non-existent doc |
| `UploadService` | Upload failure triggers retry up to 3 times; retry uses same `wishId`; cancel stops upload task |
| `AdminService` | `updateWishStatus` throws when current status is not `pending`; `deleteWish` calls both Storage deletes and Firestore delete in correct order |
| `NotificationService` | `registerToken` saves token to correct Firestore path |

### What Requires Integration Tests

Integration tests use the **Firebase Local Emulator Suite**
(`firebase emulators:start`) to run a real Firestore and Storage instance locally.

| Test Target | What to Test |
|---|---|
| Firestore security rules | User cannot read another user's wishes; user cannot set `role: 'admin'`; admin can read all wishes; status transition rules enforce one-way flow |
| Storage security rules | User cannot upload to another user's path; file size limit is enforced; non-video MIME type is rejected |
| End-to-end wish creation | Upload video → upload thumbnail → write Firestore document — all three succeed and document shape is correct |
| Admin delete flow | Firestore delete + both Storage deletes are all called in correct order |

### Business Rules That Must Never Regress

These specific behaviours must be covered by tests and must never be broken by a
future change:

1. **A user cannot read another user's wish** — Firestore rules integration test
2. **Status can only transition from pending** — unit test on `AdminService` +
   Firestore rules integration test
3. **A wish document is only written after both Storage uploads succeed** —
   integration test on the full upload flow
4. **Admin delete removes both the Firestore document and both Storage files** —
   unit test on `AdminService.deleteWish` verifying all three delete calls are made
5. **A user cannot create a wish attributed to a different uid** — Firestore rules
   integration test