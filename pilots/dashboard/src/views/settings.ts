import { component, h } from 'jasno';
import { INTERVALS, pollMs } from '../state.ts';

export default component(function SettingsView(): Node {
  return h.div({ class: 'settings' },
    h.h1(null, 'Settings'),
    h.fieldset(null,
      h.legend(null, 'Polling interval'),
      INTERVALS.map((ms) => h.label(null,
        h.input({ type: 'radio', name: 'interval', checked: () => pollMs() === ms, onchange: () => pollMs.set(ms) }),
        ` ${ms / 1000} seconds`))),
    h.p({ role: 'status' }, () => `Metrics refresh every ${pollMs() / 1000} seconds.`));
});
