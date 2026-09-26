import { component, h } from 'jasno';

export interface ErrorPanelProps {
  error: unknown;
  retry: () => void;
}

/** Rendered by the router in place of a view whose loader, module or setup failed. */
export const ErrorPanel = component(function ErrorPanel(p: ErrorPanelProps): Node {
  const message = p.error instanceof Error ? p.error.message : String(p.error);
  return h.section({ role: 'alert' },
    h.h1(null, 'Something went wrong'),
    h.p(null, message),
    h.button({ type: 'button', onclick: p.retry }, 'Try again'),
  );
});
