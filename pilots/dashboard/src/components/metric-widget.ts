import { component, css, effect, h, linkedSignal, resource, show } from 'jasno';
import type { Metric } from '../api.ts';
import { pageVisible, pollMs } from '../state.ts';
import { ResourceStatus } from './resource-status.ts';
import { Sparkline } from './sparkline.ts';

export interface MetricWidgetProps {
  id: string;
  label: string;
  unit: string;
  load: (signal: AbortSignal) => Promise<Metric>;
}

css`.widget {
  border: 1px solid #ccd; border-radius: 8px; padding: 0.75rem 1rem;
  h3 { font-size: 1rem; margin: 0; } .value { font-size: 1.75rem; margin: 0.25rem 0; font-variant-numeric: tabular-nums; }
  &.stale .value, &.stale .sparkline { opacity: 0.45; }
  &[aria-busy="true"] h3::after { content: " ⟳"; color: #667; }
}`;

export const MetricWidget = component(function MetricWidget(p: MetricWidgetProps): Node {
  const metric = resource({ loader: ({ abortSignal }) => p.load(abortSignal), debugName: `metric:${p.id}` });
  // A failed reload clears value(): keep the last good one on screen (marked stale).
  const last = linkedSignal({
    source: () => (metric.hasValue() ? metric.value() : undefined),
    computation: (v, prev): Metric | null => v ?? prev?.value ?? null,
  });
  // One request at a time: the next reload is scheduled only after the previous one settled.
  // Paused while the tab is hidden and while in error (Retry resumes).
  effect(() => {
    if (!pageVisible() || metric.isLoading() || metric.status() === 'error') return;
    const t = setTimeout(metric.reload, pollMs());
    return () => clearTimeout(t);
  });
  const titleId = `metric-${p.id}`;
  return h.section({ class: { widget: true, stale: () => metric.status() === 'error' }, 'aria-labelledby': titleId, 'aria-busy': metric.isLoading },
    h.h3({ id: titleId }, p.label),
    show(last, (m) => [
      h.p({ class: 'value' }, () => `${m().value.toLocaleString('en')} ${p.unit}`),
      Sparkline({ values: () => m().history }),
    ]),
    ResourceStatus({ resource: metric, what: p.label }));
});
