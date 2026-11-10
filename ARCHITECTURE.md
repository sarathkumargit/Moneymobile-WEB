# MoneyMobile — Architecture & Maintenance Guide

Installment phone-shop system: a Next.js + Supabase web admin and a Kotlin Android app that
locks/unlocks phones sold on installments. Shop operates in **Sri Lanka (UTC+5:30, no DST)**.

## Two codebases
- **Moneymobile WEB** — this folder. Next.js 14 (App Router) + Supabase (Postgres). Staff portal.
- **Money mobile** — the Android app (Device Owner / kiosk). Built with `./gradlew assembleDebug`
  or by double-clicking `Money mobile/publish-app.command` (also copies the APK into
  `Moneymobile WEB/setup-kit/` so the website can hand it out).

## Roles
`super_admin` (platform), `shop_admin` (owns a shop), `employee` (works a shop). Role is on
`profiles.role`; the signed-in profile comes from `getSessionProfile()` in `src/lib/auth.ts`.

## Web layout (src/)
- `app/shop/*`, `app/employee/*`, `app/super-admin/*` — role dashboards. Each has `layout.tsx`
  (auth gate), `loading.tsx` (skeleton), `page.tsx`, and `actions.ts` (server actions).
- `app/api/devices/*` — endpoints the **phone** calls (heartbeat, enroll, auto-enroll,
  command-ack, security-event, unlock-request). Authenticated by a hashed device token, not a login.
- `app/api/setup-kit/*` — per-shop install kit + public APK download + QR config.
- `components/*` — UI. `customer-detail.tsx` is the big one (device control + schedule).
- `lib/*` — shared logic. Key files below.

## Key libraries (src/lib)
- `auth.ts` — `getSessionProfile()` (cached per request; reads session locally, no extra network).
- `supabase/server.ts` — request-scoped client (RLS as the user). `supabase/admin.ts` — service
  role (bypasses RLS; **server-only**, used by phone endpoints).
- `device-api.ts` — `resolveAgreementId`, `buildAgreementStatus` (what the phone shows).
- `schedule.ts` — overdue math (`isOverdue`, `rowDisplayStatus`, `allocatePayment`).
- `overdue-lock.ts` — `evaluateOverdueLock`: locks/unlocks for missed payments.
- `sim-alert.ts` — `raiseSimAlert`: locks on SIM removal/change.
- `srilanka-time.ts` — **all due times are Sri Lanka time**; convert with these helpers.
- `flash.ts` — toast messages (set in a cookie by a server action, shown by `FlashToaster`).

## How locking works (the core)
The phone checks in every ~60s at `/api/devices/heartbeat`. The response includes the agreement
status; the phone locks when `agreement.locked` is true. `locked` comes from
`installment_agreements.restriction === "restricted"`. Three things set it:
1. **Overdue payment** — `evaluateOverdueLock()` runs on every heartbeat. If an installment's
   `due_at` (+ `grace_days`) has passed unpaid → `restriction="restricted"`, `restriction_reason="overdue"`.
   A payment that clears all overdue months auto-unlocks (reason must be 'overdue').
2. **SIM removed/changed** — the app locks instantly and calls `/api/devices/security-event`;
   `raiseSimAlert()` sets restricted + reason='sim'. Only staff Approve/Reject clears it.
3. **Manual** — staff Lock button (`device-management/actions.ts`) sets restricted + reason='manual'.
`restriction_reason` keeps the three apart so a payment never lifts a SIM or manual lock.

## Offline overdue lock (phone locks itself with no internet)
Every heartbeat's `agreement` also carries `server_time` and `overdue_lock_at` (UTC epoch ms, built in
`buildAgreementStatus` from `firstOverdueAt()` in `lib/billing/schedule.ts` — the SAME rule as `isOverdue`,
so phone and server always agree). The phone stores both (`OfflineLockGuard` in the Android app) and
locks itself at that moment even with no connection; the next heartbeat still wins (payment, new due
date or staff unlock replace the deadline). No migration needed. `overdue_lock_at` is null for
agreements that are not `active`, so nothing is enforced for paid/released/cancelled ones.
If you change the overdue rule in `schedule.ts`, the phone follows automatically.

