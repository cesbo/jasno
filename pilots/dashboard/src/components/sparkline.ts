import { component, css, svg, type Read } from 'jasno';

const W = 100;
const H = 24;

/** SVG polyline points scaled into a W x H box (min at the bottom, max at the top). */
export function points(values: readonly number[]): string {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const step = values.length > 1 ? W / (values.length - 1) : 0;
  return values.map((v, i) => `${(i * step).toFixed(1)},${(H - ((v - min) / span) * H).toFixed(1)}`).join(' ');
}

css`.sparkline { width: 100%; height: 2rem; overflow: visible; polyline { fill: none; stroke: currentColor; stroke-width: 1.5; vector-effect: non-scaling-stroke; } }`;

/** Decorative trend line; the widget prints the numbers next to it. */
export const Sparkline = component(function Sparkline(p: { values: Read<readonly number[]> }): Node {
  return svg('svg', { class: 'sparkline', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' },
    svg('polyline', { points: () => points(p.values()) }));
});
