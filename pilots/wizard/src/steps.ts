import { component, h, signal, type Read } from 'jasno';
import { createAccount, type Plan, type SignupInput } from '#api';
import { Field, StepForm } from './form.ts';
import { router } from './routes.ts';
import { account } from './state.ts';

export interface Draft extends SignupInput { readonly terms: boolean }

export const EMPTY: Draft = {
  email: '', password: '', name: '', username: '', country: '', plan: 'free', newsletter: false, terms: false,
};

export interface StepProps {
  draft: Read<Draft>;
  edit: (patch: Partial<Draft>) => void;
  onBack: () => void;
  onNext: () => void;
}

const COUNTRIES = [['de', 'Germany'], ['fr', 'France'], ['pl', 'Poland'], ['gb', 'United Kingdom'], ['us', 'United States']] as const;
const PLANS: readonly (readonly [Plan, string])[] = [['free', 'Free'], ['pro', 'Pro, $8 a month']];
const label = (list: readonly (readonly [string, string])[], value: string) => list.find(([v]) => v === value)?.[1] ?? value;

export const AccountStep = component(function AccountStep(p: StepProps): Node {
  const reveal = signal(false);
  return StepForm({
    onNext: p.onNext,
    fields: [
      Field({ id: 'email', label: 'Email', missing: 'Enter your email address.', invalid: 'Enter an email address like name@example.com.',
        control: (a) => h.input({ ...a, type: 'email', required: true, autocomplete: 'email',
          value: () => p.draft().email, oninput: (e) => p.edit({ email: e.currentTarget.value }) }) }),
      Field({ id: 'password', label: 'Password', missing: 'Enter a password.', invalid: 'Use at least 8 characters.', hint: 'At least 8 characters.',
        control: (a) => h.input({ ...a, type: () => (reveal() ? 'text' : 'password'), required: true, minLength: 8, autocomplete: 'new-password',
          value: () => p.draft().password, oninput: (e) => p.edit({ password: e.currentTarget.value }) }) }),
      h.label(null, h.input({ type: 'checkbox', checked: reveal, onchange: (e) => reveal.set(e.currentTarget.checked) }), ' Show password'),
    ],
  });
});

export const ProfileStep = component(function ProfileStep(p: StepProps): Node {
  return StepForm({
    onBack: p.onBack,
    onNext: p.onNext,
    fields: [
      Field({ id: 'name', label: 'Full name', missing: 'Enter your name.',
        control: (a) => h.input({ ...a, required: true, autocomplete: 'name',
          value: () => p.draft().name, oninput: (e) => p.edit({ name: e.currentTarget.value }) }) }),
      Field({ id: 'username', label: 'Username', missing: 'Choose a username.', invalid: 'Use 3 to 20 lowercase letters, digits or underscores.',
        hint: '3 to 20 lowercase letters, digits or underscores.',
        control: (a) => h.input({ ...a, required: true, pattern: '[a-z0-9_]{3,20}', autocomplete: 'username',
          value: () => p.draft().username, oninput: (e) => p.edit({ username: e.currentTarget.value }) }) }),
      Field({ id: 'country', label: 'Country', missing: 'Choose your country.',
        control: (a) => h.select({ ...a, required: true, autocomplete: 'country',
          value: () => p.draft().country, onchange: (e) => p.edit({ country: e.currentTarget.value }) },
          h.option({ value: '' }, 'Choose a country'),
          COUNTRIES.map(([value, name]) => h.option({ value }, name))) }),
    ],
  });
});

export const PreferencesStep = component(function PreferencesStep(p: StepProps): Node {
  return StepForm({
    onBack: p.onBack,
    onNext: p.onNext,
    fields: [
      h.fieldset(null, h.legend(null, 'Plan'),
        PLANS.map(([value, name]) => h.label({ class: 'radio' },
          h.input({ type: 'radio', name: 'plan', value, checked: () => p.draft().plan === value, onchange: () => p.edit({ plan: value }) }),
          ' ', name))),
      h.label(null, h.input({ type: 'checkbox', checked: () => p.draft().newsletter, onchange: (e) => p.edit({ newsletter: e.currentTarget.checked }) }),
        ' Send me product news (about once a month)'),
      Field({ id: 'terms', label: 'I accept the terms of service', missing: 'Accept the terms to continue.',
        control: (a) => h.input({ ...a, type: 'checkbox', required: true, checked: () => p.draft().terms, onchange: (e) => p.edit({ terms: e.currentTarget.checked }) }) }),
    ],
  });
});

export const ReviewStep = component(function ReviewStep(p: StepProps): Node {
  const saving = signal(false);
  const error = signal('');
  const row = (term: string, value: Read<string>) => [h.dt(null, term), h.dd(null, value)];

  async function submit(): Promise<void> {
    if (saving()) return;
    saving.set(true);
    error.set('');
    const { terms: _terms, ...input } = p.draft();
    try {
      const created = await createAccount(input, AbortSignal.timeout(10_000));
      account.set(created);
      if (router.url().pathname === '/') void router.navigate('/welcome', { replace: true });   // unless the user left meanwhile
    } catch (err) {
      error.set(err instanceof Error ? err.message : 'Sign-up failed. Try again.');   // the draft is untouched
    } finally {
      saving.set(false);
    }
  }

  return StepForm({
    onBack: () => { if (!saving()) p.onBack(); },
    onNext: submit,
    busy: saving,
    next: () => (saving() ? 'Creating account…' : 'Create account'),
    fields: [
      h.dl(null,
        row('Email', () => p.draft().email),
        row('Full name', () => p.draft().name),
        row('Username', () => p.draft().username),
        row('Country', () => label(COUNTRIES, p.draft().country)),
        row('Plan', () => label(PLANS, p.draft().plan)),
        row('Product news', () => (p.draft().newsletter ? 'Yes' : 'No'))),
      h.p({ role: 'status' }, () => (saving() ? 'Creating your account…' : '')),
      h.p({ role: 'alert', class: 'error' }, error),
    ],
  });
});
