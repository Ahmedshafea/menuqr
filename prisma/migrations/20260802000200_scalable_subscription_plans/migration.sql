CREATE TYPE "FeatureValueType" AS ENUM ('BOOLEAN', 'NUMBER');

ALTER TABLE "Plan"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "nameAr" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "descriptionAr" TEXT,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'EGP',
  ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isRecommended" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Plan" SET "code" = 'LEGACY_' || "id";
WITH candidates AS (
  SELECT "id",
    CASE
      WHEN LOWER("name") IN ('free', 'مجاني') THEN 'FREE'
      WHEN LOWER("name") IN ('basic', 'pro', 'أساسي', 'احترافي') THEN 'PRO'
      WHEN LOWER("name") IN ('premium', 'business', 'أعمال') THEN 'BUSINESS'
    END AS desired_code,
    ROW_NUMBER() OVER (
      PARTITION BY CASE
        WHEN LOWER("name") IN ('free', 'مجاني') THEN 'FREE'
        WHEN LOWER("name") IN ('basic', 'pro', 'أساسي', 'احترافي') THEN 'PRO'
        WHEN LOWER("name") IN ('premium', 'business', 'أعمال') THEN 'BUSINESS'
      END
      ORDER BY "createdAt"
    ) AS position
  FROM "Plan"
)
UPDATE "Plan" p SET "code" = c.desired_code
FROM candidates c
WHERE p."id" = c."id" AND c.desired_code IS NOT NULL AND c.position = 1;

ALTER TABLE "Plan" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

CREATE TABLE "Feature" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameAr" TEXT,
  "description" TEXT,
  "descriptionAr" TEXT,
  "valueType" "FeatureValueType" NOT NULL DEFAULT 'BOOLEAN',
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Feature_key_key" ON "Feature"("key");

CREATE TABLE "PlanFeature" (
  "planId" TEXT NOT NULL,
  "featureId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "value" INTEGER,
  CONSTRAINT "PlanFeature_pkey" PRIMARY KEY ("planId", "featureId")
);
CREATE INDEX "PlanFeature_featureId_idx" ON "PlanFeature"("featureId");

CREATE TABLE "LaunchPromotion" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "trialDays" INTEGER NOT NULL DEFAULT 30,
  "affectedPlanId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LaunchPromotion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LaunchPromotion_enabled_startsAt_endsAt_idx" ON "LaunchPromotion"("enabled", "startsAt", "endsAt");

ALTER TABLE "Subscription"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "trialEndsAt" TIMESTAMP(3),
  ADD COLUMN "launchPromotionId" TEXT;
CREATE INDEX "Subscription_launchPromotionId_idx" ON "Subscription"("launchPromotionId");

