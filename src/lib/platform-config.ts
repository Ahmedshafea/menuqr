import { unstable_cache } from "next/cache";
import type { PlatformConfigVisibility, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const PLATFORM_CONFIG_TAG = "platform-configuration";
export const PLATFORM_FLAGS_TAG = "platform-feature-flags";
export const HOMEPAGE_CONFIG_TAG = "homepage-configuration";

export type ConfigValue = string | number | boolean | null | ConfigValue[] | { [key: string]: ConfigValue };

type FlagContext = {
  subjectId?: string;
  restaurantId?: string;
  planCode?: string;
};

type FlagConditions = {
  restaurantIds?: string[];
  planCodes?: string[];
};

const getCachedSettings = unstable_cache(
  async () => prisma.platformSetting.findMany({
    select: {
      namespace: true,
      key: true,
      value: true,
      defaultValue: true,
      visibility: true,
    },
  }),
  ["platform-configuration-v1"],
  { revalidate: 60, tags: [PLATFORM_CONFIG_TAG] },
);

const getCachedFlags = unstable_cache(
  async () => prisma.featureFlag.findMany({
    select: {
      key: true,
      enabled: true,
      rolloutPercentage: true,
      conditions: true,
      startsAt: true,
      endsAt: true,
    },
  }),
  ["platform-feature-flags-v1"],
  { revalidate: 30, tags: [PLATFORM_FLAGS_TAG] },
);

export const getHomepageSections = unstable_cache(
  async () => prisma.homepageSection.findMany({
    orderBy: { displayOrder: "asc" },
    select: { key: true, content: true, enabled: true, displayOrder: true },
  }),
  ["homepage-configuration-v1"],
  { revalidate: 60, tags: [HOMEPAGE_CONFIG_TAG] },
);

function visibleTo(value: PlatformConfigVisibility, includePrivate: boolean) {
  if (value === "SECRET") return false;
  return includePrivate || value === "PUBLIC";
}

export async function getPlatformConfig(options: { includePrivate?: boolean } = {}) {
  const includePrivate = options.includePrivate === true;
  const rows = await getCachedSettings();
  const result: Record<string, Record<string, ConfigValue>> = {};
  for (const row of rows) {
    if (!visibleTo(row.visibility, includePrivate)) continue;
    result[row.namespace] ??= {};
    result[row.namespace][row.key] = (row.value ?? row.defaultValue) as ConfigValue;
  }
  return result;
}

export async function getConfigNamespace(namespace: string, options: { includePrivate?: boolean } = {}) {
  return (await getPlatformConfig(options))[namespace] ?? {};
}

export async function getConfigValue<T extends ConfigValue>(
  namespace: string,
  key: string,
  fallback: T,
  options: { includePrivate?: boolean } = {},
): Promise<T> {
  const value = (await getConfigNamespace(namespace, options))[key];
  return (value === undefined || value === null ? fallback : value) as T;
}

function rolloutBucket(subject: string) {
  let hash = 2166136261;
  for (let index = 0; index < subject.length; index += 1) {
    hash ^= subject.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

export async function isFeatureFlagEnabled(key: string, context: FlagContext = {}, fallback = false) {
  const flag = (await getCachedFlags()).find((item) => item.key === key);
  if (!flag) return fallback;
  if (!flag.enabled) return false;
  const now = Date.now();
  if (flag.startsAt && flag.startsAt.getTime() > now) return false;
  if (flag.endsAt && flag.endsAt.getTime() < now) return false;

  const conditions = (flag.conditions ?? {}) as FlagConditions;
  if (conditions.restaurantIds?.length && (!context.restaurantId || !conditions.restaurantIds.includes(context.restaurantId))) return false;
  if (conditions.planCodes?.length && (!context.planCode || !conditions.planCodes.includes(context.planCode))) return false;
  if (flag.rolloutPercentage >= 100) return true;
  if (flag.rolloutPercentage <= 0 || !context.subjectId) return false;
  return rolloutBucket(`${flag.key}:${context.subjectId}`) < flag.rolloutPercentage;
}

export function deepMerge<T extends Record<string, unknown>>(base: T, override: Record<string, unknown>): T {
  const output: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === "object" && !Array.isArray(value) && output[key] && typeof output[key] === "object" && !Array.isArray(output[key])) {
      output[key] = deepMerge(output[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      output[key] = value;
    }
  }
  return output as T;
}

export function jsonForAudit(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
