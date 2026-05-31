# process.md — Girigo App Engineering Process

---

## Framing Note

Girigo is built by **one developer working with Cursor as an AI coding partner**.
This process document is written for that reality — not for a team. Many traditional
process concepts (standups, sprint ceremonies, code review by a colleague) are
replaced by equivalent solo + AI practices.

This document is itself a context engineering artifact — it tells Cursor how this
project is run, what conventions to follow, and what constraints to respect when
generating or modifying code. It should be included in every Cursor session where
architectural or process decisions are relevant.

---

## 1. Engineering Methodology

### Delivery Model: Milestone-Based Continuous Development

Girigo does not use Scrum or time-boxed sprints. Work is organised around
**milestones** — each milestone represents a vertical slice of working functionality
that can be demonstrated end-to-end.

Development happens in **focused sessions** (hours, not scheduled sprints). A session
has a clear goal: "implement the upload flow", "set up Firestore rules", "build the
admin status update". Sessions end when the goal is achieved or a natural stopping
point is reached, not when a timer expires.

### Why This Model

| Reason | Detail |
|---|---|
| Fits solo development rhythm | Work happens in available time, not on a fixed calendar schedule |
| Milestone = deployable increment | Each milestone produces a testable, git-tagged version of the app |
| No ceremony overhead | No standups, retrospectives, or planning meetings — just building |
| AI partner works best with clear session goals | Cursor produces better output when given a well-scoped, concrete task than an open-ended sprint goal |

### Problems It Prevents

- Over-planning before implementation (milestone scope is loose — adjust as you learn)
- Sprint commitment pressure on a flexible personal schedule
- Fake velocity metrics that don't reflect real progress

### Problems It Introduces

- Scope creep within a milestone if the goal is not clearly defined at session start
- Risk of working on interesting-but-not-blocking features before critical-path
  features
- **Mitigation:** Each milestone has a defined feature list in this document.
  Anything not on the list is deferred to a later milestone or the backlog.

---

## 2. Work Planning and Breakdown

### Milestone Structure

Milestones are defined in this document and tracked as **GitHub Milestones** in the
repository. Each milestone maps to a version tag.

| Milestone | Version | Deliverables |
|---|---|---|
| **Foundation** | `v0.1.0` | Firebase project configured; anonymous auth working; user document created on first launch; splash → onboarding → home navigation; theme/design tokens in place; Firestore and Storage rules deployed |
| **Core Feature** | `v0.2.0` | Camera opens and records; video compressed; thumbnail generated; upload flow with progress bar; wish document created in Firestore; wish card displayed on home screen |
| **Admin System** | `v0.3.0` | Admin panel accessible via 5-tap + PIN; pending wish queue loads; admin can watch video; admin can grant or reject with optional message; status updates visible to user |
| **Notifications** | `v0.4.0` | FCM token registered and saved; push notification sent on admin status change; foreground/background notification handling; notification tap navigates to wish detail |
| **MVP Complete** | `v1.0.0` | All smoke test checklist items pass on a physical Android device; signed APK released; GitHub Pages download site live; all context `.md` files current |

### Breaking Milestones Into Tasks

Each milestone is broken into **GitHub Issues**. An issue is the smallest unit of
work that:
- Can be completed in a single Cursor session (1–3 hours)
- Has a clear, verifiable done condition
- Does not depend on another incomplete issue in the same milestone

**Issue template:**
```
## What
[One sentence: what is being built or fixed]

## Why
[One sentence: why this is needed for the milestone]

## Done when
- [ ] [Specific, verifiable condition 1]
- [ ] [Specific, verifiable condition 2]
- [ ] [Tests written for any new service logic]
- [ ] [No TypeScript errors, no ESLint errors]
- [ ] [Manually tested in browser or on device]

## Context files
[Which .md files Cursor should read before implementing: e.g. @frontend.md @backend.md]
```

### What Defines a "Ready" Task

A task is ready to be worked on when:
- The done conditions are written out in the GitHub Issue
- The relevant context files are identified
- Any blocking tasks from the same milestone are complete

### Preventing Oversized Tasks

