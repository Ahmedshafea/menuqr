import { describe, expect, it } from "vitest";
import { InvalidPhoneError, normalizePhoneE164 } from "./phone";

describe("normalizePhoneE164", () => {
  it("keeps an Egyptian E.164 number", () => {
    expect(normalizePhoneE164("+201001234567")).toBe("+201001234567");
  });

  it("converts a 00-prefixed international number", () => {
    expect(normalizePhoneE164("00201001234567")).toBe("+201001234567");
  });

  it("converts the local Egyptian format accepted by registration", () => {
    expect(normalizePhoneE164("0100 123 4567")).toBe("+201001234567");
  });

  it("rejects an invalid number", () => {
    expect(() => normalizePhoneE164("123")).toThrow(InvalidPhoneError);
  });
});
