# Deploying MoneyMobile Web

The app is Next.js 14 + Supabase. Supabase is already cloud — only this web app goes online.

## Recommended host: Vercel (free)

### 1. Push this repo to GitHub (secrets are git-ignored, so they stay local).

### 2. Import the repo at vercel.com → New Project.

### 3. Set Environment Variables (Vercel → Project → Settings → Environment Variables):

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key (secret) |
| `FIREBASE_SERVICE_ACCOUNT` | The WHOLE firebase-service-account.json, pasted as one line |

(`firebase-service-account.json` is only for LOCAL dev. On Vercel there is no file, so the
Firebase key goes in the `FIREBASE_SERVICE_ACCOUNT` variable instead — the code reads either.)

### 4. Deploy. You get a permanent URL like `https://moneymobile-xxxx.vercel.app`.

### 5. Point the phones at it
In Shop Settings (or the setup `config.txt`), set the server address to the public URL.
New phones set up after this will use it automatically; existing phones get re-pointed the next
time you run the update/setup file.

## Alternative: Railway / Render
Both run a normal Node server (`next start`) with a real filesystem — the app works unchanged.
Set the same four environment variables.

## After deploying
- Phones reach the server over their own SIM data or any Wi-Fi — no shop Wi-Fi, no router
  settings, no firewall, no IP changes.
- FCM push and the offline unlock code work exactly as before.