ALTER TABLE "PlanFeature" ADD CONSTRAINT "PlanFeature_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanFeature" ADD CONSTRAINT "PlanFeature_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LaunchPromotion" ADD CONSTRAINT "LaunchPromotion_affectedPlanId_fkey" FOREIGN KEY ("affectedPlanId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_launchPromotionId_fkey" FOREIGN KEY ("launchPromotionId") REFERENCES "LaunchPromotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Plan" ("id", "code", "name", "nameAr", "description", "descriptionAr", "price", "currency", "interval", "displayOrder", "isActive", "isRecommended", "maxProducts", "maxBranches", "maxStaff", "analyticsEnabled", "customDomain", "createdAt", "updatedAt") VALUES
('plan_free', 'FREE', 'Free', 'مجاني', 'Explore MenuQR with the essential tools.', 'جرّب MenuQR بالأدوات الأساسية.', 0, 'EGP', 'MONTHLY', 1, true, false, 25, 1, 2, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('plan_pro', 'PRO', 'Pro', 'احترافي', 'Everything most restaurants need to grow.', 'كل ما يحتاجه معظم المطاعم للنمو.', 499, 'EGP', 'MONTHLY', 2, true, true, 200, 3, 10, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('plan_business', 'BUSINESS', 'Business', 'الأعمال', 'Advanced capabilities for growing restaurant brands.', 'إمكانات متقدمة للعلامات والمطاعم المتنامية.', 999, 'EGP', 'MONTHLY', 3, true, false, -1, 10, -1, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "nameAr" = EXCLUDED."nameAr", "description" = EXCLUDED."description", "descriptionAr" = EXCLUDED."descriptionAr",
  "displayOrder" = EXCLUDED."displayOrder", "isActive" = EXCLUDED."isActive", "isRecommended" = EXCLUDED."isRecommended";

INSERT INTO "Feature" ("id", "key", "name", "nameAr", "valueType", "displayOrder") VALUES
('feature_products', 'PRODUCT_LIMIT', 'Products', 'المنتجات', 'NUMBER', 1),
('feature_branches', 'BRANCH_LIMIT', 'Branches', 'الفروع', 'NUMBER', 2),
('feature_staff', 'TEAM_MEMBER_LIMIT', 'Team members', 'أعضاء الفريق', 'NUMBER', 3),
('feature_qr', 'QR_MENU', 'QR digital menu', 'قائمة QR رقمية', 'BOOLEAN', 4),
('feature_whatsapp', 'WHATSAPP_ORDERS', 'WhatsApp ordering', 'طلبات واتساب', 'BOOLEAN', 5),
('feature_analytics_basic', 'ANALYTICS_BASIC', 'Basic analytics', 'تحليلات أساسية', 'BOOLEAN', 6),
('feature_analytics_advanced', 'ANALYTICS_ADVANCED', 'Advanced analytics', 'تحليلات متقدمة', 'BOOLEAN', 7),
('feature_promotions', 'PROMOTIONS', 'Promotions and coupons', 'العروض والكوبونات', 'BOOLEAN', 8),
('feature_pdf', 'PDF_IMPORT', 'AI PDF menu import', 'استيراد المنيو من PDF', 'BOOLEAN', 9),
('feature_reviews', 'REVIEWS', 'Customer reviews', 'تقييمات العملاء', 'BOOLEAN', 10),
('feature_custom_domain', 'CUSTOM_DOMAIN', 'Custom domain', 'نطاق مخصص', 'BOOLEAN', 11)
ON CONFLICT ("key") DO UPDATE SET "name" = EXCLUDED."name", "nameAr" = EXCLUDED."nameAr", "displayOrder" = EXCLUDED."displayOrder";

INSERT INTO "PlanFeature" ("planId", "featureId", "enabled", "value")
SELECT p."id", f."id", true,
  CASE f."key"
    WHEN 'PRODUCT_LIMIT' THEN CASE p."code" WHEN 'FREE' THEN 25 WHEN 'PRO' THEN 200 ELSE -1 END
    WHEN 'BRANCH_LIMIT' THEN CASE p."code" WHEN 'FREE' THEN 1 WHEN 'PRO' THEN 3 ELSE 10 END
    WHEN 'TEAM_MEMBER_LIMIT' THEN CASE p."code" WHEN 'FREE' THEN 2 WHEN 'PRO' THEN 10 ELSE -1 END
    ELSE NULL
  END
FROM "Plan" p CROSS JOIN "Feature" f
WHERE p."code" IN ('FREE', 'PRO', 'BUSINESS')
AND (p."code" <> 'FREE' OR f."key" IN ('PRODUCT_LIMIT','BRANCH_LIMIT','TEAM_MEMBER_LIMIT','QR_MENU','WHATSAPP_ORDERS','ANALYTICS_BASIC'))
AND (p."code" <> 'PRO' OR f."key" <> 'CUSTOM_DOMAIN')
ON CONFLICT ("planId", "featureId") DO UPDATE SET "enabled" = EXCLUDED."enabled", "value" = EXCLUDED."value";

INSERT INTO "LaunchPromotion" ("id", "name", "enabled", "startsAt", "endsAt", "trialDays", "affectedPlanId", "createdAt", "updatedAt")
SELECT 'launch_pro_2026', 'MenuQR Launch Offer', false, '2026-09-01T00:00:00Z', '2026-09-30T23:59:59Z', 30, "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Plan" WHERE "code" = 'PRO'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Subscription" ("id", "status", "startsAt", "restaurantId", "planId", "createdAt", "updatedAt")
SELECT 'subscription_free_' || r."id", 'ACTIVE', CURRENT_TIMESTAMP, r."id", p."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Restaurant" r
CROSS JOIN "Plan" p
WHERE p."code" = 'FREE'
AND NOT EXISTS (SELECT 1 FROM "Subscription" s WHERE s."restaurantId" = r."id");
