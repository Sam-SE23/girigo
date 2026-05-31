# design.md — Girigo App Architecture

---

## 1. Architecture Decision Record (ADR)

### Options Considered

| Option | Description |
|---|---|
| **Firebase BaaS (chosen)** | Use Firebase Auth, Firestore, Storage, and FCM directly from the client via the Firebase JS SDK. No custom server. |
| Custom backend (Node.js + Express + PostgreSQL) | Build a REST API server, manage a database, deploy to a cloud provider. |
| Supabase | Open-source Firebase alternative with PostgreSQL under the hood. |

### Evaluation Criteria

| Criterion | Weight for this project |
|---|---|
| Cost | High — must stay on free tier throughout |
| Solo developer complexity | High — one developer with no DevOps background |
| Time to MVP | High — portfolio project, speed matters |
| Scale requirements | None — maximum 6 users |
| Mobile SDK quality | High — must integrate well with Capacitor/Vue |

### Why Firebase Was Chosen

Firebase's free Spark plan covers Auth, Firestore, Storage, and FCM with generous limits that a 6-user portfolio project will never exceed. The Firebase JS SDK integrates directly into the Vue app with no custom server layer, eliminating deployment, hosting, and infrastructure concerns entirely. Built-in security rules replace the need for a custom authorization layer.

### Known Drawbacks

- **Vendor lock-in**: All data, auth, and storage lives in Google's infrastructure. Migrating away later is non-trivial.
- **Firestore query limitations**: No complex joins, no full-text search, limited compound queries without composite indexes.
- **Firebase Functions unavailable on free tier**: The Spark plan does not support Cloud Functions. Any server-side logic (e.g. automated notifications) cannot be implemented without upgrading to the Blaze pay-as-you-go plan.
- **Eventual consistency**: Firestore is not strongly consistent across all read paths. Acceptable for this use case, but worth knowing.

### What We Are Explicitly Rejecting and Why

| Rejected Option | Reason |
|---|---|
| Custom Node.js backend | Requires server hosting, deployment pipeline, database management — all overkill for a 6-user portfolio project |
| Supabase | Less mature mobile SDK, more complex local setup, no meaningful advantage over Firebase at this scale |
| Firebase Functions | Not available on the free Spark plan. Admin actions are handled manually via the in-app admin dashboard instead. |
| Separate web admin dashboard | Second codebase with zero benefit — the developer is the only admin and has access to the in-app hidden admin panel |

### Conditions for Revisiting This Decision

- If the app grows beyond Firebase free tier limits (unlikely for a portfolio project, but worth noting)
- If complex server-side logic is needed (e.g. AI moderation, automated wish processing) — this would require upgrading to Blaze or moving to a custom backend
- If strong data consistency becomes a requirement

---

## 2. System Context

### Actors

| Actor | Description |
|---|---|
| Anonymous User | Any person who installs the app. Authenticated via Firebase anonymous auth on first launch. Can record and upload wishes, view their own wish status, receive push notifications. |
| Admin User | The developer (or a designated admin). Identified by a `role: "admin"` field in their Firestore user document. Accesses the hidden in-app admin panel. Can review, approve/reject wishes, and send push notifications manually. |
| Firebase Platform | Google-managed backend services: Auth, Firestore, Storage, FCM. Treated as a trusted external dependency. |
| Device OS (Android / iOS) | Manages camera, microphone, storage permissions, and delivers push notifications via the OS notification system. |

### External Systems

| System | Interaction |
|---|---|
| Firebase Authentication | Issues and validates anonymous user tokens |
| Cloud Firestore | Stores user profiles and wish documents |
| Firebase Storage | Stores uploaded video files and thumbnails |
| Firebase Cloud Messaging (FCM) | Delivers push notifications to user devices |
| Google FCM Servers | Intermediary between the app and the device OS for push delivery |

### Data Entering the System

- Recorded video file (up to 20MB, MP4)
- Generated thumbnail image (JPEG)
- Optional wish text (up to 280 characters)
- FCM push token (device-generated)
- Anonymous user identity (Firebase-generated)

### Data Leaving the System

- Push notifications (wish granted / rejected messages)
- Wish status updates (read from Firestore in real time)
- Video and thumbnail download URLs (served from Firebase Storage)

### Trust Boundaries

