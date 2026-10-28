# Supabase setup

## 1. Create the project
1. Go to https://supabase.com → **New project**. Pick a name, a strong DB password, and a region close to you (e.g. Singapore for Sri Lanka).
2. Wait for it to finish provisioning.

## 2. Get your keys
Project → **Settings → API**. Copy these into `../.env.local` (create it from `../.env.example`):

| .env.local key | Supabase value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` `secret` key (server-only) |

## 3. Create the database
Project → **SQL Editor → New query** → paste the contents of
`migrations/0001_init.sql` → **Run**. This creates all tables, indexes,
the signup trigger, and Row-Level Security policies.

## 4. Create your first Super Admin
1. Project → **Authentication → Users → Add user** → enter an email + password
   (this is your login).
2. Project → **SQL Editor**, run (replace the email):
   ```sql
   update profiles
   set role = 'super_admin', full_name = 'Your Name'
   where id = (select id from auth.users where email = 'you@example.com');
   ```
3. That account can now sign in as the platform Super Admin once auth is wired.

## Multi-tenancy model
- `profiles.role` is one of `super_admin | shop_admin | employee`.
- `profiles.shop_id` ties a shop admin / employee to one shop (null for super admin).
- RLS enforces: super admin = everything; shop admin = their whole shop;
  employee = their shop, limited to customers/devices they created or were assigned.
- Privileged writes use the service-role key **only in server code** (Route Handlers /
  Server Actions), never in the browser.
