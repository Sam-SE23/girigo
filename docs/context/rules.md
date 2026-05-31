# rules.md — AI Behavior Contract for Girigo

---

This file defines the operational rules governing every code generation decision,
communication style, and escalation behaviour in Cursor sessions on this project.

Read this file at the start of every session alongside `context.md` and `system.md`.

**Authority**: When this file conflicts with `system.md`, `system.md` takes
precedence. When this file conflicts with a domain `.md` file (e.g. `backend.md`,
`auth.md`), the domain file takes precedence for its specific subject matter.

---

## Rule 1 — Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing anything:

- State your assumptions explicitly. If uncertain, ask.
- If multiple valid interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

The cost of a wrong assumption is higher than the cost of one clarifying question.

---

## Rule 2 — Simplicity First

Minimum code that solves the problem. Nothing speculative.

```
No features beyond what was asked.
No abstractions for single-use code.
No "flexibility" or "configurability" that wasn't requested.
No error handling for impossible scenarios.
```

If you write 200 lines and it could be 50, rewrite it.

Ask yourself: *"Would a senior engineer say this is overcomplicated?"* If yes, simplify.

**Girigo-specific calibration:** This is a portfolio project with 6 users on a free
Firebase tier. 50 lines that work correctly and follow the established patterns is
always preferred over 200 lines that are "enterprise-ready" but add no real value.
See `system.md` Section 10 for the complete overengineering rules.

---

## Rule 3 — Surgical Changes

Touch only what you must. Clean up only your own mess.

**When editing existing code:**
- Do not "improve" adjacent code, comments, or formatting.
- Do not refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it in a Note — don't delete it.

**When your changes create orphans:**
- Remove imports, variables, and functions that YOUR changes made unused.
- Do not remove pre-existing dead code unless explicitly asked.

**The test:** Every changed line should trace directly to the user's request.
Every commit should map to a single logical change. If a response produces multiple
unrelated changes, they go into separate commits.

---

## Rule 4 — Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

```
"Add validation"  →  "Write a test that rejects wishText over 280 chars,
                      then make it pass"

"Fix the bug"     →  "Write a test that reproduces the upload ordering failure,
                      then make it pass"

"Refactor X"      →  "Ensure tests pass before and after — no behaviour change"
```

For multi-step tasks, state a brief plan before starting:

```
[Step 1] → verify: [check]
[Step 2] → verify: [check]
[Step 3] → verify: [check]
```

Strong success criteria allow independent verification. Weak criteria
("make it work") require constant clarification.

---

## Rule 5 — Architecture Compliance

Never silently violate the system design.

**Before writing any code:**
- Check `design.md` Section 5 for the layering rule, module boundaries, and
  forbidden dependencies.
- Check `context.md` Section 4 for locked decisions and current system state.
- Check `api-contracts.md` before adding or modifying any service method signature,
  Firestore schema field, or Storage path.

**Hard rules for Girigo:**

```
NEVER import firebase/firestore or firebase/storage in .vue files.
NEVER import firebase/firestore or firebase/storage in Pinia store files.
All Firebase SDK calls go through /src/services/ only.

NEVER add a Firestore field that is not in database.md Section 2 or
/src/types/index.ts.

NEVER introduce a new npm dependency without stating:
name, version, purpose, and size impact — then waiting for confirmation.

NEVER change a service method signature, Firestore schema field, or Storage
path silently — these are breaking changes. State the change explicitly.

NEVER modify the Firestore or Storage security rules without noting that
integration tests must be run before deploying.
```

**If the task conflicts with the defined architecture:**
Stop and surface the conflict. Do not resolve it silently.

**The test:** Can every new line be justified by a decision already made in one
of the `.md` files?

---

## Rule 6 — Context Authority — Read Before Writing

Context files are law. Code is output.

**Before any task, read in this order:**

```
1. context.md          — current system state, locked decisions, active task scope
2. Relevant spec file  — backend.md, frontend.md, database.md, auth.md,
                         security.md, api-contracts.md, errors.md, or testing.md
3. system.md           — behavioral rules and output contract
4. rules.md            — this file
```

Never infer what context files would say. Read them.

**If a required context file is missing or incomplete:**
- Say which file is missing.
- Say what decision you cannot make without it.
- Ask for it, or ask the user to fill it in.
- Do not proceed on assumptions for any decision that could affect the layering
  rule, Firestore schema, security rules, or service method contracts.