| Boundary | Description |
|---|---|
| Unauthenticated → Authenticated | All Firestore and Storage access requires a valid Firebase Auth token, even for anonymous users |
| User → Admin | Admin-level Firestore and Storage access is restricted by security rules checking the `role` field |
| App → Firebase | All communication is over HTTPS via the Firebase JS SDK; no raw credentials are ever sent from the app |

### Public vs Internal

| Component | Exposure |
|---|---|
| Firebase Auth endpoint | Reachable from the internet (via Firebase SDK) — protected by Firebase's own infrastructure |
| Firestore | Reachable from the internet — protected by Firestore security rules |
| Firebase Storage | Reachable from the internet — protected by Storage security rules |
| In-app admin panel | Hidden from UI; protected by router guard + Firestore role check |
| User wish data | Private by rule — users can only read their own documents |

---

## 3. High-Level Architecture

### Top-Level Components

```
┌─────────────────────────────────────────────────────────┐
│                  Ionic Vue App (Client)                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │  Views   │ │  Stores  │ │ Services │ │Composables│  │
│  │ (Ionic)  │ │ (Pinia)  │ │(Firebase)│ │(Capacitor)│  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘  │
└───────┼────────────┼────────────┼──────────────┼────────┘
        │            │            │              │
        └────────────┴────────────┘              │
                     │                           │
              Firebase JS SDK              Capacitor Plugins
                     │                           │
        ┌────────────┴──────────────┐            │
        │                           │            │
   ┌────▼──────┐  ┌──────────────┐  │    ┌───────▼────────┐
   │ Firestore │  │Firebase      │  │    │ Device OS      │
   │           │  │Storage       │  │    │ (Camera, Mic,  │
   └───────────┘  └──────────────┘  │    │  Notifications)│
                            ┌───────▼──┐ └────────────────┘
                            │ Firebase │
                            │   Auth   │
                            └──────────┘
                            ┌──────────┐
                            │   FCM    │
                            └──────────┘
```

### Component Responsibilities

| Component | Responsibility |
|---|---|
| **Views** | Render UI, handle user input, delegate to stores |
| **Pinia Stores** | Hold application state, coordinate between views and services |
| **Services** | All Firebase SDK calls live here — never called directly from views |
| **Composables** | Encapsulate device-level logic (camera, notifications) via Capacitor plugins |
| **Firestore** | Source of truth for user profiles and wish documents |
| **Firebase Storage** | Binary file storage for videos and thumbnails |
| **Firebase Auth** | Identity — issues tokens for all users including anonymous |
| **FCM** | Delivers push notifications to user devices |

### Protocols and Communication

| Connection | Protocol | Direction |
|---|---|---|
| App ↔ Firestore | HTTPS (Firebase SDK, WebSocket for real-time listeners) | Bidirectional |
| App ↔ Firebase Storage | HTTPS (multipart upload) | App → Storage (upload), Storage → App (download URL) |
| App ↔ Firebase Auth | HTTPS | App → Auth (sign in), Auth → App (token) |
| App ↔ FCM | HTTPS (SDK registration) + OS push channel | Bidirectional |
| Admin → User | FCM push notification (manual trigger from admin panel) | One-way |

### Synchronous vs Asynchronous

| Flow | Type |
|---|---|
| Auth sign-in | Synchronous (awaited on app launch) |
| Firestore reads | Synchronous (one-time) or Asynchronous (real-time listener) |
| Video upload | Asynchronous (progress observable) |
| Push notification delivery | Asynchronous (fire-and-forget from admin) |

---

## 4. Data Flow and State Management

### Critical Data Flows

**Flow 1 — First Launch**
```
App opens
  → Firebase Auth: signInAnonymously()
  → Generate username
  → Store uid + username in @capacitor/preferences
  → Write user document to Firestore /users/{uid}
  → Register FCM push token
  → Update pushToken in Firestore /users/{uid}
  → Navigate to home screen
```

**Flow 2 — Record and Upload Wish**
```
User taps "Make a Wish"
  → Request camera + microphone permissions
  → Record video (max 30s)
  → Preview video
  → User confirms
  → Compress video locally
  → Generate thumbnail from first frame
  → Generate wishId (UUID)
  → Upload video → Firebase Storage /wishVideos/{uid}/{wishId}.mp4
  → Upload thumbnail → Firebase Storage /thumbnails/{uid}/{wishId}.jpg
  → Get download URLs
  → Write wish document to Firestore /wishes/{wishId}
  → Show success state
```

