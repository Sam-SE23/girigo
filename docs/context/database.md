# database.md — Girigo App Data Layer

---

## Framing Note

Girigo uses **Cloud Firestore** as its database — a NoSQL document store managed
entirely by Google. This document covers the data layer as it actually exists:
Firestore collections, document schemas, query patterns, indexes, and the
constraints enforced by TypeScript and Firestore security rules. Concepts from
relational database design (foreign keys, JOIN queries, migration tools, isolation
levels) either don't apply or are reframed in Firestore terms throughout.

---

## 1. Data Model Overview

### Primary Use Cases Driving Data Access

| Use Case | Operation | Frequency |
|---|---|---|
| User opens app — auth state resolved | Read `/users/{uid}` | Every app launch |
| Home screen loads wish list | Query `wishes` where `uid ==` current user | Every home screen visit |
| User submits a wish | Write `/wishes/{wishId}` | A few times per user total |
| User opens wish detail | Read `/wishes/{wishId}` | On tap from home screen |
| Admin views pending queue | Query `wishes` where `status == 'pending'` | Admin sessions only |
| Admin updates wish status | Transaction on `/wishes/{wishId}` | Once per wish reviewed |
| Real-time status update on user device | `onSnapshot` listener on `wishes` | Continuous during active session |
| Push token registration | Write `/users/{uid}.pushToken` | Each app launch (token may rotate) |

### Read/Write Balance

**Read-heavy.** The dominant operation is reading wish documents — users checking
their wish list, the real-time listener keeping statuses current, and the admin
loading the pending queue. Writes are infrequent: one write per wish creation, one
update per admin review, and periodic `lastSeen` and `pushToken` updates on user
documents.

### Critical Queries the System Must Support

| Query | Collection | Filters | Order |
|---|---|---|---|
| User's own wishes | `wishes` | `uid == currentUid` | `createdAt` DESC |
| Admin pending queue | `wishes` | `status == 'pending'` | `createdAt` ASC (oldest first) |
| Single wish detail | `wishes` | document ID lookup | N/A |
| User profile | `users` | document ID lookup | N/A |

### What Would Be Unacceptably Slow If Designed Poorly

- **Wish list load on Home screen**: if the query required a full collection scan
  without an index, it would degrade proportionally to total wishes in the database.
  Compound indexes prevent this — see Section 7.
- **Real-time status updates**: if implemented via polling instead of `onSnapshot`,
  the user would see stale status for long periods and the app would make wasteful
  repeated reads. Firestore's real-time listener is the correct pattern.
- **Admin wish queue**: if the admin had to load all wishes and filter client-side,
  performance would degrade as the wish count grew. Server-side filtering with an
  index prevents this.

---

## 2. Core Entities and Schema Design

### Entities and Their Responsibilities

**`User`** — represents any person who has opened the app. Always an anonymous
Firebase Auth user in MVP. Created once on first launch. Holds identity, display
name, push token, and role.

**`Wish`** — the core domain object. Represents a single recorded video wish
submitted by a user. Holds the video reference, text, status, and admin response.
Self-contained — does not require joining with the user document to display.

### Full Schema

**Collection: `users` — path: `/users/{uid}`**

| Field | Type | Required | Description |
|---|---|---|---|
| `uid` | `string` | Yes | Firebase Auth UID — matches the document ID |
| `username` | `string` | Yes | Generated display name (e.g. `phantom_38291`) |
| `createdAt` | `Timestamp` | Yes | Set on document creation, never updated |
| `lastSeen` | `Timestamp` | Yes | Updated on each app resume |
| `pushToken` | `string` | Yes | FCM device token for push notification delivery |
| `role` | `'user' \| 'admin'` | Yes | Access level — set manually in Firebase Console for admin |
| `pinHash` | `string` | No | SHA-256 hash of admin PIN — only present on admin user documents |

**Collection: `wishes` — path: `/wishes/{wishId}`**

