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

Read-only live demos are available without a database connection:

- `/menu/demo-bistro` — Burger Factory
- `/menu/demo-pizza-roma` — Pizza Roma
- `/menu/demo-al-sultan` — Al Sultan Grills
- `/menu/demo-mazag-coffee` — Mazag Coffee

Demo carts, extras, favorites, and WhatsApp previews run only in the browser.
They never create orders, analytics events, or production database records.

## Environment variables

| Variable                         |   Required | Purpose                                             |
| -------------------------------- | ---------: | --------------------------------------------------- |
| `DATABASE_URL`                   |        Yes | Supabase transaction pooler URL for runtime traffic |
| `DIRECT_URL`                     |        Yes | Direct/session Supabase URL for Prisma migrations   |
| `NEXT_PUBLIC_SUPABASE_URL`       |        Yes | Supabase project API URL                            |
| `SUPABASE_SERVICE_ROLE_KEY`      |        Yes | Server-only Storage administration key              |
| `AUTH_SECRET`                    |        Yes | Random 32+ byte Auth.js signing secret              |
| `NEXT_PUBLIC_APP_URL`            |        Yes | Canonical application URL                           |
| `MENUQR_VERCEL_ACCESS_TOKEN`     | Domains only | Server-only token used to add and verify project domains |
| `MENUQR_VERCEL_PROJECT_ID`       | Domains only | Vercel project ID (`prj_...`)                       |
| `MENUQR_VERCEL_TEAM_ID`          |   Optional | Team ID when the project belongs to a Vercel team   |
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
# AI PDF menu import

Restaurant owners can open **Dashboard → Products → Import from PDF** to upload
a PDF menu, review the extracted categories and products, and save only the
approved data.

1. Create an API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Add the key to local `.env` and the Vercel project environment:

   ```env
   GEMINI_API_KEY=your_server_only_key
   GEMINI_MODEL=gemini-2.5-flash
   ```

3. Run `npm run db:deploy`. The migration creates the private, temporary
   `menu-imports` Supabase Storage bucket.

The key is used only by the server. PDFs are limited to 20 MB, uploaded directly
to the private bucket through a signed URL, processed in one Gemini request, and
deleted immediately after analysis. The feature uses Gemini's native PDF vision,
so selectable and scanned menus are handled without a separate OCR service.

## WhatsApp Cloud API

MenuQR includes a server-only Meta WhatsApp Cloud API integration for OTPs,
approved notification templates, delivery callbacks, incoming messages, and
template status events.

### Environment variables

```env
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WABA_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_API_VERSION=v23.0
DEFAULT_PHONE_COUNTRY_CODE=20
WHATSAPP_TEMPLATE_LANGUAGE_AR=ar_EG
WHATSAPP_TEMPLATE_LANGUAGE_EN=en
WHATSAPP_TEMPLATE_OTP=otp_verification
WHATSAPP_TEMPLATE_OTP_AR=
WHATSAPP_TEMPLATE_OTP_EN=
WHATSAPP_TEMPLATE_OTP_LANGUAGE_AR=ar_EG
WHATSAPP_TEMPLATE_OTP_LANGUAGE_EN=en
WHATSAPP_TEMPLATE_ORDER_RECEIVED=customer_order_received
WHATSAPP_TEMPLATE_ORDER_ACCEPTED=order_accepted
WHATSAPP_TEMPLATE_ORDER_PREPARING=order_preparing
WHATSAPP_TEMPLATE_ORDER_READY=order_ready
WHATSAPP_TEMPLATE_ORDER_OUT_FOR_DELIVERY=order_out_for_delivery
WHATSAPP_TEMPLATE_ORDER_DELIVERED=order_delivered
WHATSAPP_TEMPLATE_ORDER_CANCELLED=order_cancelled
WHATSAPP_TEMPLATE_NEW_ORDER=new_restaurant_order_received
WHATSAPP_TEMPLATE_PAYMENT_SUCCESSFUL=payment_successful
WHATSAPP_TEMPLATE_PAYMENT_FAILED=payment_failed
WHATSAPP_TEMPLATE_REVIEW_REQUEST=review_request
OTP_HASH_SECRET=
OTP_EXPIRE_MINUTES=5
OTP_LENGTH=6
```

