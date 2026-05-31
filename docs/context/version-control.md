# version-control.md — Girigo Git and Version Control

---

## 1. Repository Initialisation

The GitHub repository is named `girigo` and is public (required for free GitHub
Pages and free GitHub Actions minutes).

### First Commit Rule

The first commit contains infrastructure only — no feature code:

```
feat(config): initialise project

- .gitignore
- README.md
- ionic.config.json
- capacitor.config.ts
- firebase.json
- .firebaserc
- .env.example
- package.json (from ionic start)
```

No service code, no Vue components, no tests in the first commit.

### Remote

Link to GitHub immediately after `git init`. Never develop locally for more than
one session before pushing:

```bash
git remote add origin https://github.com/[username]/girigo.git
git push -u origin main
```

---

## 2. Branching Strategy

Girigo uses a **two-branch model** — not full GitFlow. This is proportionate for
a solo portfolio project and already established in `process.md` and `devops.md`.

### Core Branches

| Branch | Purpose | Who Merges Into It |
|---|---|---|
| `main` | Stable, tagged releases only. CI deploys Firebase rules from here. | PRs from `dev` on milestone completion |
| `dev` | Active development. All work lands here first. | Feature branches, or direct commits for small tasks |

### When to Use Feature Branches (Optional but Recommended)

Feature branches are optional for small single-file changes but strongly recommended
for anything spanning multiple files or taking more than one session:

| Branch Type | Format | Purpose | Target |
|---|---|---|---|
| `feature/` | `feature/[issue-number]-short-description` | New feature within a milestone | `dev` |
| `fix/` | `fix/short-description` | Bug fix | `dev` |
| `chore/` | `chore/short-description` | Dependency updates, config changes | `dev` |
| `refactor/` | `refactor/short-description` | Code restructuring, no behaviour change | `dev` |

**Examples:**
```
feature/12-upload-service
feature/15-admin-wish-queue
fix/upload-progress-not-resetting
chore/update-ionic-7.1
refactor/extract-thumbnail-composable
```

**Never commit directly to `main`.** No exceptions.

### Branch Naming Rules

```
Format: type/short-description (kebab-case)
Include issue number when applicable: feature/42-record-flow

Forbidden:
  feature/updates
  fix/bug
  test/stuff
  wip
```

---

## 3. Commit Discipline

A commit is a unit of reasoning, not a save point.

### Commit Message Format (Conventional Commits)

```
<type>(<scope>): <short description>

[optional body — what and why, not how]

[optional footer — issue refs, breaking changes]
```

**Types:**

| Type | Use For |
|---|---|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Code change with no behaviour change |
| `test` | Adding or updating tests |
| `chore` | Tooling, dependencies, config |
| `docs` | Documentation only |
| `perf` | Performance improvement |
| `ci` | GitHub Actions workflow changes |
| `revert` | Reverting a previous commit |
| `rules` | Firestore or Storage security rule changes |

**Girigo-specific scopes:**

| Scope | Use For |
|---|---|
| `auth` | `AuthService`, `authStore`, Firebase Auth |
| `wishes` | `WishService`, `wishesStore`, `WishCard`, `WishDetailView` |
| `upload` | `UploadService`, `uploadStore`, `UploadProgressModal` |
| `admin` | `AdminService`, `adminStore`, `AdminView`, `AdminWishDetailView` |
| `notifications` | `NotificationService`, `notificationStore` |
| `camera` | `useCamera` composable, `RecordView`, `PreviewView` |
| `ui` | Vue components, SCSS, design tokens |
| `rules` | `firestore.rules`, `storage.rules`, `firestore.indexes.json` |
| `config` | Firebase config, `.env`, `capacitor.config.ts`, `firebase.json` |
| `ci` | `.github/workflows/` files |
| `deps` | npm dependency changes |
| `tests` | Test files, emulator config |
| `types` | `/src/types/index.ts` changes |

**Examples:**

