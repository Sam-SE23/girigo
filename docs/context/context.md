# context.md — Girigo App Session Context

---

## HOW TO USE THIS FILE

This is the **only file that changes every session**. All other `.md` files are
updated only when architectural decisions change. This file is updated at the
**end of every Cursor session** and read at the **start of every Cursor session**.

It is the working memory of the project. It tells Cursor exactly where things stand
right now, what is being built, what is locked, and what must not be assumed.

**Session start:** Read this file first. Then read the specific `.md` files listed
in Section 15 for the current task.

**Session end:** Update Sections 1, 3, 6, 7, 9, 11, 12, and 13 to reflect what
changed. Do not modify Sections 4, 5, 14, or 15 unless a locked decision has
formally changed (which requires updating the relevant `.md` file first).

```
LAST UPDATED: [context engineering phase — pre-initialization]
CURRENT MILESTONE: none — project not yet initialized
CURRENT BRANCH: none — repository not yet created
LAST STABLE TAG: none
ACTIVE TASK: project initialization
```

---

## 1. System State Snapshot

### Component Status

| Component | Status | Notes |
|---|---|---|
| GitHub Repository | ⏳ Not started | Not yet created |
| Ionic Vue project | ⏳ Not started | Not yet initialized |
| Firebase project | ⏳ Not started | Not yet created in Firebase Console |
| Firestore rules | ⏳ Not started | Written in context docs; not yet deployed |
| Storage rules | ⏳ Not started | Written in context docs; not yet deployed |
| Firestore indexes | ⏳ Not started | Defined in context docs; not yet deployed |
| `.env` configuration | ⏳ Not started | Template defined; values not yet set |
| Firebase Auth (anonymous) | ⏳ Not started | Requires Firebase project |
| CI/CD workflows | ⏳ Not started | Defined in `devops.md`; not yet created |
| GitHub Pages download site | ⏳ Not started | |
| APK signing keystore | ⏳ Not started | |

### Implementation Status

| Layer | Status |
|---|---|
| `/src/types/index.ts` (TypeScript interfaces) | ⏳ Not started |
| `/src/theme/variables.css` (design tokens) | ⏳ Not started |
| `AuthService.ts` | ⏳ Not started |
| `WishService.ts` | ⏳ Not started |
| `UploadService.ts` | ⏳ Not started |
| `AdminService.ts` | ⏳ Not started |
| `NotificationService.ts` | ⏳ Not started |
| `StorageService.ts` | ⏳ Not started |
| Pinia stores | ⏳ Not started |
| Vue Router config | ⏳ Not started |
| Onboarding screens | ⏳ Not started |
| Home screen | ⏳ Not started |
| Record flow | ⏳ Not started |
| Admin panel | ⏳ Not started |
| Push notifications | ⏳ Not started |
| Unit tests | ⏳ Not started |
| Integration tests | ⏳ Not started |

### Working State

| Environment | Status |
|---|---|
| Browser (`ionic serve`) | ⏳ Not available — project not initialized |
| Android device | ⏳ Not available |
| Firebase project | ⏳ Not available |

### Branch and Version State

```
Repository:      does not exist yet
Active branch:   none
Last stable tag: none
Uncommitted changes: n/a
```

---
> **SESSION UPDATE PATTERN — replace the above tables each session:**
> Change ⏳ to ✅ (done), 🔄 (in progress), or ❌ (blocked) as work progresses.
> Update branch, tag, and uncommitted changes fields at the start of every session.
---

## 2. Current Architecture State

### Actual Deployed Architecture

Nothing is deployed. The entire architecture exists as documentation in the
context `.md` files only. No code has been written, no Firebase project has been
created, and no repository exists.

### Planned Architecture (from context files)

```
[Android / iOS Device]
  └── Ionic Vue 3 App (Capacitor WebView)
        ├── Views (.vue) → Stores (Pinia) → Services (TypeScript)
        └── Services → Firebase JS SDK → Firebase Platform
                                          ├── Firebase Auth (anonymous)
                                          ├── Cloud Firestore
                                          ├── Firebase Storage
                                          └── Firebase Cloud Messaging
```

### Known Temporary Decisions (Technical Debt from Day One)

