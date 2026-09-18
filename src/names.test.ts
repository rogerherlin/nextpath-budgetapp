import { describe, expect, it } from "vitest";
import { namesForOwner, nextCopyName } from "./names";

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

describe("namesForOwner returns only that owner’s names", () => {
  it("namesForOwner returns only that owner’s names", () => {
    expect(
      namesForOwner(
        [
          { ownerId: "uid-alice", name: "Summer" },
          { ownerId: "uid-bob", name: "Winter" },
          { ownerId: "uid-alice", name: "Autumn" },
        ],
        "uid-alice",
      ),
    ).toEqual(["Summer", "Autumn"]);
  });
});