If an issue's done conditions list more than 5 items, split it into two issues.
If a task cannot be completed in a single Cursor session, it is too large.

### Prioritisation Rules

Within a milestone, work in this order:
1. **Blockers first**: tasks that other tasks in the milestone depend on
2. **Critical path second**: tasks on the core user flow (auth → record → upload → status)
3. **Supporting features third**: admin panel, notifications, edge case handling
4. **Polish last**: animations, copy refinement, empty states

**Final say on priority:** The developer. Cursor proposes; the developer decides.

---

## 3. Milestone Cycle Structure

### Starting a Milestone

Before beginning a milestone:
1. Create GitHub Issues for every task in the milestone
2. Assign the milestone label to each issue in GitHub
3. Review the relevant context `.md` files to refresh understanding of the
   architecture decisions that apply to this milestone
4. Identify which Cursor context files to include in the first session

### Working Through a Milestone

Each development session follows this pattern:

```
1. Open Cursor
2. Reference relevant context files in the session:
   @design.md @tech-stack.md @[relevant-feature].md
3. State the session goal clearly: "I am implementing [specific issue]"
4. Work with Cursor to implement the task
5. Review all Cursor-generated code before accepting (see Section 5)
6. Run the test suite locally: vitest run
7. Fix any TypeScript or lint errors
8. Commit the work to the dev branch
9. Close the GitHub Issue when done conditions are met
```

### Completing a Milestone

A milestone is complete when:
- All GitHub Issues in the milestone are closed
- All tests pass (`vitest run` locally)
- Firestore rules integration tests pass against the emulator
- `ionic build` succeeds without errors
- Manual smoke test confirms the milestone's features work on a device
- The dev branch is merged to main via PR (even solo — triggers CI)
- A version tag is pushed (`git tag v0.x.0 && git push --tags`)
- The GitHub Release is created with release notes
- Any new architectural decisions made during the milestone are reflected in the
  relevant context `.md` files

### Definition of Done (Per Feature)

A feature is done when ALL of the following are true:

| Condition | Check |
|---|---|
| Code compiles with zero TypeScript errors (`vue-tsc --noEmit`) | ✅ |
| Zero ESLint errors | ✅ |
| Unit tests written for all new service methods | ✅ |
| All existing tests still pass | ✅ |
| New Firestore rules tested against emulator (if rules changed) | ✅ |
| Feature manually tested in browser (`ionic serve`) | ✅ |
| Device-specific features manually tested on Android device | ✅ (if applicable) |
| Code follows the layering rules in `design.md` Section 5 | ✅ |
| No hardcoded colour values, secrets, or Firebase calls in components | ✅ |
| Relevant context `.md` file updated if any decision changed | ✅ |
| Branch merged to `dev` via commit; PR to `main` on milestone completion | ✅ |

**Can partially complete features be merged to `dev`?**
Yes — in-progress work can be committed to `dev`. Partial features must not break
existing features. Incomplete features should be behind a conditional that prevents
them from appearing in the UI until they are done.

**Can partially complete features be merged to `main`?**
No — `main` only receives complete milestones.

---

## 4. Collaboration Model (Developer + Cursor)

### How the Developer–Cursor Partnership Works

| Role | Responsibility |
|---|---|
| **Developer** | Defines what to build; reviews all generated code; makes architectural decisions; runs tests; makes final merge decisions |
| **Cursor** | Proposes implementations; generates code; explains trade-offs; suggests tests; flags potential issues it notices |

Cursor is an implementation partner, not an autonomous decision-maker. Every piece
of Cursor-generated code is reviewed by the developer before it is committed.

### How to Work With Cursor Effectively on This Project

1. **Start each session by loading context:**
```
   @design.md @tech-stack.md @backend.md
   "I am building [feature] in the [layer] layer of the Girigo app.
   The current milestone is [milestone name]."
```

2. **Give Cursor a single, scoped task per session prompt:**
   Instead of: *"Build the whole upload flow"*
   Use: *"Write the `uploadVideo` method in `UploadService.ts` that uploads a video
   file to Firebase Storage with progress tracking and retry on failure. Follow the
   service layer patterns in `backend.md`."*