| Decision | Why Temporary | When to Revisit |
|---|---|---|
| FCM legacy server key stored in `.env` / APK | Firebase Functions (correct solution) requires Blaze plan | When upgrading to Blaze plan |
| One Firebase project for all environments | No staging/prod separation | If app ever gets real users beyond portfolio testing |
| Anonymous auth only | No account portability across reinstalls | If users request persistent identity |
| No automated Firestore backups | Not available on free Spark plan | If data becomes valuable enough to protect |
| No per-user wish submission rate limiting | Requires Firebase Functions | When upgrading to Blaze plan |
| Manual FCM notification from admin panel | No server-side trigger | When Firebase Functions are available |

---
> **SESSION UPDATE PATTERN:**
> Add new temporary decisions as they are introduced.
> Move items to the relevant `.md` file when they are formally resolved.
---

## 3. Implementation Progress Tracking

### Milestone v0.1.0 — Foundation

| Task | Status | Notes |
|---|---|---|
| Create GitHub repository | ⏳ Not started | |
| Initialize Ionic Vue TypeScript project | ⏳ Not started | `ionic start girigo blank --type vue` |
| Configure folder structure per `design.md` | ⏳ Not started | |
| Create Firebase project | ⏳ Not started | Firebase Console — region: asia-southeast1 |
| Enable anonymous authentication | ⏳ Not started | Firebase Console → Auth → Sign-in methods |
| Configure `.env` with Firebase values | ⏳ Not started | |
| Install all required dependencies | ⏳ Not started | See `tech-stack.md` Section 3 |
| Set up `/src/theme/variables.css` | ⏳ Not started | All design tokens from `frontend.md` Section 3 |
| Set up `/src/types/index.ts` | ⏳ Not started | `WishDocument`, `UserDocument`, `NewWish`, `StatusUpdate` |
| Write `firestore.rules` | ⏳ Not started | From `backend.md` Section 5 |
| Write `storage.rules` | ⏳ Not started | From `backend.md` Section 5 |
| Write `firestore.indexes.json` | ⏳ Not started | From `database.md` Section 7 |
| Deploy Firestore and Storage rules | ⏳ Not started | `firebase deploy --only firestore:rules,storage,firestore:indexes` |
| `AuthService.ts` | ⏳ Not started | |
| `StorageService.ts` (preferences) | ⏳ Not started | |
| `authStore.ts` | ⏳ Not started | |
| `userStore.ts` | ⏳ Not started | |
| Vue Router config | ⏳ Not started | All routes from `frontend.md` Section 11 |
| Splash screen | ⏳ Not started | |
| Intro screen | ⏳ Not started | |
| Permissions screen | ⏳ Not started | |
| Home screen (empty state) | ⏳ Not started | |
| GitHub Actions `build.yml` | ⏳ Not started | |
| Husky pre-commit hooks | ⏳ Not started | |
| Set up Vitest + Vue Test Utils | ⏳ Not started | |
| Set up Firebase Local Emulator | ⏳ Not started | |

### Milestone v0.2.0 — Core Feature

All tasks: ⏳ Not started — blocked by v0.1.0

### Milestone v0.3.0 — Admin System

All tasks: ⏳ Not started — blocked by v0.2.0

### Milestone v0.4.0 — Notifications

All tasks: ⏳ Not started — blocked by v0.3.0

### Milestone v1.0.0 — MVP Complete

All tasks: ⏳ Not started — blocked by v0.4.0

---
> **SESSION UPDATE PATTERN:**
> Update task statuses at the end of each session.
> Add new tasks discovered during implementation.
> Move completed milestones to a collapsed "Completed Milestones" section.
---

## 4. Locked Decisions

These decisions are fixed. Cursor must not propose alternatives to these. If a
locked decision appears to be wrong, raise it with the developer — do not silently
work around it.

### Technology Stack (Locked)

| Decision | Locked Choice | Why Locked |
|---|---|---|
| Mobile framework | Ionic + Vue 3 + TypeScript + Capacitor | Developer knows Vue; established in `tech-stack.md` with full decision matrix |
| State management | Pinia | Official Vue recommendation; established in `tech-stack.md` |
| Styling | Ionic CSS variables + plain SCSS | Tailwind conflicts with Ionic; established in `tech-stack.md` |
| Backend | Firebase BaaS only (free Spark plan) | No custom server; established in `design.md` ADR |
| Firebase Functions | Not used in MVP | Not available on Spark plan; admin acts manually |
| Testing | Vitest + Vue Test Utils + Firebase Local Emulator | Established in `tech-stack.md` and `testing.md` |
| CI/CD | GitHub Actions — plain Node.js steps | No Docker; established in `tech-stack.md` and `devops.md` |
| Work cadence | Milestone-based | Established in `process.md` |
| AI IDE | Cursor | Established in `process.md` |

