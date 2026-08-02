import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((value) => value || null);
const requiredLocationText = (max: number) => z.string().trim().min(1).max(max);
const optionalPhone = z
  .string()
  .trim()
  .max(20)
  .optional()
  .transform((value) => value?.replace(/[^\d+]/g, "") || null)
  .refine((value) => !value || /^\+?\d{8,15}$/.test(value), "INVALID_PHONE");
const optionalUrl = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .transform((value) => value || null)
  .refine((value) => !value || /^https?:\/\//i.test(value), "INVALID_URL");

export const branchHourSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  opensAt: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  closesAt: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  isClosed: z.boolean().default(false),
});

export const branchSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    isActive: z.boolean().default(true),
    phone: optionalPhone,
    whatsappNumber: optionalPhone,
    useRestaurantWhatsapp: z.boolean().default(true),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(255)
      .optional()
      .transform((value) => value || null)
      .refine((value) => !value || z.email().safeParse(value).success, "INVALID_EMAIL"),
    address: z.string().trim().min(3).max(300),
    city: requiredLocationText(100),
    state: optionalText(100),
    governorate: requiredLocationText(100),
    district: requiredLocationText(100),
    area: requiredLocationText(100),
    street: requiredLocationText(150),
    country: optionalText(100),
    postalCode: optionalText(30),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    googleMapsUrl: optionalUrl,
    workingHours: z.array(branchHourSchema).max(7).default([]),
  })
  .superRefine((value, context) => {
    if (!value.useRestaurantWhatsapp && !value.whatsappNumber)
      context.addIssue({
        code: "custom",
        path: ["whatsappNumber"],
        message: "BRANCH_WHATSAPP_REQUIRED",
      });
    if ((value.latitude == null) !== (value.longitude == null))
      context.addIssue({
        code: "custom",
        path: ["latitude"],
        message: "BOTH_COORDINATES_REQUIRED",
      });
    if (value.latitude == null || value.longitude == null)
      context.addIssue({
        code: "custom",
        path: ["latitude"],
        message: "BRANCH_LOCATION_REQUIRED",
      });
    if (new Set(value.workingHours.map((hour) => hour.dayOfWeek)).size !== value.workingHours.length)
      context.addIssue({
        code: "custom",
        path: ["workingHours"],
        message: "DUPLICATE_WEEKDAY",
      });
  });

export type BranchInput = z.infer<typeof branchSchema>;

export const branchListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  take: z.coerce.number().int().min(1).max(50).default(20),
});