| Field | Type | Required | Description |
|---|---|---|---|
| `wishId` | `string` | Yes | Client-generated UUID — matches the document ID |
| `uid` | `string` | Yes | UID of the user who submitted the wish |
| `username` | `string` | Yes | Display name copied from user document at submission time |
| `wishText` | `string` | Yes | Optional text typed by user — empty string `''` if skipped |
| `videoUrl` | `string` | Yes | Firebase Storage download URL for the video file |
| `thumbnailUrl` | `string` | Yes | Firebase Storage download URL for the thumbnail image |
| `status` | `'pending' \| 'granted' \| 'rejected'` | Yes | Current lifecycle state |
| `createdAt` | `Timestamp` | Yes | Set at document creation, never updated |
| `grantedAt` | `Timestamp \| null` | Yes | Set when status changes to `granted` or `rejected`; null while pending |
| `adminMessage` | `string \| null` | Yes | Optional message from admin — null until reviewed |
| `viewed` | `boolean` | Yes | Whether the user has opened the wish detail after a status change |

### Relationships

| Relationship | Type | How Expressed in Firestore |
|---|---|---|
| User → Wishes | 1:N (one user, many wishes) | `uid` field on each wish document references the user's document ID |
| Wish → User | N:1 (many wishes, one user) | `uid` field on wish document |

Firestore does not enforce referential integrity. There are no foreign key constraints
in the relational sense. The `uid` field on a wish document is a logical reference
to a user document — it is validated at write time by the security rules
(`request.resource.data.uid == request.auth.uid`) but not by the database engine.

There are no many-to-many relationships in this data model.

### Normalisation vs Denormalisation

Firestore does not support JOIN queries. To display a wish without a separate user
document fetch, the `username` field is **denormalised** — copied from the user
document onto every wish document at creation time.

| Denormalised Field | Lives On | Copied From | Consistency Risk |
|---|---|---|---|
| `username` | `wishes` document | `users/{uid}.username` | Low — usernames are generated once and never changed in MVP. If username changes were supported, all wish documents for that user would need a batch update. |

No other user data is denormalised onto wish documents. The `uid` alone is sufficient
to cross-reference the user document in the rare case both are needed simultaneously.

---

## 3. Constraints and Invariants

### Document-Level Constraints

| Entity | Field | Constraint | Enforced At |
|---|---|---|---|
| `users` | `uid` | Must match the Firebase Auth UID and the Firestore document ID | Security rules + TypeScript |
| `users` | `role` | Must be exactly `'user'` or `'admin'` | TypeScript type system; security rules prevent self-escalation |
| `wishes` | `wishId` | Must match the Firestore document ID | TypeScript at write time |
| `wishes` | `uid` | Must match the authenticated user's UID | Security rules: `request.resource.data.uid == request.auth.uid` |
| `wishes` | `videoUrl` | Must be non-empty string at creation | Security rules: `request.resource.data.videoUrl != ''` |
| `wishes` | `thumbnailUrl` | Must be non-empty string at creation | Security rules: `request.resource.data.thumbnailUrl != ''` |
| `wishes` | `status` | Must be `'pending'` at creation | TypeScript at write time; service layer sets it |
| `wishes` | `status` | Transitions only: `pending → granted` or `pending → rejected` | Security rules + Firestore transaction in `AdminService` |
| `wishes` | `createdAt` | Set once at creation, never updated | TypeScript — `createdAt` is not included in any update operation |

### What Happens if Constraints Fail

- **TypeScript violations**: caught at compile time — the code will not build
- **Security rule violations**: Firestore rejects the write and returns a
  `permission-denied` error; the service layer catches this and throws a
  human-readable message to the store
- **Transaction conflicts**: if a concurrent write modifies a document during a
  transaction, Firestore retries the transaction automatically up to 5 times before
  failing; the service layer catches the final failure and surfaces a retry message

### Uniqueness

Firestore document IDs are globally unique within a collection. Since `wishId` matches
the document ID (a client-generated UUID), and `uid` matches the Firebase Auth UID
(also globally unique), the uniqueness constraints that matter are enforced by these
identifiers.

`username` is **not enforced as globally unique** at the database level. Usernames
are display labels generated with sufficient entropy (format: `word_word_NNNNN`) that
the probability of collision across 6 users is negligible. The `uid` is the true
identity — `username` is cosmetic.

---

## 4. Data Lifecycle and State Transitions

### User Document Lifecycle

