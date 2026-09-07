import { useSyncExternalStore } from "react";
import { getRevision, subscribe } from "../persist";

export function useStoreRevision(): number {
  return useSyncExternalStore(subscribe, getRevision, getRevision);
}
