import { component, h, match } from 'jasno';
import type { ViewProps } from 'jasno/router';
export default component(function Settings(p: ViewProps<'/settings/:tab(profile|billing)'>): Node {
  return h.section(null, h.h1(null, 'Settings'),
    match(() => p.params().tab, (tab) => (tab === 'profile' ? h.p(null, 'Profile') : h.p(null, 'Billing'))));
});