**Flow 3 — Admin Reviews Wish**
```
Admin opens hidden admin panel
  → Firestore real-time listener loads pending wishes
  → Admin watches video
  → Admin changes status to "granted" or "rejected"
  → Firestore /wishes/{wishId}.status updated
  → Admin optionally types a message
  → Admin taps "Send Notification"
  → FCM push notification sent to user's pushToken
```

**Flow 4 — User Receives Notification**
```
FCM delivers push notification to device
  → App in foreground: in-app toast shown
  → App in background: OS notification tray
  → User taps notification
  → App navigates to /wish/{wishId}
  → Firestore document loaded, status and message displayed
```

### Where State Lives

| State Type | Location | Why |
|---|---|---|
| Auth state (current user) | Pinia `authStore` + Firebase SDK cache | Fast access across app |
| User profile | Pinia `userStore` (synced from Firestore) | Avoid re-fetching on every screen |
| Wish list | Pinia `wishesStore` (real-time Firestore listener) | Always up-to-date |
| Upload progress | Pinia `uploadStore` | Temporary — discarded after upload |
| Local preferences (uid, username) | `@capacitor/preferences` | Persists across app restarts |
| All wish and user data | Firestore | Single source of truth |
| Video and thumbnail files | Firebase Storage | Single source of truth |

### Source of Truth

| Data | Source of Truth |
|---|---|
| User identity | Firebase Auth |
| User profile | Firestore `/users/{uid}` |
| Wish content and status | Firestore `/wishes/{wishId}` |
| Video file | Firebase Storage |
| Push token | Firestore `/users/{uid}.pushToken` |
| Onboarding completed | `@capacitor/preferences` |

### Data Consistency

Firestore uses **eventual consistency**. For this app this is acceptable because:
- Each user only reads their own wishes — no concurrent multi-user reads on shared data
- The admin is the only person updating wish status — no concurrent writes to the same document
- A slight delay between admin updating status and user seeing it is acceptable UX

Firestore's offline persistence is enabled in the app, so reads work even when the device is briefly offline.

---

## 5. Domain and Module Design

### Core Domains

| Domain | Responsibility |
|---|---|
| **Auth** | Anonymous sign-in, identity persistence, session management |
| **Wishes** | Recording, uploading, storing, and displaying wishes |
| **Notifications** | FCM token registration, push notification handling and routing |
| **Admin** | Viewing all wishes, updating status, sending notifications |

### Module Map

```
/services
  AuthService       → Auth domain: signInAnonymously, getUser, updateLastSeen
  WishService       → Wishes domain: createWish, getUserWishes, getWishById
  UploadService     → Wishes domain: uploadVideo, uploadThumbnail, cancelUpload
  NotificationService → Notifications domain: registerToken, saveToken, handleIncoming
  StorageService    → Cross-domain: read/write @capacitor/preferences
  AdminService      → Admin domain: getAllWishes, updateWishStatus, deleteWish

/stores
  authStore         → Auth domain state
  userStore         → Auth domain: full user profile
  wishesStore       → Wishes domain state
  uploadStore       → Wishes domain: upload progress
  notificationStore → Notifications domain state
  adminStore        → Admin domain state

/composables
  useCamera         → Wishes domain: device camera and video recording
  useUpload         → Wishes domain: orchestrates UploadService
  useNotifications  → Notifications domain: Capacitor push plugin
  useAuth           → Auth domain: auth state watcher
  useThumbnail      → Wishes domain: canvas thumbnail extraction
  useAdmin          → Admin domain: role check
```

### Module Ownership Rules

| Module | Owns |
|---|---|
| `AuthService` | All Firebase Auth SDK calls |
| `WishService` | All Firestore reads/writes for the `wishes` collection |
| `UploadService` | All Firebase Storage operations |
| `NotificationService` | All FCM token operations and Firestore pushToken writes |
| `AdminService` | Cross-user Firestore reads; wish status updates |
| `StorageService` | All `@capacitor/preferences` reads and writes |

### What Is Forbidden

- **Views must never import or call the Firebase SDK directly.** All Firebase logic goes through the services layer.
- **Services must never import Pinia stores.** Data flows one way: stores call services, not the reverse.
- **`AdminService` must only be called after a role check.** The router guard and `useAdmin` composable enforce this.
- **No Firebase credentials or secrets in component files, stores, or composables.** Only `services/` and `.env`.

### Preventing Tight Coupling

