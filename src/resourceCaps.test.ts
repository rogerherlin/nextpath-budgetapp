import { describe, expect, it } from "vitest";
import { getClientResourceCaps, readResourceCaps, resetClientResourceCaps } from "./resourceCaps";

const defaults = {
  userCount: 3,
  userBudgetCount: 2,
  categoryCount: 4,
  entryCount: 4,
};

describe("readResourceCaps", () => {
  it("AC1: Invalid env uses the defaults", () => {
    expect(
      readResourceCaps({
        CAP_USER_BUDGET_COUNT: "0",
        CAP_CATEGORY_COUNT: "4abc",
        CAP_ENTRY_COUNT: " 4 ",
      }),
    ).toEqual(defaults);

    expect(
      readResourceCaps({
        CAP_USER_COUNT: "",
        CAP_USER_BUDGET_COUNT: "-2",
        CAP_CATEGORY_COUNT: "08",
        CAP_ENTRY_COUNT: "3.0",
      }),
    ).toEqual(defaults);
  });

  it("AC2: Positive integers are kept", () => {
    expect(
      readResourceCaps({
        CAP_USER_COUNT: " 5 ",
        CAP_USER_BUDGET_COUNT: "9",
        CAP_CATEGORY_COUNT: "11",
        CAP_ENTRY_COUNT: "13",
      }),
    ).toEqual({
      userCount: 5,
      userBudgetCount: 9,
      categoryCount: 11,
      entryCount: 13,
    });
  });
});

describe("client resource caps", () => {
  it("AC26: The client stores config caps and uses defaults until then", () => {
    resetClientResourceCaps();
    expect(getClientResourceCaps()).toEqual(defaults);
  });
});
