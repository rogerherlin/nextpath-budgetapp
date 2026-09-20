import { trackBusy } from "./busy";

export function clientFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return trackBusy(globalThis.fetch(input, init));
}
