import { useEffect, useState, useSyncExternalStore } from "react";
import {
  BUSY_SPINNER_DELAY_MS,
  getBusyCount,
  subscribeBusy,
} from "../busy";

export function BusyOverlay() {
  const count = useSyncExternalStore(
    subscribeBusy,
    getBusyCount,
    getBusyCount,
  );
  const busy = count > 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!busy) {
      setVisible(false);
      return;
    }
    const id = window.setTimeout(() => {
      setVisible(true);
    }, BUSY_SPINNER_DELAY_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [busy]);

  if (!visible) {
    return null;
  }

  return (
    <div className="busy-overlay">
      <div className="spinner" aria-hidden="true" />
      <p role="status">Loading.</p>
    </div>
  );
}
