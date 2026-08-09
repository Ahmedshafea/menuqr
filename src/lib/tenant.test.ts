import { describe, expect, it } from "vitest";
import { canPerformTenantAction } from "./authorization-policy";

describe("tenant authorization policy", () => {
  it("allows owners and explicit super admins to perform owner actions", () => {
    expect(canPerformTenantAction({ globalRoles: ["RESTAURANT_OWNER"], membershipRole: "RESTAURANT_OWNER" }, true)).toBe(true);
    expect(canPerformTenantAction({ globalRoles: ["SUPER_ADMIN"], membershipRole: null }, true)).toBe(true);
  });
  it("denies staff and unauthenticated/non-members from owner actions", () => {
    expect(canPerformTenantAction({ globalRoles: ["STAFF"], membershipRole: "STAFF" }, true)).toBe(false);
    expect(canPerformTenantAction({ globalRoles: [], membershipRole: null }, true)).toBe(false);
  });
  it("allows staff tenant work only with a membership", () => {
    expect(canPerformTenantAction({ globalRoles: ["STAFF"], membershipRole: "STAFF" })).toBe(true);
    expect(canPerformTenantAction({ globalRoles: ["STAFF"], membershipRole: null })).toBe(false);
  });
});
