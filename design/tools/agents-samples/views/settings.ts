import { component, h } from '@jasno/core';
import type { ViewProps } from '@jasno/core/router';
const tabs = { profile: () => h.p(null, 'Profile'), billing: () => h.p(null, 'Billing') };
export default component(function Settings(p: ViewProps<'/settings/:tab(profile|billing)'>): Node {
  return h.section(null, h.h1(null, 'Settings'), tabs[p.params().tab]());
});