---

## Rule 7 — Code Quality Defaults

Every output is production-grade unless explicitly told otherwise.

**All code must include by default:**
- Input validation at the service layer entry point (before any Firebase call)
- Explicit error handling — no silent failures, no empty catch blocks
- Clear TypeScript return types and function parameter types
- No `any` type without a comment explaining why it cannot be avoided
- No hardcoded values that belong in constants or environment variables
- No magic numbers or magic strings — name them as constants

**Never acceptable:**
```
TODO comments left without an explanation of why it's deferred
Empty catch blocks
console.log statements left in production code paths
Functions that do more than one thing (Single Responsibility)
Functions longer than ~40 lines without justification
Hardcoded colour values in <style> blocks (use CSS variables from variables.css)
Firebase SDK imports in .vue files or Pinia stores
```

**If writing a quick prototype is intentional:**
- Say so explicitly.
- Mark the code with: `// PROTOTYPE — not production ready`

---

## Rule 8 — Naming Discipline

Names are the first form of documentation.

**Girigo naming conventions (from `process.md` Section 7):**

| Type | Convention | Example |
|---|---|---|
| Vue views (pages) | PascalCase + `View` suffix | `HomeView.vue`, `RecordView.vue` |
| Vue components | PascalCase | `WishCard.vue`, `StatusBadge.vue` |
| Services | PascalCase + `Service` suffix | `WishService.ts`, `UploadService.ts` |
| Pinia stores | camelCase + `Store` suffix | `wishesStore.ts`, `authStore.ts` |
| Composables | camelCase + `use` prefix | `useCamera.ts`, `useUpload.ts` |
| TypeScript interfaces | PascalCase | `WishDocument`, `UserDocument` |
| Boolean variables | `is` / `has` / `can` prefix | `isLoading`, `hasError`, `canSubmit` |
| Event handlers | `handle` prefix | `handleSubmit`, `handleRecordStart` |
| Async functions | verb + noun | `uploadVideo()`, `createWish()` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_VIDEO_DURATION_SECONDS` |
| CSS variables | `--category-property` | `--color-accent`, `--space-md` |
| Test files | match source + `.test.ts` | `WishService.test.ts` |

**General rules:**
- Names must describe what, not how (`getUserById`, not `fetchFromDBById`)
- Do not abbreviate unless universally known (`id`, `url`, `uid` are fine;
  `usrCtxMgr` is not)
- File names must match their primary export exactly
- Functions must be verbs

**When naming is ambiguous:**
Ask. Don't invent names that will confuse the codebase later. If you must proceed,
flag it: *"I've named this X — confirm or rename."*

---

## Rule 9 — Error Handling Contract

Errors are outputs, not surprises.

**Align with `errors.md` at all times:**

```
Every error thrown by a service method is a plain Error object with a
human-readable, user-safe message string.

Never re-throw raw FirebaseError objects.
Never expose Firebase error codes (.code property) to the UI layer.
Never expose stack traces outside of Crashlytics logs.
Every service method logs full context before throwing:
  console.error(`[ServiceName.methodName] failed — uid: ${uid}`, error)
  await FirebaseCrashlytics.recordException({ message: `...` })
  throw new Error('Human-readable message.')
```

**Error categories to handle explicitly (from `errors.md` Section 3):**

| Category | Firebase Codes | Handling |
|---|---|---|
| Network | `unavailable`, `deadline-exceeded`, `auth/network-request-failed` | Retryable — throw with "check your connection" message |
| Permission | `permission-denied`, `storage/unauthorized` | Non-retryable — throw generic message, never explain which rule fired |
| Validation | Client-side check fails | Non-retryable — throw specific message ("Maximum 280 characters") |
| Conflict | Status already reviewed | Non-retryable — throw "already reviewed" |
| Not Found | Document does not exist | Return `null` — do not throw |
| Quota | `resource-exhausted`, `storage/quota-exceeded` | Non-retryable — throw generic "try again later" |
| Cancelled | `storage/canceled` | Silent — reset state, no error shown |
| Unknown | Any unmatched code | Throw `'Something went wrong. Please try again.'` |

**Never:**
```
Re-throw a FirebaseError directly (exposes .code to the UI)
Use generic "Something went wrong" without logging full context first
Catch an error and do nothing (empty catch blocks)
Swallow errors in non-critical paths without at least logging them
```

---

## Rule 10 — Security Defaults

Assume all input is hostile. Assume all paths are attacked.

**Defaults that apply to every piece of code:**

```
Validate all inputs at the service layer entry point (before any Firebase call).
Never trust client-supplied uid values — the authoritative uid is
  request.auth.uid in Firestore rules, not whatever the client sends.
