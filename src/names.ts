export function normalizeName(name: string): string {
  return name.trim();
}

export function isNameTaken(name: string, existingNames: string[]): boolean {
  const needle = name.toLowerCase();
  return existingNames.some((existing) => existing.toLowerCase() === needle);
}

export function nextCopyName(sourceName: string, existingNames: string[]): string {
  let n = 1;
  let candidate = `${sourceName} (copy${n})`;
  while (isNameTaken(candidate, existingNames)) {
    n += 1;
    candidate = `${sourceName} (copy${n})`;
  }
  return candidate;
}