### Architecture (Locked)

| Decision | Locked Choice | Why Locked |
|---|---|---|
| Layering rule | Views → Stores → Services → Firebase SDK | Established in `design.md` Section 5; architectural constraint |
| Firebase calls in views | FORBIDDEN | Violates layering rule |
| Firebase calls in stores | FORBIDDEN | Violates layering rule |
| Authentication | Anonymous Firebase Auth (MVP) | Established in `auth.md` |
| Authorisation model | RBAC — `role: 'user' \| 'admin'` on Firestore user document | Established in `auth.md` Section 3 |
| Admin PIN | SHA-256 hash stored in Firestore, client-side verification | Established in `auth.md` Section 5 |
| Server-side authorisation | Firestore security rules are authoritative | Client-side guards are UX only; established in `security.md` |
| Admin panel entry | 5-tap gesture + PIN (client UX) + Firestore role check (server) | Established in spec and `auth.md` |
| Status transitions | One-way: `pending → granted` or `pending → rejected` only | Established in `backend.md` Section 2 |
| Wish deletion | Hard delete: Firestore document + both Storage files | Established in `database.md` Section 4 |
| Delete ordering | Firestore document deleted first, then Storage files | Established in `backend.md` Section 3 |
| Upload ordering | Storage uploads first, then Firestore write | Established in `backend.md` Section 3 |
| Admin style | Functional contrast (same dark base, cleaner layout) | Established in `frontend.md` Section 3 |

### Database Schema (Locked)

| Decision | Locked Choice |
|---|---|
| Users collection path | `/users/{uid}` |
| Wishes collection path | `/wishes/{wishId}` |
| Video Storage path | `/wishVideos/{uid}/{wishId}.mp4` |
| Thumbnail Storage path | `/thumbnails/{uid}/{wishId}.jpg` |
| Wish status values | `'pending' \| 'granted' \| 'rejected'` only |
| Initial wish status | Always `'pending'` — never any other value at creation |
| Username denormalisation | `username` copied onto every wish document at creation |
| wishId | Client-generated UUID — matches Firestore document ID |
| uid on wish | Must match `request.auth.uid` — enforced by Firestore rules |

### Conditions for Revisiting a Locked Decision

A locked decision can only be revisited if:
1. The developer explicitly opens a GitHub Issue proposing the change
2. The relevant context `.md` file is updated with the new decision before any code changes
3. The change does not break any existing tests

---

## 5. Non-Negotiables

These must never change under any circumstance. Changing them would break the
system, expose user data, or violate the architectural contract.

### Absolute Rules for Code Generation

```
1. NEVER import firebase/firestore or firebase/storage in .vue files
2. NEVER import firebase/firestore or firebase/storage in Pinia store files
3. NEVER use v-html anywhere in the codebase
4. NEVER hardcode hex colour values in <style> blocks — use CSS variables only
5. NEVER hardcode secrets, API keys, or tokens in source files
6. NEVER write a Firestore document before both Storage uploads succeed (upload ordering)
7. NEVER allow a status transition from 'granted' or 'rejected' to any other value
8. NEVER expose raw Firebase error codes to the UI layer — always catch and rethrow human-readable messages
9. NEVER skip the try/catch wrapper in async service methods
10. NEVER deploy Firestore rules without running integration tests first
```

### What Would Break the System If Changed

| Non-Negotiable | What Breaks If Violated |
|---|---|
| Layering rule | Business logic scattered across components; untestable; architectural chaos |
| Firestore rules as authoritative auth layer | Client-side bypass exposes all user data |
| Upload ordering (Storage before Firestore) | Wish documents with missing videos; admin sees blank player |
| One-way status transitions | Users receive duplicate notifications; admin panel state becomes inconsistent |
| Hard delete (not soft delete) | Storage files orphaned indefinitely; quota consumed without cleanup |
| No v-html | XSS via wish text rendered in admin panel |
| CSS variables only | Design token system breaks; future theme changes require hunting through component files |

---

## 6. Current Task Definition

```
TASK: Project Initialization
MILESTONE: v0.1.0 — Foundation
STATUS: Not started
```

