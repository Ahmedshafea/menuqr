-- Additional indexes for tenant filtering and high-frequency Supabase queries.
CREATE INDEX IF NOT EXISTS "Branch_restaurantId_isActive_idx" ON "Branch"("restaurantId", "isActive");
CREATE INDEX IF NOT EXISTS "Product_restaurantId_isAvailable_sortOrder_idx" ON "Product"("restaurantId", "isAvailable", "sortOrder");
CREATE INDEX IF NOT EXISTS "Product_categoryId_sortOrder_idx" ON "Product"("categoryId", "sortOrder");
CREATE INDEX IF NOT EXISTS "ProductImage_productId_sortOrder_idx" ON "ProductImage"("productId", "sortOrder");
CREATE INDEX IF NOT EXISTS "Extra_productId_isAvailable_idx" ON "Extra"("productId", "isAvailable");
CREATE INDEX IF NOT EXISTS "Order_restaurantId_status_createdAt_idx" ON "Order"("restaurantId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX IF NOT EXISTS "Subscription_restaurantId_status_idx" ON "Subscription"("restaurantId", "status");

-- Auth.js remains the authentication system. Server-side Prisma connects as the
-- database owner and is not restricted by these policies. For SQL clients that
-- do not bypass RLS, set `app.current_restaurant_id` for the transaction.
CREATE OR REPLACE FUNCTION public.current_restaurant_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$ SELECT NULLIF(current_setting('app.current_restaurant_id', true), '') $$;

ALTER TABLE "Restaurant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Branch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkingHour" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductImage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Extra" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItemExtra" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnalyticsEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

-- Public menu reads. Only active restaurants and available menu entries are exposed.
CREATE POLICY "public_active_restaurants" ON "Restaurant" FOR SELECT USING ("isActive" = true);
CREATE POLICY "public_active_categories" ON "Category" FOR SELECT USING ("isActive" = true AND EXISTS (SELECT 1 FROM "Restaurant" r WHERE r.id = "restaurantId" AND r."isActive" = true));
CREATE POLICY "public_available_products" ON "Product" FOR SELECT USING ("isAvailable" = true AND EXISTS (SELECT 1 FROM "Restaurant" r WHERE r.id = "restaurantId" AND r."isActive" = true));
CREATE POLICY "public_product_images" ON "ProductImage" FOR SELECT USING (EXISTS (SELECT 1 FROM "Product" p JOIN "Restaurant" r ON r.id = p."restaurantId" WHERE p.id = "productId" AND p."isAvailable" = true AND r."isActive" = true));
CREATE POLICY "public_available_extras" ON "Extra" FOR SELECT USING ("isAvailable" = true AND EXISTS (SELECT 1 FROM "Product" p JOIN "Restaurant" r ON r.id = p."restaurantId" WHERE p.id = "productId" AND p."isAvailable" = true AND r."isActive" = true));

-- Example tenant policies for direct SQL/PostgREST access. MenuQR itself uses
-- Auth.js + Prisma authorization and the service role for Storage operations.
CREATE POLICY "tenant_restaurant" ON "Restaurant" FOR ALL USING (id = public.current_restaurant_id()) WITH CHECK (id = public.current_restaurant_id());
CREATE POLICY "tenant_users" ON "User" FOR ALL USING ("restaurantId" = public.current_restaurant_id()) WITH CHECK ("restaurantId" = public.current_restaurant_id());
CREATE POLICY "tenant_branches" ON "Branch" FOR ALL USING ("restaurantId" = public.current_restaurant_id()) WITH CHECK ("restaurantId" = public.current_restaurant_id());
CREATE POLICY "tenant_categories" ON "Category" FOR ALL USING ("restaurantId" = public.current_restaurant_id()) WITH CHECK ("restaurantId" = public.current_restaurant_id());
CREATE POLICY "tenant_products" ON "Product" FOR ALL USING ("restaurantId" = public.current_restaurant_id()) WITH CHECK ("restaurantId" = public.current_restaurant_id());
CREATE POLICY "tenant_orders" ON "Order" FOR ALL USING ("restaurantId" = public.current_restaurant_id()) WITH CHECK ("restaurantId" = public.current_restaurant_id());
CREATE POLICY "tenant_subscriptions" ON "Subscription" FOR SELECT USING ("restaurantId" = public.current_restaurant_id());
CREATE POLICY "tenant_settings" ON "Setting" FOR ALL USING ("restaurantId" = public.current_restaurant_id()) WITH CHECK ("restaurantId" = public.current_restaurant_id());
CREATE POLICY "tenant_analytics" ON "AnalyticsEvent" FOR ALL USING ("restaurantId" = public.current_restaurant_id()) WITH CHECK ("restaurantId" = public.current_restaurant_id());
CREATE POLICY "tenant_audit_logs" ON "AuditLog" FOR SELECT USING ("restaurantId" = public.current_restaurant_id());

CREATE POLICY "tenant_working_hours" ON "WorkingHour" FOR ALL USING (EXISTS (SELECT 1 FROM "Branch" b WHERE b.id = "branchId" AND b."restaurantId" = public.current_restaurant_id())) WITH CHECK (EXISTS (SELECT 1 FROM "Branch" b WHERE b.id = "branchId" AND b."restaurantId" = public.current_restaurant_id()));
CREATE POLICY "tenant_product_images" ON "ProductImage" FOR ALL USING (EXISTS (SELECT 1 FROM "Product" p WHERE p.id = "productId" AND p."restaurantId" = public.current_restaurant_id())) WITH CHECK (EXISTS (SELECT 1 FROM "Product" p WHERE p.id = "productId" AND p."restaurantId" = public.current_restaurant_id()));
CREATE POLICY "tenant_extras" ON "Extra" FOR ALL USING (EXISTS (SELECT 1 FROM "Product" p WHERE p.id = "productId" AND p."restaurantId" = public.current_restaurant_id())) WITH CHECK (EXISTS (SELECT 1 FROM "Product" p WHERE p.id = "productId" AND p."restaurantId" = public.current_restaurant_id()));
CREATE POLICY "tenant_order_items" ON "OrderItem" FOR ALL USING (EXISTS (SELECT 1 FROM "Order" o WHERE o.id = "orderId" AND o."restaurantId" = public.current_restaurant_id())) WITH CHECK (EXISTS (SELECT 1 FROM "Order" o WHERE o.id = "orderId" AND o."restaurantId" = public.current_restaurant_id()));
CREATE POLICY "tenant_order_item_extras" ON "OrderItemExtra" FOR ALL USING (EXISTS (SELECT 1 FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId" WHERE i.id = "orderItemId" AND o."restaurantId" = public.current_restaurant_id())) WITH CHECK (EXISTS (SELECT 1 FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId" WHERE i.id = "orderItemId" AND o."restaurantId" = public.current_restaurant_id()));
CREATE POLICY "tenant_payments" ON "Payment" FOR SELECT USING (EXISTS (SELECT 1 FROM "Subscription" s WHERE s.id = "subscriptionId" AND s."restaurantId" = public.current_restaurant_id()));
