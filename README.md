# MenuQR

MenuQR is a multi-tenant SaaS for restaurant QR menus and WhatsApp-assisted ordering. Restaurants get a public menu at `/menu/[slug]`; guests can search, build a cart, enter checkout details, and open a preformatted order through `wa.me` without a WhatsApp API integration.

## Included

- Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 4
- Auth.js credentials authentication with bcrypt password hashing and JWT sessions
- Supabase PostgreSQL with Prisma for all tenant and business data
- Supabase Storage for restaurant logos, covers, and product images
- Zod validation and server-authoritative order price calculation
- Responsive marketing site, onboarding, owner dashboard, and customer menu
- Search, categories, cart quantities, checkout notes, and encoded WhatsApp orders
- Arabic-ready data fields, SEO metadata, sitemap, robots rules, security headers, and tests

## Supabase installation

Requirements: Node.js 20+, npm, and a Supabase project.

1. Create a project in Supabase and save its database password.
2. Copy `.env.example` to `.env`.
3. In **Project Settings → Database**, copy the transaction-mode pooler URL (port 6543) to `DATABASE_URL`. Append `?pgbouncer=true&connection_limit=1`.
4. Copy the direct URL or session-mode pooler URL (port 5432) to `DIRECT_URL`.
5. In **Project Settings → API**, copy the project URL and service-role key to their matching variables. Keep the service-role key server-only.
6. Set `AUTH_SECRET` and `NEXT_PUBLIC_APP_URL`.
7. Run `npm install` and `npm run db:generate`.
8. Apply the committed database migrations with `npm run db:deploy`.
9. Run [supabase/storage.sql](supabase/storage.sql) once in the Supabase SQL Editor.
10. Start the application with `npm run dev`.

The sample restaurant remains available at `/menu/demo-bistro`, including without a database connection.

## Environment variables

| Variable                         |   Required | Purpose                                             |
| -------------------------------- | ---------: | --------------------------------------------------- |
| `DATABASE_URL`                   |        Yes | Supabase transaction pooler URL for runtime traffic |
| `DIRECT_URL`                     |        Yes | Direct/session Supabase URL for Prisma migrations   |
| `NEXT_PUBLIC_SUPABASE_URL`       |        Yes | Supabase project API URL                            |
| `SUPABASE_SERVICE_ROLE_KEY`      |        Yes | Server-only Storage administration key              |
| `AUTH_SECRET`                    |        Yes | Random 32+ byte Auth.js signing secret              |
| `NEXT_PUBLIC_APP_URL`            |        Yes | Canonical application URL                           |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Production | Free Cloudflare Turnstile public site key           |
| `TURNSTILE_SECRET_KEY`           | Production | Server-only Cloudflare Turnstile secret             |

Generate an auth secret with `openssl rand -base64 32`. Never commit `.env`, a database password, or the service-role key.

Create one free Cloudflare Turnstile widget for the production domain. The widget is intentionally used only for restaurant registration and customer checkout. Server-side validation is mandatory in production; local development can run without Turnstile keys.

## Database and migrations

Prisma uses `DATABASE_URL` for normal pooled queries and automatically uses `DIRECT_URL` for migration commands. The committed migrations create the schema, optimized tenant indexes, and example RLS policies.

- `npm run db:generate` — generate Prisma Client
- `npm run db:migrate` — create a migration during development
- `npm run db:deploy` — apply committed migrations to Supabase
- `npm run db:status` — inspect migration status
- `npm run db:studio` — open Prisma Studio through the direct connection

Use `db:deploy`, never `prisma migrate dev`, in production. The service-role Storage client is only created on the server and only after Auth.js role and tenant checks.

## Quality checks

- `npm run lint` — ESLint
- `npm test` — unit tests
- `npm run build` — production compilation and type checking
- `npx prisma validate` — database schema validation

## Supabase and Vercel deployment

1. Create the Supabase project and rotate any key that has previously been exposed.
2. Configure local environment variables and run `npm run db:deploy`.
3. Execute [supabase/storage.sql](supabase/storage.sql) in the SQL Editor and verify all three buckets under Storage.
4. Import the repository into Vercel.
5. Add every variable from `.env.example` in Vercel for Production and Preview. Use the transaction pooler for `DATABASE_URL` and the direct/session URL only for `DIRECT_URL`.
6. Deploy, set `NEXT_PUBLIC_APP_URL` to the final HTTPS domain, and redeploy.
7. Run `npm run db:deploy` for each release containing migrations.

For production, retain `connection_limit=1` for serverless functions, rotate secrets regularly, enable Supabase backups/PITR, configure transactional email, and use a distributed rate limiter such as Upstash.

## Architecture

The application architecture and Auth.js implementation are unchanged. `src/app` owns routes and API boundaries, `src/components` contains interactive features, `src/lib` contains shared domain utilities, `src/lib/supabase` owns Supabase clients and Storage helpers, and `prisma/schema.prisma` remains the tenant-aware domain model. See [supabase/README.md](supabase/README.md) for the project layout, connection topology, RLS behavior, and provisioning order.