### What Is Included in This Task

1. Create the GitHub repository named `girigo` with `main` and `dev` branches
2. Initialize the Ionic Vue TypeScript project inside the repo
3. Configure the folder structure as defined in `design.md` and `tech-stack.md`
4. Create the Firebase project in Firebase Console (region: `asia-southeast1`)
5. Enable anonymous authentication in Firebase Console
6. Install all required npm dependencies from `tech-stack.md` Section 3
7. Create `.env.example` with all required keys (values blank)
8. Create `.env` with actual Firebase config values (gitignored)
9. Write `firestore.rules`, `storage.rules`, `firestore.indexes.json`
10. Deploy rules to Firebase via `firebase deploy`
11. Set up Husky pre-commit hooks (TypeScript check + ESLint)
12. Set up Vitest configuration
13. Set up Firebase Local Emulator configuration
14. Create `.github/workflows/build.yml`
15. Create `.cursor/rules/project.md`

### What Is Explicitly NOT Included in This Task

- Any UI screens beyond the empty project scaffold
- Any service layer implementation
- Any Pinia stores
- Any tests (test framework setup yes; actual test cases no)
- Firebase Crashlytics or Analytics integration
- APK signing keystore setup
- GitHub Pages download site

### Definition of Done for This Task

```
[ ] GitHub repository exists with main and dev branches
[ ] ionic start girigo blank --type vue runs without errors
[ ] Folder structure matches design.md spec
[ ] Firebase project exists in Firebase Console
[ ] Anonymous auth enabled in Firebase Console
[ ] .env exists locally with real Firebase values (gitignored)
[ ] .env.example committed with all keys, values blank
[ ] All dependencies installed (npm install passes)
[ ] ionic serve runs without errors in browser
[ ] vue-tsc --noEmit passes with zero errors
[ ] eslint src/ passes with zero errors
[ ] firestore.rules, storage.rules, firestore.indexes.json committed
[ ] firebase deploy --only firestore:rules,storage,firestore:indexes succeeds
[ ] Husky pre-commit hook runs on git commit
[ ] vitest run reports "no test files found" (framework set up, no tests yet)
[ ] .github/workflows/build.yml committed
[ ] .cursor/rules/project.md committed
[ ] context.md updated to reflect completion of all v0.1.0 initialization tasks
```

### What Would Make This Task Considered Failed

- `ionic serve` produces errors in the browser console
- Firebase config values are committed to the repository
- Firestore or Storage rules fail to deploy
- TypeScript errors exist in the initial project scaffold

---
> **SESSION UPDATE PATTERN:**
> Replace the task name, milestone, included/excluded items, and done conditions
> with the current task at the start of each new session.
---

## 7. Expected Output

### For the Current Task (Project Initialization)

| Output | Format | Quality Standard |
|---|---|---|
| GitHub repository | Public repository at `github.com/[username]/girigo` | Contains `main` and `dev` branches; `README.md`; `.gitignore` |
| Ionic Vue project | Generated by `ionic start` + customized folder structure | Matches `design.md` folder layout exactly |
| Firebase config | `.env` locally; `.env.example` committed | All `VITE_FIREBASE_*` keys present |
| Security rules | `firestore.rules`, `storage.rules` | Match rules defined in `backend.md` Section 5; deployed and active |
| Firestore indexes | `firestore.indexes.json` | Both compound indexes from `database.md` Section 7 |
| CI workflow | `.github/workflows/build.yml` | Matches pipeline defined in `devops.md` Section 9 |
| Cursor rules | `.cursor/rules/project.md` | Contains the core rules from `process.md` Section 15 |

### General Output Standards (Every Session)

All code generated by Cursor must meet these standards before being accepted:

- Zero TypeScript errors (`vue-tsc --noEmit`)
- Zero ESLint errors
- Follows the layering rule (Views → Stores → Services → SDK)
- Follows naming conventions from `process.md` Section 7
- All async service methods wrapped in `try/catch` with human-readable errors
- No hardcoded colours, secrets, or Firebase calls in components

---
> **SESSION UPDATE PATTERN:**
> Update the "For the current task" table to reflect what the current session
> should produce.
---

## 8. Context Dependencies

### For the Current Task

