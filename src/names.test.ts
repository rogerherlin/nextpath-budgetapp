import { describe, expect, it } from "vitest";
import { nextCopyName } from "./names";

describe("AC7: nextCopyName first copy", () => {
  it("AC7: nextCopyName first copy", () => {
    expect(nextCopyName("Summer", ["Summer"])).toBe("Summer (copy1)");
  });
});

describe("AC8: nextCopyName skips taken suffix", () => {
  it("AC8: nextCopyName skips taken suffix", () => {
    expect(nextCopyName("Summer", ["Summer", "Summer (copy1)"])).toBe(
      "Summer (copy2)",
    );
  });
});

describe("AC9: nextCopyName is case-insensitive against existing", () => {
  it("AC9: nextCopyName is case-insensitive against existing", () => {
    expect(nextCopyName("Summer", ["summer (copy1)"])).toBe("Summer (copy2)");
  });
});
