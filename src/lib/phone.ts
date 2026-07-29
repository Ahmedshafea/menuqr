export class InvalidPhoneError extends Error {
  constructor() {
    super("INVALID_PHONE");
  }
}

/**
 * Accepts E.164, 00-prefixed international numbers, and local numbers.
 * Local numbers use Egypt (20) by default and can be changed per deployment.
 */
export function normalizePhoneE164(input: string) {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  const countryCode = (
    process.env.DEFAULT_PHONE_COUNTRY_CODE || "20"
  ).replace(/\D/g, "");

  let internationalDigits: string;
  if (trimmed.startsWith("+")) {
    internationalDigits = digits;
  } else if (digits.startsWith("00")) {
    internationalDigits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    internationalDigits = `${countryCode}${digits.slice(1)}`;
  } else {
    internationalDigits = digits;
  }

  const normalized = `+${internationalDigits}`;
  if (!/^\+[1-9]\d{7,14}$/.test(normalized))
    throw new InvalidPhoneError();
  return normalized;
}
