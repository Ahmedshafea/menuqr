import { z } from "zod";

const identifier = z.string().trim().min(2).max(80).regex(/^[A-Za-z][A-Za-z0-9_.-]*$/);

export const platformSettingInput = z.object({
  namespace: identifier,
  key: identifier,
  label: z.string().trim().min(2).max(120),
  labelAr: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
  valueType: z.enum(["STRING", "NUMBER", "BOOLEAN", "JSON"]),
  visibility: z.enum(["PUBLIC", "PRIVATE"]),
  rawValue: z.string().max(50_000),
});

export const featureFlagInput = z.object({
  key: identifier.transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(120),
  nameAr: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
  enabled: z.boolean(),
  rolloutPercentage: z.coerce.number().int().min(0).max(100),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
});

export const homepageSectionInput = z.object({
  key: identifier,
  name: z.string().trim().min(2).max(120),
  nameAr: z.string().trim().max(120).optional(),
  enabled: z.boolean(),
  displayOrder: z.coerce.number().int().min(0).max(10_000),
  content: z.string().min(2).max(100_000),
});

export function parseConfigValue(type: "STRING" | "NUMBER" | "BOOLEAN" | "JSON", raw: string) {
  if (type === "STRING") return raw;
  if (type === "NUMBER") return z.coerce.number().parse(raw);
  if (type === "BOOLEAN") return z.enum(["true", "false"]).transform((value) => value === "true").parse(raw);
  return JSON.parse(raw) as unknown;
}
