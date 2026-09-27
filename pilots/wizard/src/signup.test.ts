import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { flush } from 'jasno';
import { mountTest, settled } from 'jasno/testing';
import { App } from './app.ts';
import { router } from './routes.ts';

// Compare identities: assert.equal on two DOM nodes renders a diff of happy-dom's object graph and runs out of memory.
function assertFocused(el: Element): void {
  const active = document.activeElement;
  assert.ok(active === el, `focus is on <${active?.tagName.toLowerCase()} id="${active?.id}">, expected <${el.tagName.toLowerCase()} id="${el.id}">`);
}

async function start(t: TestContext) {
  history.replaceState(null, '', '/');
  const view = mountTest(t, () => App());
  await router.navigate('/');
  await settled();
  const $ = <E extends Element = HTMLInputElement>(sel: string) => {
    const el = view.root.querySelector<E>(sel);
    assert.ok(el, `missing ${sel}`);
    return el;
  };
  const heading = () => $<HTMLHeadingElement>('h1');
  const button = (name: string) => {
    const b = Array.from(view.root.querySelectorAll('button')).find((el) => el.textContent === name);
    assert.ok(b, `missing button ${name}`);
    return b;
  };
  const type = (sel: string, value: string) => {
    const el = $(sel);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const choose = (sel: string, value: string) => {
    const el = $<HTMLSelectElement>(sel);
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const tick = (sel: string) => {
    const el = $(sel);
    el.checked = !el.checked;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const press = (name: string) => { const b = button(name); b.focus(); b.click(); flush(); };
  const fillToReview = (username = 'ada_l') => {
    type('#email', 'ada@example.com'); type('#password', 'correct horse'); press('Next');
    type('#name', 'Ada Lovelace'); type('#username', username); choose('#country', 'gb'); press('Next');
    tick('#terms'); press('Next');
  };
  return { view, $, heading, button, type, choose, tick, press, fillToReview };
}

test('a failed Next shows the messages and focuses the first invalid field', async (t) => {
  const { $, heading, type, press } = await start(t);
  press('Next');
  assert.match(heading().textContent ?? '', /Account/);
  assert.equal($('#email-error').textContent, 'Enter your email address.');
  assert.equal($('#password-error').textContent, 'Enter a password.');
  assert.equal($('#email').getAttribute('aria-invalid'), 'true');
  assertFocused($('#email'));

  type('#email', 'ada');                // a shown message follows the value
  flush();
  assert.equal($('#email-error').textContent, 'Enter an email address like name@example.com.');
  type('#email', 'ada@example.com');
  type('#password', 'short');
  flush();
  assert.equal($('#email-error').textContent, '');
  assert.equal($('#email').getAttribute('aria-invalid'), 'false');

  press('Next');                        // now the password is the first invalid field
  assertFocused($('#password'));
  assert.equal($('#password-error').textContent, 'Use at least 8 characters.');
});

test('Next and Back focus the step heading and keep the data', async (t) => {
  const { view, $, heading, type, press } = await start(t);
  type('#email', 'ada@example.com');
  type('#password', 'correct horse');
  press('Next');
  assert.match(heading().textContent ?? '', /Step 2 of 4: Profile/);
  assertFocused(heading());
  assert.deepEqual(Array.from(view.root.querySelectorAll('[aria-current]'), (li) => li.textContent), ['Profile']);
  type('#name', 'Ada Lovelace');

  press('Back');
  assert.match(heading().textContent ?? '', /Account/);
  assertFocused(heading());
  assert.equal($('#email').value, 'ada@example.com');
  assert.equal($('#password').value, 'correct horse');

  press('Next');
  assert.equal($('#name').value, 'Ada Lovelace');
  press('Next');                        // username and country still missing
  assertFocused($('#username'));
  assert.equal($('#country-error').textContent, 'Choose your country.');
});

test('the terms checkbox is required', async (t) => {
  const { $, heading, type, choose, press, tick } = await start(t);
  type('#email', 'ada@example.com'); type('#password', 'correct horse'); press('Next');
  type('#name', 'Ada'); type('#username', 'ada'); press('Next');
  assert.match(heading().textContent ?? '', /Profile/);   // country missing
  choose('#country', 'de');
  press('Next');
  press('Next');
  assertFocused($('#terms'));
  assert.equal($('#terms-error').textContent, 'Accept the terms to continue.');
  tick('#terms');
  flush();
  assert.equal($('#terms-error').textContent, '');
});

test('a failed submit keeps focus on the button, shows the error and keeps the data', async (t) => {
  const { view, $, heading, button, press, fillToReview } = await start(t);
  fillToReview('taken');
  assert.match(heading().textContent ?? '', /Review/);
  assert.match(view.root.querySelector('dl')?.textContent ?? '', /United Kingdom/);

  press('Create account');
  const submit = button('Creating account…');
  assert.equal(submit.getAttribute('aria-disabled'), 'true');
  assertFocused(submit);
  press('Creating account…');           // a second press while saving is ignored

  await settled();
  assertFocused(submit);
  assert.equal(submit.textContent, 'Create account');
  assert.equal(submit.getAttribute('aria-disabled'), 'false');
  assert.match($('[role=alert]').textContent ?? '', /already taken/);
  assert.equal(location.pathname, '/');

  press('Back');
  press('Back');
  assert.equal($('#username').value, 'taken');
});

test('a successful submit lands on the welcome page with its heading focused', async (t) => {
  const { heading, press, fillToReview } = await start(t);
  fillToReview();
  press('Create account');
  await settled();
  assert.equal(location.pathname, '/welcome');
  assert.equal(heading().textContent, 'Welcome, Ada Lovelace!');
  assertFocused(heading());
});

test('the welcome page without a sign-up goes back to the wizard', async (t) => {
  const { heading } = await start(t);
  await router.navigate('/welcome');
  await settled();
  assert.equal(location.pathname, '/');
  assert.match(heading().textContent ?? '', /Account/);
});