3. **Always specify which context file governs the code being written:**
```
   "Following the service layer rules in @backend.md Section 5 and the domain model
   in @database.md Section 2, implement..."
```

4. **Review Cursor output against these specific files before accepting:**
   - Does the code follow the layering rule (components → stores → services → SDK)?
   - Does it use CSS variables from `variables.css` for any colours or spacing?
   - Does it match the TypeScript interfaces in `/types/index.ts`?
   - Are Firebase SDK calls wrapped in try/catch with human-readable error messages?

### Preventing Conflicting Work

Not applicable — solo developer. There is no risk of two people working on the same
file simultaneously.

### Where Technical Decisions Are Discussed

| Decision Type | Where It Lives |
|---|---|
| Architectural decisions (new service, new pattern) | Comment in the relevant GitHub Issue before implementing; update the relevant `.md` context file after |
| Implementation choices (which npm package, which API) | Document in the commit message or GitHub Issue comment |
| Decisions that change an established architecture | Update the relevant context `.md` file — this is the single source of truth for Cursor |

**What requires documentation before implementation:**
- Any change to the Firestore schema
- Any change to the Firestore or Storage security rules
- Any new npm dependency
- Any deviation from the layering rules in `design.md` Section 5

---

## 5. Code Review System

### Who Reviews Code

The developer reviews all code — whether written manually or generated by Cursor.
There are no external reviewers in this project.

### Review Checklist for Cursor-Generated Code

Before accepting any Cursor output, check:

| Category | What to Verify |
|---|---|
| **Architecture** | Does it follow the layering rule? No Firebase SDK calls in components or stores. |
| **TypeScript** | No `any` types without a comment explaining why. All function parameters and return types are typed. |
| **Error handling** | All async operations are wrapped in try/catch. No raw Firebase error codes reach the UI layer. |
| **Security** | No secrets hardcoded. No `v-html`. No user input rendered as HTML. |
| **Naming** | Follows the naming conventions in Section 7. |
| **Consistency** | Does it match the patterns already in the codebase? (Same import style, same error pattern, same CSS variable usage.) |
| **Tests** | Are tests included for any new service logic? |

### What Blocks a Merge

A commit must not be merged to `main` if:
- TypeScript type errors exist
- ESLint errors exist
- Any test in the suite is failing
- Firebase SDK is called directly from a Vue component or Pinia store
- A hardcoded colour value, secret, or magic number appears in the code

### What Is Explicitly NOT Reviewed

- Code formatting — Prettier handles this automatically. Never manually adjust
  indentation or quote style.
- Import order — ESLint's `import/order` rule handles this.
- Whitespace and blank lines — Prettier.

These are linter/formatter responsibilities, not review responsibilities.

---

## 6. Definition of Done

Defined in full in Section 3. Summary for reference:

```
A feature is DONE when:
  ✅ Zero TypeScript errors
  ✅ Zero ESLint errors
  ✅ Unit tests written and passing for new service logic
  ✅ All existing tests pass
  ✅ Rules integration tests pass (if rules changed)
  ✅ Manually tested in browser
  ✅ Manually tested on device (if Capacitor-specific)
  ✅ Layering rules followed (no Firebase calls in components)
  ✅ No hardcoded values (colours, secrets, magic numbers)
  ✅ Relevant context .md file updated if a decision changed
  ✅ Committed to dev branch; merged to main at milestone completion
```

### Updating Context Files

**This is a mandatory step.** When a development decision changes or adds to what
is documented in the context `.md` files, the relevant file must be updated
**before the milestone is tagged**. If Cursor's instructions become out of date,
future sessions will generate inconsistent code.

Examples of changes that require a context file update:
- A new npm package is added → update `tech-stack.md`
- A new Firestore field is added → update `database.md`
- A business rule is modified → update `backend.md`
- A new route is added → update `frontend.md`
- A security decision changes → update `security.md` or `auth.md`

---

## 7. Coding Standards

### Naming Conventions

**Files:**

