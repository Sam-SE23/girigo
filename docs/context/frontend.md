# frontend.md — Girigo App Frontend

---

## 1. User Experience (UX) Model

### Core User Flows

---

**Flow 1 — First Launch and Onboarding**

| Step | Screen | Action |
|---|---|---|
| 1 | Splash | App opens, logo animates in, auto-advances after ~2 seconds |
| 2 | Intro | Cinematic tagline displayed, user taps "Begin" |
| 3 | Permissions | App explains why camera, microphone, and notifications are needed before requesting |
| 4 | Home | Permissions granted, auth established silently in background, home screen loads |

- **Entry point:** Cold app launch with no existing session
- **Exit / success state:** User is on the Home screen with a valid anonymous Firebase Auth session
- **Fastest possible path:** Splash auto-advances → tap "Begin" → grant all permissions → Home (3 taps)
- **Drop-off risks:**
  - User denies camera or microphone permission — they can reach Home but cannot record a wish; app must show a clear explanation and guide them to device Settings
  - User force-closes during splash before auth completes — handled by re-running auth on next launch

---

**Flow 2 — Record and Submit a Wish**

| Step | Screen | Action |
|---|---|---|
| 1 | Home | User taps "Make a Wish" |
| 2 | Record | Camera opens in full-screen video mode, countdown visible, user records up to 30 seconds |
| 3 | Preview | Recorded video plays back, user decides to retake or proceed |
| 4 | Preview | User optionally types a wish text (max 280 characters) |
| 5 | Preview | User taps "Send My Wish" |
| 6 | Upload overlay | Progress bar shown, upload runs |
| 7 | Home | Success animation plays, new wish card appears in list with "Pending" status |

- **Entry point:** "Make a Wish" button on Home screen
- **Exit / success state:** Wish document exists in Firestore, video in Firebase Storage, wish card visible in user's list
- **Fastest possible path:** Tap → record → tap "Send My Wish" (skip text) → upload (4 taps + recording time)
- **Drop-off risks:**
  - Network drops during upload — show retry button, do not lose the recorded video
  - User navigates away during upload — upload continues in background (Capacitor background task), user is notified on completion
  - Recording longer than 30 seconds — enforced by a hard stop with a visible countdown

---

**Flow 3 — View Wish Status**

| Step | Screen | Action |
|---|---|---|
| 1 | Home | User sees wish list with status badges |
| 2 | Wish Detail | User taps a wish card |
| 3 | Wish Detail | Status, timestamp, admin message (if any), and video player are shown |

- **Entry point:** Home screen wish list
- **Exit / success state:** User has seen their wish's current status and any message from the admin
- **Fastest possible path:** One tap from Home to Wish Detail
- **Drop-off risks:** None significant — this is a passive viewing flow

---

**Flow 4 — Receive and Act on Push Notification**

| Step | Screen | Action |
|---|---|---|
| 1 | System notification tray | Notification arrives: "Your wish has been granted." |
| 2 | App opens | Tap navigates directly to the relevant Wish Detail screen |
| 3 | Wish Detail | User sees updated status and admin message |

- **Entry point:** OS notification tray (app may be closed, backgrounded, or foreground)
- **Exit / success state:** User has seen the status update
- **Fastest possible path:** One tap on notification → Wish Detail (no navigation steps required)
- **Drop-off risks:** If push token is not registered (permission denied), user must open the app manually to see the update — Firestore real-time listener ensures the status is still visible in-app

---

**Flow 5 — Admin Reviews and Responds to a Wish**

| Step | Screen | Action |
|---|---|---|
| 1 | Home | Admin taps the logo 5 times |
| 2 | Admin PIN prompt | Admin enters PIN |
| 3 | Admin Dashboard | Pending wish queue loads |
| 4 | Admin Wish Detail | Admin taps a wish, watches video |
| 5 | Admin Wish Detail | Admin selects "Grant" or "Reject" |
| 6 | Admin Wish Detail | Admin optionally types a message |
| 7 | Admin Wish Detail | Admin taps "Send Notification" — FCM push sent to user |

- **Entry point:** Hidden 5-tap gesture on logo
- **Exit / success state:** Wish status updated in Firestore, user's device receives push notification
- **Fastest possible path:** 5 taps → PIN → tap pending wish → grant → notify (8 taps)
- **Drop-off risks:** None significant — single admin, no competing actions

