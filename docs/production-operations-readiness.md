# Production operations readiness

## Monitoring contract

The application emits structured security and integration events, but no centralized monitoring provider is configured in this repository. Before launch, platform logs must be connected to alerting without logging secrets or customer payloads.

Required alert categories:

| Area | Signals | Minimum alert |
|---|---|---|
| Application errors | Unhandled server/API errors, elevated 5xx rate | Sustained error-rate or critical route failure |
| Authentication | Repeated login/Turnstile failures, disabled-user attempts | Threshold by source/account with privacy-safe identifiers |
| Webhooks | Signature rejection, processing failure, replay/duplicate rate | Any sustained processing failure |
| Cron/retention | Unauthorized invocation, non-2xx run, missing scheduled run | One failed run or missed schedule |
| Payments | Checkout failure, rejected/stale webhook, billing persistence failure | Immediate high-severity billing alert |
| WhatsApp | Configuration, timeout, rate limit, provider rejection | Sustained send failures; never include recipient or token |
| Database | Connection saturation, lock waits, slow queries, migration failure | Capacity threshold and any failed migration |
| Backup | Failed backup, expired retention, failed restore test | Immediate operational alert |

Alert ownership, notification destination, retention, access control, and escalation timing are manual production gates.

## Cron contract

- Endpoint: `POST /api/internal/maintenance/retention`
- Authentication: constant-time comparison of `Authorization: Bearer <CRON_SECRET>`
- No query-string secret is allowed.
- Cleanup batch size is bounded by code and work is repeatable.
- Configure the exact schedule according to retention objectives; the repository does not activate a scheduler.
- Alert on unauthorized calls, failures, excessive duration, and missed runs.

## CORS, CSRF, and headers

- No application route currently requires permissive cross-origin credentialed access; do not add wildcard CORS.
- Same-origin authenticated mutations rely on Next.js server-action/session protections and server-side authorization.
- Provider webhooks use signatures/tokens rather than browser-origin trust.
- Existing headers provide HSTS in production, frame denial, nosniff, referrer policy, and permissions policy.
- CSP remains a manual hardening item. A production CSP must be derived from observed script/style/image/font/connect sources in report-only mode before enforcement. Do not guess an enforcing policy.

## Release candidate commands

After human review, an operator may prepare a release candidate with commands equivalent to:

```text
git status --short
git diff --check
git diff --stat
npm ci
npm test
npm run lint
npm run build
git add <explicit reviewed files>
git commit -m "Prepare MenuQR production release candidate"
git tag -a <approved-release-tag> -m "MenuQR production release candidate"
```

The commit, tag, push, migration, and deployment commands are intentionally not executed by this remediation phase.

## Production deployment gates

- [ ] Code reviewed
- [ ] Working tree contains only intended changes
- [ ] Release commit created
- [ ] Release candidate tagged
- [ ] Production environment values verified
- [ ] Production project identity verified
- [ ] Production schema status checked
- [ ] Production backup created and verified
- [ ] Restore procedure tested
- [ ] Migration lock plan approved
- [ ] Single migration worker assigned
- [ ] Maintenance window approved if needed
- [ ] Monitoring enabled
- [ ] Error alerting enabled
- [ ] Webhook alerting enabled
- [ ] Cron alerting enabled
- [ ] Payment alerting enabled
- [ ] WhatsApp alerting enabled
- [ ] Rollback plan approved
- [ ] Application release paired with migration version

Unchecked production-only gates mean deployment remains blocked; staging success must not be used to mark them complete.
