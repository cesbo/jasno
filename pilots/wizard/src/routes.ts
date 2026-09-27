import { h } from 'jasno';
import { createRouter, route } from 'jasno/router';
import { account } from './state.ts';

export const router = createRouter([
  route('/', { view: () => import('./views/signup.ts'), title: 'Sign up' }),
  route('/welcome', {
    view: () => import('./views/welcome.ts'),
    title: 'Welcome',
    loader: async () => {
      const created = account();
      if (!created) void router.navigate('/', { replace: true });   // deep link without a sign-up
      return created;
    },
  }),
], {
  error: (_error, retry) => h.div({ role: 'alert' }, h.p(null, 'Something went wrong.'), h.button({ type: 'button', onclick: retry }, 'Try again')),
  notFound: () => h.div(null, h.h1(null, 'Page not found'), h.a({ href: '/' }, 'Go to sign-up')),
});