| Type | Convention | Example |
|---|---|---|
| Vue views (pages) | PascalCase + `View` suffix | `HomeView.vue`, `RecordView.vue` |
| Vue components | PascalCase | `WishCard.vue`, `StatusBadge.vue` |
| Services | PascalCase + `Service` suffix | `WishService.ts`, `UploadService.ts` |
| Pinia stores | camelCase + `Store` suffix | `wishesStore.ts`, `authStore.ts` |
| Composables | camelCase + `use` prefix | `useCamera.ts`, `useUpload.ts` |
| TypeScript types/interfaces | `index.ts` in `/types/` | `/src/types/index.ts` |
| Test files | Match source filename + `.test.ts` | `WishService.test.ts` |
| Integration test files | Match source + `.integration.test.ts` | `rules.integration.test.ts` |

**Variables and functions:**

| Type | Convention | Example |
|---|---|---|
| Variables | camelCase | `wishText`, `uploadProgress` |
| Boolean variables | `is` / `has` / `can` prefix | `isLoading`, `hasError`, `canSubmit` |
| Event handlers | `handle` prefix | `handleSubmit`, `handleRecordStart` |
| Async functions | verb + noun, no `async` suffix | `uploadVideo()`, `createWish()` |
| TypeScript interfaces | PascalCase | `WishDocument`, `UserDocument` |
| TypeScript type unions | PascalCase | `WishStatus`, `UserRole` |
| CSS variables | `--category-property` format | `--color-accent`, `--space-md`, `--font-heading` |
| Pinia store exported composable | `use` prefix + store name | `useWishesStore()`, `useAuthStore()` |

**Forbidden naming patterns:**
- Single-letter variable names outside of loop counters (`i`, `j`) and arrow
  function parameters where the type is obvious
- `data`, `info`, `stuff`, `thing` as variable names — be specific
- `temp`, `tmp` — name it for what it actually holds
- Hungarian notation (`strName`, `intCount`) — TypeScript already carries the type

### Code Structure Rules

**Layering rule (absolute):**
```
Views (Vue components)
  ↓ call only
Pinia Stores
  ↓ call only
Services (/src/services/)
  ↓ call only
Firebase JS SDK + Capacitor Plugins
```

This is not a guideline — it is an architectural constraint. Violations block merge.

**Module organisation:**
- Each service owns one domain (see `backend.md` Section 2)
- Each Pinia store owns one domain
- Cross-domain data access goes through service method calls, never via direct
  Firestore access from one store to another domain's collection

**What is forbidden:**
- Importing `firebase/firestore` or `firebase/storage` directly in `.vue` files
- Importing `firebase/firestore` or `firebase/storage` directly in Pinia store files
- Importing one Pinia store from another Pinia store
- Using `v-html` anywhere in the codebase
- Hardcoded hex colour values in `<style>` blocks — use CSS variables only
- Inline `style` attributes for design values (colours, spacing, typography)

### Complexity Rules

| Rule | Limit |
|---|---|
| Maximum lines per function | 40 lines. If a function exceeds this, extract a helper. |
| Maximum nesting depth | 3 levels of indentation. Flatten with early returns. |
| Maximum parameters per function | 3. If more are needed, use an options object. |
| `try/catch` blocks | Every `async` service method has exactly one `try/catch` wrapping the Firebase call |

**Early return pattern** (enforced for readability):
```ts
// Preferred: early return on invalid state
async function updateWishStatus(wishId: string, status: WishStatus) {
  if (!wishId) throw new Error('wishId is required')
  if (status === 'pending') throw new Error('Status cannot be set back to pending')
  // ... proceed with valid state
}

// Avoided: deep nesting
async function updateWishStatus(wishId: string, status: WishStatus) {
  if (wishId) {
    if (status !== 'pending') {
      // ... logic buried 2 levels deep
    }
  }
}
```

---

## 8. Architecture Enforcement

### Who Ensures Architecture Rules Are Followed

The developer reviews all Cursor-generated code against the layering rules in
`design.md` Section 5 before accepting. ESLint provides automated enforcement for
some rules.

