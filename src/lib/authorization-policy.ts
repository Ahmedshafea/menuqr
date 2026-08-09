export function canPerformTenantAction(input: { globalRoles: string[]; membershipRole?: string | null }, ownerOnly = false) {
  if (input.globalRoles.includes("SUPER_ADMIN")) return true;
  if (!input.membershipRole) return false;
  return ownerOnly ? input.membershipRole === "RESTAURANT_OWNER" : ["RESTAURANT_OWNER", "STAFF"].includes(input.membershipRole);
}
