type AdjustmentType = "FIXED" | "PERCENTAGE";

type PricingSettings = {
  deliveryFee?: number;
  deliveryFeeType?: string;
  serviceFee?: number;
  serviceFeeType?: string;
  taxRate?: number;
  taxType?: string;
  discountValue?: number;
  discountType?: string;
};

const money = (value: number) => Math.round(Math.max(0, value) * 100) / 100;

function adjustment(
  base: number,
  value: number,
  type: string | undefined,
) {
  return money(
    type === ("PERCENTAGE" satisfies AdjustmentType)
      ? base * (Math.max(0, value) / 100)
      : Math.max(0, value),
  );
}

export function calculateOrderPricing(
  subtotal: number,
  fulfillmentType: "DELIVERY" | "PICKUP" | "DINE_IN",
  settings: PricingSettings,
) {
  const safeSubtotal = money(subtotal);
  const discountAmount = Math.min(
    safeSubtotal,
    adjustment(
      safeSubtotal,
      Number(settings.discountValue ?? 0),
      settings.discountType,
    ),
  );
  const discountedSubtotal = money(safeSubtotal - discountAmount);
  const deliveryFee =
    fulfillmentType === "DELIVERY"
      ? adjustment(
          discountedSubtotal,
          Number(settings.deliveryFee ?? 0),
          settings.deliveryFeeType,
        )
      : 0;
  const serviceFee = adjustment(
    discountedSubtotal,
    Number(settings.serviceFee ?? 0),
    settings.serviceFeeType,
  );
  const beforeTax = money(discountedSubtotal + deliveryFee + serviceFee);
  const taxAmount = adjustment(
    beforeTax,
    Number(settings.taxRate ?? 0),
    settings.taxType,
  );
  return {
    subtotal: safeSubtotal,
    discountAmount,
    deliveryFee,
    serviceFee,
    taxAmount,
    total: money(beforeTax + taxAmount),
  };
}
