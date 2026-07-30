export function compactBranchLocation(
  address: string,
  city?: string | null,
  maxLength = 34,
) {
  const location = city?.trim() || address.split(/[،,]/)[0]?.trim() || "";
  if (location.length <= maxLength) return location;
  return `${location.slice(0, maxLength - 1).trim()}…`;
}