**ESLint rules that enforce architecture:**
- `vue/no-v-html` — prevents XSS via `v-html`
- `no-restricted-imports` — can be configured to warn when `firebase/firestore`
  is imported in `.vue` files directly
- `no-restricted-syntax` — can warn on hardcoded hex colour values in style blocks

**What Cursor is told when generating code:**
Every Cursor session that involves the service layer, stores, or components should
begin with:
```
"Follow the strict layering rule from @design.md Section 5:
Views → Stores → Services → Firebase SDK.
Never import Firebase SDK packages in .vue files or Pinia store files."
```

### What Happens If Architecture Is Violated

During code review (developer reviewing Cursor output): reject the code, explain
the violation to Cursor with a reference to the relevant context file, and ask
for a corrected implementation.

In CI: TypeScript import checking can surface some violations. Manual review is
the primary gate.

---

## 9. Consistency Enforcement

### Tools and Their Roles

| Tool | What It Enforces | When It Runs |
|---|---|---|
| **TypeScript** (strict mode) | Type safety, interface compliance | On save (VS Code/Cursor), pre-commit, CI |
| **ESLint** | Code quality rules, Vue-specific rules, `no-v-html` | On save, pre-commit, CI |
| **Prettier** | Code formatting (indentation, quotes, semicolons) | On save (Cursor auto-format), pre-commit |
| **Husky** (pre-commit hook) | TypeScript check + ESLint before every commit | On `git commit` |
| **Vitest** | Business logic correctness | On demand (locally), CI |
| **Context `.md` files** | Architectural consistency across Cursor sessions | Developer references at session start |

### Configuration

**`.prettierrc`:**
```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2
}
```

**`tsconfig.json` strict settings:**
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

**Husky pre-commit hook (`.husky/pre-commit`):**
```bash
#!/bin/sh
vue-tsc --noEmit && eslint src/ --max-warnings 0
```

### What Happens If Standards Are Violated

- **TypeScript error**: Husky blocks the commit. Fix the error before committing.
- **ESLint error**: Husky blocks the commit. Fix the error or add a justified
  `// eslint-disable-next-line` comment explaining why.
- **Prettier formatting**: Cursor auto-formats on save. If not formatted, Prettier
  is run as part of the pre-commit hook via `lint-staged`.
- **Architectural violation** (caught in review): Reject the code; provide Cursor
  with the corrected constraint and regenerate.

---

## 10. Knowledge Sharing

### The Context Engineering System IS the Knowledge Base

The `/docs/context/` directory contains the project's entire knowledge base:

| File | What It Documents |
|---|---|
| `design.md` | Architecture decisions, system context, component responsibilities |
| `tech-stack.md` | Technology choices, decision rationale, upgrade strategy |
| `frontend.md` | UX flows, design system, state management, routing |
| `backend.md` | Firebase API layer, business rules, domain model |
| `database.md` | Firestore schema, queries, indexes, lifecycle |
| `auth.md` | Authentication strategy, token management, authorisation |
| `security.md` | Threat model, attack surface, security rules |
| `devops.md` | CI/CD, build process, deployment, environments |
| `testing.md` | Test strategy, critical tests, coverage rules |
| `process.md` | This file — engineering workflow and standards |

These files serve two purposes simultaneously:
1. **Human reference**: The developer reads them when returning to the project after
   time away or when making a decision in an unfamiliar area
2. **Cursor context**: Loaded into Cursor sessions to give the AI accurate,
   project-specific knowledge rather than generic best practices

### Keeping Context Files Current

Context files are living documents. They become inaccurate the moment a decision
changes and they are not updated. The definition of done (Section 6) makes
updating context files a mandatory step before tagging a milestone.

**Practical rule:** If Cursor gives advice that contradicts an established decision,
the context file may be out of date. Update it, then re-run the Cursor session.

### Onboarding (Returning to the Project)

If the developer returns to the project after an extended break:

```
1. Read the most recent GitHub Release notes to understand the current state
2. Check open GitHub Issues to see what is in progress
3. Run vitest run to confirm the test suite is still passing
4. Read the context .md files for any area being worked on
5. Open Cursor and load the relevant context files for the session
```

