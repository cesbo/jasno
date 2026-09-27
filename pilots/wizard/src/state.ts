import { signal } from 'jasno';
import type { Account } from '#api';

/** The account created by the last successful sign-up; the welcome page reads it. */
export const account = signal<Account | null>(null);
