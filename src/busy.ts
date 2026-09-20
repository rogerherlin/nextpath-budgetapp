export const BUSY_SPINNER_DELAY_MS = 400;

let count = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getBusyCount(): number {
  return count;
}

export function subscribeBusy(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function trackBusy<T>(work: Promise<T>): Promise<T> {
  count += 1;
  notify();
  return work.finally(() => {
    count = Math.max(0, count - 1);
    notify();
  });
}

export function resetBusyForTests(): void {
  count = 0;
  notify();
}
