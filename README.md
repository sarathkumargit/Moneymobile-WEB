# MoneyMobile — Mobile Installment Management Platform

A multi-tenant web platform for mobile phone retailers to manage phone inventory,
customers, guarantors, installment agreements, payments and supported device
management — with strict role-based access (Super Admin / Shop Admin / Employee).

> Design and feature ideas are inspired by the CoolPay management system; this is a
> new, original build.

## Tech stack
- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** + shadcn-style UI primitives + **lucide-react** icons
- **Recharts** for analytics
- **Supabase** (PostgreSQL, Auth, Storage, Row-Level Security) — wired in the next phase

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Run the dev server
npm run dev
# open http://localhost:3000
```

The app opens on the sign-in screen. Until Supabase auth is wired, use the
**"Preview a dashboard"** shortcuts to open each role workspace:
- Super Admin  → /super-admin
- Shop Admin   → /shop
- Employee     → /employee

## Supabase setup (next phase)

1. Create a project at https://supabase.com
2. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only — never commit or expose in client code)
3. Database migrations (tables + RLS policies) will live in `supabase/migrations/`.

## Status

**Phase 1–2 (done):** project foundation, emerald/white design system, login screen,
and the three role dashboards (Super Admin / Shop Admin / Employee) with sidebar
navigation and overview cards. **All figures are clearly-labeled sample data.**

**Next:** Supabase schema + RLS migrations, real authentication, role resolution and
backend authorization, then the feature modules (inventory, customers, guarantors,
installments, payments, device management, temporary unlocks, audit logs).

## Project structure

```
src/
  app/
    layout.tsx            Root layout + global styles
    page.tsx              Redirects to /login
    login/                Sign-in screen
    super-admin/          Super Admin workspace (layout + overview)
    shop/                 Shop Admin workspace
    employee/             Employee workspace
  components/
    ui/                   Button, Card, Badge, Input, Label
    sidebar.tsx           Role-aware navigation
    dashboard-shell.tsx   Sidebar + top bar wrapper
    stat-card.tsx, loans-table.tsx, collections-chart.tsx, prototype-banner.tsx
  lib/
    nav.ts                Role-based navigation config
    mock-data.ts          Sample data (prototype only)
    utils.ts              cn(), formatCurrency()
    supabase/             Browser + server Supabase clients
```