## Database migrations (supabase/migrations)
Run new ones in the Supabase SQL editor in order. The app is written to **degrade gracefully**
if a migration hasn't run yet (queries fall back), so a missing migration slows a feature, it
doesn't crash a page. Notable: 0007 indexes, 0012 dashboard totals, 0013 SIM state, 0014 overdue
auto-lock (`restriction_reason`), 0015 due date+time (`due_at`).

## Conventions (keep these)
- Money math is **server-side only** (never trust client numbers) — see `installment.ts`.
- Phone endpoints use the **admin** client + device-token auth; staff pages use the **user**
  client so RLS applies.
- New due dates/times are **Sri Lanka** wall-clock — always go through `srilanka-time.ts`.
- After any change: `node node_modules/typescript/bin/tsc --noEmit -p .` must pass.
- Test real speed with `npm run build && npm start`, not `npm run dev` (dev compiles per page).

## Debugging checklist
- "Phone won't lock/unlock" → is it online (heartbeat `last_sync` < 5 min)? Check
  `installment_agreements.restriction` + `restriction_reason`. Check `device_commands` queue.
- "Not connected" → run the migration named in the server log; check device token.
- "Wrong time / locks at wrong hour" → it's a Sri Lanka-time issue; check `srilanka-time.ts` usage.
- "Page slow" → you're probably in `npm run dev`. Build + start. Otherwise check for a new
  sequential query that could join a `Promise.all`.


## Licenses, shop management, passwords
- `shops.license_limit` (migration `supabase/migrations/0018_license_limit.sql`, NULL = unlimited). One license = one agreement; all agreements of the shop count. Enforced in `createAgreement` (friendly message) and by a DB trigger (`enforce_license_limit`). If the migration is not run the app treats shops as unlimited.
- Super admin (Shops page → Manage): edit name/phone/address/status/licenses, reset the owner's password, delete a shop (blocked while it has agreements or phones — suspend instead). Owners and Employees pages: reset password.
- Shop owner (Employees page): edit, activate/deactivate, delete, reset password (same-shop employees only).

## Anti-tamper (app 1.7.1)
- While a phone is locked its USB port is charge-only (no file transfer, no USB debugging, USB data signaling off on Android 12+ phones that support it). All of it is lifted on unlock/release so the shop can still update over USB.
- At enrollment the app reports `bootloader_state` (locked / unlocked / unknown); migration `0019_bootloader_state.sql` stores it. Device Management flags "Bootloader unlocked — high risk" and "No check-in for N days".
- Device Management has Delete phone / Reset for resale per phone, and Remove for stale enrollment rows.

## Online app updates (app 1.10.0+, migration 0020)
- Super admin → **App Updates**: upload the release APK (straight to the private `app-releases` bucket). The server reads
  package + versionCode from inside the APK (`lib/devices/apk-info.ts`), rejects other apps and non-newer builds, stores SHA-256 + size.
  Then: **Test** in one shop → **Publish** to all shops. **Withdraw** cancels every update that hasn't started installing.
- Staff: Device Mgmt shows "App update available" (hidden otherwise) with **Update** / **Update all**; the customer page shows the
  same per phone. Nothing installs unless staff press Update. One `device_app_updates` row per request.
- Phone: the heartbeat response carries `app_update` ONLY for a requested update (`lib/devices/app-updates.ts`), signed with the
  phone's command key (`signAppUpdate`). The app (`update/AppUpdater.kt`, `AppUpdateWorker.kt`) downloads in the background
  (resumes; retries when back online), checks size + SHA-256 + package + version + signing certificate, then installs silently
  (Device Owner). Progress → `/api/devices/app-update`. Android installs atomically: any failure = phone keeps its current app.
  After the update `monitor/AppUpdatedReceiver` restarts management at once (lock screen, alarms, SIM watch, restrictions).