---

## 11. Decision-Making Process

### Who Makes Technical Decisions

**The developer makes all decisions.** Cursor proposes options and explains
trade-offs but never makes architectural decisions unilaterally.

### How Decisions Are Recorded

| Decision Type | Where Recorded |
|---|---|
| Architectural decisions (tech stack, data model, security model) | Relevant context `.md` file — the ADR is embedded in the document |
| Feature-level decisions (which component to use, which API pattern) | GitHub Issue comment or code comment explaining the choice |
| Rejected approaches | Brief note in the relevant context file's "what we are not doing" section |

**Before asking Cursor to implement a decision**, write one sentence in the GitHub
Issue or a code comment explaining why this approach was chosen. This prevents
second-guessing in future sessions.

### How Disagreements Are Resolved

There is one developer — no disagreements with other humans. When Cursor proposes
an approach that conflicts with the established architecture, the resolution process
is:

1. Reference the specific section of the context file that governs the decision
2. Ask Cursor to explain why its proposed approach conflicts with the documented
   constraint (sometimes it reveals an outdated context file)
3. If the context file is correct, ask Cursor to re-implement following the
   documented pattern
4. If the context file is wrong or outdated, update it first, then proceed

---

## 12. Change Management

### Breaking Changes to the Firestore Schema

Firestore schema changes follow the migration policy in `database.md` Section 10.
Before implementing any schema change:
1. Document the change type (additive, rename, remove) in the GitHub Issue
2. If breaking: write the migration script before changing app code
3. Deploy the migration to Firestore before deploying app code that depends on it
4. Update `database.md` to reflect the new schema

### Breaking Changes to Security Rules

1. Write the rule change in `firestore.rules` or `storage.rules`
2. Write integration tests for the new rule behaviour
3. Run the integration tests against the local emulator — must pass
4. Merge to `main` — CI deploys the rules after tests pass
5. Never deploy rule changes manually via the Firebase Console

### What Requires a Design Review Before Implementation

| Change | Why Review First |
|---|---|
| New Firestore collection | Affects the data model documented in `database.md` |
| New npm dependency | Must be justified against the "no unnecessary dependencies" principle |
| Changes to the security rule structure | Security rules are the authoritative authorization layer |
| New route added to the app | Must be consistent with the navigation model in `frontend.md` |
| Any change to the admin PIN or admin access mechanism | Security-sensitive |

**Design review for a solo developer** means: write a GitHub Issue describing the
change and its rationale before writing any code. If you cannot write a clear one-
paragraph justification, the change may not be necessary.

---

## 13. Quality Gates

### Hard Blocks (Must Pass — No Exceptions)

| Gate | Checked By |
|---|---|
| Zero TypeScript errors | `vue-tsc --noEmit` — Husky pre-commit + CI |
| Zero ESLint errors | ESLint — Husky pre-commit + CI |
| All unit tests passing | Vitest — CI |
| All integration (rules) tests passing | Firebase emulator — CI (required before Firebase deploy) |
| `npm audit` — no high/critical CVEs | CI |
| `ionic build` succeeds | CI |
| No Firebase SDK import in `.vue` files | ESLint `no-restricted-imports` — CI |
| No hardcoded colour values in `<style>` | ESLint `no-restricted-syntax` — CI |

### Soft Warnings (Log but Do Not Block)

| Warning | When Acceptable |
|---|---|
| ESLint warnings (not errors) | Style suggestions that don't affect correctness |
| `npm audit` — moderate CVEs | Noted; scheduled for next dependency update |
| Unused CSS variables | Acceptable during active development; clean up before milestone tag |

### Context File Freshness

Before tagging a milestone version, the developer manually verifies that all
context `.md` files accurately reflect the current state of the codebase. This is
not automated — it is a checklist item in the milestone completion process.

---

## 14. Speed vs Safety Tradeoff

### When Speed Is Prioritised

