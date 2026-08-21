import { describe, expect, it } from "vitest";
import { assertAuthorizedDevelopmentDatabaseTarget } from "@/lib/database-target-safety";

const localRef = "localprojectref12345";
const productionRef = "productionref1234567";

function environment(overrides: Record<string, string> = {}) {
  return {
    NODE_ENV: "development",
    LOCAL_DATABASE_PROJECT_REF: localRef,
    PRODUCTION_DATABASE_PROJECT_REF: productionRef,
    DATABASE_URL: `postgresql://postgres.${localRef}:not-a-secret@pooler.invalid:6543/postgres`,
    DIRECT_URL: `postgresql://postgres.${localRef}:not-a-secret@pooler.invalid:5432/postgres`,
    NEXT_PUBLIC_SUPABASE_URL: `https://${localRef}.supabase.co`,
    ...overrides,
  };
}

describe("development database target safety", () => {
  it("accepts an explicitly authorized non-production project without opening a connection", () => {
    expect(() => assertAuthorizedDevelopmentDatabaseTarget(environment())).not.toThrow();
  });

  it("rejects an unknown runtime database target", () => {
    expect(() => assertAuthorizedDevelopmentDatabaseTarget(environment({
      DATABASE_URL: "postgresql://postgres.unknownprojectref123:unused@pooler.invalid:6543/postgres",
    }))).toThrow("LOCAL_DATABASE_TARGET_REJECTED");
  });

  it("rejects the production project even when another local project is authorized", () => {
    expect(() => assertAuthorizedDevelopmentDatabaseTarget(environment({
      DATABASE_URL: `postgresql://postgres.${productionRef}:unused@pooler.invalid:6543/postgres`,
    }))).toThrow("LOCAL_DATABASE_TARGET_REJECTED");
  });

  it("rejects an attempt to authorize Production as the local project", () => {
    expect(() => assertAuthorizedDevelopmentDatabaseTarget(environment({
      LOCAL_DATABASE_PROJECT_REF: productionRef,
    }))).toThrow("LOCAL_DATABASE_TARGET_REJECTED");
  });

  it("does not alter production or test runtime behavior", () => {
    expect(() => assertAuthorizedDevelopmentDatabaseTarget({ NODE_ENV: "production" })).not.toThrow();
    expect(() => assertAuthorizedDevelopmentDatabaseTarget({ NODE_ENV: "test" })).not.toThrow();
  });
});
