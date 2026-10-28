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
