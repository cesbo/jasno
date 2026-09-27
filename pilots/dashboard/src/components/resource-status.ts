import { component, h, show, type Resource } from 'jasno';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Status line (loading / error) that exists before its text changes, plus a Retry that keeps focus. */
export const ResourceStatus = component(function ResourceStatus(p: { resource: Pick<Resource<unknown>, 'status' | 'error' | 'reload'>; what: string }): Node {
  const r = p.resource;
  const status = h.p({ role: 'status', tabIndex: -1, class: 'status' }, () =>
    r.status() === 'error' ? `Could not load ${p.what}: ${message(r.error())}`
      : r.status() === 'loading' ? `Loading ${p.what}…` : '');
  return h.div({ class: 'resource-status' }, status,
    show(() => r.status() === 'error', () =>
      h.button({ type: 'button', 'aria-label': `Retry ${p.what}`, onclick: () => { status.focus(); r.reload(); } }, 'Retry')));
});
