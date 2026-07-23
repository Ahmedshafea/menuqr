-- One authenticated identity can hold several platform capabilities.
ALTER TYPE "Role" RENAME VALUE 'OWNER' TO 'RESTAURANT_OWNER';

CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RestaurantMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RestaurantMember_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "User" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'ar';

INSERT INTO "UserRole" ("id", "userId", "role", "createdAt")
SELECT 'role_' || "id", "id",
  "role",
  CURRENT_TIMESTAMP
FROM "User"
ON CONFLICT DO NOTHING;

INSERT INTO "RestaurantMember" ("id", "userId", "restaurantId", "role", "createdAt")
SELECT 'owner_' || "id", "ownerId", "id", 'RESTAURANT_OWNER'::"Role", CURRENT_TIMESTAMP
FROM "Restaurant"
ON CONFLICT DO NOTHING;

INSERT INTO "RestaurantMember" ("id", "userId", "restaurantId", "role", "createdAt")
SELECT 'member_' || "id", "id", "restaurantId", "role", CURRENT_TIMESTAMP
FROM "User"
WHERE "restaurantId" IS NOT NULL AND "role" = 'STAFF'
ON CONFLICT DO NOTHING;

ALTER TABLE "Order" RENAME COLUMN "customerId" TO "customerUserId";
ALTER INDEX IF EXISTS "Order_customerId_createdAt_idx" RENAME TO "Order_customerUserId_createdAt_idx";

CREATE TABLE "CustomerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "avatar" TEXT,
    "birthDate" TIMESTAMP(3),
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerAddress" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerFavoriteRestaurant" (
    "customerId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerFavoriteRestaurant_pkey" PRIMARY KEY ("customerId","restaurantId")
);

CREATE TABLE "CustomerFavoriteProduct" (
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerFavoriteProduct_pkey" PRIMARY KEY ("customerId","productId")
);

INSERT INTO "CustomerProfile" ("id", "userId", "createdAt", "updatedAt")
SELECT 'customer_' || u."id", u."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u
WHERE u."role" = 'CUSTOMER' OR EXISTS (
  SELECT 1 FROM "Order" o WHERE o."customerUserId" = u."id"
)
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX "UserRole_userId_role_key" ON "UserRole"("userId", "role");
CREATE INDEX "UserRole_role_idx" ON "UserRole"("role");
CREATE UNIQUE INDEX "RestaurantMember_userId_restaurantId_key" ON "RestaurantMember"("userId", "restaurantId");
CREATE INDEX "RestaurantMember_restaurantId_role_idx" ON "RestaurantMember"("restaurantId", "role");
CREATE UNIQUE INDEX "CustomerProfile_userId_key" ON "CustomerProfile"("userId");
CREATE INDEX "CustomerAddress_customerId_isDefault_idx" ON "CustomerAddress"("customerId", "isDefault");
CREATE INDEX "CustomerFavoriteRestaurant_restaurantId_idx" ON "CustomerFavoriteRestaurant"("restaurantId");
CREATE INDEX "CustomerFavoriteProduct_productId_idx" ON "CustomerFavoriteProduct"("productId");

ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestaurantMember" ADD CONSTRAINT "RestaurantMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestaurantMember" ADD CONSTRAINT "RestaurantMember_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerProfile" ADD CONSTRAINT "CustomerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerFavoriteRestaurant" ADD CONSTRAINT "CustomerFavoriteRestaurant_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerFavoriteRestaurant" ADD CONSTRAINT "CustomerFavoriteRestaurant_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerFavoriteProduct" ADD CONSTRAINT "CustomerFavoriteProduct_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerFavoriteProduct" ADD CONSTRAINT "CustomerFavoriteProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Restaurant" DROP CONSTRAINT IF EXISTS "Restaurant_ownerId_fkey";
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_restaurantId_fkey";
DROP POLICY IF EXISTS "tenant_users" ON "User";
ALTER TABLE "User" DROP COLUMN "role", DROP COLUMN "restaurantId";
ALTER TABLE "Restaurant" DROP COLUMN "ownerId";

ALTER TABLE "UserRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RestaurantMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerAddress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerFavoriteRestaurant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerFavoriteProduct" ENABLE ROW LEVEL SECURITY;

-- Direct SQL/PostgREST tenant access is limited to members of the selected
-- restaurant. Customer-owned tables intentionally have no public policy;
-- MenuQR accesses them only through authenticated server-side Prisma queries.
CREATE POLICY "tenant_users" ON "User" FOR SELECT USING (
  EXISTS (SELECT 1 FROM "RestaurantMember" m WHERE m."userId" = "User"."id" AND m."restaurantId" = public.current_restaurant_id())
);
CREATE POLICY "tenant_restaurant_members" ON "RestaurantMember" FOR ALL USING (
  "restaurantId" = public.current_restaurant_id()
) WITH CHECK ("restaurantId" = public.current_restaurant_id());