```
App first launch
  → signInAnonymously() → Firebase Auth UID issued
  → createUser() → /users/{uid} document created
  → Document is never recreated — same document for the lifetime of the install

App resumed
  → updateLastSeen() → lastSeen field updated
  → registerToken() → pushToken field updated if rotated

[No user-initiated deletion in MVP]
[No account merge or upgrade in MVP]
```

The user document is created once and incrementally updated. It is never deleted
or replaced.

### Wish Document Lifecycle

```
User records and submits wish
  → Storage uploads complete (video + thumbnail)
  → createWish() → /wishes/{wishId} created with status: 'pending'

Admin reviews wish
  → updateWishStatus() → status transitions to 'granted' or 'rejected'
  → grantedAt set to current timestamp
  → adminMessage set (optional)
  → [status is now terminal — no further transitions]

User views updated wish
  → viewed field updated to true

[Optional] Admin deletes wish
  → deleteWish() → Firestore document deleted → Storage files deleted
```

### Valid State Transitions

```
[Created]  →  pending
pending    →  granted   (admin action)
pending    →  rejected  (admin action)
granted    →  [terminal — no further transitions]
rejected   →  [terminal — no further transitions]
```

A wish in `granted` or `rejected` state cannot transition to any other state.
This is intentional — it matches the "irreversible wish" mental model and prevents
confusing repeated notifications to users.

### What "Update" Means for Each Entity

**User document updates:**
- `lastSeen` — updated every app resume (background → foreground)
- `pushToken` — updated when FCM rotates the device token
- `pinHash` — set once manually when admin account is configured

Fields that are **never updated** after creation: `uid`, `username`, `createdAt`,
`role` (role changes are manual via Firebase Console only).

**Wish document updates:**
- `status` — updated once by admin (terminal)
- `grantedAt` — updated once when status changes (terminal)
- `adminMessage` — updated once when status changes (terminal)
- `viewed` — updated when user opens the wish detail after a status change

Fields that are **never updated** after creation: `wishId`, `uid`, `username`,
`wishText`, `videoUrl`, `thumbnailUrl`, `createdAt`.

### Deletion Strategy

**Hard delete only.** There is no soft delete (`deleted: true` flag) in this
application.

| Entity | Deletable? | By Whom | What Gets Deleted |
|---|---|---|---|
| User document | No | — | User documents are never deleted in MVP |
| Wish document | Yes | Admin only | Firestore document + `/wishVideos/{uid}/{wishId}.mp4` + `/thumbnails/{uid}/{wishId}.jpg` |

**Cascade behaviour on wish deletion:** The Firestore document and both Storage files
are deleted in a single `AdminService.deleteWish()` call. Deletion order is Firestore
document first, then Storage files — see `backend.md` Section 3 for the ordering
rationale.

**What happens to a user's wishes if their Auth account were deleted:**
Anonymous Firebase Auth users are not deleted programmatically in MVP — there is no
account deletion feature. If a user's Auth account were manually deleted from the
Firebase Console, their wish documents would remain in Firestore (orphaned, no longer
readable by a valid user). At 6 users this is not a practical concern. A future
cleanup Function could handle this if needed.

### Data Retention

No retention policy is implemented in MVP. Data is kept indefinitely until:
- The Firebase free tier Storage limit (5GB) is approached — manual cleanup via
  Firebase Console
- The project is decommissioned

At current scale (6 users, ~10 wishes each at 20MB per video):
estimated Storage usage ≈ 1.2GB — within the 5GB free limit.
Firestore document storage for 60 documents ≈ ~60KB — negligible.

---

## 5. Transactions and Atomicity

### Operations That Require Transactions

Only one operation in the MVP requires a Firestore transaction:
**`AdminService.updateWishStatus()`**

This operation must be atomic because it is a **read-modify-write**: it reads the
current status to verify it is `'pending'`, then writes the new status. Without a
transaction, two concurrent admin sessions (extremely unlikely with one admin, but
handled correctly regardless) could both read `status: 'pending'` and both write
updates, resulting in the second write overwriting the first.

