ALTER TABLE "Restaurant" ADD COLUMN "address" TEXT,
ADD COLUMN "descriptionAr" TEXT,
ADD COLUMN "mapUrl" TEXT,
ADD COLUMN "facebookUrl" TEXT,
ADD COLUMN "instagramUrl" TEXT;

ALTER TABLE "Product" ADD COLUMN "stock" INTEGER;
CREATE INDEX "Product_restaurantId_stock_idx" ON "Product"("restaurantId", "stock");
