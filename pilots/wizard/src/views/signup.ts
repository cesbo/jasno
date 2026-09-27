import { component, h, match, onMount, signal } from 'jasno';
import { AccountStep, EMPTY, PreferencesStep, ProfileStep, ReviewStep, type Draft } from '../steps.ts';

const STEPS = [
  { title: 'Account', render: AccountStep },
  { title: 'Profile', render: ProfileStep },
  { title: 'Preferences', render: PreferencesStep },
  { title: 'Review', render: ReviewStep },
] as const;

/** The wizard. Steps are state, not routes: a step is only reachable once the earlier ones validate. */
export default component(function SignupView(): Node {
  const draft = signal<Draft>(EMPTY);
  const step = signal(0);
  const edit = (patch: Partial<Draft>) => draft.update((d) => ({ ...d, ...patch }));
  let moved = false;   // set on Back/Next only, so the first render leaves focus to the router
  const go = (to: number) => { moved = true; step.set(to); };

  const heading = h.h1({ tabIndex: -1 }, () => `Step ${step() + 1} of ${STEPS.length}: ${STEPS[step()]?.title}`);

  return h.section({ class: 'wizard' },
    h.ol({ class: 'progress', 'aria-label': 'Sign-up steps' },
      STEPS.map((s, i) => h.li({ 'aria-current': () => (step() === i ? 'step' : null) }, s.title))),
    heading,
    match(step, (i) => {
      if (moved) { moved = false; onMount(() => heading.focus()); }
      const Step = STEPS[i]?.render ?? AccountStep;
      return Step({ draft, edit, onBack: () => go(i - 1), onNext: () => go(i + 1) });
    }));
});