```ts
await runTransaction(db, async (transaction) => {
  const wishRef = doc(db, 'wishes', wishId)
  const snap = await transaction.get(wishRef)

  if (!snap.exists()) throw new Error('Wish not found.')
  if (snap.data().status !== 'pending') {
    throw new Error('This wish has already been reviewed.')
  }

  transaction.update(wishRef, {
    status: newStatus,
    adminMessage: adminMessage ?? null,
    grantedAt: serverTimestamp(),
  })
})
```

### Operations That Are Idempotent Without Transactions

All other write operations use `setDoc` or `updateDoc` with known document IDs
and are safe to retry without transactions:

| Operation | Why Safe Without Transaction |
|---|---|
| `createWish` | `setDoc` with UUID — retrying overwrites with the same data |
| `createUser` | `setDoc` with uid — retrying overwrites with the same data |
| `updateLastSeen` | Non-critical timestamp field — last writer wins is acceptable |
| `registerToken` | FCM token field — last writer wins is correct behaviour |

### Operations That Span Firebase Storage and Firestore

The wish creation flow spans two services that cannot share a transaction:
Firebase Storage and Firestore. This is handled by deliberate **operation ordering**
rather than a transaction — see `backend.md` Section 3 for the full rationale and
failure mode analysis.

### Isolation Level

Firestore transactions provide **serialisable isolation** for document-level
operations within a transaction. Outside of transactions, Firestore provides
**read-your-own-writes consistency** and **strong consistency for single-document
reads**. Multi-document queries are **eventually consistent**.

### Acceptable Anomalies

| Anomaly | Acceptable? | Why |
|---|---|---|
| Stale wish list (seconds behind) | Yes | Real-time listener resolves within seconds |
| Two reads of the same wish returning different statuses briefly | Yes | Transient during propagation — listener corrects immediately |
| Orphaned Storage files after failed wish creation | Yes | Invisible to users, manually cleanable, negligible cost |

---

## 6. Concurrency and Consistency

Covered in full in `backend.md` Section 4 and `design.md` Section 8. Summary for
the data layer specifically:

### Locking Strategy

**Optimistic concurrency** via Firestore transactions. The transaction reads the
current document state, validates it, and conditionally writes. If a concurrent
modification occurs between the read and the write, Firestore detects the conflict
and retries the transaction automatically (up to 5 times).

There is no pessimistic locking. Firestore does not support row-level locks in the
traditional sense.

### Concurrent Write Scenarios

| Scenario | Handling |
|---|---|
| Admin updates wish status simultaneously from two sessions | Transaction detects conflict; second write is retried; second attempt reads the already-updated status and throws "already reviewed" to the admin |
| User submits two wishes simultaneously | Not possible — submit button is disabled immediately on first tap |
| User's `lastSeen` updated from two app instances | Last writer wins — acceptable for a non-critical timestamp |
| FCM token written while auth is refreshing | Last writer wins — the latest token is always correct |

### Where Eventual Consistency Is Acceptable

| Data | Tolerance |
|---|---|
| Wish list ordering on Home screen | A few seconds — `onSnapshot` keeps it near-current |
| Wish status on detail screen | A few seconds — `onSnapshot` listener |
| Admin wish queue contents | A few seconds — `onSnapshot` listener |
| User `lastSeen` timestamp | Minutes to hours — not user-visible in MVP |

---

## 7. Query Patterns and Performance

### Most Frequent Queries

| Query | Trigger | Expected Frequency |
|---|---|---|
| User's wish list | Home screen load + real-time listener | Continuous during active session |
| Single wish document | Wish detail screen open | On user tap |
| User profile document | App launch | Once per session |
| Admin pending queue | Admin panel open | Admin sessions only |

### Required Compound Indexes

Firestore automatically indexes every field individually. Compound queries (multiple
`where` clauses or `where` + `orderBy` on different fields) require explicit compound
indexes created in the Firebase Console or `firestore.indexes.json`.

| Index | Collection | Fields | Query It Supports |
|---|---|---|---|
| User wish list | `wishes` | `uid` ASC, `createdAt` DESC | Home screen: user's wishes newest-first |
| Admin pending queue | `wishes` | `status` ASC, `createdAt` ASC | Admin queue: pending wishes oldest-first |

