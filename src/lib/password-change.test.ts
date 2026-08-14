import { describe, expect, it, vi } from "vitest";
import { changeAuthenticatedPassword } from "@/lib/password-change";
import { passwordChangeRateLimitKeys } from "@/lib/rate-limit";

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    findUser: vi.fn().mockResolvedValue({ passwordHash: "old-hash" }),
    updateUser: vi.fn().mockResolvedValue(1),
    limit: vi.fn().mockResolvedValue({ allowed: true, remaining: 1, retryAfter: 0 }),
    comparePassword: vi.fn().mockResolvedValue(true),
    hashPassword: vi.fn().mockResolvedValue("new-hash"),
    ...overrides,
  };
}

const valid = { userId: "user-a", ip: "192.0.2.1", currentPassword: "OldPass1", newPassword: "NewPass2", confirmPassword: "NewPass2" };

describe("authenticated password changes", () => {
  it("changes the password and increments the session version through the guarded update", async () => {
    const deps = dependencies();
    expect(await changeAuthenticatedPassword(valid, deps)).toBe("changed");
    expect(deps.updateUser).toHaveBeenCalledWith("user-a", "old-hash", "new-hash");
  });

  it("rejects a wrong current password without changing session state", async () => {
    const deps = dependencies({ comparePassword: vi.fn().mockResolvedValue(false) });
    expect(await changeAuthenticatedPassword(valid, deps)).toBe("incorrect");
    expect(deps.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    { ...valid, userId: "" },
    { ...valid, currentPassword: "x".repeat(129) },
    { ...valid, newPassword: "x".repeat(129), confirmPassword: "x".repeat(129) },
    { ...valid, newPassword: "weak", confirmPassword: "weak" },
  ])("rejects invalid or oversized input before database or bcrypt work", async (input) => {
    const deps = dependencies();
    expect(await changeAuthenticatedPassword(input, deps)).toBe("invalid");
    expect(deps.findUser).not.toHaveBeenCalled();
    expect(deps.comparePassword).not.toHaveBeenCalled();
  });

  it("rejects mismatched confirmation before expensive work", async () => {
    const deps = dependencies();
    expect(await changeAuthenticatedPassword({ ...valid, confirmPassword: "Different2" }, deps)).toBe("mismatch");
    expect(deps.limit).not.toHaveBeenCalled();
  });

  it("enforces a database-backed account or client bucket before password comparison", async () => {
    const deps = dependencies({ limit: vi.fn().mockResolvedValueOnce({ allowed: false }).mockResolvedValueOnce({ allowed: true }) });
    expect(await changeAuthenticatedPassword(valid, deps)).toBe("rate_limited");
    expect(deps.comparePassword).not.toHaveBeenCalled();
  });

  it("isolates account buckets while sharing the same client bucket", () => {
    const first = passwordChangeRateLimitKeys("user-a", "192.0.2.1");
    const second = passwordChangeRateLimitKeys("user-b", "192.0.2.1");
    expect(first.account).not.toBe(second.account);
    expect(first.client).toBe(second.client);
    expect(first.account).not.toContain("user-a");
    expect(first.client).not.toContain("192.0.2.1");
  });

  it("rejects a concurrent stale-hash update", async () => {
    const deps = dependencies({ updateUser: vi.fn().mockResolvedValue(0) });
    expect(await changeAuthenticatedPassword(valid, deps)).toBe("incorrect");
  });
});
