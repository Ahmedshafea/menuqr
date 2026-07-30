import { z } from "zod";

const requiredName = (label: string, max: number) => z.string()
  .trim()
  .min(2, `${label} must contain at least 2 characters`)
  .max(max, `${label} is too long`);

export const registerSchema = z.object({
  name: requiredName("Name", 80),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  password: z.string()
    .min(8, "Password must contain at least 8 characters")
    .regex(/[A-Z]/, "Password must contain an uppercase English letter")
    .regex(/[0-9]/, "Password must contain a number"),
  restaurantName: requiredName("Restaurant name", 100),
  slug: z.string()
    .transform(value => value.trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""))
    .pipe(z.string()
      .min(3, "Menu URL must contain at least 3 characters")
      .max(60, "Menu URL is too long")
      .regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u, "Menu URL may only contain letters, numbers, and hyphens")),
  whatsapp: z.string()
    .transform(value => value.replace(/\D/g, ""))
    .pipe(z.string().regex(/^\d{8,15}$/, "Enter a valid WhatsApp number including country code")),
});

const optionalAddressText = (maximum = 120) =>
  z.string().trim().max(maximum).optional().transform((value) => value || undefined);

export const checkoutSchema = z.object({
  restaurantSlug: z.string(),
  customerName: z.string().trim().min(2).max(80),
  customerPhone: z.string().trim().min(8).max(20),
  fulfillmentType: z.enum(["DELIVERY", "PICKUP", "DINE_IN"]).optional().default("DELIVERY"),
  deliveryAddress: z.string().trim().max(300).optional().transform((value) => value || undefined),
  deliveryLatitude: z.coerce.number().min(-90).max(90).optional(),
  deliveryLongitude: z.coerce.number().min(-180).max(180).optional(),
  street: optionalAddressText(),
  district: optionalAddressText(),
  city: optionalAddressText(),
  governorate: optionalAddressText(),
  country: optionalAddressText(),
  postalCode: optionalAddressText(30),
  buildingName: optionalAddressText(),
  floor: optionalAddressText(30),
  apartment: optionalAddressText(30),
  landmark: optionalAddressText(200),
  deliveryNotes: optionalAddressText(500),
  notes: z.string().trim().max(500).optional().transform((value) => value || undefined),
  turnstileToken: z.string().optional(),
  couponCode: z.string().trim().max(40).optional().transform((value) => value || undefined),
  createAccount: z.boolean().optional().default(false),
  email: z.string().trim().toLowerCase().pipe(z.email()).optional(),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/).optional(),
  items: z.array(z.object({
    productId: z.string(),
    name: z.string(),
    price: z.number().nonnegative(),
    quantity: z.number().int().min(1).max(99),
    extras: z.array(z.object({ id: z.string(), name: z.string(), price: z.number() })).default([]),
  })).min(1),
}).superRefine((data, context) => {
  if (data.createAccount && (!data.email || !data.password))
    context.addIssue({ code: "custom", path: ["email"], message: "Email and password are required" });
  if (data.fulfillmentType === "DELIVERY" && !data.deliveryAddress)
    context.addIssue({ code: "custom", path: ["deliveryAddress"], message: "Delivery address is required" });
  if ((data.deliveryLatitude == null) !== (data.deliveryLongitude == null))
    context.addIssue({ code: "custom", path: ["deliveryLatitude"], message: "Both delivery coordinates are required" });
});