**These indexes must be created before deploying** — Firestore rejects the compound
queries without them and logs an error message containing a direct link to create
the missing index in the Firebase Console.

**`firestore.indexes.json`** (committed to the repository):
```json
{
  "indexes": [
    {
      "collectionGroup": "wishes",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "uid", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "wishes",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "ASCENDING" }
      ]
    }
  ]
}
```

### Single-Field Indexes (Automatic)

Firestore creates these automatically — no manual configuration needed:

| Field | Collection | Used By |
|---|---|---|
| `uid` | `wishes` | Security rules reads |
| `status` | `wishes` | Admin status filter |
| `createdAt` | `wishes` | Order-only queries |

### Pagination

Wish list queries use cursor-based Firestore pagination with `limit(10)` and
`startAfter(lastDocumentSnapshot)`. This prevents loading the entire wish collection
on each query and scales correctly regardless of how many wishes accumulate.

At 6 users each submitting 10 wishes, pagination fires only on the second page
(11+ wishes for a single user) — essentially never in practice. It is implemented
correctly from the start as a portfolio quality signal.

### Queries That Could Degrade Over Time

| Query | Degradation Risk | Mitigation |
|---|---|---|
| Admin full wish queue | Grows with total wishes across all users | Paginate admin queue at 20 items per page; filter by status to limit result set |
| User wish list | Grows with user's personal wish count | Pagination with `limit(10)` per page |

Both are mitigated. At this project's scale, neither will realistically degrade.

---

## 8. Scaling Strategy

This section is intentionally brief. Girigo is a portfolio project with six users.
Scaling is not a current concern. Firebase's infrastructure scales automatically
with no configuration changes required.

### Expected Data Size

| Timeframe | Firestore Documents | Storage (Videos + Thumbnails) |
|---|---|---|
| End of MVP testing (6 users, ~10 wishes each) | ~66 documents | ~1.2GB video + ~6MB thumbnails ≈ 1.21GB |
| 1 month | ~66 documents | ~1.21GB |
| 1 year | ~66 documents (no new users planned) | ~1.21GB |

All values are well within the Firebase free Spark plan limits:
- Firestore: 1GB storage free — 66 documents ≈ 66KB (0.007% utilised)
- Storage: 5GB free — 1.21GB (24% utilised)

### What Breaks First If the App Were to Grow

1. **Firebase Storage egress (video downloads)**: free tier allows 1GB/day outbound.
   Video streaming at scale exceeds this quickly.
2. **Firebase free tier read quota**: 50,000 reads/day free. At hundreds of active
   users with real-time listeners, this would be reached.
3. **Firebase Functions absence**: automated server-side logic (notifications,
   moderation) requires upgrading to the Blaze plan before adding real users.

### Scaling Path (Future Reference)

No changes to the data model or app architecture would be needed to scale. Firebase
scales horizontally by default. Upgrading to the Blaze plan removes quota limits
and unlocks Firebase Functions for server-side logic.

---

## 9. Caching and Read Optimisation

### Caching Layers

| Layer | Mechanism | What Is Cached | Invalidation |
|---|---|---|---|
| Firestore SDK offline persistence | On-device SQLite (managed by SDK) | All documents fetched during the session | SDK manages automatically — latest server data always wins |
| Pinia stores (in-memory) | `ref()` and `computed()` in stores | Wish list, user profile, admin wish queue | Cleared on app restart; updated by `onSnapshot` events during session |
| Firebase Storage CDN | HTTP cache on Firebase's CDN | Video and thumbnail files | Immutable files — never invalidated (same `wishId` path always serves the same file) |
| `@capacitor/preferences` | OS key-value store | `uid`, `username`, onboarding state | Manual write on change; read on every launch |

### Firestore Offline Persistence

Enabled at SDK initialisation:

```ts
import { initializeFirestore, persistentLocalCache } from 'firebase/firestore'

const db = initializeFirestore(app, {
  localCache: persistentLocalCache()
})
```

With offline persistence enabled:
- Wish list loads instantly from the on-device cache on every app open, even offline
- Network fetch runs in the background and updates the UI via `onSnapshot` when
  new data arrives
- Writes made while offline are queued locally and synced when connectivity returns

### On Cache Miss

