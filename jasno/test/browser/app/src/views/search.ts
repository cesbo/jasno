import { component, h } from '@jasno/core';
import { router } from '../routes.ts';
export default component(function SearchView(): Node {
  return h.section(null, h.h1(null, 'Search'), h.p({ id: 'sq' }, () => router.url().searchParams.get('q') ?? ''));
});
