# Take-Off Parts

Privacy-first marketplace for North-American heavy-truck parts. See `.planning/` for the product spec and roadmap.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000. The scaffold runs without Supabase credentials (the home page makes no database calls).

## Connecting Supabase (do this before Phase 1 features)

1. Create a Supabase project at https://supabase.com/dashboard.
2. Copy `.env.example` to `.env.local`.
3. From the project's API settings, fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only — never commit, never prefix `NEXT_PUBLIC_`)
4. `.env.local` is gitignored. Never commit real credentials.

## Project structure

- `app/(public)` / `app/(auth)` / `app/(app)` / `app/admin` — route groups.
- `lib/supabase/{client,server,middleware,admin}.ts` — Supabase clients (admin is server-only).
- `supabase/migrations/` — schema source of truth (first migration arrives in Phase 1).
