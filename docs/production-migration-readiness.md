# Production migration readiness

The repository contains 29 ordered Prisma migrations. Phase 4.2 staging applied all 29 with no pending or failed migration and no schema drift. This is staging evidence, not production verification.

## Migration inventory

| Migration | Classification | Production concern |
|---|---|---|
| `20260721000100_init` | Initial schema, indexes, foreign keys | Large initial transaction on a non-empty target; use only on the intended baseline |
| `20260721000200_supabase_rls_indexes` | RLS, policies, indexes, functions | Policy correctness and index locks |
| `20260721000300_profile_stock` | Additive columns/index | Index build on products |
| `20260721000400_ordering_hours` | Additive columns | Brief table locks |
| `20260721000500_order_tracking` | Additive schema, indexes, foreign keys | Order/User scans and constraint validation |
| `20260721000600_backfill_order_links` | Backfill, `SET NOT NULL` | Full Order scan; row writes; exclusive constraint lock |
| `20260722000100_unified_user_roles` | Role migration, backfill, RLS, constraints, drops | Data-dependent and difficult to reverse |
| `20260724000100_order_workflow` | Additive workflow schema, seed/backfill, RLS | Order-related locks and policy transition |
| `20260724000200_mvp_notifications_availability` | Additive schema, RLS, constraints | Index/constraint locks |
| `20260724000300_options_delivery_reviews` | Additive schema, RLS, constraints | Multiple table and policy operations |
| `20260725000100_order_pricing_adjustments` | Additive columns | Brief Order/OrderItem locks |
| `20260727000100_delivery_coordinates` | Additive columns | Brief table lock |
| `20260727000200_checkout_address_details` | Additive columns | Brief Order lock |
| `20260727000300_pdf_import_bucket` | Supabase storage seed/configuration | Requires Supabase storage schema and privileges |
| `20260727000400_whatsapp_cloud_api` | Additive columns/index | Index build |
| `20260729000100_complete_restaurant_reviews` | Schema, indexes, constraints, RLS | Multi-table locks and policy changes |
| `20260730000100_promotions` | Schema, indexes, constraints, data relationships | Lock-sensitive on promotion/order relations |
| `20260730000200_remove_default_discount` | Drop operation | Irreversible schema removal; application pairing required |
| `20260730000300_multi_branch_support` | Schema, seed/backfill, indexes, constraints | Data-dependent, multi-table, production rehearsal required |
| `20260802000100_structured_restaurant_branch_addresses` | Additive columns/backfill | Restaurant/Branch scans and writes |
| `20260802000200_scalable_subscription_plans` | Schema, seed/backfill, indexes, foreign keys | Subscription rewrite/seed behavior; application pairing required |
| `20260803000100_custom_restaurant_domains` | Schema, index, foreign key, backfill | Unique-domain validation and index lock |
| `20260803000200_dynamic_configuration_engine` | Schema, seed data, indexes, foreign keys | Configuration seed semantics |
| `20260803000300_super_admin_account_management` | Additive column/index | User index build |
| `20260808000100_phase1_security_billing` | Billing columns, unique indexes, operational tables | Uniqueness validation on provider identifiers |
| `20260808000200_billing_checkout_intent` | Schema, indexes, foreign keys | Billing constraint locks |
| `20260808000300_order_inventory_lifecycle` | Additive nullable column | Low risk, brief Order lock |
| `20260811000100_order_idempotency` | Additive column, unique index | Order scan and unique-index lock |
| `20260812000100_phase31_security` | Additive security columns/table/indexes | User lock and operational index builds |

## Highest-risk operations

| Migration | Affected data | Scan/lock risk | Data dependency | Strategy |
|---|---|---|---|---|
| `20260721000600_backfill_order_links` | `Order` | UPDATE scan plus `SET NOT NULL` lock | Every row must receive a valid token | Backup, measure row count, confirm no nulls, maintenance window if large |
| `20260722000100_unified_user_roles` | Users, roles, tenant membership | Multi-table writes, constraints, RLS, drops | Legacy role data must map cleanly | Production-sized rehearsal; single worker; forward-fix plan |
| `20260730000300_multi_branch_support` | Restaurant, Branch, related tenant tables | Backfills, indexes, FKs | Every existing restaurant needs coherent branch mapping | Rehearse with representative volume; validate orphan counts before constraints |
| `20260802000200_scalable_subscription_plans` | Plans, features, subscriptions | Schema locks, seeds, subscription inserts | Existing restaurants/subscriptions must not gain conflicting active rows | Backup; preflight counts; single worker; application version paired |
| `20260811000100_order_idempotency` | `Order` | Unique index scans table | Existing non-null pairs must be unique | Preflight duplicates; schedule for low traffic if large |
| `20260730000200_remove_default_discount` | Restaurant schema | Destructive column drop | Old application must no longer depend on column | Deploy only with compatible application; restore/forward-fix for rollback |

## Execution gate

1. Verify a recent restorable backup.
2. Verify production project identity and current migration status read-only.
3. Record table sizes and preflight data invariants.
4. Assign exactly one migration worker using `DIRECT_URL`.
5. Stop application rollout if migrations fail; do not run `db push`.
6. Monitor locks, connections, query duration, and error rate.
7. Verify migration status and critical row invariants before application deployment.

Historical migrations must not be edited. Any production issue should use a reviewed forward-fix migration or database restore plan.