- **Firestore**: SDK fetches from server; Pinia store's `isLoading` flag shows a
  loading skeleton in the UI while the fetch completes
- **Storage (thumbnails)**: CDN fetches from Firebase Storage origin; loading
  placeholder shown until image loads; `loading="lazy"` defers off-screen fetches

### On Stale Cache

- **Firestore**: Real-time `onSnapshot` listeners ensure the Pinia store is updated
  within seconds of any server-side change. Stale data is self-healing.
- **Storage thumbnails and videos**: Files are immutable — the content at a given
  Storage path never changes after upload. Staleness is not possible.
- **`@capacitor/preferences`**: `uid` and `username` are written once and never
  change. Staleness is not possible.

---

## 10. Migrations and Schema Evolution

### No Migration Tooling

There is no Flyway, Liquibase, or custom migration runner for Firestore. Firestore
does not enforce a schema at the database level — it accepts any valid JSON document
structure. Schema is enforced by the TypeScript interfaces and security rules in the
application layer.

All schema changes are applied manually via one-off scripts run against the Firebase
Admin SDK, or by updating the application code to write new fields going forward and
read defensively.

### Schema Change Policies

| Change Type | Safe? | Deployment Process |
|---|---|---|
| **Add optional field** | Yes | Add to TypeScript interface with `?` suffix; update service methods to write the new field on new documents; read with nullish coalescing (`?? defaultValue`) to handle existing documents that lack it |
| **Add required field to new documents** | Yes with defensive reads | Set in creation service methods; existing documents won't have it; always read with `?? null` until all documents have been backfilled |
| **Rename a field** | No — breaking | (1) Add new field name to all service writes; (2) deploy; (3) run backfill script to populate new field on existing documents; (4) update all reads to use new field name; (5) deploy; (6) run cleanup script to remove old field |
| **Remove a field** | No — breaking | (1) Remove all code that reads the field; (2) deploy; (3) run script to delete field from all documents |
| **Change a field's type** | No — breaking | Treat as rename — migrate data to a new field with the new type, then remove the old field in a separate deployment |
| **Change status enum** | No — breaking | Update TypeScript types + security rules + all UI components that reference the value, deploy atomically |

### Backward Compatibility

The application reads all optional or future fields with nullish coalescing:

```ts
// Defensive read — handles documents created before 'viewed' field was added
const viewed = wishData.viewed ?? false
```

This means a new version of the app can be deployed before all existing Firestore
documents have been backfilled with the new field. Old documents are handled
gracefully by the new code.

### No Downtime Migrations

Firestore is a live database — there is no "migration lock" and no downtime during
a schema change. The deployment process for breaking changes uses the additive
approach above (add → backfill → remove in separate steps) to ensure old app
versions and new app versions can coexist against the same database during a rollout.

At this project's scale (66 documents), any backfill script runs in under a second.

### Rollback

If a newly deployed schema change causes issues:
1. Revert the app code to the previous version (GitHub Actions supports this via
   re-running a previous release tag)
2. If new fields were written to Firestore, run a cleanup script to remove them
3. The previous app version reads the old field names and ignores new ones — backward
   compatibility is maintained by the defensive read pattern above

---

## 11. Data Integrity and Validation

### Validation Layers

| Layer | What It Validates | When It Runs |
|---|---|---|
| TypeScript type system | Shape of all Firestore read/write objects against `WishDocument` and `UserDocument` interfaces | Compile time |
| Service layer guard checks | Required fields are present and non-empty; character limits not exceeded; status transition is valid | Runtime, before Firebase SDK call |
| Firestore security rules | `uid` matches authenticated user; `videoUrl` and `thumbnailUrl` are non-empty; status transition is `pending → granted/rejected`; role cannot be self-escalated | Runtime, server-side |
| Firebase Storage security rules | File size ≤ 20MB; MIME type matches `video/*`; upload path matches authenticated user's `uid` | Runtime, server-side |

### Detecting Inconsistent Data

Signs of inconsistent data that could be spotted via the Firebase Console:
- A `wishes` document where `videoUrl` is an empty string (should be rejected by
  security rules — indicates a rules deployment was missed)
