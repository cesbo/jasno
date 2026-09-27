import { signal } from 'jasno';

export const INTERVALS = [2000, 5000, 10000, 30000] as const;

function savedInterval(): number {
  try {
    const n = Number(localStorage.getItem('pollMs'));
    return INTERVALS.some((i) => i === n) ? n : 5000;
  } catch { return 5000; }
}

/** Polling interval in ms, chosen on /settings (App persists it). */
export const pollMs = signal(savedInterval());
/** False while the tab is hidden; App keeps it in sync with visibilitychange. */
export const pageVisible = signal(!document.hidden);
