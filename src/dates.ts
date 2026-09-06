import type { DateParts } from "./types";

export type ParseDateResult =
  | { ok: true; date: DateParts | null }
  | { ok: false; error: string };

const INVALID_DATE: ParseDateResult = {
  ok: false,
  error: "Enter a date as dd.mm.yyyy.",
};

function isValidCalendarDate(date: DateParts): boolean {
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day));
  return (
    utc.getUTCFullYear() === date.year &&
    utc.getUTCMonth() === date.month - 1 &&
    utc.getUTCDate() === date.day
  );
}

export function parseDate(input: string): ParseDateResult {
  if (input === "") {
    return { ok: true, date: null };
  }
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(input);
  if (!match) {
    return INVALID_DATE;
  }
  const date: DateParts = {
    day: Number(match[1]),
    month: Number(match[2]),
    year: Number(match[3]),
  };
  if (!isValidCalendarDate(date)) {
    return INVALID_DATE;
  }
  return { ok: true, date };
}