- A `wishes` document where `status` is `'granted'` but `grantedAt` is `null`
  (indicates a partial write — `AdminService.updateWishStatus` sets both atomically)
- A `wishes` document with a `uid` that has no corresponding `/users/{uid}` document
  (orphaned wish from a deleted auth account)

### Repairing Inconsistent Data

At this project's scale, repair is done manually via the Firebase Console data editor
or a one-off Admin SDK script run locally. No automated repair tooling is needed.

---

## 12. Auditing and History Tracking

### MVP Approach: Lightweight, No Formal Audit Log

A formal audit log (separate Firestore collection recording every admin action with
actor, timestamp, and before/after state) is **not implemented in MVP**. For a
portfolio project with one admin and six users, the overhead of designing, writing,
and maintaining an audit collection produces no practical benefit.

The existing wish document fields provide a lightweight natural audit trail:

| Event | Evidence In Data |
|---|---|
| Wish submitted | `wishes/{wishId}.createdAt` |
| Admin reviewed wish | `wishes/{wishId}.grantedAt` (timestamp of review) |
| Status set by admin | `wishes/{wishId}.status` |
| Message sent by admin | `wishes/{wishId}.adminMessage` |

This is sufficient for the portfolio MVP.

### Future: Formal Audit Log

If the app ever moved to real users and required accountability tracking, an `auditLog`
collection would be the correct addition:

```ts
// Future: /auditLog/{eventId}
interface AuditEvent {
  eventId: string
  adminUid: string
  action: 'status_updated' | 'wish_deleted' | 'notification_sent'
  wishId: string
  previousValue: string | null
  newValue: string | null
  timestamp: Timestamp
}
```

This is not built in MVP — the architecture supports adding it without changes to
existing collections.

---

## 13. Backup and Recovery

### Backup on the Free Spark Plan

**Automated Firestore backups are not available on the free Spark plan.** This is a
known limitation. For a portfolio project, data loss is acceptable — the app can be
re-seeded with test data if needed.

Manual backup options:

| Method | How | Frequency |
|---|---|---|
| Firebase Console export | Firebase Console → Firestore → Import/Export → Export | Manual, on-demand |
| `gcloud` CLI export | `gcloud firestore export gs://[BUCKET]` | Manual, on-demand |
| Storage files | Download from Firebase Console Storage browser | Manual, on-demand |

For MVP: no scheduled backups. Export manually before any significant schema change.

### Recovery Time Objective (RTO) and Recovery Point Objective (RPO)

| Metric | Value | Rationale |
|---|---|---|
| RTO | Hours | Portfolio project — a few hours of recovery time is acceptable |
| RPO | Last manual export | No automated backups — data since the last manual export could be lost |

### Recovery Process

In the event of data loss or corruption:

1. If a recent manual export exists: import via Firebase Console → Firestore →
   Import/Export → Import, pointing to the export bucket
2. If no export exists: recreate the Firebase project, re-deploy security rules and
   indexes, re-distribute the APK — users re-onboard as new anonymous users
3. Storage video files: not recoverable without a manual download backup — acceptable
   for a portfolio project

### Backup Verification

Manual spot-check: after any schema-changing operation, open the Firebase Console
and verify a sample of documents have the expected structure. No automated backup
verification tooling is implemented.

---

## 14. Security and Data Protection

### Sensitive Data Classification

| Data | Sensitivity | Protection |
|---|---|---|
| Video files | Medium — personal recordings | Firebase Storage access rules restrict reads to the owner's `uid` and admins only |
| Wish text | Low-Medium — personal expression | Firestore rules restrict reads to owner and admins only |
| User `uid` | Low — not a secret, but identifies a user | Never exposed in UI to other users; Firestore rules prevent cross-user access |
| Firebase Auth token | High — grants API access | Managed entirely by Firebase JS SDK; never accessed or stored manually by the app |
| Admin `pinHash` | Medium | Stored as SHA-256 hash; never stored in plain text; lives in admin's Firestore user document |
| FCM push token | Low-Medium — could be used to send notifications | Stored in Firestore; readable only by the token owner and admins via security rules |

### Encryption

