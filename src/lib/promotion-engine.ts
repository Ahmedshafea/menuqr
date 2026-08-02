export type PromotionKind =
  | "PERCENTAGE"
  | "FIXED_AMOUNT"
  | "BUY_X_GET_Y"
  | "FREE_ITEM"
  | "FREE_DELIVERY";

export type PromotionTarget =
  | "ORDER"
  | "PRODUCT"
  | "CATEGORY"
  | "BRANCH"
  | "RESTAURANT"
  | "COLLECTION";

export type PromotionStacking = "ALLOW" | "PREVENT" | "HIGHEST_WINS";

export interface PromotionCartLine {
  productId: string;
  categoryId: string;
  unitPrice: number;
  quantity: number;
}

export interface PromotionCoupon {
  id: string;
  code: string;
  isActive: boolean;
  expiresAt?: Date | string | null;
  maximumUsage?: number | null;
  usageCount: number;
  perCustomerLimit?: number | null;
  customerUsageCount?: number;
}

export interface PromotionCandidate {
  id: string;
  name: string;
  nameAr?: string | null;
  type: PromotionKind;
  targetType: PromotionTarget;
  value: number;
  buyQuantity?: number | null;
  getQuantity?: number | null;
  freeProductId?: string | null;
  minimumOrderValue?: number | null;
  maximumDiscount?: number | null;
  minimumQuantity?: number | null;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  startTime?: string | null;
  endTime?: string | null;
  weekdays?: number[];
  firstOrderOnly?: boolean;
  newCustomersOnly?: boolean;
  returningOnly?: boolean;
  totalUsageLimit?: number | null;
  perCustomerLimit?: number | null;
  usageCount?: number;
  customerUsageCount?: number;
  requiresCoupon?: boolean;
  autoApply?: boolean;
  allowStacking?: boolean;
  stackingRule?: PromotionStacking;
  priority?: number;
  exclusive?: boolean;
  isActive: boolean;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  productIds?: string[];
  categoryIds?: string[];
  branchIds?: string[];
  coupons?: PromotionCoupon[];
}

export interface PromotionContext {
  subtotal: number;
  lines: PromotionCartLine[];
  fulfillmentType: "DELIVERY" | "PICKUP" | "DINE_IN";
  branchId?: string | null;
  customerOrderCount?: number;
  couponCode?: string | null;
  now?: Date;
  timeZone?: string;
}

export interface AppliedPromotion {
  id: string;
  couponId?: string;
  couponCode?: string;
  name: string;
  nameAr?: string | null;
  type: PromotionKind;
  discountAmount: number;
  freeDelivery: boolean;
  snapshot: Record<string, unknown>;
}

export interface PromotionCalculation {
  appliedPromotions: AppliedPromotion[];
  discountAmount: number;
  freeDelivery: boolean;
  couponCode?: string;
  couponError?:
    | "COUPON_NOT_FOUND"
    | "COUPON_INACTIVE"
    | "COUPON_EXPIRED"
    | "COUPON_USAGE_LIMIT"
    | "COUPON_CUSTOMER_LIMIT"
    | "COUPON_NOT_ELIGIBLE";
}

const money = (value: number) =>
  Math.round(Math.max(0, Number.isFinite(value) ? value : 0) * 100) / 100;

export function normalizeCouponCode(value?: string | null) {
  return (value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function localScheduleParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  const weekdays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    weekday: weekdays[value("weekday")] ?? date.getUTCDay(),
    time: `${value("hour")}:${value("minute")}`,
  };
}

export function isPromotionScheduled(
  promotion: PromotionCandidate,
  now: Date,
  timeZone: string,
) {
  if (promotion.startsAt && now < new Date(promotion.startsAt)) return false;
  if (promotion.endsAt && now > new Date(promotion.endsAt)) return false;
  const local = localScheduleParts(now, timeZone);
  if (
    promotion.weekdays?.length &&
    !promotion.weekdays.includes(local.weekday)
  )
    return false;
  if (promotion.startTime && promotion.endTime) {
    if (promotion.startTime <= promotion.endTime) {
      if (local.time < promotion.startTime || local.time > promotion.endTime)
        return false;
    } else if (
      local.time > promotion.endTime &&
      local.time < promotion.startTime
    ) {
      return false;
    }
  }
  return true;
}