```
feat(auth): implement anonymous sign-in on first launch

feat(upload): add video compression before Firebase Storage upload

fix(wishes): status badge not updating on real-time listener event

test(rules): add integration tests for cross-user wish read denial

chore(deps): upgrade @ionic/vue to 7.2.0

rules(rules): add one-way status transition validation to firestore.rules

ci(ci): add Firebase rules deployment step to build.yml
```

### Commit Rules

```
Subject line: max 72 characters, imperative mood ("add", not "added" or "adds")
Body: optional; required when the fix is non-obvious, a workaround was used,
      or a tradeoff was made
One logical change per commit — if you need "and" to describe it, split it
Tests for the change are in the same commit, not a separate follow-up commit
```

**Never in a commit:**
```
Secrets, API keys, .env file contents — ever
Firebase service account JSON
firebase-debug.log or firestore-debug.log
console.log or debug statements left in production code paths
Commented-out code without an explanation comment
Half-finished work — use a draft PR instead
Unrelated formatting changes bundled with logic changes
```

---

## 4. Pull Request Rules

### When PRs Are Required

| Merge | PR Required? |
|---|---|
| Feature/fix branch → `dev` | Optional for small single-file changes; recommended for multi-file |
| `dev` → `main` | **Always** — this is a milestone release |
| Any branch → `main` directly | Never — only `dev` → `main` |

### PR Title Format

Mirrors the commit format:
```
feat(upload): complete video upload flow with progress and retry
fix(admin): status badge not reflecting real-time Firestore update
```

### PR Description Template

```markdown
## What this PR does
[One paragraph: what was built or fixed]

## Why it's needed
[Link to GitHub Issue or milestone context]

## How to test manually
[Step-by-step test instructions — what to open, what to tap, what to expect]

## Known limitations or follow-up tasks
[Any deferred work or known edge cases]

## Screenshots / recordings
[Required for any UI change — attach before/after or a screen recording]

## Checklist
[ ] All tests pass locally (vitest run)
[ ] No console.log or debug code left in
[ ] No secrets committed
[ ] Commit messages follow the Conventional Commits format
[ ] Branch is up to date with dev (rebased or merged)
[ ] context.md updated if this PR changes system state, locked decisions,
    or any architectural decision
[ ] Relevant .md context file updated if a decision changed
```

### PR Size Rule

A PR should be reviewable in under 20 minutes. If it touches more than ~400 lines,
consider splitting it. If you cannot describe the PR in one sentence, it is doing
too much.

### Solo Developer PR Process

As a solo developer, PRs are self-reviewed. The PR is a forcing function to read
your own diff before merging — not a social process.

Before merging any `dev` → `main` PR:
1. Read the entire diff
2. Verify the checklist above
3. Run `vitest run` locally
4. Run the manual smoke test checklist from `docs/smoke-test.md`
5. Merge only when all checklist items are checked

### Draft PRs

Use draft PRs for work-in-progress that needs early visibility or a save point.
Never merge a draft PR. Convert to ready only when the checklist is satisfied.

---

## 5. Merging Rules

### Merge Strategy

| Merge | Strategy | Reason |
|---|---|---|
| Feature/fix branch → `dev` | Squash merge | Keeps `dev` history clean; branch noise removed |
| `dev` → `main` | Merge commit | Preserves the milestone merge point for traceability |

### Never

```
Force-push to main or dev
Merge with unresolved conflicts by accepting all incoming blindly
Delete main or dev branches
Merge without running vitest run first
```

---

## 6. Merge Conflict Rules

Conflicts are a signal, not just an obstacle.

**When a conflict occurs:**
1. Stop and understand why the conflict exists before resolving it
2. Never blindly accept "ours" or "theirs" — read both sides
3. If the conflict is in a service method, a Firestore schema field, or security
   rules, treat it as a potential breaking change — resolve carefully
4. Resolve in a dedicated commit: `chore: resolve merge conflict in <file>`
5. After resolving, run `vitest run` — a conflict resolution that breaks tests
   is not a resolution

