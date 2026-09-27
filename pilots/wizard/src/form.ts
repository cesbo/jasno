import { component, h, signal, type Child, type Read } from 'jasno';

type Control = HTMLInputElement | HTMLSelectElement;

/** What Field gives the control it wraps: spread it into h.input / h.select. */
export interface ControlAttrs {
  id: string;
  'aria-invalid': Read<boolean>;
  'aria-describedby': string;
  oninvalid: () => void;
}

export interface FieldProps {
  id: string;
  label: string;
  /** Message for valueMissing. */
  missing: string;
  /** Message for any other broken constraint (type, pattern, length). */
  invalid?: string | undefined;
  hint?: string | undefined;
  control: (attrs: ControlAttrs) => Control;
}

/**
 * Label, control, hint and error message. The message is set from the control's `invalid` event
 * (fired by form.checkValidity() in StepForm) and follows the value once it is shown.
 */
export const Field = component(function Field(p: FieldProps): Node {
  const error = signal('');
  const describe = () => (el.validity.valid ? '' : el.validity.valueMissing ? p.missing : p.invalid ?? p.missing);
  const recheck = () => { if (error()) error.set(describe()); };
  const el = p.control({
    id: p.id,
    'aria-invalid': () => error() !== '',
    'aria-describedby': p.hint ? `${p.id}-hint ${p.id}-error` : `${p.id}-error`,
    oninvalid: () => error.set(describe()),
  });
  return h.div({ class: el.type === 'checkbox' ? 'field check' : 'field', oninput: recheck, onchange: recheck },
    h.label({ htmlFor: p.id }, p.label),
    el,
    p.hint ? h.p({ id: `${p.id}-hint`, class: 'hint' }, p.hint) : null,
    h.p({ id: `${p.id}-error`, class: 'error' }, error));
});

export interface StepFormProps {
  fields: Child;
  onNext: () => void | Promise<void>;
  onBack?: (() => void) | undefined;
  next?: Read<string> | undefined;
  busy?: Read<boolean> | undefined;
}

const isInvalid = (el: Element): el is Control =>
  (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) && !el.validity.valid;

/**
 * One wizard step's form. noValidate replaces the browser's bubbles with the fields' own messages;
 * a failed Next focuses the first invalid field.
 */
export const StepForm = component(function StepForm(p: StepFormProps): Node {
  return h.form({
    noValidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      if (form.checkValidity()) return p.onNext();   // fires `invalid` at every broken field: they show their messages
      Array.from(form.elements).find(isInvalid)?.focus();
    },
  },
  p.fields,
  h.div({ class: 'nav' },
    p.onBack ? h.button({ type: 'button', 'aria-disabled': p.busy, onclick: p.onBack }, 'Back') : null,
    h.button({ type: 'submit', 'aria-disabled': p.busy }, p.next ?? 'Next')));
});