Never log sensitive data: Firebase tokens, admin PINs, full UIDs in messages.
Never store secrets in code — only environment variables (.env, gitignored).
Firestore security rules are the authoritative authorization layer.
Client-side role checks (router guards, isAdmin composable) are UX only.
Never call Firebase SDK directly from .vue files or Pinia stores.
Never add a field to a Firestore document that bypasses the TypeScript
  interface in /src/types/index.ts.
```

**When writing auth-adjacent code:**
- Read `auth.md` before proceeding.
- Flag any deviation from the anonymous auth model immediately.

**When writing security-rules-adjacent code:**
- Read `security.md` Section 5 and `backend.md` Section 5 before proceeding.
- Any change to `firestore.rules` or `storage.rules` must be accompanied by
  an integration test against the Firebase Local Emulator.

**If a task requires a security decision not covered in `security.md` or `auth.md`:**
Stop. State what decision needs to be made. Ask.

---

## Rule 11 — Testing Expectations

Untested code is unfinished code.

**Rules aligned with `testing.md`:**

```
Every new service method with business logic must have at least one unit test.
Every change to Firestore or Storage security rules must have at least one
  integration test against the Firebase Local Emulator.
Tests must cover the happy path AND at least one failure path.
Test names must describe behaviour, not implementation:
  ✅ "throws when wish status is not pending"
  ❌ "test updateWishStatus"
Mocks must reflect real behaviour — a mock that always returns success is
  not a test.
```

**When asked to write a feature:**
- State what tests are needed, even if not writing them in the same response.
- For service methods, write (or propose) the unit test alongside the implementation.

**Never:**
```
Write tests that only test Firebase SDK behaviour (Google tests their own SDK).
Skip error path testing for: status transitions, upload ordering, security rules,
  and admin delete ordering (Firestore before Storage).
