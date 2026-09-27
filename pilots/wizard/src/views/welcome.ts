import { component, h } from 'jasno';
import type { ViewProps } from 'jasno/router';
import type { Account } from '#api';

export default component(function WelcomeView(p: ViewProps<'/welcome', Account | null>): Node {
  return h.section(null,
    h.h1(null, () => `Welcome, ${p.data()?.name ?? ''}!`),
    h.p(null, () => `Your account is ready. We sent a confirmation link to ${p.data()?.email ?? 'your inbox'}.`),
    h.a({ href: '/' }, 'Sign up another account'));
});