| Dependency | Status | Blocking? |
|---|---|---|
| Firebase Console access (Google account) | Developer must have this | Yes — cannot create Firebase project without it |
| Node.js installed locally | Developer must have this | Yes — required for `ionic start` and `npm install` |
| Ionic CLI installed (`npm install -g @ionic/cli`) | May need to install | Yes |
| Firebase CLI installed (`npm install -g firebase-tools`) | May need to install | Yes — required for `firebase deploy` |
| Android Studio + Android SDK (API 24+) | Can defer | No — not needed for `ionic serve` |

### For All Future Tasks

| Dependency | Where Defined |
|---|---|
| `WishDocument` and `UserDocument` interfaces | Must exist in `/src/types/index.ts` before any service is written |
| Design tokens (`variables.css`) | Must exist before any component styling is written |
| Firebase project configured | Must exist before `AuthService` can be implemented |
| `AuthService` complete | Must exist before any store that calls auth functions |
| `authStore` complete | Must exist before any screen that requires an authenticated user |
| Firestore rules deployed | Must exist before any service method that reads/writes Firestore |
| `WishService` complete | Must exist before home screen wish list |
| `UploadService` complete | Must exist before record flow |

---

## 9. Known Issues and Technical Debt

### Current Issues

None — project has not been initialized yet.

### Pre-Accepted Technical Debt (From Day One)

These are known limitations accepted at project start. They are documented as
temporary decisions in `design.md` Section 2 and must not be "fixed" without
the developer explicitly deciding to change them.

| Debt | Risk Level | When to Address |
|---|---|---|
| FCM legacy server key in APK | Medium — notification spam if extracted | Upgrade to Blaze plan + Firebase Functions |
| One Firebase project (no env separation) | Low — test data in same DB as production | If app gets real users |
| No per-user rate limiting | Low — abuse possible at scale | Upgrade to Blaze plan |
| No automated Firestore backups | Low — data loss possible | If data becomes commercially valuable |
| Manual push notifications from admin panel | Low — admin must manually notify | Upgrade to Blaze + Functions |
| Anonymous auth only | Medium — user loses history on reinstall | When adding Google Sign-In |

### Intentionally Unfinished (Future Features — Do Not Implement)

These are listed in the spec as future features. Cursor must NOT implement them
unless explicitly instructed. Do not add structure, placeholder code, or stubs
for these unless the developer opens a GitHub Issue for them.

- Live chat between user and admin
- AI content moderation
- Comments and reactions
- User profile customization
- Web admin dashboard
- Wish categories or tags
- Animated wish reveal experience

---
> **SESSION UPDATE PATTERN:**
> Add new bugs or debt items discovered during the session.
> Move resolved items to a "Resolved Issues" section with the date fixed.
---

## 10. Risk Register

### Active Risks

| Risk | Probability | Impact | Priority | Mitigation |
|---|---|---|---|---|
| Firestore rules misconfiguration | Medium | High | 🔴 High | Rules integration tests run in CI before every deploy; Rules Playground check before merge |
| FCM key extracted from APK | Low | Medium | 🟡 Medium | Accepted limitation; documented in `security.md`; plan to move to Functions when on Blaze |
| Anonymous auth reinstall = lost history | Certain | Medium | 🟡 Medium | Accepted by design; document in app onboarding as a known limitation |
| APK signing key lost | Low | High | 🟡 Medium | Stored only in GitHub Secrets; never on disk |
| Firebase free tier quota exceeded | Very low | Medium | 🟢 Low | 6 users; daily limits will never be reached; monitor Firebase Console weekly |
| npm dependency CVE | Low | Variable | 🟢 Low | `npm audit` in CI; Dependabot enabled on repo |
| Capacitor/Ionic version incompatibility | Low | Medium | 🟢 Low | Pin versions; upgrade deliberately with testing |
| iOS build not in CI | Certain | Low | 🟢 Low | Accepted; iOS tested manually on Mac if needed |

---

## 11. Active Bugs and Blockers

### Bugs

None — project not initialized.

### Blockers

| Blocker | What It Blocks | Resolution |
|---|---|---|
| GitHub repository not created | Everything | Create repository (current task) |
| Firebase project not created | Auth, Firestore, Storage, FCM | Create in Firebase Console (current task) |
| Ionic project not initialized | All app code | Run `ionic start` (current task) |

---
> **SESSION UPDATE PATTERN:**
> Add bugs as they are discovered during implementation.
> Remove resolved bugs with a note of what fixed them.
> Update blockers as they are resolved.
---

