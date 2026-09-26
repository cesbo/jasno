// RECIPES "Config and backend": the mock keeps the real types.
import type * as Api from './api.ts';
export const listUsers: typeof Api.listUsers = async () => [{ id: '1', name: 'Ada' }];
