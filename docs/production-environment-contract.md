# Production environment contract

This document defines names and validation rules only. Secret values must never be committed, logged, copied into tickets, or exposed through `NEXT_PUBLIC_*` variables.

## Deployment invariants

- `DATABASE_URL` is the application-runtime PostgreSQL URL. For serverless production it should use the approved transaction pooler and its intentional connection limit.
- `DIRECT_URL` is the migration/session connection. It must remain distinct from `DATABASE_URL` and be used only by a single controlled migration worker.
- Neither URL may point to the Phase 4.2 project, the previous `_1` project, localhost, or a placeholder in production.
- Production must not define `PHASE42_PG_TEST=1` or any PostgreSQL integration-test flag.
- Server-only values must not use a `NEXT_PUBLIC_` prefix.
- Validation errors may name a missing variable, but must never include its value.

## Core variables

| Variable | Requirement | Exposure | Purpose | Validation before deployment |
|---|---|---|---|---|
| `DATABASE_URL` | Required | Server only | Runtime Prisma connection | PostgreSQL URL; approved production project; runtime pooler; non-placeholder |
| `DIRECT_URL` | Required | Server only | Prisma migration connection | PostgreSQL URL; same production project; session/direct endpoint; non-placeholder |
| `AUTH_SECRET` | Required | Server only | Session signing/encryption | Present, non-placeholder, independently generated |
| `CRON_SECRET` | Required when retention cron is enabled | Server only | Maintenance endpoint bearer authentication | Present, non-placeholder, stored in both scheduler and application environments |
| `OTP_HASH_SECRET` | Recommended required | Server only | OTP keyed hashing | Present and independently generated. Code can fall back to `AUTH_SECRET`, but production should configure a separate value |
| `NEXT_PUBLIC_APP_URL` | Required | Browser safe | Canonical HTTPS origin | Absolute production HTTPS URL; no localhost; no trailing ambiguity |
| `NEXT_PUBLIC_SUPABASE_URL` | Required for Supabase storage/API use | Browser safe | Supabase API origin | HTTPS URL for the approved production project |
| `SUPABASE_SERVICE_ROLE_KEY` | Required for privileged storage operations | Server only | Supabase service-role client | Present, non-placeholder; never exposed to browser code |

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is browser-safe but is not currently consumed by application source. Configure it only if a client-side Supabase client is introduced.

## Conditional integrations

| Variable | Required when | Exposure | Validation |
|---|---|---|---|
| `LEMON_SQUEEZY_API_KEY` | Checkout enabled | Server only | Present and production-scoped |
| `LEMON_SQUEEZY_WEBHOOK_SECRET` | Billing webhooks enabled | Server only | Present in application and provider webhook configuration |
| `LEMON_SQUEEZY_STORE_ID` | Checkout/webhooks enabled | Server only | Matches the approved production store |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp enabled | Server only | Present and production-scoped |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp sending enabled | Server only | Matches approved sender |
| `WHATSAPP_WABA_ID` | Template management enabled | Server only | Matches approved business account |
| `WHATSAPP_VERIFY_TOKEN` | WhatsApp webhook enabled | Server only | Present in application and provider webhook configuration |
| `WHATSAPP_APP_SECRET` | WhatsApp webhook enabled | Server only | Present; used for signature verification |
| `GEMINI_API_KEY` | AI PDF import enabled | Server only | Present and production-scoped |
| `GEMINI_MODEL` | AI PDF import enabled | Server only | Approved supported model name |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile enabled | Browser safe | Matches production site registration |
| `TURNSTILE_SECRET_KEY` | Turnstile enabled | Server only | Matches site key and production hostname |
| `MENUQR_VERCEL_ACCESS_TOKEN` | In-app custom-domain management enabled | Server only | Least-privilege token |
| `MENUQR_VERCEL_PROJECT_ID` | In-app custom-domain management enabled | Server only | Approved production project |
| `MENUQR_VERCEL_TEAM_ID` | Team-scoped Vercel project | Server only | Approved team |

WhatsApp template names, language codes, API version, default country code, and OTP length/expiry are non-secret configuration, but must still be reviewed for production correctness.

## Manual production gate

An operator must verify presence and target identity in the deployment platform without copying values into logs. Repository validation does not prove that production values are correct.