## 12. Recent Changes

### Context Engineering Phase (Pre-Code)

No code changes have been made. The following context files have been written
and represent the current state of all architectural decisions:

| File | Contents Summary |
|---|---|
| `design.md` | Architecture decisions, system context, component map, data flows, failure modes |
| `tech-stack.md` | Full decision matrix for Ionic+Vue vs Flutter vs React Native; Firebase vs alternatives; all tool choices with rationale |
| `frontend.md` | UX flows, design system, design tokens, state classification, navigation, accessibility |
| `backend.md` | Firebase as API layer, service method contracts, domain model, business rules, security rules |
| `database.md` | Firestore schema, indexes, lifecycle, migrations, constraints |
| `auth.md` | Anonymous auth strategy, token lifecycle, RBAC model, admin PIN approach |
| `security.md` | Threat model, attack scenarios, OWASP coverage, incident response |
| `devops.md` | CI/CD pipelines, build process, deployment strategy, secrets management |
| `testing.md` | Test pyramid, critical tests, mocking strategy, deployment gates |
| `process.md` | Milestone structure, Cursor collaboration model, coding standards, Definition of Done |
| `context.md` | This file — current system state |

---
> **SESSION UPDATE PATTERN:**
> Replace this section at the end of each session with:
> "What was changed, what file was affected, why it was changed, what behaviour
> changed as a result."
> Keep only the last 2–3 sessions of history. Archive older entries to a
> CHANGELOG.md if needed.
---

## 13. Next Steps

### Immediate Next Actions (in order)

```
1. CREATE GITHUB REPOSITORY
   - Name: girigo
   - Visibility: public (for GitHub Pages and free CI minutes)
   - Initialize with README.md
   - Create dev branch immediately after main

2. INITIALIZE IONIC VUE PROJECT
   - Command: ionic start girigo blank --type vue --capacitor
   - Working directory: inside the cloned repo
   - Select: Vue, TypeScript
   - After init: restructure folders to match design.md spec

3. CREATE FIREBASE PROJECT
   - Firebase Console → Add project → name: girigo
   - Region: asia-southeast1 (Singapore)
   - Enable Google Analytics: no (will add manually later)
   - Enable anonymous authentication:
     Firebase Console → Authentication → Sign-in method → Anonymous → Enable
   - Copy config values to .env
```

### What Must Be Resolved Before Starting Next Steps

- Developer must have a Google account with Firebase Console access
- Node.js (v18+) must be installed locally
- Ionic CLI must be installed: `npm install -g @ionic/cli`
- Firebase CLI must be installed: `npm install -g firebase-tools`
- `firebase login` must be run to authenticate the CLI

### What Should NOT Be Done Next

- Do not implement any service layer before the folder structure and TypeScript
  interfaces are in place
- Do not build any screens before `variables.css` (design tokens) is set up
- Do not attempt to run on a physical Android device until `ionic serve` works
  without errors in the browser
- Do not implement FCM notifications — this is Milestone v0.4.0
- Do not implement the admin panel — this is Milestone v0.3.0

---
> **SESSION UPDATE PATTERN:**
> At the end of each session, replace this section with:
> - The 1–3 immediate next actions for the NEXT session
> - Their ordering dependencies
> - What must NOT be done next (common drift traps for this phase)
---

## 14. Context Boundaries

### What Cursor Must NOT Assume

```
1. Do NOT assume the project uses React, React Native, or Flutter.
   Stack is: Ionic + Vue 3 + TypeScript + Capacitor + Firebase.

2. Do NOT assume there is a custom backend server.
   There is no Express, no FastAPI, no Node server, no REST API.
   Firebase IS the backend.

3. Do NOT assume Firebase Functions are available.
   The project is on the free Spark plan. Functions require Blaze.

4. Do NOT generate code that calls Firebase SDK in .vue files or Pinia stores.
   All Firebase calls go through /src/services/ only.

5. Do NOT generate v-html anywhere.

6. Do NOT use Vuex. The state management library is Pinia.

7. Do NOT use Tailwind CSS. Styling uses Ionic CSS variables + plain SCSS.

8. Do NOT use localStorage or sessionStorage.
   Persistent local storage uses @capacitor/preferences only.

9. Do NOT add features from the "future features" list (live chat, AI moderation,
   reactions, profile customization, web dashboard) unless explicitly instructed.

10. Do NOT infer Firestore schema fields beyond what is defined in
    /src/types/index.ts and database.md Section 2.

11. Do NOT suggest upgrading to Firebase Blaze plan as part of a solution.
    All solutions must work within the free Spark plan constraints.

12. Do NOT assume admin notifications are automated.
    In MVP, admin manually sends push notifications from the in-app admin panel.
```