**The most likely conflict sources in Girigo:**
- `/src/types/index.ts` — TypeScript interfaces modified in two branches
- `firestore.rules` — security rules edited in two branches
- `context.md` — updated in two parallel sessions

---

## 7. Tagging and Versioning

Semantic versioning: `MAJOR.MINOR.PATCH`

| Change | Bump |
|---|---|
| Breaking change or major redesign | MAJOR (`1.0.0 → 2.0.0`) |
| New feature, backward-compatible | MINOR (`0.1.0 → 0.2.0`) |
| Bug fix, no new functionality | PATCH (`0.1.0 → 0.1.1`) |

### Girigo Release Tags

Tags are created on `main` only, after a milestone PR is merged:

```bash
git tag -a v0.1.0 -m "v0.1.0: Foundation — auth, onboarding, Firebase setup"
git push origin v0.1.0
```

| Tag | Milestone |
|---|---|
| `v0.1.0` | Foundation — auth working, rules deployed, project initialised |
| `v0.2.0` | Core Feature — record, upload, wish list |
| `v0.3.0` | Admin System — admin panel, status updates |
| `v0.4.0` | Notifications — FCM push notifications |
| `v1.0.0` | MVP Complete — smoke test passing, APK distributed |

**Tagging rules:**
```
Tag every release pushed to main
Tags live on main only — never tag dev
Never delete or rewrite tags
Tag message must summarise what changed at a high level
Pushing a tag triggers the release.yml GitHub Actions workflow (signed APK build)
```

---

## 8. What Never Goes in Version Control

### Absolute Prohibitions

```
.env files or any file containing Firebase config values, API keys, or secrets
Firebase service account JSON (used for CI authentication)
APK signing keystore (.jks or .keystore files)
Android local.properties (contains machine-specific SDK path)
firebase-debug.log, firestore-debug.log, storage-debug.log
Database exports or Firestore data dumps
Build artifacts: www/, android/app/build/, android/build/, ios/App/Pods/
Editor-specific settings: .vscode/settings.json, .idea/
OS files: .DS_Store, Thumbs.db
Dependency directories: node_modules/
```

### If Accidentally Committed

```
Remove from tracking: git rm --cached <file>
Add to .gitignore immediately
If the file contained secrets and was pushed to the remote:
  1. Rotate the secret immediately — assume it is compromised
  2. Use BFG Repo Cleaner or git filter-repo to rewrite history
  3. Force-push the cleaned history: git push --force-with-lease
  4. Update GitHub Secrets with the new values
```

---

## 9. Gitignore

The `.gitignore` at the project root covers all platforms and tools used in Girigo:

```gitignore
# ─── Environment ───────────────────────────────────────────────
.env
.env.*

# ─── Dependencies ──────────────────────────────────────────────
node_modules/

# ─── Ionic / Vite build output ─────────────────────────────────
# www/ is generated by `ionic build` — not committed; regenerated in CI
www/
dist/
.cache/

# ─── Android build artifacts ───────────────────────────────────
# Note: android/ folder IS committed (required for CI APK builds)
# Only exclude build output and machine-specific config
android/local.properties
android/.gradle/
android/app/build/
android/build/

# ─── iOS build artifacts ───────────────────────────────────────
# Note: ios/ folder IS committed
# Only exclude CocoaPods and machine-specific config
ios/App/Pods/
ios/App/.xcode.env.local

# ─── Firebase ──────────────────────────────────────────────────
.firebase/
firebase-debug.log
firestore-debug.log
storage-debug.log
ui-debug.log
database-debug.log

# ─── Testing ───────────────────────────────────────────────────
coverage/

# ─── Logs ──────────────────────────────────────────────────────
*.log
npm-debug.log*
yarn-debug.log*

# ─── OS ────────────────────────────────────────────────────────
.DS_Store
.DS_Store?
._*
Thumbs.db
ehthumbs.db

# ─── Editor ────────────────────────────────────────────────────
.vscode/settings.json
.idea/

# ─── APK signing ───────────────────────────────────────────────
*.jks
*.keystore
```

