import { describe, expect, it } from "vitest";
import { formatMoney, parseMoney, parseOptionalMoney } from "./money";

describe("AC1: Format amount with thousands space and two decimals", () => {
  it("AC1: Format amount with thousands space and two decimals", () => {
    expect(formatMoney(123456)).toBe("1 234,56");
  });
});

describe("AC2: Format zero", () => {
  it("AC2: Format zero", () => {
    expect(formatMoney(0)).toBe("0,00");
  });
});

describe("AC3: Format cents only", () => {
  it("AC3: Format cents only", () => {
    expect(formatMoney(50)).toBe("0,50");
  });
});

describe("AC4: Format negative amount", () => {
  it("AC4: Format negative amount", () => {
    expect(formatMoney(-1050)).toBe("-10,50");
  });
});

describe("AC5: Parse amount with thousands space", () => {
  it("AC5: Parse amount with thousands space", () => {
    expect(parseMoney("1 234,56")).toEqual({ ok: true, cents: 123456 });
  });
});

describe("AC6: Parse amount without thousands space", () => {
  it("AC6: Parse amount without thousands space", () => {
    expect(parseMoney("1234,56")).toEqual({ ok: true, cents: 123456 });
  });
});

describe("AC7: Parse negative amount", () => {
  it("AC7: Parse negative amount", () => {
    expect(parseMoney("-10,50")).toEqual({ ok: true, cents: -1050 });
  });
});

describe("AC8: Parse zero", () => {
  it("AC8: Parse zero", () => {
    expect(parseMoney("0,00")).toEqual({ ok: true, cents: 0 });
  });
});

describe("AC9: Reject empty required amount", () => {
  it("AC9: Reject empty required amount", () => {
    expect(parseMoney("")).toEqual({
      ok: false,
      error: "Enter a valid amount.",
    });
  });
});

describe("AC10: Reject more than two decimal digits", () => {
  it("AC10: Reject more than two decimal digits", () => {
    expect(parseMoney("10,123")).toEqual({
      ok: false,
      error: "Enter a valid amount.",
    });
  });
});

describe("AC11: Reject non-numeric amount", () => {
  it("AC11: Reject non-numeric amount", () => {
    expect(parseMoney("abc")).toEqual({
      ok: false,
      error: "Enter a valid amount.",
    });
  });
});

describe("AC12: Optional money empty is unset", () => {
  it("AC12: Optional money empty is unset", () => {
    expect(parseOptionalMoney("")).toEqual({ ok: true, cents: null });
  });
});

describe("AC13: Optional money valid", () => {
  it("AC13: Optional money valid", () => {
    expect(parseOptionalMoney("200,00")).toEqual({ ok: true, cents: 20000 });
  });
});
