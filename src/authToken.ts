let getter: () => Promise<string | null> = async () => null;

export function setAuthTokenGetter(
  next: () => Promise<string | null>,
): void {
  getter = next;
}

export async function getAuthToken(): Promise<string | null> {
  return getter();
}
