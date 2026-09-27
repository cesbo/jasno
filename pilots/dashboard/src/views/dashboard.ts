import { component, computed, css, h, resource, show } from 'jasno';
import { getMetric, listServices } from '#api';
import { MetricWidget } from '../components/metric-widget.ts';
import { ResourceStatus } from '../components/resource-status.ts';
import { ServiceDetail, ServiceList } from '../components/services.ts';
import { router } from '../routes.ts';

const METRICS = [
  { id: 'cpu', label: 'CPU', unit: '%' },
  { id: 'memory', label: 'Memory', unit: '%' },
  { id: 'rps', label: 'Requests', unit: 'req/s' },
  { id: 'latency', label: 'p95 latency', unit: 'ms' },
];

css`.dashboard {
  .metrics { display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: 1rem; }
  .split { display: grid; grid-template-columns: minmax(12rem, 1fr) 2fr; gap: 1.5rem; margin-top: 1.5rem; }
  @media (max-width: 40rem) { .split { grid-template-columns: 1fr; } }
}`;

export default component(function DashboardView(): Node {
  const services = resource({ loader: ({ abortSignal }) => listServices(abortSignal) });
  // Selection lives in the URL (?service=id): deep links work and the list stays mounted.
  const selectedId = computed(() => router.url().searchParams.get('service'));
  const selected = computed(() => (services.hasValue() && services.value().find((s) => s.id === selectedId())) || null);
  const select = (id: string) => void router.navigate(`?service=${encodeURIComponent(id)}`, { replace: true });

  return h.div({ class: 'dashboard' },
    h.h1(null, 'Dashboard'),
    h.section({ 'aria-labelledby': 'metrics-title' },
      h.h2({ id: 'metrics-title' }, 'Metrics'),
      h.div({ class: 'metrics' }, METRICS.map((m) => MetricWidget({ ...m, load: (signal) => getMetric(m.id, signal) })))),
    h.div({ class: 'split' },
      h.section({ 'aria-labelledby': 'services-title' },
        h.h2({ id: 'services-title' }, 'Services'),
        show(() => services.hasValue() && services.value(), (list) => ServiceList({ services: list, selected: selectedId, onSelect: select })),
        ResourceStatus({ resource: services, what: 'services' })),
      h.section({ 'aria-labelledby': 'detail-title', 'aria-live': 'polite' },
        h.h2({ id: 'detail-title' }, () => selected()?.name ?? 'Details'),
        show(selected, (s) => ServiceDetail({ service: s }), () => h.p(null, 'Select a service to see its details.')))));
});
