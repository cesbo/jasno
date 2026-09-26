import { component, h, type Read } from 'jasno';
export const Chart = component(function Chart(p: { data: Read<readonly number[]> }): Node {
  return h.p(null, () => p.data().join(' '));
});
