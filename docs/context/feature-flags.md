# feature-flags.md — Girigo Feature Flags

---

## Status: Not Implemented in MVP

Feature flags are **not implemented** in Girigo's MVP. This is an intentional,
documented decision — not an oversight.

This document explains the decision, documents the simple future path if flags ever
become necessary, and gives Cursor explicit instructions on what not to build.

---

## Why Feature Flags Are Not Needed for This Project

Feature flags solve a specific problem: **how to safely expose an incomplete or
risky feature to a subset of users in a live production system without redeploying.**

That problem does not exist in Girigo because:

| Condition That Justifies Flags | Girigo's Reality |
|---|---|
| Many users who cannot all be individually reached | 6 friends who can be messaged directly |
| Risky partial rollout across a large user base | Worst case: 6 people get a broken APK; they reinstall the previous version from GitHub Releases |
| A/B testing to measure feature impact | 6 users is statistically meaningless for A/B tests |
| Kill switches for features under load | Firebase handles load; no custom infrastructure to throttle |
| Gradual percentage rollout | APK distribution is manual; "rollout" means sharing a new download link |
| Multiple teams needing independent release control | One developer |

The overhead of designing, building, and maintaining a feature flag system —
even a minimal Firestore-based one — produces zero practical value at this scale
and adds complexity that would make Cursor-assisted development harder to manage.

---

## The Current Release Model (This Replaces Flags)

"Releasing" a feature in Girigo means:

```
1. Build the feature on the dev branch
2. Test it locally with ionic serve and on a physical device
3. Merge to main when done
4. Push a version tag (v0.x.x)
5. GitHub Actions builds and publishes the signed APK
6. Send the new download link to 6 test users
```

If the feature is broken:
```
1. Fix it on dev
2. Push a patch release (v0.x.1)
3. Send the new link
```

This is faster and simpler than any feature flag system. The APK release is the
rollout mechanism. There are no partially-exposed features, no flag states to
manage, and no flag cleanup debt.

---

## Instruction for Cursor

```
DO NOT implement feature flags in this project.
DO NOT add flag checks to Vue components, Pinia stores, or service methods.
DO NOT create a Firestore collection or document for feature flag state.
DO NOT add LaunchDarkly, Firebase Remote Config, or any flag evaluation library.

Unreleased features are not in the codebase at all — they are not behind a flag.
If a feature is not in scope for the current milestone (context.md Section 6),
it does not exist in any form in the code.
```

---

## If Feature Flags Ever Become Necessary

The trigger for needing a real feature flag system is:
- The app has more than ~100 active users, AND
- A risky feature cannot be safely tested with all users simultaneously

If that threshold is reached, the approach established in `frontend.md` Section 14
is the starting point:

```ts
// Future: /config/featureFlags Firestore document
// Read once on app launch; stored in a configStore
interface FeatureFlags {
  liveChat: boolean       // false until implemented
  aiModeration: boolean   // false until implemented
  reactions: boolean      // false until implemented
}
```

Implementation details if this ever becomes needed:
- **Storage**: A single Firestore document at `/config/featureFlags`
- **Access**: Readable by all authenticated users; writable only by admin
- **Evaluation**: Client-side, in a `configStore`, fetched on app launch
- **Default on missing flag**: Always `false` — fail-safe, not fail-open
- **No external service**: No LaunchDarkly, no Firebase Remote Config — the Firestore
  document is sufficient for a simple boolean flag system

This is not built in MVP. It is documented here so Cursor knows the planned approach
if the developer ever opens a GitHub Issue to implement it.

---

## Sections of the Template That Do Not Apply

The following sections of the feature-flags.md template are not applicable to
Girigo at any point in the MVP. They are listed here so Cursor does not attempt
to implement them:

| Section | Why Not Applicable |
|---|---|
| Percentage-based rollout | APK distribution is the rollout mechanism; no partial user targeting |
| A/B testing / experiment flags | Statistically meaningless at 6 users |
| Cohort targeting | No user segments; all 6 users are equivalent |
| Kill switches | No custom infrastructure to protect; Firebase handles availability |
| Flag evaluation at edge/CDN | No CDN layer; Ionic app is a downloaded APK, not a web deployment |
| Multi-environment flag consistency | One Firebase project for all environments |
| Flag dependency management | No flags to depend on each other |
| Emergency flag override protocols | Emergency = push a patch release; faster than any flag system |