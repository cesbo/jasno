<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# CSP_HASH_STRICT_DYNAMIC

**error / warn**, reported by jasno dist: index.html carries its own CSP <meta>: with 'strict-dynamic' (error), combined with jasno's hash sources it blocks imports in Chromium and Firefox; without it (warn), browsers enforce both policies and the stricter wins, so the app breaks only after deploy.

<!-- /generated:catalogue -->

Your `index.html` has its own `<meta http-equiv="Content-Security-Policy">`.

`jasno dist` writes the production policy itself. It puts the policy into the built `index.html` and `_headers`. The policy is `script-src 'self'` plus the hashes of the two inline scripts (the import map and the entry), with Trusted Types.

Browsers enforce every policy on the page. Your policy applies on top of the policy from jasno.

- With `'strict-dynamic'`, your policy blocks the imports of the app in Chromium and Firefox. This is an error.
- Without `'strict-dynamic'`, the stricter of the two policies wins. The app can break only after deploy. This is a warning.
<!-- design.md: (c) dist, (e) dist 6 -->

## Fix

- Delete the CSP `<meta>` from `index.html`. `jasno dist` writes the policy.
- A server that sets a nonce per response: run `npm run dist -- --nonce`. It prints the nonce and `'strict-dynamic'` variant of the jasno policy. The server sends this policy. The server also adds `nonce="<nonce>"` to both inline scripts of the page it serves.
- Other directives (`connect-src`, `img-src`, `frame-ancestors`): send them as headers from your host. Browsers enforce them together with the jasno policy.

## Example

```html
<head>
  <meta charset="utf-8">
  <!-- Wrong: a handwritten policy in index.html -->
  <meta http-equiv="Content-Security-Policy" content="script-src 'self' 'strict-dynamic'">
  <title>App</title>
  <!--jasno:head-->
</head>
```

```html
<head>
  <meta charset="utf-8">
  <!-- Right: no CSP meta; jasno dist adds its policy to the built page -->
  <title>App</title>
  <!--jasno:head-->
</head>
```

## Fixture

`test/cli/spec/dist.test.ts` › CSP_HASH_STRICT_DYNAMIC: index.html carrying its own CSP with 'strict-dynamic' (the only CSP "config" a project has) fails the build
