import { z } from "zod";
import { normalizeCouponCode } from "@/lib/promotion-engine";

const optionalMoney = z.coerce.number().min(0).max(1000000).nullable().optional();
const optionalPositiveInt = z.coerce.number().int().positive().max(1000000).nullable().optional();

export const promotionInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    nameAr: z.string().trim().max(120).optional().nullable(),
    description: z.string().trim().max(1000).optional().nullable(),
    descriptionAr: z.string().trim().max(1000).optional().nullable(),
    type: z.enum([
      "PERCENTAGE",
      "FIXED_AMOUNT",
      "BUY_X_GET_Y",
      "FREE_ITEM",
      "FREE_DELIVERY",
    ]),
    targetType: z
      .enum(["ORDER", "PRODUCT", "CATEGORY", "BRANCH", "RESTAURANT", "COLLECTION"])
      .default("ORDER"),
    value: z.coerce.number().min(0).max(1000000).default(0),
    buyQuantity: optionalPositiveInt,
    getQuantity: optionalPositiveInt,
    freeProductId: z.string().trim().optional().nullable(),
    minimumOrderValue: optionalMoney,
    maximumDiscount: optionalMoney,
    minimumQuantity: optionalPositiveInt,
    startsAt: z.coerce.date().optional().nullable(),
    endsAt: z.coerce.date().optional().nullable(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
    weekdays: z.array(z.coerce.number().int().min(0).max(6)).max(7).default([]),
    firstOrderOnly: z.boolean().default(false),
    newCustomersOnly: z.boolean().default(false),
    returningOnly: z.boolean().default(false),
    totalUsageLimit: optionalPositiveInt,
    perCustomerLimit: optionalPositiveInt,
    requiresCoupon: z.boolean().default(false),
    autoApply: z.boolean().default(true),
    allowStacking: z.boolean().default(false),
    stackingRule: z.enum(["ALLOW", "PREVENT", "HIGHEST_WINS"]).default("HIGHEST_WINS"),
    priority: z.coerce.number().int().min(-1000).max(1000).default(0),
    exclusive: z.boolean().default(false),
    isActive: z.boolean().default(true),
    status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]).default("DRAFT"),
    productIds: z.array(z.string()).max(500).default([]),
    categoryIds: z.array(z.string()).max(200).default([]),
    branchIds: z.array(z.string()).max(100).default([]),
    coupons: z
      .array(
        z.object({
          id: z.string().optional(),
          code: z.string().min(3).max(40).transform(normalizeCouponCode),
          description: z.string().trim().max(300).optional().nullable(),
          maximumUsage: optionalPositiveInt,
          perCustomerLimit: optionalPositiveInt,
          expiresAt: z.coerce.date().optional().nullable(),
          isActive: z.boolean().default(true),
        }),
      )
      .max(50)
      .default([]),
  })
  .superRefine((value, context) => {
    if (value.type === "PERCENTAGE" && value.value > 100)
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "Percentage cannot exceed 100",
      });
    if (
      value.startsAt &&
      value.endsAt &&
      value.endsAt.getTime() <= value.startsAt.getTime()
    )
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "End date must be after start date",
      });
    if (
      value.requiresCoupon &&
      value.coupons.length === 0
    )
      context.addIssue({
        code: "custom",
        path: ["coupons"],
        message: "At least one coupon is required",
      });
    if (value.newCustomersOnly && value.returningOnly)
      context.addIssue({
        code: "custom",
        path: ["returningOnly"],
        message: "Customer conditions conflict",
      });
    if (
      value.type === "BUY_X_GET_Y" &&
      value.buyQuantity != null &&
      value.getQuantity != null &&
      value.getQuantity > value.buyQuantity
    )
      context.addIssue({
        code: "custom",
        path: ["getQuantity"],
        message: "Free quantity cannot exceed the qualifying quantity",
      });
  });

export const promotionCalculateSchema = z.object({
  restaurantSlug: z.string().min(1),
  branchId: z.string().optional(),
  fulfillmentType: z.enum(["DELIVERY", "PICKUP", "DINE_IN"]),
  couponCode: z.string().trim().max(40).optional(),
  customerPhone: z.string().trim().max(30).optional(),
  items: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.coerce.number().int().min(1).max(99),
        extraTotal: z.coerce.number().min(0).max(100000).default(0),
      }),
    )
    .min(1)
    .max(200),
});

export type PromotionInput = z.infer<typeof promotionInputSchema>;
