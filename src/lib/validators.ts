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

export const checkoutSchema = z.object({ restaurantSlug: z.string(), customerName: z.string().min(2).max(80), customerPhone: z.string().min(8).max(20), deliveryAddress: z.string().max(300).optional(), notes: z.string().max(500).optional(), turnstileToken: z.string().optional(), createAccount: z.boolean().optional().default(false), email: z.string().trim().toLowerCase().pipe(z.email()).optional(), password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/).optional(), items: z.array(z.object({ productId: z.string(), name: z.string(), price: z.number().nonnegative(), quantity: z.number().int().min(1).max(99), extras: z.array(z.object({ id: z.string(), name: z.string(), price: z.number().nonnegative() })).default([]) })).min(1) }).superRefine((data, context) => { if (data.createAccount && (!data.email || !data.password)) context.addIssue({ code: "custom", path: ["email"], message: "Email and password are required" }); });
