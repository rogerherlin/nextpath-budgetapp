export type ParseMoneyResult =
  | { ok: true; cents: number }
  | { ok: false; error: string };

function withThousandsSpaces(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  return `${sign}${withThousandsSpaces(String(euros))},${fraction}`;
}

function normalizeMoneyInput(input: string): string {
  return input.trim().replaceAll(" ", "").replace(",", ".");
}

const INVALID_AMOUNT: ParseMoneyResult = {
  ok: false,
  error: "Enter a valid amount.",
};

export function parseMoney(input: string): ParseMoneyResult {
  const normalized = normalizeMoneyInput(input);
  const fraction = normalized.split(".")[1];
  const extraDecimals = fraction !== undefined && fraction.length > 2;
  if (
    normalized === "" ||
    Number.isNaN(Number(normalized)) ||
    extraDecimals
  ) {
    return INVALID_AMOUNT;
  }
  return { ok: true, cents: Math.round(Number(normalized) * 100) };
}

export type ParseOptionalMoneyResult =
  | { ok: true; cents: number | null }
  | { ok: false; error: string };

export function parseOptionalMoney(input: string): ParseOptionalMoneyResult {
  if (normalizeMoneyInput(input) === "") {
    return { ok: true, cents: null };
  }
  return parseMoney(input);
}
