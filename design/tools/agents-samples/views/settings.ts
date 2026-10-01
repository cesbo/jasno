import { component, h, match } from '@jasno/core';
import type { ViewProps } from '@jasno/core/router';
export default component(function Settings(p: ViewProps<'/settings/:tab(profile|billing)'>): Node {
  return h.section(null, h.h1(null, 'Settings'),
    match(() => p.params().tab, (tab) => (tab === 'profile' ? h.p(null, 'Profile') : h.p(null, 'Billing'))));
});