- Views depend only on Pinia stores (via `useXxxStore()`)
- Stores depend only on services
- Services depend only on the Firebase SDK and Capacitor plugins
- TypeScript interfaces in `/types/index.ts` define all shared data shapes — modules communicate via these contracts, not via each other's internal structures

---

## 6. API and Contract Boundaries

There is no custom REST API in this architecture. The Firebase JS SDK is the API layer. The **contract boundaries** are the Firestore document schemas defined in `/types/index.ts`.

### Key Contracts

**`UserDocument`** — `/users/{uid}`
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

**`WishDocument`** — `/wishes/{wishId}`
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

### Stability Requirements

These schemas are the internal API. Once wishes are being stored in production (even with 6 friends), changing field names or removing fields is a breaking change that requires a migration plan.

### Handling Schema Changes

- **Additive changes** (adding a new optional field): safe, no migration needed
- **Renaming or removing fields**: requires a script to update all existing documents in Firestore before deploying the new app version
- **Status enum changes**: update Firestore security rules and all UI components that reference status values simultaneously

### Versioning

No API versioning is needed at this scale. The app and its Firestore schema are deployed together. Document versioning (e.g. a `schemaVersion` field) can be added if breaking changes become frequent.

---

## 7. Failure Modes and Resilience

### Top 5 Realistic Failure Scenarios

**Scenario 1 — Video upload fails mid-upload (network drop)**
- Behavior: Upload progress stops; Firebase Storage upload is cancelled or times out
- Recovery: `UploadService` catches the error; UI shows a retry button; user can re-attempt without re-recording
- Acceptable: Yes — user retries manually

**Scenario 2 — FCM push token not registered (notification permission denied)**
- Behavior: Admin sends a notification; it is never delivered; user sees no update until they open the app
- Recovery: On next app open, re-attempt FCM registration; show in-app status update via Firestore real-time listener regardless of push
- Acceptable: Yes — Firestore real-time listener is the fallback for status updates

**Scenario 3 — Firestore security rules misconfigured (permission denied on reads/writes)**
- Behavior: App shows loading indefinitely or throws an unhandled Firebase permission error
- Recovery: Check Firebase Console rules, redeploy corrected rules; no data loss
- Acceptable: Yes for a portfolio project — fix and redeploy within hours

**Scenario 4 — Firebase free tier quota exceeded**
- Behavior: Firestore reads/writes or Storage uploads fail; app stops functioning for the rest of the billing day
- Recovery: Wait for quota reset (resets daily at midnight Pacific); review usage in Firebase Console
- Acceptable: Yes — at 6 users this is extremely unlikely; daily free limits are generous

**Scenario 5 — Camera or microphone permission permanently denied by user**
- Behavior: App cannot open camera; wish recording is impossible
- Recovery: App detects permanent denial and shows a message guiding the user to enable permissions in device Settings
- Acceptable: Yes — user action required; app handles gracefully

### Catastrophic vs Acceptable Failures

| Failure | Classification |
|---|---|
| App crashes on launch | Catastrophic — must fix immediately |
| Video upload fails | Acceptable — user retries |
| Push notification not delivered | Acceptable — Firestore listener is fallback |
| Admin panel inaccessible | Acceptable — fix within hours |
| Quota exceeded | Acceptable — resets daily |
| Data loss from a Firestore write failure | Catastrophic — must handle with error catching and retry |

### Maximum Tolerable Downtime

This is a portfolio project. A few hours of downtime is acceptable. There is no SLA.

---

## 8. Consistency and Concurrency

### Consistency Model

**Eventual consistency** — Firestore's default model. This is acceptable for Girigo because:
- Users only read their own wishes; there are no shared feeds or leaderboards
- The admin is one person reviewing one wish at a time

### Where Stale Data Is Tolerable

- Wish list on home screen: a few seconds of staleness is fine (real-time listener updates it anyway)
- Admin dashboard wish queue: acceptable to be a few seconds behind

### Concurrent Update Scenarios

| Scenario | Risk | Mitigation |
|---|---|---|
| Admin updates wish status while user is viewing it | Low — real-time Firestore listener on the wish detail screen will update the UI automatically | Firestore real-time listener |
| Two admins updating the same wish simultaneously | Extremely low — there is one admin | Not a concern for MVP |
| User submits two wishes at the same time | Not possible — UI disables the record button during upload | UI lock during upload |

### Race Conditions

