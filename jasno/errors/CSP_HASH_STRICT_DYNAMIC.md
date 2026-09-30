<!-- generated:catalogue from design.md (c) by tools/gen-errors.mjs; do not edit by hand -->
# CSP_HASH_STRICT_DYNAMIC

**error / warn**, reported by jasno dist: index.html carries its own CSP <meta>: with 'strict-dynamic' (error), combined with jasno's hash sources it blocks imports in Chromium and Firefox (§7); without it (warn), browsers enforce both policies and the stricter wins, so the app breaks only after deploy.

<!-- /generated:catalogue -->

`index.html` carries its own `<meta http-equiv="Content-Security-Policy">`. `jasno dist` writes the production policy itself, into the built `index.html` and `_headers`: `script-src 'self'` plus the hashes of the two inline scripts (the import map and the entry), with Trusted Types. Browsers enforce every policy on the page, so yours applies on top of jasno's: with `'strict-dynamic'` it blocks the app's imports in Chromium and Firefox (an error); without it the stricter of the two wins, and the app can break only after deploy (a warning).
<!-- design.md: (c) dist, (e) dist 6 -->

## Fix

- Delete the CSP `<meta>` from `index.html`; `jasno dist` writes the policy.
- A server that sets a nonce per response: `npm run dist -- --nonce` prints the nonce and `'strict-dynamic'` variant of jasno's policy for the server to send; the server adds `nonce="<nonce>"` to both inline scripts of the page it serves.
- Other directives (`connect-src`, `img-src`, `frame-ancestors`): send them as headers from your host; browsers enforce them alongside jasno's policy.

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