Write tests that pass trivially without asserting actual behaviour.
```

**The critical tests that must never regress (from `testing.md` Section 9):**
1. User cannot read another user's wish
2. Status transition from non-pending is denied
3. Wish document only written after both Storage uploads succeed
4. Admin delete calls Firestore delete before Storage deletes
5. User cannot create wish with a different uid

These are hard-blocked in CI. If a change would break any of these, stop and ask.

---

## Rule 12 — Dependency Rules

New dependencies are architectural decisions.

**Before importing any new package:**
- Check `tech-stack.md` Section 3 — is it already in the stack?
- Ask: can this be solved with existing dependencies or the Web API?
- If a new package is needed, state: name, version, purpose, and approximate
  gzipped size impact on the bundle.
- Flag if the package is unmaintained, has known vulnerabilities, or is not
  aligned with the Ionic/Capacitor/Firebase ecosystem.

**Never:**
```
Add a package just to avoid writing 10 lines of code.
Pull in a heavy dependency for a single utility function.
Add a dependency without checking package.json first.
Add a dependency that conflicts with Ionic or Capacitor's peer dependency requirements.
```

If a new dependency is a deviation from the stack defined in `tech-stack.md`:
flag it explicitly and wait for confirmation before proceeding.

---

## Rule 13 — Communication Contract

Every response must be structured and honest.

**Response structure:**
1. Direct answer or action first — no preamble, no restating the question
2. Reasoning — why this approach over alternatives, tied to specific `.md` files
3. Tradeoffs — what is sacrificed
4. Risks or open questions — what could go wrong, or what needs clarification

**Language rules:**
- Never use vague terms without definition: "scalable", "clean", "simple",
  "fast", "robust" — quantify them or omit them.
- If making an assumption, prefix it: *"Assuming X — if that's wrong, this changes."*
- If uncertain, say so directly: *"I don't know the right answer here without
  seeing Y."*
- Never pad responses. If it can be said in 2 sentences, use 2 sentences.

**Never:**
- Pretend confidence you don't have
- Give two options and refuse to recommend one when one is clearly better
- Say "it depends" without immediately explaining what it depends on and giving
  a recommendation for the most likely case

---

## Rule 14 — Scope Containment

Do the task. Not the task plus improvements.

**When a task is defined:**
- Implement exactly what was asked.
- If you notice something broken nearby, mention it in a Note — don't fix it.
- If the task is underspecified, ask — don't invent scope.

**Note format when you spot adjacent issues:**
```
Note (out of scope): [File/function] has [problem]. Not touching it —
raise as a separate GitHub Issue if needed.
```

**Never:**
```
Add logging, metrics, or comments to code you weren't asked to touch.
Rename variables for "clarity" in files outside the task scope.
Run "while I'm here" refactors unless explicitly asked.
Add animation, empty states, or loading indicators to screens not
in the current task.
```

---

## Rule 15 — Refusal and Escalation Rules

Know when to stop.

**Stop and escalate (ask the developer) when:**
- The task requires changing a locked decision in `context.md` Section 4
- The task requires an architectural decision not covered in `design.md`
- The task would change a service method signature, Firestore schema field,
  or Storage path defined in `api-contracts.md`
- The task would modify `firestore.rules` or `storage.rules`
- Two valid approaches exist with meaningfully different tradeoffs — present both,
  ask which to proceed with
- The task is ambiguous in a way that would produce different code depending on
  interpretation
- A required context file is missing or clearly out of date

**Do not proceed with:**
```
Partial assumptions on Firestore schema changes
Guessed service method signatures
Inferred security rule changes
Undeclared new Firestore collections
New Capacitor plugin additions without confirmation
```

**Escalation format:**
```
BLOCKED: [What I cannot determine]
WHY IT MATTERS: [What goes wrong if I guess wrong]
WHAT I NEED: [Specific question or missing information]
```

---

## Rule 16 — Session Continuity Rules

Every session starts from context, not memory.

**At the start of every session:**
- Read `context.md` first. Treat it as the ground truth of current system state.
- Do not rely on previous conversation history as a substitute for updated context.
- If `context.md` is stale or contradicts recent changes, flag it immediately:
  *"context.md Section 1 still shows [component] as not started, but we completed
  it last session. Please update before we proceed."*

**After completing a task:**
State what changed so the developer can update `context.md`. Do not assume it
will be updated — surface it explicitly.

**Format for post-task context update suggestion:**
```
Suggested context.md update:
- Section 1: [Component] is now ✅ Done.
- Section 3: [Task] marked complete under Milestone v0.x.0.
- Section 6: Current task updated to [next task].
- Section 12: Recent changes — [what was built, why, what changed].
- Section 13: Next steps — [1-3 immediate next actions].
```

**If context is missing mid-task:**
Stop at the point of uncertainty. Do not hallucinate a context that was never
defined. Use the escalation format from Rule 15.

---

## Rule 17 — Refactoring Rules

Refactoring changes structure, not behaviour. Maintain that separation strictly.

**When refactoring is explicitly requested:**
1. Verify tests exist before touching anything. If they don't, write them first.
2. Make the refactor in the smallest possible steps — one logical change per commit.
3. Never change behaviour while refactoring. If you find a bug, stop, commit the
   refactor, then address the bug in a separate commit.
4. State upfront: what is changing structurally, and what is guaranteed not to
   change in behaviour.

**The specific refactoring that is never acceptable without explicit request:**
```
Renaming service methods (breaks the contract in api-contracts.md)
Restructuring the /src/ folder layout (breaks context.md Section 1 expectations)
Changing Firestore document field names (requires a database migration)
Changing the error message strings in service methods (breaks the contract
  in errors.md Section 5)
```

---

## Quick Reference — The Non-Negotiables

| Rule | Never Do |
|---|---|
| Think before coding | Proceed when requirements are ambiguous |
| Simplicity first | Write 200 lines when 50 would work |
| Architecture compliance | Import Firebase SDK in .vue files or Pinia stores |
| Context authority | Invent Firestore fields or service methods not in .md files |
| Error handling | Re-throw raw FirebaseError or expose .code to the UI |
| Security defaults | Trust client-supplied uid for ownership; call Firebase in components |
| Naming discipline | Deviate from the naming conventions in process.md Section 7 |
| Scope containment | Fix adjacent code you weren't asked to touch |
| Escalation | Guess when a Firestore schema or security rule change is implied |
| Session continuity | Rely on conversation memory over context.md |
| Testing | Skip tests for status transitions, upload ordering, or security rules |
| Dependencies | Add a package without stating name, version, and bundle size impact |