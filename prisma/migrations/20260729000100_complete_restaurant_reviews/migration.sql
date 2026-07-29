ALTER TABLE "Setting"
  ADD COLUMN IF NOT EXISTS "reviewsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "reviewImagesEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "anonymousReviewsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "requireCompletedOrderForReview" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "autoPublishReviews" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "RestaurantReview"
  ALTER COLUMN "orderId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "customerName" TEXT,
  ADD COLUMN IF NOT EXISTS "staffBehavior" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "ownerReply" TEXT,
  ADD COLUMN IF NOT EXISTS "repliedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "abuseReportedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ipHash" TEXT,
  ADD COLUMN IF NOT EXISTS "isVerified" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "RestaurantReviewImage" (
  "id" TEXT PRIMARY KEY,
  "reviewId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantReviewImage_reviewId_fkey"
    FOREIGN KEY ("reviewId") REFERENCES "RestaurantReview"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "RestaurantReview_restaurantId_publishedAt_idx"
  ON "RestaurantReview"("restaurantId", "publishedAt");
CREATE INDEX IF NOT EXISTS "RestaurantReview_restaurantId_ipHash_createdAt_idx"
  ON "RestaurantReview"("restaurantId", "ipHash", "createdAt");
CREATE INDEX IF NOT EXISTS "RestaurantReviewImage_reviewId_sortOrder_idx"
  ON "RestaurantReviewImage"("reviewId", "sortOrder");

ALTER TABLE "RestaurantReviewImage" ENABLE ROW LEVEL SECURITY;