export function promotionTargetsLine(
  promotion: PromotionCandidate,
  line: Pick<PromotionCartLine, "productId" | "categoryId">,
) {
  if (promotion.targetType === "PRODUCT")
    return Boolean(promotion.productIds?.includes(line.productId));
  if (promotion.targetType === "CATEGORY")
    return Boolean(promotion.categoryIds?.includes(line.categoryId));
  return true;
}

function targetedLines(
  promotion: PromotionCandidate,
  lines: PromotionCartLine[],
) {
  return lines.filter((line) => promotionTargetsLine(promotion, line));
}

function couponForPromotion(
  promotion: PromotionCandidate,
  normalizedCode: string,
) {
  return promotion.coupons?.find(
    (coupon) => normalizeCouponCode(coupon.code) === normalizedCode,
  );
}

function couponFailure(coupon: PromotionCoupon, now: Date) {
  if (!coupon.isActive) return "COUPON_INACTIVE" as const;
  if (coupon.expiresAt && now > new Date(coupon.expiresAt))
    return "COUPON_EXPIRED" as const;
  if (
    coupon.maximumUsage != null &&
    coupon.usageCount >= coupon.maximumUsage
  )
    return "COUPON_USAGE_LIMIT" as const;
  if (
    coupon.perCustomerLimit != null &&
    (coupon.customerUsageCount || 0) >= coupon.perCustomerLimit
  )
    return "COUPON_CUSTOMER_LIMIT" as const;
  return null;
}

function calculateCandidate(
  promotion: PromotionCandidate,
  context: PromotionContext,
  coupon?: PromotionCoupon,
): AppliedPromotion | null {
  const lines = targetedLines(promotion, context.lines);
  const targetSubtotal = money(
    lines.reduce(
      (sum, line) => sum + line.unitPrice * Math.max(0, line.quantity),
      0,
    ),
  );
  const targetQuantity = lines.reduce(
    (sum, line) => sum + Math.max(0, line.quantity),
    0,
  );
  if (!lines.length && promotion.type !== "FREE_DELIVERY") return null;
  if (
    promotion.minimumOrderValue != null &&
    context.subtotal < promotion.minimumOrderValue
  )
    return null;
  if (
    promotion.minimumQuantity != null &&
    targetQuantity < promotion.minimumQuantity
  )
    return null;

  let discountAmount = 0;
  let freeDelivery = false;
  if (promotion.type === "PERCENTAGE")
    discountAmount = targetSubtotal * (Math.max(0, promotion.value) / 100);
  else if (promotion.type === "FIXED_AMOUNT")
    discountAmount = Math.min(targetSubtotal, Math.max(0, promotion.value));
  else if (promotion.type === "BUY_X_GET_Y") {
    const buy = Math.max(1, promotion.buyQuantity || 1);
    const get = Math.max(1, promotion.getQuantity || 1);
    // X is the qualifying quantity shown in the form. Y of every X units are free.
    const freeUnits = Math.floor(targetQuantity / buy) * Math.min(get, buy);
    const unitPrices = lines
      .flatMap((line) =>
        Array.from(
          { length: Math.max(0, line.quantity) },
          () => line.unitPrice,
        ),
      )
      .sort((a, b) => a - b);
    discountAmount = unitPrices
      .slice(0, freeUnits)
      .reduce((sum, price) => sum + price, 0);
  } else if (promotion.type === "FREE_ITEM") {
    const freeLine = context.lines.find(
      (line) => line.productId === promotion.freeProductId && line.quantity > 0,
    );
    discountAmount = freeLine?.unitPrice || 0;
  } else if (
    promotion.type === "FREE_DELIVERY" &&
    context.fulfillmentType === "DELIVERY"
  ) {
    freeDelivery = true;
  }
  if (promotion.maximumDiscount != null)
    discountAmount = Math.min(discountAmount, promotion.maximumDiscount);
  discountAmount = money(discountAmount);
  if (!discountAmount && !freeDelivery) return null;

  return {
    id: promotion.id,
    couponId: coupon?.id,
    couponCode: coupon?.code,
    name: promotion.name,
    nameAr: promotion.nameAr,
    type: promotion.type,
    discountAmount,
    freeDelivery,
    snapshot: {
      id: promotion.id,
      name: promotion.name,
      nameAr: promotion.nameAr,
      type: promotion.type,
      targetType: promotion.targetType,
      value: promotion.value,
      buyQuantity: promotion.buyQuantity,
      getQuantity: promotion.getQuantity,
      minimumOrderValue: promotion.minimumOrderValue,
      maximumDiscount: promotion.maximumDiscount,
      couponCode: coupon?.code,
      calculatedAt: (context.now || new Date()).toISOString(),
    },
  };
}