- Phones older than 1.10.0 (build 19) have no updater: they need ONE update with the USB setup file. The page says so per phone.
- Rules: raise `versionCode` for every release; sign with the SAME key (today: the Mac's ~/.android/debug.keystore — back it up);
  never remove/rename an API field an older app still uses.

## Reset protection per shop (migration 0021, app 1.10.1 reports status)
- No app can block the Power + Volume recovery reset. Instead, Android's Factory Reset Protection makes a reset useless:
  after ANY reset the phone only finishes setup with one of the shop's Google accounts.
- Shop owner → Shop Settings → **Reset protection**: enters the shop's Google account ID(s) (number from OAuth Playground,
  steps on the page). Stored in `shops.frp_account_ids`. `FRP_ACCOUNT_IDS` (env, optional) = platform backup added to all shops.
- Heartbeat sends `frp_account_ids` + `frp_sig` (signed, `signFrpAccounts`). App 1.10.1 applies only a signed list and reports
  `frp_state` (on/off/unsupported/failed) + `frp_accounts`; shown as a badge in Device Mgmt and on the customer page
  (`lib/devices/reset-protection.ts`). Super admin Shops list shows which shops haven't set it up.
- Release clears it on the phone (`DevicePolicyController.releaseFully`) before giving up Device Owner.
- If the shop list can't be loaded (DB error) the heartbeat leaves the field out, so a phone never loses protection by accident.

## Anti-unlock protection (migrations 0025–0029, app 1.11.0)
No app can stop a firmware flash on most phones (only the phone maker controls that layer). These layers make unlocking
rare, noticed within hours, traceable and costly. Each degrades gracefully: before its migration runs, it does nothing.
- **Unlock Tests (0025)** — Shop → Unlock Tests: record each model's test with your own tools (Power+Volume reset, FRP tool,
  firmware flash, MDM remover) → `lib/devices/model-risk.ts` gives Safe / Risky / Untested / Not allowed (a "held" result
  counts for 180 days; the latest result per attack wins). The agreement form shows the risk with a suggested down payment /
  term; "Not allowed" needs the shop owner + a written reason (audit `agreement_model_risk_override`). Super admin →
  Unlock Tests sets platform verdicts (a shop's own "bypassed" always wins over Safe/Risky).
- **Hardware key (0026)** — app 1.11.0 creates an EC key in the phone's secure chip with a server challenge (heartbeat field
  `attest_challenge`) and proves it at `/api/devices/attest` (Android key attestation; chain checked against Google's roots,
  challenge, package name, Google revocation list — `lib/devices/attestation.ts`, no extra npm packages). Every check-in is then
  signed: ECDSA-SHA256 over `"<X-MM-Ts>." + exact body`, header `X-MM-Sig` (`lib/devices/device-keys.ts`). Problems never
  refuse a check-in — they raise tamper alerts. Phones on 1.10.x show "No hardware key (app 1.10)".
- **Tamper alerts (0027)** — `lib/devices/tamper.ts`: rules with points (silent 2/7 days, unsigned / wrong / replayed signature,
  key lost / replaced, attestation not Google, bootloader unlocked, firmware not verified, USB debugging / developer options,
  phone registered again without Release, lost Device Owner). Score = open alerts of 30 days (max 100). Shop → Tamper Alerts:
  resolve / false alarm, optional auto-lock at a threshold (restriction_reason 'tamper'; a payment never lifts it), strict USB
  (USB debugging + file transfer blocked at all times on 1.11.0; Device Mgmt → "USB service 30 min"). Daily scan:
  `vercel.json` cron → `/api/cron/tamper-scan` (set `CRON_SECRET` in Vercel). Customer notice: heartbeat `tamper_notice` (signed).
- **Evidence chain (0028)** — every audit log entry, phone command, payment and identity event is copied into `evidence_chain`,
  hash-linked (append-only; `evidence_verify()` finds the first changed row). Customer page → agreement → Evidence report
  (printable, verified, shows the chain head).
- **Technician lookup (0029)** — public page `/check` + `GET/POST /api/public/imei-check` → only "Financed — contact <shop>" or
  "Not found", signed Ed25519 (public key `/api/public/imei-check/key`; set `IMEI_CHECK_SIGNING_KEY` = base64 of 32 random bytes).
  Rate limited (30/hour, 200/day per connection). A shop can opt out (`shops.imei_lookup_enabled`).