`WHATSAPP_ACCESS_TOKEN` should be a permanent System User token in production.
`WHATSAPP_TOKEN` remains accepted as a backwards-compatible alias.
`DEFAULT_PHONE_COUNTRY_CODE` is used only when a user enters a local number
beginning with `0`; Egypt uses `20`.
`WHATSAPP_TEMPLATE_OTP` is the shared fallback template. If Meta uses separate
templates or different approved language codes, set the `_AR`, `_EN`, and
`_LANGUAGE_AR`/`_LANGUAGE_EN` values to the exact names and language codes shown
in WhatsApp Manager. A template name and language form one exact Meta lookup;
an approved English translation does not make the Arabic translation exist.

Review photos use the public Supabase Storage bucket `review-images`. Create it
once beside the existing restaurant and product image buckets before enabling
review images. Files remain limited to JPEG, PNG, WebP, or AVIF and 5 MB each;
the public form accepts at most three images.

The approved `review_request` WhatsApp template receives:
restaurant name, order number, and the secure review URL, in that order.

The approved `new_restaurant_order_received` template receives six body variables in
this exact order: order number, customer name, customer phone, formatted total,
order type, and order time. Its first dynamic URL button receives the secure
public order token as its URL suffix.

The approved `customer_order_received` customer template receives five body variables in
this exact order: customer name, order number, restaurant name, restaurant
phone, and formatted total. Its first dynamic URL button receives the secure
public order token as its URL suffix.

For both dynamic order buttons, enter only the static URL prefix
`https://menuqr-eg.vercel.app/order/` in Meta's **Website URL** field. Meta
renders the `{{1}}` suffix beside the field automatically; do not type
`{{1}}` into the URL field itself. Otherwise the braces are URL-encoded and the
result becomes `/order/%7B%7B1%7D%7D{token}` instead of `/order/{token}`.
`WHATSAPP_APP_SECRET` verifies `X-Hub-Signature-256`; never expose either value
to the browser. `OTP_HASH_SECRET` must be a random value of at least 32
characters and can fall back to `AUTH_SECRET`.

### Meta setup

1. Create a Meta app, add WhatsApp, connect a WhatsApp Business Account and copy
   the Phone Number ID and WABA ID.
2. Create the approved templates listed in `src/lib/whatsapp.ts`. Template body
   variables must use the same order passed by the application. Create the
   authentication template named by `WHATSAPP_TEMPLATE_OTP` with a copy-code or
   one-tap URL button.
3. Configure the callback URL as:
   `https://YOUR_DOMAIN/api/webhooks/whatsapp`.
   The legacy `/api/whatsapp/webhook` route remains available as an alias.
4. Use the exact `WHATSAPP_VERIFY_TOKEN` as the webhook verify token and
   subscribe to `messages` and `message_template_status_update`.
5. Add the environment values to Vercel for Production and Preview, then deploy.
6. Run `npm run db:deploy` to create the OTP and message delivery tables.

### Endpoints

- `POST /api/whatsapp/send-otp` — `{ "phone": "+201...", "language": "ar" }`
- `POST /api/whatsapp/verify-otp` — `{ "phone": "+201...", "code": "123456" }`
- `POST /api/whatsapp/notifications` — authenticated restaurant workspace only
- `GET /api/whatsapp/templates` — list WABA templates for authenticated staff
- `GET|POST /api/whatsapp/webhook` — Meta verification and signed callbacks

For local webhook testing, expose localhost with a temporary HTTPS tunnel and
configure that URL in Meta. Never disable signature verification; use a separate
Meta test app/number and test recipient instead. OTP values, access tokens and
phone numbers are intentionally excluded from structured logs.

