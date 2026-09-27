import { component, css, h } from 'jasno';
import { router } from './routes.ts';

css`
  body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: #1a1a1a; background: #f6f6f4; }
  .app { max-width: 36rem; margin: 0 auto; padding: 1rem; }
  .app header { font-weight: 700; padding-block: .5rem; }
  .app main { background: #fff; border-radius: 8px; padding: 1.5rem; }
  .progress { display: flex; gap: 1rem; padding: 0; list-style: none; color: #666; font-size: .875rem; }
  .progress [aria-current] { color: #1a1a1a; font-weight: 700; }
  .field { display: grid; gap: .25rem; margin-block: 1rem; }
  .field.check { grid-template-columns: auto 1fr; align-items: center; }
  .field.check input { grid-row: 1; }
  .field.check .error, .field.check .hint { grid-column: 1 / -1; }
  .field input:not([type=checkbox]), .field select { font: inherit; padding: .5rem; border: 1px solid #888; border-radius: 4px; }
  .field [aria-invalid=true] { border-color: #b00020; }
  .hint { margin: 0; color: #555; font-size: .875rem; }
  .error { margin: 0; color: #b00020; font-size: .875rem; }
  .nav { display: flex; gap: .5rem; margin-top: 1.5rem; }
  .nav button { font: inherit; padding: .5rem 1rem; }
  .nav button[aria-disabled=true] { opacity: .6; cursor: progress; }
  dt { font-weight: 600; }
  dd { margin: 0 0 .5rem; }
`;

export const App = component(function App(): Node {
  return h.div({ class: 'app' },
    h.header(null, 'Acme'),
    h.main(null, router.outlet()));
});
