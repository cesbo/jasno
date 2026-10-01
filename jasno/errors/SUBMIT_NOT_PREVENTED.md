<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# SUBMIT_NOT_PREVENTED

**warn**, runtime, dev builds: an onsubmit handler did not prevent navigation.

- Message: `The submit handler of <form> in {ownerPath} did not call preventDefault(); the browser will navigate.`
- Hint: Call e.preventDefault() first in onsubmit.

<!-- design.md: B15.7 -->
<!-- /generated:catalogue -->

A form's `onsubmit` handler returned without calling `e.preventDefault()`. The form has no `action` and is not `method: 'dialog'`, so after the handler the browser submits it to the current URL and loads that page again: the app's state is lost, and the save the handler started may be cut off.

## Fix

- Call `e.preventDefault()` first in `onsubmit`, before any `await`: the check runs when the handler returns, and a call after an `await` also comes too late for the browser.
- Return the save's promise from the handler, so `settled()` in tests waits for it.
- A form inside a `dialog` that only closes it uses `method: 'dialog'`; a form that really posts to a server has an `action`. jasno does not check either.

## Example

```ts
import { component, h, signal } from '@jasno/core';

declare function subscribe(email: string): Promise<void>;

// Wrong: no preventDefault(), so the browser reloads the page after the handler
export const SignupWrong = component(function SignupWrong(): Node {
  const email = signal('');
  return h.form({ onsubmit: () => subscribe(email()) },
    h.label(null, 'Email ', h.input({ type: 'email', required: true, value: email, oninput: (e) => email.set(e.currentTarget.value) })),
    h.button({ type: 'submit' }, 'Subscribe'));
});

// Right: preventDefault() first, then return the promise
export const Signup = component(function Signup(): Node {
  const email = signal('');
  return h.form({ onsubmit: (e) => { e.preventDefault(); return subscribe(email()); } },
    h.label(null, 'Email ', h.input({ type: 'email', required: true, value: email, oninput: (e) => email.set(e.currentTarget.value) })),
    h.button({ type: 'submit' }, 'Subscribe'));
});
```

## Fixture

`test/spec/elements.test.ts` › B15.7 SUBMIT_NOT_PREVENTED: reported without preventDefault; not with preventDefault, an action attribute or method dialog
