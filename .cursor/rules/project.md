# Girigo — Cursor Project Rules

## Stack
Ionic + Vue 3 + TypeScript + Capacitor + Firebase BaaS (free Spark plan)
No custom backend. No Firebase Functions. Firebase IS the backend.

## Absolute Layering Rule — never violate
Views → Stores → Services → Firebase SDK
NEVER import firebase/firestore, firebase/storage, or firebase/auth in .vue files or Pinia stores.
ALL Firebase SDK calls go through /src/services/ only.

## Context Files — read before implementing
- Architecture decisions: @docs/context/design.md
- Technology choices: @docs/context/tech-stack.md
- UX and frontend: @docs/context/frontend.md
- Service layer and business rules: @docs/context/backend.md
- Firestore schema: @docs/context/database.md
- Auth model: @docs/context/auth.md
- Security rules: @docs/context/security.md
- Error contract: @docs/context/errors.md
- Current system state: @docs/context/context.md

## Error Handling
Every async service method wraps Firebase calls in try/catch.
NEVER re-throw raw FirebaseError or expose .code to the UI.
ALWAYS throw new Error('Human-readable message.') instead.
Log with: console.error('[ServiceName.method] failed — uid: ${uid}', error)

## Naming Conventions
- Vue views: PascalCase + View suffix (HomeView.vue)
- Vue components: PascalCase (WishCard.vue)
- Services: PascalCase + Service suffix (WishService.ts)
- Pinia stores: camelCase + Store suffix (wishesStore.ts)
- Composables: camelCase + use prefix (useCamera.ts)
- Booleans: is/has/can prefix (isLoading, hasError, canSubmit)
- Event handlers: handle prefix (handleSubmit)

## Absolutely Forbidden
- v-html anywhere in the codebase
- Hardcoded hex colour values in <style> blocks — use CSS variables from variables.css
- localStorage or sessionStorage — use @capacitor/preferences only
- inline style attributes for design values
- any type without an explaining comment
- console.log in production code paths
