import { describe, expect, it } from "vitest";

import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps local paths and rejects external ones", () => {
    expect(safeNext("/radar?x=1")).toBe("/radar?x=1");
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "", null, undefined]) expect(safeNext(bad)).toBe("/");
  });
});