---

### Mental Model Alignment

The user's mental model for Girigo is: **a wishing well you speak into, then wait.** You send something into the dark. You don't know who receives it or when. Eventually, an answer comes back.

The UI must reinforce this model at every step:

| Mental Model Expectation | UI Behaviour |
|---|---|
| "I am sending something irreversible into the unknown" | No edit button after submission. No delete option for users. The wish is gone. |
| "Something is receiving my wish and deciding" | Pending status is communicated with ambient mystery, not progress-bar impatience. Copy reads "waiting" not "processing". |
| "An answer will come to me — I don't need to check" | Push notifications replace the need to poll. Users should not feel compelled to keep opening the app. |
| "This is a private, personal act" | No public feed, no like counts, no usernames visible to others. The app feels like a private channel. |

**Where mismatches could cause confusion:**
- If upload progress looks like "approval progress" — keep the upload UI clearly labelled as a technical operation, not part of the wish ritual. Success copy should shift tone: *"Your wish has been sent into the dark."* not *"Upload complete."*
- Anonymous auth must be invisible — users should never see a "sign in" screen or feel like they created an account. The identity system is infrastructure, not product.

---

### Interaction Design

| Action | Priority | Feedback Type | Latency Tolerance |
|---|---|---|---|
| Tap "Make a Wish" | Primary | Instant navigation to camera | Must feel instant (<100ms) |
| Start recording | Primary | Red recording indicator + countdown | Instant |
| Tap "Send My Wish" | Primary | Upload overlay appears immediately | Upload itself can take time — feedback must be immediate |
| Tap wish card on Home | Primary | Navigate to Wish Detail | Must feel instant |
| Tap notification | Primary | Navigate directly to Wish Detail | Must feel instant |
| Type wish text | Secondary | Character counter updates live | Instant |
| Tap "Retake" on preview | Secondary | Returns to camera | Instant |
| Admin: change status | Primary (in admin context) | Confirmation state change visible | <500ms |