export function calculatePromotions(
  promotions: PromotionCandidate[],
  context: PromotionContext,
): PromotionCalculation {
  const now = context.now || new Date();
  const normalizedCoupon = normalizeCouponCode(context.couponCode);
  const eligible: Array<{
    promotion: PromotionCandidate;
    applied: AppliedPromotion;
  }> = [];
  let matchedCoupon = false;
  let couponError: PromotionCalculation["couponError"];

  for (const promotion of promotions) {
    if (
      !promotion.isActive ||
      promotion.status !== "ACTIVE" ||
      !isPromotionScheduled(promotion, now, context.timeZone || "Africa/Cairo") ||
      (promotion.totalUsageLimit != null &&
        (promotion.usageCount || 0) >= promotion.totalUsageLimit) ||
      (promotion.perCustomerLimit != null &&
        (promotion.customerUsageCount || 0) >= promotion.perCustomerLimit) ||
      (promotion.firstOrderOnly && (context.customerOrderCount || 0) > 0) ||
      (promotion.newCustomersOnly && (context.customerOrderCount || 0) > 0) ||
      (promotion.returningOnly && (context.customerOrderCount || 0) === 0) ||
      (promotion.branchIds?.length &&
        (!context.branchId || !promotion.branchIds.includes(context.branchId)))
    )
      continue;

    const coupon = normalizedCoupon
      ? couponForPromotion(promotion, normalizedCoupon)
      : undefined;
    if (coupon) {
      matchedCoupon = true;
      const failure = couponFailure(coupon, now);
      if (failure) {
        couponError = failure;
        continue;
      }
    }
    if (promotion.requiresCoupon && !coupon) continue;
    if (!promotion.autoApply && !coupon) continue;

    const applied = calculateCandidate(promotion, context, coupon);
    if (applied) eligible.push({ promotion, applied });
    else if (coupon) couponError = "COUPON_NOT_ELIGIBLE";
  }

  if (normalizedCoupon && !matchedCoupon && !couponError)
    couponError = "COUPON_NOT_FOUND";

  eligible.sort(
    (a, b) =>
      (b.promotion.priority || 0) - (a.promotion.priority || 0) ||
      b.applied.discountAmount - a.applied.discountAmount,
  );
  let selected: typeof eligible = [];
  const exclusive = eligible.filter((item) => item.promotion.exclusive);
  if (exclusive.length) selected = [exclusive[0]];
  else if (eligible.length) {
    const highest = [...eligible].sort(
      (a, b) => b.applied.discountAmount - a.applied.discountAmount,
    )[0];
    const stackable = eligible.filter(
      (item) =>
        item.promotion.allowStacking ||
        item.promotion.stackingRule === "ALLOW",
    );
    selected =
      stackable.length === eligible.length
        ? eligible
        : [
            highest,
            ...stackable.filter((item) => item !== highest),
          ].filter(
            (item, index, values) =>
              values.findIndex(
                (candidate) => candidate.promotion.id === item.promotion.id,
              ) === index,
          );
  }

  const appliedPromotions = selected.map((item) => item.applied);
  return {
    appliedPromotions,
    discountAmount: money(
      Math.min(
        context.subtotal,
        appliedPromotions.reduce(
          (sum, promotion) => sum + promotion.discountAmount,
          0,
        ),
      ),
    ),
    freeDelivery: appliedPromotions.some((promotion) => promotion.freeDelivery),
    ...(normalizedCoupon ? { couponCode: normalizedCoupon } : {}),
    ...(couponError ? { couponError } : {}),
  };
}
