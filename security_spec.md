# FloraQ Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Default-Deny Catch-All**: Every undefined Firestore path is denied (`match /{document=**} { allow read, write: if false; }`).
2. **Verified Identity & Ownership**: All writes require an authenticated user with `request.auth.token.email_verified == true`. Every top-level plant plan (`plants/{plantId}`) is bound to `ownerId == request.auth.uid`.
3. **Master Gate Subcollection Ownership**: Any read, create, update, or delete on `/plants/{plantId}/cycles/{cycleId}`, `/plants/{plantId}/observations/{observationId}`, or `/plants/{plantId}/careEvents/{careEventId}` fetches the parent `/plants/{plantId}` document via `get()` and requires `parent.data.ownerId == request.auth.uid` (or `isAdmin()`), matching `incoming().plantId == plantId` and `incoming().ownerId == request.auth.uid`.
4. **PII Isolation**: Email addresses and avatar URLs are isolated under `/users/{userId}/private/info`, strictly readable/writable only by `userId == request.auth.uid` or `isAdmin()`. No blanket `isSignedIn()` reads exist anywhere.
5. **Immutable & Terminal States**: `ownerId`, `plantId`, `uid`, and `createdAt` are immutable after creation. Archived plants (`status == 'archived'`) and completed cycles (`status == 'completed'`) lock against non-admin updates.
6. **Temporal Integrity**: `createdAt` on create and `updatedAt` on create/update must equal `request.time`.
7. **Strict Key & Size Enforcement**: Every entity validation helper enforces `keys().hasAll(...)` and `keys().hasOnly(...)` along with bounded string lengths and regex-validated IDs (`^[a-zA-Z0-9_\\-]+$`).

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Identity Spoofing on Plant Create**: Creating `/plants/p1` with `ownerId: "victim-uid"` while signed in as `"attacker-uid"`. -> `PERMISSION_DENIED`
2. **Shadow Field Injection on User Create**: Creating `/users/attacker-uid` with extra ghost field `isAdmin: true` or `role: "admin"`. -> `PERMISSION_DENIED`
3. **Unverified Email Spoofing**: Creating `/plants/p2` with `email: "yadavr60003@gmail.com"` and `email_verified: false`. -> `PERMISSION_DENIED`
4. **PII Cross-User Read**: Reading `/users/victim-uid/private/info` as `"attacker-uid"`. -> `PERMISSION_DENIED`
5. **Orphaned Subcollection Write**: Creating `/plants/nonexistent-plant/cycles/c1` where parent `/plants/nonexistent-plant` does not exist. -> `PERMISSION_DENIED`
6. **Cross-Tenant Subcollection Hijack**: Creating `/plants/victim-plant/observations/obs1` as `"attacker-uid"`. -> `PERMISSION_DENIED`
7. **Client Timestamp Forgery**: Creating `/plants/p3` with client-supplied `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time`. -> `PERMISSION_DENIED`
8. **Immutable Owner Transfer**: Updating `/plants/p1` to change `ownerId` from `"attacker-uid"` to `"other-uid"`. -> `PERMISSION_DENIED`
9. **Terminal State Bypass**: Updating `/plants/archived-plant` (`status == 'archived'`) to mutate `planName` or revert `status` to `'active'`. -> `PERMISSION_DENIED`
10. **ID Poisoning / Resource Exhaustion**: Writing `/plants/<200-char-junk-id>` or sending `notes` > 2000 characters. -> `PERMISSION_DENIED`
11. **Value Type Poisoning on Action Update**: Updating `/plants/p1` `notes` with a boolean `true` or integer `123` instead of a string. -> `PERMISSION_DENIED`
12. **Unfiltered Collection Scraping**: Listing `/plants` without `where('ownerId', '==', auth.uid)`. -> `PERMISSION_DENIED`