The only meaningful race condition is: **admin updates wish status at the exact moment the user is reading it**. Firestore's real-time listeners handle this automatically — the client receives the update and re-renders. No manual handling required.

---

## 9. Performance and Scalability

### Expected Load

| Metric | Value |
|---|---|
| Concurrent users | Maximum 6 (portfolio project) |
| Wishes per user | A few per week at most |
| Video uploads per day | Fewer than 10 |
| Push notifications per day | Fewer than 10 |
| Firestore reads per day | Well within free tier limits (50,000/day free) |
| Storage used | Well within free tier (5GB free) |

At this scale, performance is entirely determined by the device hardware and network speed — not by Firebase infrastructure.

### Latency Targets

| Action | Target |
|---|---|
| App cold start | Under 3 seconds |
| Firestore document read | Under 1 second on a good connection |
| Video upload (20MB on typical mobile data) | Under 30 seconds — show progress bar |
| Push notification delivery | Best-effort; FCM typically delivers within seconds |

### What Breaks First Under Load

Not relevant at 6 users. The Firebase free tier limits (not infrastructure capacity) would be hit first if usage scaled unexpectedly.

### Scaling Strategy

No scaling strategy is required for this project. If it ever needed to scale:
- Firebase scales automatically (no server to provision)
- Upgrading to the Blaze plan removes all quota limits
- The service/store architecture already separates concerns cleanly for future decomposition

---

## 10. Caching Strategy

### What Is Cached and Where

| Data | Cache Location | Strategy |
|---|---|---|
| Wish list | Pinia `wishesStore` (in-memory) | Loaded once on home screen mount; updated by real-time Firestore listener |
| User profile | Pinia `userStore` (in-memory) | Loaded once on auth init; refreshed on app resume |
| Firestore documents | Firestore SDK offline persistence (on-device) | Enabled by default — serves cached data when offline |
| Video thumbnails | Browser/WebView image cache (automatic) | Standard HTTP cache headers from Firebase Storage CDN |
| uid and username | `@capacitor/preferences` (persistent) | Written on first launch; read on every launch |

### Cache Invalidation

| Cache | Invalidation Trigger |
|---|---|
| Pinia stores | App restart, or Firestore real-time listener emitting a new value |
| Firestore offline cache | Firestore SDK manages this automatically |
| `@capacitor/preferences` | Never invalidated (persists user identity across sessions by design) |

### On Cache Miss

- Firestore: SDK fetches from the server; show loading indicator in UI
- Pinia store: service layer is called to fetch from Firestore
- Thumbnails: Firebase Storage CDN serves the file; normal network latency

### On Stale Cache