| Change Type | Speed Rationale |
|---|---|
| CSS and visual changes | Low risk — no business logic; only affects appearance |
| Copy and text updates | Zero logic risk |
| New Vue component with no Firebase calls | Contained risk; does not touch data layer |
| Adding a new optional field to a Firestore document | Additive, backward-compatible, no migration needed |

For these changes: write, test in browser, commit to `dev`. No additional review.

### When Correctness Is Prioritised

| Change Type | Why Correctness First |
|---|---|
| Firestore or Storage security rule changes | Misconfiguration exposes user data |
| Service layer business logic (status transitions, upload ordering) | Business invariants must be correct — unit tests required |
| Authentication or authorisation flow changes | Security-critical |
| Schema changes involving renames or deletions | Risk of data loss or app breakage |
| FCM notification logic | If broken silently, users stop receiving status updates |

For these changes: write the tests first (or alongside), run the full test suite,
verify on device if Capacitor-specific, then merge.

### Fast-Track Conditions

A change can be fast-tracked (commit directly to `dev` without opening a GitHub
Issue) only if:
- It is a bug fix for something introduced in the current session
- It is a visual/CSS adjustment with no logic changes
- It is a comment or documentation update

Everything else gets a GitHub Issue before implementation.

---

## 15. Developer Experience

### Starting a Development Session

```
1. Pull latest from dev:     git pull origin dev
2. Open Cursor
3. Load context files:       @design.md @[relevant area].md
4. State session goal:       "I am implementing [GitHub Issue title]"
5. Begin
```

Total time from "open laptop" to "writing code with Cursor": under 3 minutes.

### Feedback Speed

| Action | Feedback Time |
|---|---|
| TypeScript error in Cursor | Immediate (inline type checking) |
| ESLint error in Cursor | Immediate (inline linting) |
| Vitest watch mode re-run (unit tests) | Under 3 seconds |
| `ionic serve` hot reload (component change) | Under 1 second |
| `ionic serve` full refresh (route change) | 1–2 seconds |
| Pre-commit hook (type check + lint) | 15–20 seconds |
| Full CI pipeline | 5–6 minutes |

### Cursor-Specific DX Tips

**`.cursor/rules/` (project rules file):**
Create a `.cursor/rules/project.md` file that Cursor reads automatically in every
session. Minimum contents:

```md
# Girigo — Cursor Project Rules

## Stack
Ionic + Vue 3 + TypeScript + Capacitor + Firebase (BaaS)

## Layering Rule (absolute — never violate)
Views → Stores → Services → Firebase SDK
Never import firebase/firestore or firebase/storage in .vue or store files.

## Context Files
Always read the relevant context file before implementing:
- Architecture: @design.md
- Tech choices: @tech-stack.md
- Frontend/UX: @frontend.md
- Backend/Firebase: @backend.md
- Database/schema: @database.md
- Auth: @auth.md
- Security: @security.md

## Error Handling
All async service methods wrap Firebase calls in try/catch.
Never re-throw raw Firebase error codes — always throw human-readable Error messages.

## Naming
- Views: PascalCase + View suffix
- Components: PascalCase
- Services: PascalCase + Service suffix
- Stores: camelCase + Store suffix
- Composables: camelCase + use prefix
- Booleans: is/has/can prefix

## Forbidden
- v-html anywhere
- Hardcoded hex colours in <style> — use CSS variables from variables.css
- Inline style attributes for design values
- Any type without a comment justifying it
```

### Biggest Bottlenecks in Developer Workflow

| Bottleneck | When It Occurs | Mitigation |
|---|---|---|
| Android APK build time (~3 minutes) | When testing Capacitor-specific features | Use `ionic serve` (browser) for as long as possible; build APK only for device-specific testing |
| Firebase emulator startup (~15 seconds) | When running integration tests | Start the emulator once at the beginning of a rules-focused session; keep it running |
| Context file loading in Cursor | At the start of each session | Create the `.cursor/rules/project.md` file so core rules load automatically; manually `@mention` additional context files as needed |
| First-time Android SDK setup | Once, at project initialisation | Document exact SDK version and setup steps in `README.md` |
| Flaky FCM testing | When building notification flow | Test FCM on a physical device only; mock FCM entirely in unit and component tests |