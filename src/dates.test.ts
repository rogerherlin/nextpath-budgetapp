import { describe, expect, it } from "vitest";
import { parseDate } from "./dates";

describe("AC15: Parse valid date", () => {
  it("AC15: Parse valid date", () => {
    expect(parseDate("05.09.2026")).toEqual({
      ok: true,
      date: { year: 2026, month: 9, day: 5 },
    });
  });
});

describe("AC16: Parse empty date as unset", () => {
  it("AC16: Parse empty date as unset", () => {
    expect(parseDate("")).toEqual({ ok: true, date: null });
  });
});

describe("AC17: Reject non-padded date", () => {
  it("AC17: Reject non-padded date", () => {
    expect(parseDate("5.9.2026")).toEqual({
      ok: false,
      error: "Enter a date as dd.mm.yyyy.",
    });
  });
});

describe("AC18: Reject impossible calendar date", () => {
  it("AC18: Reject impossible calendar date", () => {
    expect(parseDate("32.01.2026")).toEqual({
      ok: false,
      error: "Enter a date as dd.mm.yyyy.",
    });
  });
});
