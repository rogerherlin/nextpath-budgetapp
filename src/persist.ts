let persistFn: () => void = () => {};
let revision = 0;
const listeners = new Set<() => void>();

export function setPersist(fn: () => void): void {
  persistFn = fn;
}

export function persist(): void {
  persistFn();
  notify();
}

export function notify(): void {
  revision += 1;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRevision(): number {
  return revision;
}
