# Production rollback runbook

## Principles

- Prisma migrations do not provide automatic down migrations.
- Take and verify a backup before executing production migrations.
- Pair every application release with the exact migration head it expects.
- Prefer a compatible application rollback for additive changes and a reviewed forward fix for migrated data.
- Never improvise destructive SQL during an incident.

## Application rollback

1. Stop further deployments and migration workers.
2. Record the active application commit and database migration head.
3. Determine whether the previous application is compatible with the current schema.
4. If compatible, redeploy the previously approved immutable artifact.
5. Run read-only health, authentication, tenant-isolation, and order checks.
6. Continue monitoring database and integration errors.

## Migration categories

- **Additive nullable columns/tables:** normally leave in place while rolling back the application.
- **Indexes and foreign keys:** removal requires reviewed SQL and may lock tables; prefer leaving compatible objects in place.
- **Unique constraints:** do not drop casually. A rollback may reintroduce duplicate-write risk.
- **`NOT NULL` transitions:** an older application that writes nulls is incompatible. Use a forward fix or restore.
- **Backfills/data transformations:** reversal may be ambiguous or lossy. Use a forward fix unless the backup must be restored.
- **Column/type drops:** irreversible without a backup containing the removed data.
- **RLS/policy changes:** rollback must preserve tenant isolation; security policies must never be disabled as an emergency shortcut.
- **Storage configuration:** coordinate database and stored-object state; a database restore alone may not restore external objects.

## Restore-required conditions

- Irreversible data transformation produced incorrect results.
- Required data was dropped or overwritten.
- Constraint/policy changes cannot be safely forward-fixed within the recovery objective.
- The new schema is incompatible with both current and previous application versions.

## Restore procedure gate

The operator must follow the provider-approved restore procedure, restore into an isolated target first when possible, validate schema and row invariants, then obtain incident-owner approval before redirecting production. Credentials and connection strings must not be copied into the incident record.

## Release record

Record: application commit/tag, migration head, backup identifier and timestamp, operator, start/end time, validation results, and rollback decision. Do not record secrets.