### Why `android/` and `ios/` Are Committed

Committing the Capacitor-generated native project folders is standard Capacitor
practice and required for the CI pipeline. If they were not committed:
- CI would need to run `ionic cap add android` on every build, re-generating the
  native project from scratch
- Configuration changes to `capacitor.config.ts` and Android-specific files
  (permissions in `AndroidManifest.xml`, app icon, splash screen) would not persist

**What IS committed from `android/`:**
- `android/app/src/` (main source, manifests, resources)
- `android/app/capacitor.build.gradle`
- `android/build.gradle`, `android/settings.gradle`

**What is NOT committed from `android/`:**
- Build output (`android/app/build/`, `android/build/`)
- Machine-specific config (`android/local.properties`)
- Gradle cache (`android/.gradle/`)

---

## 10. History Integrity Rules

```
Never force-push to main or dev — these are shared branches
Rebasing is allowed on local feature branches before a PR is opened
git commit --amend is allowed on local, unpushed commits only
To undo a pushed commit: use git revert — creates a new commit, preserves history
Never use git reset --hard on any commit that has been pushed to the remote
```

**If history has gone wrong:**
1. State exactly what happened before attempting any fix
2. Never fix a history problem by force-pushing to `main`
3. On `dev`: `git revert <commit>` is the correct tool
4. On a feature branch (not yet pushed): `git reset` is acceptable

---

## 11. Solo Project Rules

Solo doesn't mean no discipline. The rules above apply in full even with one
developer. Specific notes for solo development:

**Use feature branches for multi-session work.** Your future self (returning to the
project after a break) is a different developer. A feature branch makes it clear
what is in progress and what is stable.

**Write commit messages as if you will debug from them.** You will. When something
breaks six weeks from now, `feat(upload): complete upload flow with retry logic` is
useful. `fix stuff` is not.

**Use self-reviewed PRs for `dev` → `main` merges.** This is a forcing function
to read your own diff. It is not bureaucracy — it catches things the Cursor session
missed.

**The commit history is the project changelog.** GitHub Releases and version tags
are generated from it. A clean commit history makes release notes easy to write
and bugs easy to bisect.

---

## 12. CI/CD Integration

Aligns with `devops.md` Section 1.

| Branch | CI Behaviour |
|---|---|
| Push to `dev` | Runs `build.yml`: type check, lint, tests, Firebase emulator rules tests, debug APK build |
| Push to `main` | Runs `build.yml` + `deploy-firebase.yml`: deploys Firestore rules, Storage rules, and indexes |
| Push version tag (`v*.*.*`) | Runs `release.yml`: builds signed APK, creates GitHub Release, updates GitHub Pages |

**Branch protection on `main` (GitHub Settings):**
```
Require status checks to pass before merging:
  - build (from build.yml)
  - test (from build.yml)
  - deploy-firebase (from deploy-firebase.yml)
Disallow force pushes
Disallow branch deletion
```

---

## Quick Reference

| Situation | Rule |
|---|---|
| Starting the project | `git init` before writing any code; first commit is infrastructure only |
| Adding any feature | Create `feature/` branch from `dev`; merge back via squash |
| Fixing a bug | Commit directly to `dev` for simple fixes; `fix/` branch for multi-file fixes |
| Completing a milestone | PR from `dev` → `main` (self-reviewed); merge commit; push version tag |
| Committing | One logical change; Conventional Commit format with Girigo scope |
| Secrets committed | `git rm --cached`; rotate immediately; BFG if pushed to remote |
| Conflict resolution | Read both sides; resolve; run `vitest run` to verify |
| Undoing a pushed commit | `git revert` only — never `git reset` on shared branches |
| Updating `context.md` | Every PR that changes system state must update `context.md` before merging |