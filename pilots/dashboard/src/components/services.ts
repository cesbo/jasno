import { component, css, each, h, selector, type Read } from 'jasno';
import type { Service } from '../api.ts';

css`.services {
  list-style: none; padding: 0; margin: 0; display: grid; gap: 0.25rem;
  button { width: 100%; display: flex; justify-content: space-between; gap: 1rem; padding: 0.5rem 0.75rem;
    border: 1px solid #ccd; border-radius: 6px; background: #fff; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  button[aria-pressed="true"] { background: #e6ecff; border-color: #3355cc; font-weight: 600; }
}
.health { font-size: 0.85em; &.up { color: #17692e; } &.degraded { color: #8a5a00; } &.down { color: #b3261e; } }
.service-detail { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; dt { color: #556; } dd { margin: 0; } }`;

export interface ServiceListProps {
  services: Read<readonly Service[]>;
  selected: Read<string | null>;
  onSelect: (id: string) => void;
}

/** One toggle button per service; selector() re-renders only the two rows whose answer flips. */
export const ServiceList = component(function ServiceList(p: ServiceListProps): Node {
  const isSelected = selector(p.selected);
  return h.ul({ class: 'services', 'aria-label': 'Services' }, each(p.services, {
    key: (s) => s.id,
    render: (s, _i, id) => h.li(null,
      h.button({ type: 'button', 'aria-pressed': () => isSelected(id), onclick: () => p.onSelect(id) },
        h.span(null, () => s().name),
        h.span({ class: () => `health ${s().health}` }, () => s().health))),
  }));
});

export const ServiceDetail = component(function ServiceDetail(p: { service: Read<Service> }): Node {
  const row = (term: string, value: () => string) => [h.dt(null, term), h.dd(null, value)];
  return h.dl({ class: 'service-detail' },
    row('Name', () => p.service().name),
    row('Health', () => p.service().health),
    row('Version', () => p.service().version),
    row('Region', () => p.service().region),
    row('Owner', () => p.service().owner));
});
