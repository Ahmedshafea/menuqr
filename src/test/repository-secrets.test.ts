import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("provider credential repository boundary", () => {
  it("does not track or recreate the known historical credential path", () => {
    const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
    expect(tracked).not.toContain("whatsapp Token.txt");
    expect(existsSync("whatsapp Token.txt")).toBe(false);
  });

  it("contains no hardcoded Meta access-token pattern in current text sources", () => {
    const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter((path) => path && !/\.(ico|png|jpe?g|webp|avif|pdf|xlsx|woff2?)$/i.test(path));
    const offenders = tracked.filter((path) => /EAA[A-Za-z0-9_-]{80,}/.test(readFileSync(path, "utf8")));
    expect(offenders).toEqual([]);
  });
});
