/**
 * Girigo TypeScript Interfaces — Single Source of Truth
 *
 * These interfaces define the exact shape of every Firestore document and
 * service method input/output. Do not modify field names or types without
 * also updating database.md and api-contracts.md.
 *
 * Authoritative reference: api-contracts.md Section 3, database.md Section 2
 */

/**
 * Matches Firebase Timestamp shape.
 * Defined here to avoid Firebase SDK imports outside /src/services/.
 */
export interface Timestamp {
  seconds: number
  nanoseconds: number
  toDate(): Date
}

/** Wish lifecycle states. Transitions are one-way: pending → granted or pending → rejected. */
export type WishStatus = 'pending' | 'granted' | 'rejected'

/** Firestore document at /users/{uid} */
export interface UserDocument {
  /** Firebase Auth UID — matches Firestore document ID — IMMUTABLE */
  uid: string
  /** Generated display name e.g. "phantom_38291" — IMMUTABLE */
  username: string
  /** Set at document creation — IMMUTABLE */
  createdAt: Timestamp
  /** Updated on each app resume */
  lastSeen: Timestamp
  /** FCM device token — updated on each launch */
  pushToken: string
  /** Access level — set manually in Firebase Console — never changed by app */
  role: 'user' | 'admin'
  /** SHA-256 hash of admin PIN — only present on admin user documents */
  pinHash?: string
}

/** Firestore document at /wishes/{wishId} */
export interface WishDocument {
  /** Client-generated UUID — matches Firestore document ID — IMMUTABLE */
  wishId: string
  /** Firebase Auth UID of submitting user — IMMUTABLE */
  uid: string
  /** Copied from UserDocument.username at submission time — IMMUTABLE */
  username: string
  /** User's optional text — empty string '' if skipped — max 280 chars — IMMUTABLE */
  wishText: string
  /** Firebase Storage download URL — must be non-empty — IMMUTABLE */
  videoUrl: string
  /** Firebase Storage download URL — must be non-empty — IMMUTABLE */
  thumbnailUrl: string
  /** Current lifecycle state — always 'pending' at creation */
  status: WishStatus
  /** Set once at creation — IMMUTABLE */
  createdAt: Timestamp
  /** null while pending; set to serverTimestamp() when admin reviews */
  grantedAt: Timestamp | null
  /** null until admin reviews; max 500 chars when set */
  adminMessage: string | null
  /** false at creation; set to true when user opens WishDetailView */
  viewed: boolean
}

/** Input to WishService.createWish() — all fields required */
export interface NewWish {
  /** Client-generated UUID — created before upload begins */
  wishId: string
  /** From authStore.user.uid */
  uid: string
  /** From userStore.username */
  username: string
  /** Empty string '' if user skipped text input */
  wishText: string
  /** Firebase Storage download URL — obtained from UploadService after upload */
  videoUrl: string
  /** Firebase Storage download URL — obtained from UploadService after upload */
  thumbnailUrl: string
}

/** Input to AdminService.updateWishStatus() */
export interface StatusUpdate {
  wishId: string
  /** 'pending' is NEVER a valid target — only granted or rejected allowed */
  newStatus: 'granted' | 'rejected'
  adminMessage: string | null
}