## Promotions and coupons

Restaurant owners manage offers from `/dashboard/promotions`. The module
supports percentage and fixed discounts, buy-X-get-Y, free items, free
delivery, automatic campaigns, and coupon-gated campaigns. Promotions can be
scheduled by date, time, and weekday and targeted to the restaurant, order,
branch, category, or product.

Pricing is calculated only by the shared server engine in
`src/lib/promotion-engine.ts`. The public menu uses
`POST /api/promotions/calculate` for previews, while `POST /api/orders`
recalculates eligibility from database prices before creating the order.
Browser-supplied totals and discounts are never trusted. Promotion redemption,
coupon counters, order creation, and immutable promotion snapshots are written
in one serializable transaction; concurrent limit conflicts return HTTP 409
without creating a partial order.

Promotion endpoints:

- `GET|POST /api/promotions` — paginated tenant list and creation
- `GET|PATCH|DELETE /api/promotions/:id` — tenant-scoped management
- `POST /api/promotions/:id/duplicate` — duplicate a campaign
- `POST /api/promotions/calculate` — rate-limited public price calculation
- `GET /api/promotions/analytics` — tenant-scoped performance aggregates

Deploy the normalized promotion tables and order snapshot columns before
enabling the feature:

```bash
npm run db:generate
npm run db:deploy
```

Existing restaurants and orders remain compatible: with no active promotions,
the shared pricing result is unchanged. Automated tests for coupon validation,
discount types, scheduling, limits, priority, and stacking live in
`src/lib/promotion-engine.test.ts`.

## Multi-branch restaurants

Branches are managed from `/dashboard/branches`. Each branch owns its contact
details, address, coordinates, opening hours, active status, WhatsApp routing,
and permanent menu slug. Restaurant identity, products, and other shared data
remain on `Restaurant`; they are not duplicated per branch.

Public URLs:

- `/menu/{restaurantSlug}` — restaurant menu; checkout asks for a branch only
  when more than one active branch exists.
- `/menu/{restaurantSlug}/{branchSlug}` — branch QR URL; the branch is locked
  for the session and no selection dialog is shown.

The selected branch is sent to the server and validated against the restaurant
before pricing or order creation. `Order.branchId` stores it permanently. If
`useRestaurantWhatsapp` is disabled and the branch has a WhatsApp number, new
orders are routed there; otherwise routing safely falls back to the restaurant
WhatsApp number. Existing approved WhatsApp templates remain compatible because
the branch name is appended to the existing order-type variable.

Branch endpoints are authenticated and tenant-scoped:

- `GET|POST /api/branches`
- `GET|PUT|DELETE /api/branches/{id}`

The multi-branch migration backfills a stable `main` branch and seven open
working-hour records for any legacy restaurant that has no branch, preserving
the existing ordering flow. Apply it with:

```bash
npm run db:deploy
```

## Subscription plans and launch offer

Plans and entitlements are stored in `Plan`, `Feature`, and `PlanFeature`.
Application code checks stable feature keys through
`src/lib/subscription-plans.ts`; it does not branch on plan names. The migration
creates Free, Pro, and Business, seeds their feature mappings, and assigns Free
to existing restaurants that do not already have a subscription.

The Pro launch trial is controlled from the single `LaunchPromotion` row. It is
disabled by default. Enable it and set its dates from Prisma Studio or SQL:

```sql
UPDATE "LaunchPromotion"
SET "enabled" = true,
    "startsAt" = '2026-09-01T00:00:00Z',
    "endsAt" = '2026-09-30T23:59:59Z',
    "trialDays" = 30
WHERE "id" = 'launch_pro_2026';
```

New registrations inside that window receive a time-bounded Pro `TRIALING`
subscription linked to the launch record. Outside the window they receive the
permanent Free plan. Apply the schema and seed migration before deployment:

```bash
npm run db:deploy
```