### What Is Intentionally Not Explained in This File

The following are documented in detail in their respective `.md` files.
Do not re-derive or infer them — read the authoritative file.

| Topic | Authoritative File |
|---|---|
| Firestore security rules | `backend.md` Section 5 |
| Firestore schema and field definitions | `database.md` Section 2 |
| Status transition rules | `backend.md` Section 2 and `database.md` Section 4 |
| Design tokens and CSS variables | `frontend.md` Section 3 |
| Service method contracts and signatures | `backend.md` Section 1 |
| Test cases that must never regress | `testing.md` Section 9 |
| Naming conventions | `process.md` Section 7 |
| TypeScript interface definitions | `database.md` Section 2 and `backend.md` Section 1 |
| Admin PIN hashing approach | `auth.md` Section 5 |
| Upload ordering rationale | `backend.md` Section 3 |

---

## 15. Continuity Instructions

### When Starting a New Cursor Session

**Step 1 — Read this file first:**
```
@context.md
```

**Step 2 — Read the files relevant to the current task:**

| If working on... | Also read... |
|---|---|
| Project initialization | `@design.md` `@tech-stack.md` `@devops.md` |
| Any service layer code | `@backend.md` `@database.md` |
| Authentication | `@auth.md` `@backend.md` |
| Security rules | `@security.md` `@backend.md` `@database.md` |
| Vue components or screens | `@frontend.md` `@design.md` |
| State management (Pinia stores) | `@backend.md` `@frontend.md` |
| Testing | `@testing.md` `@backend.md` |
| CI/CD or deployment | `@devops.md` `@tech-stack.md` |
| Database schema changes | `@database.md` `@backend.md` |

**Step 3 — State the session goal explicitly:**
```
"I am working on [GitHub Issue title / task description].
Current milestone: [v0.x.0].
The current system state is described in context.md Section 1."
```

### What Files Are Authoritative (Never Override These)

| Concern | Authoritative File | Never Infer From General Knowledge |
|---|---|---|
| Tech stack choices | `tech-stack.md` | Do not suggest alternatives to established choices |
| Architecture and layering | `design.md` | Do not propose new layers or shortcuts |
| Firestore schema | `database.md` | Do not add fields not in the schema |
| Business rules | `backend.md` | Do not relax or modify business invariants |
| Security rules | `security.md` + `backend.md` | Do not weaken rules for convenience |
| Auth model | `auth.md` | Do not add auth methods not in the plan |
| Naming conventions | `process.md` | Do not deviate from established naming patterns |
| Definition of done | `process.md` + this file Section 6 | Do not declare a task done without all conditions met |

### If Context Is Missing or Unclear

```
IF a context file is not loaded and the information is needed:
  → STOP and ask the developer to provide the relevant .md file
  → Do NOT guess or infer from general best practices
  → Do NOT use patterns from other frameworks (React, Django, etc.)

IF an instruction in this file conflicts with a specific .md file:
  → The specific .md file takes precedence for its domain
  → Flag the conflict to the developer

IF asked to implement a feature not described in any context file:
  → Ask the developer which context file governs this area
  → Do not proceed until the relevant context is provided or created

IF context.md has not been updated recently (last session info is stale):
  → Ask the developer to confirm current state before proceeding
  → Do not assume the state described here is current
```

### Session End Checklist

Before closing a Cursor session, the developer updates:

```
[ ] Section 1 — System State Snapshot (component statuses updated)
[ ] Section 3 — Implementation Progress (task statuses updated)
[ ] Section 6 — Current Task (updated to the NEXT task)
[ ] Section 9 — Known Issues (any new debt or bugs added)
[ ] Section 11 — Active Bugs and Blockers (resolved items removed)
[ ] Section 12 — Recent Changes (this session's changes documented)
[ ] Section 13 — Next Steps (updated to reflect what comes next)
[ ] LAST UPDATED field at top of file updated
[ ] Relevant .md files updated if any architectural decision changed
```