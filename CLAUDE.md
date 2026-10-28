# MoneyMobile Web — notes for Claude Code

Read `ARCHITECTURE.md` first. This file is the short version + rules to not break things.

## Golden rules
- **Never change working behavior while refactoring.** Run `node node_modules/typescript/bin/tsc --noEmit -p .` after every change; it must stay clean.
- **Due dates/times are Sri Lanka time** (UTC+5:30, no DST). Convert via `src/lib/srilanka-time.ts` — never `new Date(localString)` on the server for a due time.
- **Money is computed server-side** (`src/lib/installment.ts`), never from client input.
- **Migrations degrade gracefully**: when adding a column, make the query fall back if it's missing (see `loadAgreements`/`loadSchedules` in `customer-detail.tsx`). Don't let a page 500 because a migration wasn't run.
- Phone endpoints (`app/api/devices/*`) authenticate by hashed **device token** + use the **admin** Supabase client. Staff pages use the **user** client (RLS). Don't mix them.

## Where things are
- Locking logic: `lib/overdue-lock.ts` (payments), `lib/sim-alert.ts` (SIM). `restriction_reason` ('overdue'|'sim'|'manual') decides what a payment may auto-unlock.
- Heartbeat (phone ↔ server): `app/api/devices/heartbeat/route.ts`.
- The customer screen (device control + schedule + payments): `components/customer-detail.tsx`.
- Toasts: set with `setFlash()` in a server action; shown by `FlashToaster` via the dashboard shell.
- Offline unlock code: `lib/offline-unlock.ts` (server) ↔ `util/OfflineUnlock.kt` (phone) — same HMAC, keep them in sync. Generating a code also queues UNLOCK (`lib/device-commands.ts`).
- Late SIM alerts: the phone sends when the SIM was removed (`timestamp` + `sent_at`); `security-event` won't lock if staff issued UNLOCK after that. App 1.4.0+ sends `sim_watch`, which turns off the heartbeat's backup SIM check.
- Phone on records: agreements + payments keep `device_model`/`device_imei` (migration 0016, `lib/device-snapshot.ts`) so history survives Reset for resale / Delete phone.

## Performance
- Group independent Supabase calls into one `Promise.all` (one round-trip). Pattern is all over `customer-detail.tsx`.
- Real speed = `npm run build && npm start`. `npm run dev` is slow because it compiles each page on first open.
- Hot query paths have indexes (migrations 0007/0012/0014/0015). Add one when you add a new filter/sort over a growing table.

## Android app
- Build: `./gradlew assembleDebug` in `../Money mobile`, or double-click `../Money mobile/publish-app.command` (also publishes the APK to `setup-kit/`).
- Bump `versionName`/`versionCode` in `app/build.gradle.kts` when behavior changes, so the Install App page shows which build a phone is running.