- Firestore real-time listeners guarantee the Pinia stores are updated within seconds of any change
- Thumbnails are immutable (a wish's thumbnail never changes after upload) — staleness is not a concern

---

## 11. Data Storage Design

### Data Types and Storage Locations

| Data Type | Storage | Reason |
|---|---|---|
| User profiles | Firestore | Structured document; needs real-time reads |
| Wish documents (metadata, status, text) | Firestore | Structured document; needs real-time updates and admin queries |
| Video files | Firebase Storage | Binary blob; large files unsuitable for Firestore |
| Thumbnail images | Firebase Storage | Binary blob |
| Auth tokens | Firebase SDK internal cache | Managed automatically |
| Local preferences (uid, onboarding state) | `@capacitor/preferences` | Needs to persist across app restarts without a network call |

### Read/Write Patterns

| Collection | Write Pattern | Read Pattern |
|---|---|---|
| `users` | Write once on first launch; update `lastSeen` and `pushToken` periodically | Read once on auth init |
| `wishes` | Write once per wish creation (by user); update status once per wish (by admin) | Real-time listener per user's own wishes; paginated list (10 at a time) |
| Firebase Storage | Write once per wish (video + thumbnail) | Read on demand when user or admin views a wish |

---

## 12. Security Boundaries

### Authentication

- Enforced at the Firebase SDK level on every request
- Every user (including anonymous users) must have a valid Firebase Auth token to access any Firestore document or Storage path
- Tokens are managed automatically by the Firebase JS SDK

### Authorization

- Enforced by **Firestore security rules** and **Firebase Storage security rules** — see the full rules in `firestore.rules` and `storage.rules`
- Authorization decisions are made at the Firebase server level, not in the app client
- Client-side role checks (e.g. router guard for `/admin`) are UX-only — the real enforcement is the server-side rules

### Internet-Exposed Components

| Component | Exposed? | Protected By |
|---|---|---|
| Firestore | Yes (Firebase endpoint) | Security rules + Auth token |
| Firebase Storage | Yes (Firebase endpoint) | Security rules + Auth token |
| Firebase Auth | Yes (Firebase endpoint) | Firebase infrastructure |
| Admin panel (in-app) | No (hidden in UI) | Router guard + Firestore role check |
| User wish data | No (rules prevent cross-user reads) | Firestore security rules |

---

## 13. Observability

### How We Know the System Is Healthy

For a portfolio project, observability is lightweight:
- **Firebase Console** — shows Firestore read/write counts, Storage usage, Auth user count, and FCM delivery stats in real time
- **Firestore Data Viewer** — inspect documents directly to verify writes are correct
- **Firebase Storage Browser** — verify videos and thumbnails are being uploaded to the correct paths

### Critical Metrics to Watch

| Metric | Where to Check |
|---|---|
| Daily Firestore reads/writes | Firebase Console → Usage tab |
| Storage used | Firebase Console → Storage |
| Active users | Firebase Console → Auth |
| FCM delivery success | Firebase Console → Cloud Messaging |
| Free tier quota approaching limit | Firebase Console → Usage and billing |

### Logging

- During development: `console.log` in services and composables
- All service methods should log errors with enough context to identify which operation failed (e.g. `"WishService.createWish failed for uid: ${uid}"`)
- In production (v1.0): no structured logging system needed at this scale

### Debugging a Production Failure

1. Open Firebase Console and check the relevant service (Auth, Firestore, Storage)
2. Check Firebase Console → Firestore → Rules Playground if a permission denied error is suspected
3. Reproduce locally with `ionic serve` and browser DevTools (Network tab, Console)
4. Check the Firestore Data Viewer to verify document state

---

## 14. Deployment Topology

### Environments

| Environment | Description |
|---|---|
| Development | `ionic serve` — runs in Chrome browser locally; uses the same Firebase project |
| Device testing | `ionic cap run android` or `ionic cap run ios` — runs on a connected device or emulator |
| Production | APK distributed via GitHub Releases; app connects to the same Firebase project |

There is one Firebase project for this portfolio project. Separate staging/production Firebase projects are not needed at this scale.

### What Runs Where

| Component | Runs On |
|---|---|
| Ionic Vue app | User's Android or iOS device (via Capacitor WebView) |
| Firebase Auth | Google-managed (no deployment needed) |
| Firestore | Google-managed (no deployment needed) |
| Firebase Storage | Google-managed (no deployment needed) |
| FCM | Google-managed (no deployment needed) |
| GitHub Pages download site | GitHub-managed static hosting |

### APK Distribution

- APK is built via `ionic build` + Capacitor + Gradle
- Signed APK is attached to a GitHub Release
- GitHub Pages (`/docs/index.html`) hosts the public download page with a link to the latest release

### Region

Firebase project region: `asia-southeast1` (Singapore) — set at project creation time. Minimises latency for the target users.

---

## 15. Evolution and Future Scaling

This section documents known shortcuts taken in the MVP and what would need to change if the project grew.

**Firebase Functions**: The MVP has no server-side logic because the Spark free plan does not support Cloud Functions. If automated notifications, AI moderation, or scheduled tasks are ever needed, the project would need to upgrade to the Blaze plan and implement a Firebase Functions layer.

**Single Firebase project for all environments**: The MVP uses one Firebase project for development, testing, and production. A real production app would separate these into distinct projects to prevent test data from polluting production.

**Anonymous authentication only**: The MVP uses anonymous auth for zero-friction onboarding. Migrating anonymous users to named accounts (Google Sign-In, email/password) is architecturally supported — Firebase provides an `linkWithCredential` API for this — but not implemented.

**No structured logging or monitoring**: The Firebase Console is sufficient for 6 users. If the app ever scaled, a proper logging service (e.g. Firebase Crashlytics, Sentry) and monitoring dashboards would be needed.

**Firestore schema migrations**: There is no migration system. Schema changes are applied manually. At scale, a versioned migration script system would be required.

**Video compression**: The MVP compresses video on-device before upload. At scale, server-side transcoding (e.g. via a Firebase Function triggering a Cloud Run job) would provide more consistent quality and reduce client-side battery/CPU usage.