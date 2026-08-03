# MenuQR Dynamic Configuration Engine

The engine lets a `SUPER_ADMIN` change platform behavior without editing source code or redeploying the application.

## First-time access

No account is promoted automatically. Grant the role explicitly to an existing user:

```bash
npm run admin:grant -- owner@example.com
```

The command is idempotent and writes an `AuditLog` record. The user must sign out and sign in again so Auth.js refreshes JWT roles, then open `/super-admin`.

## Configuration model

- `PlatformSetting`: namespaced typed values such as `general.timezone` and `registration.enabled`.
- `FeatureFlag`: global kill switches, optional schedules, deterministic rollout percentages, and future targeting conditions.
- `HomepageSection`: ordered bilingual JSON content for the homepage CMS.
- Existing `Plan`, `Feature`, and `PlanFeature` tables remain the single source of truth for subscription prices, limits, and entitlements.
- Every administrative mutation creates an `AuditLog` containing the previous and new values where applicable.

## Cache behavior

- Platform settings and homepage CMS: 60 seconds.
- Feature flags: 30 seconds.
- Super Admin mutations invalidate the appropriate cache tag immediately, so changes normally appear on the next request.
- Public values are separated from private values. `SECRET` settings are never returned by the configuration reader.

## Adding configuration without code changes

Open `/super-admin/configuration`, choose “Add setting”, and supply:

1. Namespace, e.g. `orders`.
2. Stable key, e.g. `expirationMinutes`.
3. Type (`STRING`, `NUMBER`, `BOOLEAN`, or `JSON`).
4. Visibility (`PUBLIC` or `PRIVATE`).
5. Value and labels.

Existing runtime modules can consume it with:

```ts
const minutes = await getConfigValue("orders", "expirationMinutes", 30, {
  includePrivate: true,
});
```

Translation overrides use the `messages.ar` or `messages.en` namespace. Add a JSON setting whose key is a top-level message namespace; it is deeply merged over file-based messages, which remain a safe fallback.

## Security rules

- `/super-admin` uses server-side Auth.js role validation and returns HTTP 403 for unauthorized users.
- Destructive actions require confirmation.
- Inputs are validated with Zod.
- API tokens, database credentials, encryption keys, and provider secrets must remain in Vercel environment variables. They are intentionally excluded from this engine and UI.
- Plan deletion is blocked when subscriptions reference the plan; disable it instead.

## Deployment

Apply the migration before deploying application code:

```bash
npm run db:deploy
npm run build
```

The migration is safe to run once and seeds the initial platform settings, flags, and homepage sections.
