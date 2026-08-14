# Production backup and restore readiness

No production backup was created or verified during repository remediation.

Before migration, the responsible operator must complete this checklist:

- [ ] Production project identity independently confirmed
- [ ] Responsible backup/restore operator named
- [ ] Backup created before the maintenance window
- [ ] Backup timestamp and provider identifier recorded without credentials
- [ ] Backup includes the required database schemas
- [ ] Storage/object backup implications documented separately
- [ ] Encryption and access controls verified
- [ ] Retention policy and expiry date recorded
- [ ] Restore location and capacity confirmed
- [ ] Restore procedure tested in an isolated environment
- [ ] Restored migration head verified
- [ ] Critical table counts and tenant relationships validated after restore
- [ ] Authentication, RLS, order, billing, and configuration invariants validated
- [ ] Recovery-time and recovery-point objectives accepted
- [ ] Incident escalation owner and rollback authority recorded

Production migration remains blocked until the backup and restore gates are explicitly approved.