| Layer | Encryption |
|---|---|
| Data in transit | All Firebase SDK communications use HTTPS/TLS — enforced by Firebase infrastructure |
| Firestore data at rest | AES-256 encryption — managed by Google, not configurable |
| Firebase Storage at rest | AES-256 encryption — managed by Google |
| `@capacitor/preferences` at rest | iOS: NSUserDefaults (not encrypted); Android: SharedPreferences (not encrypted). No sensitive data is stored here — only `uid`, `username`, and onboarding state. |

### Access Control Summary

| Data | Who Can Read | Who Can Write |
|---|---|---|
| `/users/{uid}` | Owner (matching uid), Admin | Owner (own fields only), Admin |
| `/wishes/{wishId}` | Owner (matching uid), Admin | Owner (create only), Admin (update status, delete) |
| `/wishVideos/{uid}/` | Owner (matching uid), Admin | Owner (matching uid) only |
| `/thumbnails/{uid}/` | Owner (matching uid), Admin | Owner (matching uid) only |

All access control is enforced server-side by Firebase security rules — see the
full rules in `backend.md` Section 5.

### Preventing Data Leaks

- Users cannot query wishes belonging to other users — the `where('uid', '==', currentUid)` filter is enforced by security rules, not just applied client-side
- No user-identifiable data (uid, username, wish content) is logged to any external
  service other than Firebase Crashlytics, which is covered by Google's privacy policy
- Firebase Analytics tracks anonymous usage events only — no personal data is sent

---

## 15. Multi-Environment Strategy

### One Environment by Design

Girigo uses **one Firebase project for all environments** (local development, device
testing, and production distribution). This is an intentional trade-off documented
in `design.md` and `tech-stack.md`.

**Why one environment is acceptable here:**
- Solo developer — no risk of one developer's test data corrupting another's
- Six total users — no production data worth protecting from test interference
- Portfolio project — environment separation complexity adds no portfolio value

### Development Data vs Production Data

There is no formal separation. The developer's test wishes during development exist
in the same Firestore database as any wishes submitted by the six test users.

**Practical approach:** The developer uses a separate anonymous auth session on
their development device. Test wishes are identifiable by their `username`
(the developer knows which uid is theirs) and can be deleted via the admin panel
if needed.

### Seeding Test Data

No automated seed data process. Test data is created by:
1. Running `ionic serve` and using the app normally to submit test wishes
2. Using the Firebase Console to manually write a document with specific field values
   for edge case testing

### Future: Separate Environments

If the app ever moved toward real users, the correct approach would be:
- One Firebase project for `dev` (local development)
- One Firebase project for `staging` (integration testing)
- One Firebase project for `production` (real users)

Each project has its own Firestore database, Storage bucket, and Auth namespace —
complete data isolation.

---

## 16. Observability for the Data Layer

### Metrics Tracked

| Metric | Tool | Where to Find |
|---|---|---|
| Firestore daily read count | Firebase Console | Usage tab → Cloud Firestore |
| Firestore daily write count | Firebase Console | Usage tab → Cloud Firestore |
| Firestore storage used | Firebase Console | Usage tab → Cloud Firestore |
| Storage total files and size | Firebase Console | Storage browser |
| Slow Firestore operations | Firebase Console | Performance tab (if Firebase Performance SDK added) |
| Free tier quota proximity | Firebase Console | Usage and billing |

### Detecting Performance Degradation

At six users, performance degradation from query volume is not a realistic concern.
The most likely performance issue is a **missing compound index** — Firestore rejects
the query and the Firebase Console logs an error with a direct link to create the
missing index.

If a query is slow despite correct indexes:
1. Open Firebase Console → Firestore → Indexes — verify both compound indexes exist
   and are in "Enabled" state (not "Building")
2. Check the query in `ionic serve` → Chrome DevTools → Network tab — Firebase SDK
   requests are visible; examine response time
3. Verify the query uses the correct filter/orderBy combination that matches the
   compound index definition

### Tracing a Slow Query to Code

All Firestore queries are in the services layer (`/src/services/`). The one-to-one
mapping between service methods and Firestore operations (established in `backend.md`
Section 1) means any slow query can be traced directly to the service method that
executes it. No query is constructed in a component or store — the services layer
is the only place to look.