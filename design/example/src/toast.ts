import { component, createContext, css, each, h, onMount, type Read } from 'jasno';

/** Shows a short status message. App provides it; any component below reads it with useContext. */
export type Toast = (message: string) => void;
export const ToastContext = createContext<Toast>('Toast');

export interface ToastItem {
  readonly id: number;
  readonly message: string;
}

export interface ToastRegionProps {
  toasts: Read<readonly ToastItem[]>;
  dismiss: (id: number) => void;
}

css`
  .toasts { position: fixed; inset-block-end: 1rem; inset-inline-end: 1rem; display: grid; gap: .5rem; padding: 0; }
  .toasts li { list-style: none; padding: .5rem 1rem; border-radius: .5rem; background: CanvasText; color: Canvas; }
`;

// The live region exists before any message arrives, so screen readers announce each new row.
export const ToastRegion = component(function ToastRegion(p: ToastRegionProps): Node {
  const region: HTMLUListElement = h.ul({ class: 'toasts', 'aria-live': 'polite', tabIndex: -1 },
    each(p.toasts, {
      key: (t) => t.id,
      render: (toast, _index, id) => {
        // Removing the row that holds focus would drop focus to <body> (FOCUS_LOST): hand it to a neighbour first.
        const close = (): void => {
          if (row.contains(document.activeElement)) {
            ((row.nextElementSibling ?? row.previousElementSibling)?.querySelector('button') ?? region).focus();
          }
          p.dismiss(id);
        };
        // Each row owns its timer: onMount's returned cleanup runs when the row is removed.
        onMount(() => {
          const timer = setTimeout(close, 5000);
          return () => clearTimeout(timer);
        });
        const row = h.li(null, () => toast().message, ' ',
          h.button({ type: 'button', onclick: close, 'aria-label': 'Dismiss message' }, '×'));
        return row;
      },
    }),
  );
  return region;
});