**Feedback standards across the app:**
- Every tap on an interactive element produces immediate visual feedback (Ionic's ripple effect or custom press state)
- Every async operation shows a loading indicator within 200ms of being triggered
- Every error shows a human-readable message — never a raw error code or Firebase exception string
- Every success state has a distinct visual moment — not just a silent state change

---

## 2. Information Architecture

### Main Sections

| Section | Access | Visible To |
|---|---|---|
| Onboarding (Splash → Intro → Permissions) | First launch only | All users |
| Home | Primary screen after onboarding | All users |
| Record Flow (Record → Preview → Upload) | From Home CTA | All users |
| Wish Detail | From Home wish list or notification | All users (own wishes only) |
| Admin Dashboard + Wish Detail | Hidden 5-tap gesture | Admin only |

### Content Grouping and Priority

**Home screen hierarchy (top to bottom):**
1. "Make a Wish" — always visible, prominent, primary CTA
2. Wish list — recent wishes, newest first, paginated (10 at a time)
3. Empty state — when no wishes exist yet

**Wish card information priority:**
1. Status badge (first thing eyes go to — most important information)
2. Thumbnail (visual identity of the wish)
3. Relative timestamp ("3 days ago")
4. Admin message preview (only if status is granted or rejected)

### What Is Visible Immediately vs Hidden

| Content | Visibility |
|---|---|
| "Make a Wish" button | Always visible on Home |
| User's wish list | Visible immediately on Home |
| Wish video | Hidden behind tap (in Wish Detail only) |
| Admin message text | Hidden behind tap (in Wish Detail only) |
| Admin panel | Hidden — requires 5-tap gesture + PIN |
| Onboarding screens | Hidden after first launch (stored in preferences) |

### Navigation Depth

Maximum depth: **3 levels**

```
Home
  └── Record
        └── Preview
  └── Wish Detail
Admin Dashboard
  └── Admin Wish Detail
```

No screen is more than 3 taps from the Home screen. Users always have a back button (Ionic's navigation stack handles Android hardware back and iOS swipe-back natively).

---

## 3. Design System

### System Definition

Girigo uses **Ionic Framework's component library as the base system**, extended with a custom dark cinematic theme via Ionic CSS variables and component-scoped SCSS. No third-party design system is added.

**Core principles:**
- **Mysterious** — sparse layouts, deliberate use of dark space, information revealed gradually
- **Cinematic** — wide typographic spacing, dramatic heading font, restrained use of colour
- **Mobile-first** — all design decisions start from a 375px viewport
- **Minimal** — every element earns its place; decoration is ambient, not decorative clutter

### Two Visual Modes

| Mode | Used On | Character |
|---|---|---|
| **Cinematic (user-facing)** | Splash, Onboarding, Home, Record, Preview, Wish Detail | Dark, atmospheric, emotional, mysterious |
| **Functional (admin-facing)** | Admin Dashboard, Admin Wish Detail | Same dark base, cleaner data layout, higher information density, utilitarian action buttons |

Both modes share the same design tokens. The difference is layout density and typographic hierarchy — not colour palette or component library.

---

### Base Components

| Component | Variants | Standardised Behaviour |
|---|---|---|
| `PrimaryButton` | Default, Loading, Disabled | Full-width on mobile; glowing border on press; shows spinner when `loading` prop is true; disabled state removes glow |
| `GhostButton` | Default, Destructive | Outlined, no fill; used for secondary actions (Retake, Cancel) |
| `WishCard` | Pending, Granted, Rejected | Fixed height thumbnail; status badge top-right; tap anywhere navigates to Wish Detail |
| `StatusBadge` | Pending, Granted, Rejected | Coloured pill with icon + label; never colour-only (always includes text for accessibility) |
| `TextInput` | Default, Error, Disabled | Dark fill, subtle border; character counter shown when maxlength is set; error message below field |
| `UploadProgressModal` | Uploading, Error, Success | Full-screen overlay; cannot be dismissed during upload; retry button on error; auto-dismisses on success |
| `VideoPlayer` | Default | Autoplay off; mute toggle; seek bar; full-screen button; never autoplays audio |
| `ToastNotification` | Info, Success, Error | Appears at top of screen; auto-dismisses after 4 seconds; matches severity colour |
| `EmptyState` | No wishes, Error | Centred layout; cinematic copy; optional CTA button |
| `AdminWishCard` | Pending, Granted, Rejected | Denser than user WishCard; shows uid, timestamp, status; clear action affordance |

**What is forbidden:**
- No custom button styles created outside the `PrimaryButton` and `GhostButton` components
- No hardcoded colour values in component `<style>` blocks — all colours reference CSS variables
- No inline `style` attributes for colours, spacing, or typography
- No `v-html` directive anywhere in the app

---

### Design Tokens

All tokens are defined once in `/src/theme/variables.css` and referenced throughout the app. Never duplicate or override a token value in a component file.

**Colour roles:**

| Token | Value | Role |
|---|---|---|
| `--color-bg-base` | `#0a0a0a` | Page background |
| `--color-bg-surface` | `#1a1a1a` | Cards, modals |
| `--color-bg-elevated` | `#242424` | Inputs, elevated surfaces |
| `--color-border` | `#2a2a2a` | Dividers, input borders |
| `--color-text-primary` | `#e8e8e8` | Primary body text |
| `--color-text-muted` | `#888888` | Secondary text, timestamps |
| `--color-accent` | `#6C3DE8` | Primary accent — glows, highlights, active states |
| `--color-accent-glow` | `rgba(108, 61, 232, 0.3)` | Soft glow effect around accent elements |
| `--color-status-pending` | `#F59E0B` | Pending status |
| `--color-status-granted` | `#10B981` | Granted status |
| `--color-status-rejected` | `#EF4444` | Rejected status |
| `--color-danger` | `#EF4444` | Destructive actions, error states |
| `--color-success` | `#10B981` | Success states |

**Spacing scale** (8px base unit):

| Token | Value | Use |
|---|---|---|
| `--space-xs` | `4px` | Icon gaps, tight internal padding |
| `--space-sm` | `8px` | Component internal padding |
| `--space-md` | `16px` | Standard card padding, section gaps |
| `--space-lg` | `24px` | Between major sections |
| `--space-xl` | `32px` | Page-level top/bottom padding |
| `--space-2xl` | `48px` | Generous spacing on intro/splash screens |

**Typography scale:**

| Token | Font | Size | Weight | Use |
|---|---|---|---|---|
| `--font-heading` | Cormorant Garamond | 32px | 600 | Screen titles, cinematic taglines |
| `--font-subheading` | DM Sans | 20px | 600 | Section headers |
| `--font-body` | DM Sans | 16px | 400 | Body text, card content |
| `--font-small` | DM Sans | 13px | 400 | Timestamps, muted metadata |
| `--font-label` | DM Sans | 12px | 600 | Status badges, button labels (uppercase) |

**Enforcing token usage:**
ESLint's `no-restricted-syntax` rule is configured to warn when hex colour values appear inside `<style>` blocks. All spacing is expressed via the token variables, never as raw `px` values. Code review (even solo) treats hardcoded values as a failing condition.

---

## 4. State Management

### State Classification

**Server state** — data that lives in Firestore and must stay in sync:

| State | Store | Sync Method |
|---|---|---|
| User's wish list | `wishesStore` | Firestore `onSnapshot` real-time listener |
| Current user profile | `userStore` | Firestore `onSnapshot` real-time listener |
| Admin: all wishes | `adminStore` | Firestore `onSnapshot` real-time listener |

**Global client state** — app-wide state not tied to a single component:

| State | Store | Persisted? |
|---|---|---|
| Firebase auth user object | `authStore` | Firebase SDK cache + `@capacitor/preferences` |
| Upload progress and status | `uploadStore` | No — discarded after each upload |
| FCM push token | `notificationStore` | Firestore (authoritative) |
| Notification permission status | `notificationStore` | No — checked on each app launch |

**Local UI state** — component-level, not shared:

| State | Lives In | Example |
|---|---|---|
| Is modal open | Component `ref()` | Upload overlay visibility |
| Current recording status | `RecordView.vue` | Recording / previewing / idle |
| Wish text input value | `PreviewView.vue` | Text typed before submission |
| Video player muted | `VideoPlayer.vue` | Mute toggle state |
| Admin PIN input | `AdminView.vue` | PIN entry before access |

### Ownership Rules

- Server state is owned by Pinia stores. Components never call Firebase directly.
- Stores are the single source of truth for server state — components read from stores, not from local copies.
- Local UI state stays local. If a piece of state is only ever used in one component, it lives in that component as a `ref()` — it does not get promoted to a store.

### Sync and Consistency

**How server state stays in sync:**
Firestore `onSnapshot` listeners are registered in stores when the store is first used and cleaned up when the user logs out. The listener pushes updates automatically — no polling, no manual refresh.

```ts
// Example in wishesStore
const unsubscribe = onSnapshot(
  query(collection(db, 'wishes'), where('uid', '==', uid), orderBy('createdAt', 'desc')),
  (snapshot) => {
    wishes.value = snapshot.docs.map(doc => doc.data() as WishDocument)
  }
)
```

**Avoiding stale data:**
Real-time listeners mean stale data is not a meaningful risk during an active session. On app resume from background, the Firestore SDK automatically reconnects and reconciles any missed updates via its offline cache.

**Multiple components depending on the same state:**
All components reading the same store get the same reactive reference — Vue's reactivity system ensures they all re-render when the store value changes. No duplication of state across components.

**Preventing unnecessary re-renders:**
Pinia stores expose `computed` properties for derived values (e.g. `pendingWishes`, `grantedWishes` filtered from the full list). Components bind to these computed properties rather than filtering in the template, preventing repeated filter operations on every render.

---

## 5. Data Fetching and API Integration

### Structure

All Firebase SDK calls live in the `/src/services/` layer. Pinia stores import and call services. Vue components import and call stores. No component imports Firebase SDK packages directly.

```
Component → useXxxStore() → XxxService.ts → Firebase SDK
```

### Where Calls Are Triggered

| Trigger | Location | Example |
|---|---|---|
| App launch | `App.vue` `onMounted` | `AuthService.initAuth()` |
| Route change | Router navigation guard | Role check before `/admin` |
| User action | Component event handler → store action | Tap "Send My Wish" → `wishesStore.createWish()` |
| Real-time data | Store `onSnapshot` listener | Wish status updates |

### Loading State Handling

Every async operation follows this pattern:

```ts
// In store
const isLoading = ref(false)
const error = ref<string | null>(null)

async function createWish(data: NewWish) {
  isLoading.value = true
  error.value = null
  try {
    await WishService.createWish(data)
  } catch (e) {
    error.value = 'Something went wrong. Please try again.'
  } finally {
    isLoading.value = false
  }
}
```

Components bind to `isLoading` and `error` from the store. Loading indicators appear within 200ms of any async operation starting.

### Error Standardisation

All service methods catch Firebase SDK errors and rethrow as plain human-readable strings. Firebase error codes (`auth/network-request-failed`, `storage/unauthorized`) are never exposed to the UI layer.

```ts
// In WishService.ts
try {
  await setDoc(...)
} catch (e) {
  console.error('WishService.createWish failed:', e)
  throw new Error('Could not save your wish. Please check your connection and try again.')
}
```

### Retry Logic

Video upload retry is handled in `UploadService.ts` with a maximum of 3 automatic retries using exponential backoff (1s, 2s, 4s delays). After 3 failures, the error is surfaced to the user with a manual retry button. The recorded video is preserved in component state so the user never needs to re-record.

### Caching

| Layer | Mechanism |
|---|---|
| In-session | Pinia store holds data for the session lifetime |
| Offline | Firestore SDK offline persistence (enabled at SDK init) |
| Thumbnails | Firebase Storage CDN + WebView HTTP cache (automatic) |

---

## 6. Forms and Input Handling

### Forms in the App

| Form | Screen | Fields | Required? |
|---|---|---|---|
| Wish text | `PreviewView` | Text area (max 280 chars) | No — optional |
| Admin message | `AdminWishDetailView` | Text area (max 500 chars) | No — optional |
| Admin PIN | `AdminView` | 4–6 digit PIN input | Yes — blocks admin access |

No form library is used. All three forms are handled with Vue `v-model` and `computed` validation — adding VeeValidate or Zod for two optional text fields would be over-engineering.

### Validation

| Field | Validation | When Shown |
|---|---|---|
| Wish text | Max 280 characters | Character counter shown live; input disabled when limit reached |
| Admin message | Max 500 characters | Character counter shown live |
| Admin PIN | Must match stored PIN | Error shown on incorrect submission |

Client-side validation only — there is no server-side form validation (Firestore security rules handle data integrity at the write level).

### Error Display

Validation errors appear **below the input field** in `--color-danger` text. They appear on submit attempt, not on every keystroke — avoid punishing the user while they are still typing.

### Preventing Duplicate Submissions

The "Send My Wish" button is **disabled and replaced with a spinner** immediately on tap, before the upload begins. It remains disabled until the upload either succeeds or fails. This is enforced by binding the button's `disabled` prop to `uploadStore.isLoading`.

The `wishId` is generated client-side (UUID) before the upload starts. If the upload is retried, the same `wishId` is reused — Firestore's `setDoc()` with a known ID is idempotent, so a retry that follows a partial success does not create a duplicate document.

---

## 7. Error Handling and Edge States

### UI Responses to Failure Conditions

| Condition | UI Response |
|---|---|
| Firestore read fails | Toast notification: "Could not load your wishes. Pull to refresh." — wish list shows last cached state from Firestore offline persistence |
| Video upload fails (network) | Upload overlay switches to error state: retry button + message "Upload failed. Your wish is saved — tap to try again." |
| Upload times out (>60 seconds) | Same as above — timeout treated as failure |
| Camera permission denied | Camera screen shows an explanation card with a button linking to device Settings |
| Push notification permission denied | Silently skipped at launch; in-app status updates via Firestore listener still work |
| Firebase quota exceeded | Generic error toast — no quota-specific messaging exposed to users |
| No wishes yet | Empty state component with copy: *"You haven't made a wish yet. Will you dare?"* and the primary CTA button |
| Network offline | Ionic network plugin detects offline state; a persistent banner appears at the top: "You're offline. Some features may be unavailable." |

### Avoiding Blank Screens

Every screen that fetches data renders one of three states — never a blank page:

1. **Loading state**: skeleton card components (dark shimmer placeholders matching the card layout)
2. **Data state**: actual content
3. **Empty / error state**: `EmptyState` component with appropriate copy and optional action

Skeleton screens are preferred over spinners for list views — they reduce perceived load time and prevent layout shift.

---

## 8. Performance Strategy

### Targets

| Metric | Target |
|---|---|
| Cold start to Home screen | Under 3 seconds on a mid-range Android device |
| Time to interactive after navigation | Under 300ms |
| Tap response (visual feedback) | Under 100ms (feels instant) |
| Wish list scroll | 60fps — no dropped frames |
| Video upload feedback | Progress bar visible within 200ms of tap |

### Lazy Loading

All routes except `/` (Splash) and `/onboarding` use dynamic imports:

```ts
{ path: '/home', component: () => import('@/views/HomeView.vue') }
{ path: '/record', component: () => import('@/views/RecordView.vue') }
{ path: '/admin', component: () => import('@/views/AdminView.vue') }
```

Vite automatically code-splits at these boundaries. The admin bundle is never loaded for regular users.

### Code Splitting

Vite handles bundle splitting automatically via the dynamic `import()` calls above. The Firebase SDK is also tree-shaken at build time — only the Firestore, Auth, Storage, and Analytics modules are included, not the full SDK.

### What Is Memoised

| Computation | Method |
|---|---|
| Filtered wish lists (pending, granted, rejected) | Pinia `computed()` — recalculates only when the source array changes |
| User role check | `computed()` in `authStore` — not re-evaluated on every navigation |
| Formatted relative timestamps | Computed in `WishCard.vue` — not recalculated on every render |

### Biggest Performance Risks

| Risk | Mitigation |
|---|---|
| Long wish list rendering slowly | Virtualised list using Ionic's `ion-virtual-scroll` or manual Intersection Observer-based lazy rendering |
| Thumbnail images blocking scroll | `loading="lazy"` attribute on all `<img>` tags; Intersection Observer triggers load only when card enters viewport |
| Video upload blocking UI thread | Firebase Storage SDK runs the upload asynchronously; progress events update the store; UI remains interactive throughout |
| Animation causing frame drops | All animations use CSS `transform` and `opacity` only — these are GPU-composited and never cause layout recalculation |

### Measuring Performance

- **Development**: Chrome DevTools Performance tab during `ionic serve` with mobile CPU throttling enabled (4x slowdown simulates mid-range Android)
- **Device**: Chrome Remote Debugging (`chrome://inspect`) on a connected Android device
- **Lighthouse**: Run against the Vite production build (`ionic build`) targeting mobile preset; target score >80 for Performance

---

## 9. Responsiveness and Platform Support

### Supported Platforms

| Platform | Support Level |
|---|---|
| Android (API 24+) | Full support — primary build target |
| iOS (14+) | Full support — secondary build target |
| Browser (Chrome) | Development only — `ionic serve` for rapid iteration |
| PWA | Not a target for MVP |
| Tablet | Not optimised — app is designed for phone viewports only |

### Screen Size Targets

| Device Class | Viewport Width | Status |
|---|---|---|
| Small Android phone | 360px | Fully supported |
| Standard iPhone | 375px–390px | Fully supported |
| Large Android phone | 412px–430px | Fully supported |
| Tablet | 768px+ | Not targeted — layout will render but is not optimised |

All layouts are designed at 375px and tested at 360px (smallest target). No horizontal scrolling is permitted on any screen.

### Mobile-First Implementation

All CSS is written mobile-first. No desktop breakpoints are defined in the MVP. Ionic's grid system and flex layouts adapt naturally to the phone viewport range without breakpoints.

### Touch Targets

All interactive elements meet the minimum **44×44px touch target** size as per Apple HIG and Material Design guidelines. This is enforced at the component level — buttons, cards, and icon buttons all have minimum `min-height: 44px` applied in the base component styles.

---

## 10. Accessibility

### Standard

**Target: WCAG 2.1 Level AA — best effort** for MVP. This is a portfolio project with 6 users; full compliance is not a hard requirement, but the following are non-negotiable:

### Colour Contrast

All text/background combinations meet WCAG AA contrast ratios (4.5:1 for body text, 3:1 for large text):

| Combination | Contrast Ratio | Passes AA? |
|---|---|---|
| `#e8e8e8` on `#0a0a0a` | ~17:1 | ✅ |
| `#888888` on `#0a0a0a` | ~5.7:1 | ✅ |
| `#F59E0B` on `#1a1a1a` | ~6.4:1 | ✅ |
| `#10B981` on `#1a1a1a` | ~5.1:1 | ✅ |
| `#EF4444` on `#1a1a1a` | ~4.7:1 | ✅ |

### Status Communication

Status badges always include **both colour and text label** — never colour alone. A user with colour blindness can always read the status from the text.

### Screen Reader Support

Ionic components include ARIA roles and labels by default. Custom components follow these rules:
- All icon-only buttons have `aria-label` describing the action
- Images have `alt` text describing their content
- Modal overlays use `aria-modal="true"` and trap focus while open
- Status changes announce via `aria-live="polite"` region

### Keyboard Navigation

Not applicable — this is a mobile-only app. Physical keyboard navigation (e.g. from a Bluetooth keyboard) is not a requirement for MVP.

### Components Most at Risk

| Component | Risk | Mitigation |
|---|---|---|
| `StatusBadge` | Colour-only meaning | Text label always present alongside colour |
| `VideoPlayer` | No captions | Acceptable for MVP — wish videos are personal, user-recorded content |
| Camera recording screen | No visual description of recording state for screen reader users | `aria-live` region announces "Recording started" and "Recording stopped" |

---

## 11. Navigation and Routing

### Full Route Map

| Route | Component | Auth Required | Admin Required |
|---|---|---|---|
| `/` | `SplashView` | No | No |
| `/onboarding` | `OnboardingView` | No | No |
| `/home` | `HomeView` | Yes | No |
| `/record` | `RecordView` | Yes | No |
| `/preview` | `PreviewView` | Yes | No |
| `/wish/:id` | `WishDetailView` | Yes | No |
| `/admin` | `AdminView` | Yes | Yes |
| `/admin/wish/:id` | `AdminWishDetailView` | Yes | Yes |

### Navigation Guard Logic

```ts
router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // Wait for auth to initialise on first load
  if (!auth.initialised) await auth.waitForInit()

  // Redirect unauthenticated users
  if (to.meta.requiresAuth && !auth.user) return '/onboarding'

  // Redirect non-admin users away from admin routes
  if (to.meta.requiresAdmin && !auth.isAdmin) return '/home'
})
```

### Invalid Routes

Any unmatched route (`404`) redirects to `/home`. No 404 screen is shown — the app silently lands the user in a known state.

### Navigation State Preservation

Ionic's navigation stack (`IonRouterOutlet`) preserves the component state of pages in the stack. The Home screen is not destroyed when navigating to Record — it is kept alive and restored on back navigation. This means the wish list does not reload on every back navigation.

### Deep Link Handling (Notification Tap)

When a push notification is tapped, the app receives a `wishId` payload and navigates directly to `/wish/:id`. If the app is cold-starting from the notification tap, the auth and data initialisation sequence completes before the navigation resolves.

---

## 12. Visual and Interaction Consistency

### Enforcing Consistency

| Mechanism | What It Enforces |
|---|---|
| CSS variables in `variables.css` | All colours, spacing, and typography reference tokens — no hardcoded values |
| `<style scoped>` on all components | No style leakage between components |
| Base component library (`PrimaryButton`, `WishCard`, etc.) | Consistent behaviour and appearance for repeated UI patterns |
| ESLint `no-restricted-syntax` rule | Warns on hardcoded hex colour values in style blocks |
| Prettier | Consistent code formatting — eliminates style inconsistency from formatting drift |

### Preventing One-Off UI Hacks

- Any new UI element that could be reused more than once is extracted into a component in `/src/components/` before it is used in a second place
- Inline `style` attributes are prohibited for design values (colours, spacing, font sizes) — only permitted for dynamic values that cannot be expressed in CSS (e.g. upload progress bar width as a percentage)
- All animation durations and easing curves are defined as CSS variables: `--transition-fast: 150ms ease`, `--transition-standard: 300ms ease`

---

## 13. Frontend Security

### XSS Prevention

Vue 3's template compiler HTML-escapes all interpolated values by default (`{{ value }}` is always escaped). The `v-html` directive is **prohibited** in this codebase — no user-generated content is ever rendered as raw HTML. ESLint's `vue/no-v-html` rule enforces this.

### Input Sanitisation

Wish text and admin messages are stored as plain strings in Firestore. They are rendered using Vue's safe text interpolation — never as HTML. No HTML sanitisation library is needed because no HTML is ever rendered.

### Sensitive Data on the Client

| Data | Handling |
|---|---|
| Firebase config (API key, project ID) | Stored in `.env`, accessed via `import.meta.env.VITE_*` — not secret (see tech-stack.md Security section) |
| Firebase Auth token | Managed entirely by the Firebase JS SDK — never accessed or stored manually |
| Admin PIN | Stored in Firestore under the admin's user document, not hardcoded in the app bundle |
| User uid and username | Stored in `@capacitor/preferences` — not sensitive, not cryptographically protected |
| Video files | Stored in Firebase Storage — access controlled by Storage security rules |

The client-side admin route guard (router navigation guard) is a UX convenience only. The real authorisation enforcement is the Firestore security rules, which are server-side and cannot be bypassed by a client.

---

## 14. Feature Flags and Experimentation

### MVP Approach: None Needed

Feature flags are not implemented in the MVP. With one developer and six users, the overhead of a feature flag system (Firestore config document, flag checks in components) produces no benefit.

Unreleased features are simply not built. Future features listed in the spec (live chat, AI moderation, reactions) are architecturally prepared for (clean service boundaries, modular stores) but have no code, no UI, and no flags.

### If Feature Flags Are Needed Later

The simplest viable approach: a Firestore document at `/config/featureFlags` readable by all authenticated users. Flags are boolean fields. The app fetches this document on launch and stores it in a `configStore`. No third-party service needed.

```ts
// Future: configStore
const flags = { liveChat: false, aiModeration: false }
```

No A/B testing or gradual rollout tooling is planned for MVP.

---

## 15. Frontend Observability

### Error Tracking — Firebase Crashlytics

**Firebase Crashlytics** (free) is integrated via `@capacitor-firebase/crashlytics`. It automatically captures:
- Unhandled JavaScript exceptions
- Unhandled Promise rejections
- Native crashes (ANR on Android, EXC_BAD_ACCESS on iOS)

Each crash report includes the app version, device model, OS version, and a stack trace. Crashlytics is the primary tool for detecting production issues.

All caught errors in service methods are also logged to Crashlytics manually:

```ts
import { FirebaseCrashlytics } from '@capacitor-firebase/crashlytics'

try {
  await UploadService.uploadVideo(...)
} catch (e) {
  await FirebaseCrashlytics.recordException({ message: `Upload failed for uid: ${uid}` })
  uploadStore.error = 'Upload failed. Please try again.'
}
```

### User Behaviour — Firebase Analytics

**Firebase Analytics** (free) is integrated via the Firebase JS SDK. The following events are tracked:

| Event | Trigger | Parameters |
|---|---|---|
| `app_open` | Every app launch | Automatic (Firebase default) |
| `wish_recording_started` | User taps "Make a Wish" | — |
| `wish_submitted` | Upload completes successfully | `{ wishId }` |
| `wish_viewed` | User opens Wish Detail screen | `{ status: 'pending' \| 'granted' \| 'rejected' }` |
| `notification_opened` | User taps a push notification | `{ wishId }` |
| `onboarding_completed` | User reaches Home for the first time | — |

**What is not tracked:** location, contacts, clipboard, device identifiers beyond Firebase's anonymous `app_instance_id`.

### Debugging Production Issues

**Step-by-step debugging flow:**

1. **Check Crashlytics** — Firebase Console → Crashlytics → Issues. Look for the crash report matching the time of the reported issue.
2. **Check Firestore** — Firebase Console → Firestore → Data viewer. Inspect the relevant user and wish documents to verify data state.
3. **Check Storage** — Firebase Console → Storage. Verify the video file exists at the expected path.
4. **Check Analytics** — Firebase Console → Analytics → Events. Verify the sequence of events leading up to the issue.
5. **Reproduce locally** — Run `ionic serve`, replicate the steps that caused the issue, use Chrome DevTools Console and Network tabs to observe the failure.
6. **Device debugging** — If the issue is device-specific (camera, notifications), connect an Android device via USB and use Chrome Remote Debugging (`chrome://inspect`) to access DevTools on the device.