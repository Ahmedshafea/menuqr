CREATE TYPE "PlatformConfigValueType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'SECRET');
CREATE TYPE "PlatformConfigVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'SECRET');

CREATE TABLE "PlatformSetting" (
  "id" TEXT NOT NULL,
  "namespace" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "labelAr" TEXT,
  "description" TEXT,
  "value" JSONB NOT NULL,
  "defaultValue" JSONB,
  "valueType" "PlatformConfigValueType" NOT NULL,
  "visibility" "PlatformConfigVisibility" NOT NULL DEFAULT 'PRIVATE',
  "isEditable" BOOLEAN NOT NULL DEFAULT true,
  "validation" JSONB,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeatureFlag" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameAr" TEXT,
  "description" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "rolloutPercentage" INTEGER NOT NULL DEFAULT 100,
  "conditions" JSONB,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HomepageSection" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameAr" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "content" JSONB NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HomepageSection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformSetting_namespace_key_key" ON "PlatformSetting"("namespace", "key");
CREATE INDEX "PlatformSetting_namespace_updatedAt_idx" ON "PlatformSetting"("namespace", "updatedAt");
CREATE INDEX "PlatformSetting_visibility_namespace_idx" ON "PlatformSetting"("visibility", "namespace");
CREATE UNIQUE INDEX "FeatureFlag_key_key" ON "FeatureFlag"("key");
CREATE INDEX "FeatureFlag_enabled_startsAt_endsAt_idx" ON "FeatureFlag"("enabled", "startsAt", "endsAt");
CREATE UNIQUE INDEX "HomepageSection_key_key" ON "HomepageSection"("key");
CREATE INDEX "HomepageSection_enabled_displayOrder_idx" ON "HomepageSection"("enabled", "displayOrder");

ALTER TABLE "PlatformSetting" ADD CONSTRAINT "PlatformSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HomepageSection" ADD CONSTRAINT "HomepageSection_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Safe, editable defaults. Secrets remain in environment variables and are never seeded here.
INSERT INTO "PlatformSetting" ("id", "namespace", "key", "label", "labelAr", "value", "defaultValue", "valueType", "visibility", "updatedAt") VALUES
  ('cfg_platform_name', 'general', 'platformName', 'Platform name', 'اسم المنصة', '"MenuQR"', '"MenuQR"', 'STRING', 'PUBLIC', CURRENT_TIMESTAMP),
  ('cfg_support_email', 'general', 'supportEmail', 'Support email', 'بريد الدعم', '"support@menuqr.app"', '"support@menuqr.app"', 'STRING', 'PUBLIC', CURRENT_TIMESTAMP),
  ('cfg_default_language', 'general', 'defaultLanguage', 'Default language', 'اللغة الافتراضية', '"ar"', '"ar"', 'STRING', 'PUBLIC', CURRENT_TIMESTAMP),
  ('cfg_timezone', 'general', 'timezone', 'Timezone', 'المنطقة الزمنية', '"Africa/Cairo"', '"Africa/Cairo"', 'STRING', 'PUBLIC', CURRENT_TIMESTAMP),
  ('cfg_registration_enabled', 'registration', 'enabled', 'Registration enabled', 'تفعيل التسجيل', 'true', 'true', 'BOOLEAN', 'PUBLIC', CURRENT_TIMESTAMP),
  ('cfg_maintenance_enabled', 'maintenance', 'enabled', 'Maintenance mode', 'وضع الصيانة', 'false', 'false', 'BOOLEAN', 'PUBLIC', CURRENT_TIMESTAMP),
  ('cfg_maintenance_message_ar', 'maintenance', 'messageAr', 'Arabic maintenance message', 'رسالة الصيانة بالعربية', '"المنصة تحت الصيانة مؤقتاً."', '"المنصة تحت الصيانة مؤقتاً."', 'STRING', 'PUBLIC', CURRENT_TIMESTAMP),
  ('cfg_maintenance_message_en', 'maintenance', 'messageEn', 'English maintenance message', 'رسالة الصيانة بالإنجليزية', '"The platform is temporarily under maintenance."', '"The platform is temporarily under maintenance."', 'STRING', 'PUBLIC', CURRENT_TIMESTAMP);

INSERT INTO "FeatureFlag" ("id", "key", "name", "nameAr", "description", "enabled", "rolloutPercentage", "updatedAt") VALUES
  ('flag_reviews', 'REVIEWS', 'Reviews', 'التقييمات', 'Global kill switch for restaurant reviews', true, 100, CURRENT_TIMESTAMP),
  ('flag_promotions', 'PROMOTIONS', 'Promotions', 'العروض والخصومات', 'Global kill switch for promotions', true, 100, CURRENT_TIMESTAMP),
  ('flag_branches', 'BRANCHES', 'Branches', 'الفروع', 'Global kill switch for multi-branch support', true, 100, CURRENT_TIMESTAMP),
  ('flag_pdf_import', 'PDF_IMPORT', 'AI PDF import', 'استيراد PDF', 'Global kill switch for PDF menu import', true, 100, CURRENT_TIMESTAMP),
  ('flag_whatsapp', 'WHATSAPP', 'WhatsApp', 'واتساب', 'Global kill switch for WhatsApp automation', true, 100, CURRENT_TIMESTAMP),
  ('flag_custom_domains', 'CUSTOM_DOMAINS', 'Custom domains', 'النطاقات المخصصة', 'Global kill switch for custom domains', true, 100, CURRENT_TIMESTAMP);

INSERT INTO "HomepageSection" ("id", "key", "name", "nameAr", "enabled", "displayOrder", "content", "updatedAt") VALUES
  ('home_hero', 'hero', 'Hero', 'الواجهة الرئيسية', true, 10, '{"ar":{"eyebrow":"منيو QR احترافي","title":"حوّل قائمة مطعمك إلى تجربة رقمية","description":"أنشئ قائمتك واستقبل الطلبات بسهولة."},"en":{"eyebrow":"Professional QR Menu","title":"Turn your menu into a digital experience","description":"Build your menu and receive orders with ease."}}', CURRENT_TIMESTAMP),
  ('home_announcement', 'announcement', 'Top announcement', 'الإعلان العلوي', true, 0, '{"ar":{"text":"ابدأ مجانًا لفترة الإطلاق"},"en":{"text":"Start free during launch"}}', CURRENT_TIMESTAMP);
