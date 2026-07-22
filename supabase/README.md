# Supabase project structure

MenuQR uses Supabase PostgreSQL and Storage while retaining Prisma and Auth.js.

- `prisma/schema.prisma` defines application tables.
- `prisma/migrations/20260721000100_init` creates the complete schema.
- `prisma/migrations/20260721000200_supabase_rls_indexes` adds optimized indexes and RLS examples.
- `supabase/storage.sql` creates the three public image buckets and read policy.
- `src/lib/supabase` contains browser, server, and Storage utilities.
- `src/app/api/uploads` is the Auth.js-protected upload/delete boundary.

## Connection topology

Use the transaction-mode pooler on port 6543 for `DATABASE_URL`. Include
`pgbouncer=true&connection_limit=1`; Prisma will avoid prepared-statement conflicts
and conserve Supabase connections in Vercel serverless functions.

Use the direct connection or session-mode pooler on port 5432 for `DIRECT_URL`.
Prisma automatically uses it for migrations because it is configured as
`directUrl` in the datasource.

## Provisioning order

1. Create a Supabase project and save its database password.
2. Copy `.env.example` to `.env` and paste the pooler, direct, API URL,
   and newly rotated service-role key.
3. Run `npm run db:generate`.
4. For a fresh project, run `npm run db:deploy` to apply committed migrations.
5. Run `supabase/storage.sql` in the Supabase SQL Editor.
6. Confirm the three buckets in Storage and the migrations in `_prisma_migrations`.

Do not expose `SUPABASE_SERVICE_ROLE_KEY`. Auth.js owns user sessions; Supabase
Auth is deliberately not enabled. The service role is used only inside the server
upload utility after role and tenant authorization.
