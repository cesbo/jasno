// Generates the closed element prop interfaces and the `H` tag table for jasno.d.ts from lib.dom.d.ts.
// Usage: node tools/gen-elements.cjs jasno.d.ts   (rewrites the region between the <generated:elements> markers)
// Uses the TS 6 compiler API (TS 7.0 has no API) on TypeScript 7.0.2's own lib files; the two lib.dom.d.ts
// files are byte-identical (checked with cmp), so the prop set matches what users compile against.
// Re-run for every lib.dom update. Adapted from scratchpad/ts6/gen.cjs.
// v2 changes: live props may return undefined (MaybeRead<X | undefined>); aria-* keys are a closed set derived
// from lib.dom's ARIAMixin (a typo is TS2353; tsc offers no 'Did you mean' for quoted, hyphenated keys); void
// elements and textarea take no children; dialog.open is message-typed (it makes a NON-modal dialog; modals use
// showModal()).
const ts = require('../../../ts6/node_modules/typescript');
const fs = require('fs');
const path = require('path');

const LIB_DIR = path.resolve(__dirname, '../../../node_modules/@typescript/typescript-linux-x64/lib');
const LIBS = ['lib.es2025.d.ts', 'lib.dom.d.ts'];
const host = ts.createCompilerHost({ strict: true });
host.getDefaultLibLocation = () => LIB_DIR;
host.getDefaultLibFileName = () => path.join(LIB_DIR, 'lib.d.ts');
const origGet = host.getSourceFile;
host.getSourceFile = (f, l) => (f === 'x.ts' ? ts.createSourceFile(f, 'export {};', l) : origGet(f, l));
const program = ts.createProgram(['x.ts'], { lib: LIBS, strict: true, noEmit: true, types: [] }, host);
const c = program.getTypeChecker();
const typeOf = (name) => c.getDeclaredTypeOfSymbol(c.resolveName(name, undefined, ts.SymbolFlags.Type, false));

// Tags that are not offered: document structure, script/style/metadata (Trusted Types sinks or not
// meaningful in a client-rendered body), shadow-DOM plumbing, legacy plugin elements.
const EXCLUDED_TAGS = new Set(['base', 'body', 'embed', 'head', 'html', 'link', 'meta', 'noscript', 'object',
  'script', 'slot', 'style', 'template', 'title']);
// Properties never exposed as props: TT sinks, string-typed duplicates of class/style/children,
// imperative scroll state, CSP plumbing. `on*` handlers are replaced by typed events below.
const OMIT = new Set(['innerHTML', 'outerHTML', 'innerText', 'outerText', 'textContent', 'nodeValue', 'className',
  'classList', 'part', 'relList', 'style', 'scrollTop', 'scrollLeft', 'srcdoc', 'nonce', 'text', 'length',
  // URL decomposition on a/area: href is the one way to set a link target.
  'hash', 'host', 'hostname', 'password', 'pathname', 'port', 'protocol', 'search', 'username']);

const isReadonly = (p) => (p.declarations ?? []).every((d) =>
  (ts.isPropertySignature(d) && d.modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword)) ||
  (ts.isGetAccessorDeclaration(d) && !p.declarations.some(ts.isSetAccessorDeclaration)));
const isDeprecated = (p) => p.getJsDocTags().some((t) => t.name === 'deprecated');
const keep = (p) => {
  const n = p.name;
  if (OMIT.has(n) || n.startsWith('on') || n.startsWith('__') || /^aria[A-Z]/.test(n)) return false;
  if (isReadonly(p) || isDeprecated(p)) return false;
  return !c.getNonNullableType(c.getTypeOfSymbol(p)).getCallSignatures().length;
};
// Setter type when it differs from the getter (e.g. HTMLOutputElement.htmlFor: get DOMTokenList, set string).
const propType = (p, owner) => {
  const setter = (p.declarations ?? []).find(ts.isSetAccessorDeclaration);
  if (setter && setter.parameters[0]?.type) {
    const setT = c.typeToString(c.getTypeFromTypeNode(setter.parameters[0].type));
    const getT = c.typeToString(c.getTypeOfSymbol(p));
    if (setT !== getT) return setT + ' | undefined';
  }
  return `${owner}['${p.name}'] | undefined`;
};

const evKeys = (m) => typeOf(m).getProperties().map((p) => p.name);
const baseEvents = new Set(evKeys('HTMLElementEventMap'));
const events = (map, E, skip) => evKeys(map).filter((k) => !skip.has(k))
  .map((k) => `    on${k}?: Handler<${map}['${k}'], ${E}> | undefined;`);
const extraEvents = (el) => {
  if (el === 'HTMLAudioElement' || el === 'HTMLVideoElement') {
    const media = events('HTMLMediaElementEventMap', el, baseEvents);
    if (el === 'HTMLAudioElement') return media;
    return media.concat(events('HTMLVideoElementEventMap', el, new Set([...baseEvents, ...evKeys('HTMLMediaElementEventMap')])));
  }
  return [];
};

// aria-* attribute names from ARIAMixin: ariaHasPopup -> aria-haspopup; element-reference properties
// (ariaLabelledByElements, ariaActiveDescendantElement) map to their ID-reference attributes.
const ariaNames = typeOf('ARIAMixin').getProperties().map((p) => p.name).filter((n) => n.startsWith('aria'))
  .map((n) => 'aria-' + n.slice(4).replace(/Elements?$/, '').toLowerCase()).sort();
const VOID = new Set(['area', 'br', 'col', 'hr', 'img', 'input', 'source', 'track', 'wbr', 'textarea']);
const base = typeOf('HTMLElement');
const baseNames = new Set(base.getProperties().map((p) => p.name));
const banned = (msg) => `{ readonly ${JSON.stringify('jasno: ' + msg)}: never } | undefined`;
const lines = [];
lines.push('  /** Props every h.* element accepts: class, style, data-/aria- attributes, lowercase on<event> handlers and writable HTMLElement properties (value or Read<T>). */');
lines.push('  export interface GlobalProps<E extends HTMLElement> {');
lines.push('    class?: string | Read<string | undefined> | { readonly [name: string]: boolean | Read<boolean> } | undefined;');
lines.push('    style?: StyleProps | undefined;');
lines.push('    [attribute: `data-${string}`]: MaybeRead<string | number | boolean | null | undefined>;');
for (const a of ariaNames) lines.push(`    '${a}'?: MaybeRead<string | number | boolean | null | undefined> | undefined;`);
lines.push(`    className?: ${banned("use class, not className")};`);
lines.push(`    for?: ${banned("use htmlFor (the DOM property), not for")};`);
lines.push(`    ref?: ${banned("no refs: keep the element, const input = h.input(...)")};`);
lines.push(`    key?: ${banned("keys go in each(list, { key, render })")};`);
lines.push(`    children?: ${banned("pass children after props: h.div(null, a, b)")};`);
lines.push(`    innerHTML?: ${banned("not allowed (Trusted Types); build nodes with h.* and text children")};`);
lines.push(...events('HTMLElementEventMap', 'E', new Set()));
for (const p of base.getProperties().filter(keep)) lines.push(`    ${p.name}?: MaybeRead<${propType(p, 'E')}> | undefined;`);
lines.push('  }');

const table = [];
const done = new Set();
let tags = 0;
for (const tagSym of typeOf('HTMLElementTagNameMap').getProperties()) {
  const tag = tagSym.name;
  if (EXCLUDED_TAGS.has(tag)) continue;
  const elType = c.getTypeOfSymbol(tagSym);
  const el = c.typeToString(elType);
  const iface = `${el}Props`;
  tags++;
  table.push(VOID.has(tag)
    ? `    ${tag}: (props: ${iface} | null) => ${el};`
    : `    ${tag}: (props: ${iface} | null, ...children: Child[]) => ${el};`);
  if (done.has(iface)) continue;
  done.add(iface);
  const own = elType.getProperties().filter((p) => !baseNames.has(p.name) && keep(p))
    .map((p) => el === 'HTMLDialogElement' && p.name === 'open'
      ? `    open?: ${banned('open makes a NON-modal dialog; call el.showModal() in a handler and el.close() to close')};`
      : `    ${p.name}?: MaybeRead<${propType(p, el)}> | undefined;`);
  const body = [...own, ...extraEvents(el)];
  lines.push(`  /** Props for h.${tag}${el === 'HTMLElement' ? ' and every other tag whose element is a plain HTMLElement' : ''} (${el}). */`);
  lines.push(`  export interface ${iface} extends GlobalProps<${el}> {${body.length ? '\n' + body.join('\n') + '\n  ' : ''}}`);
}
lines.push('  /** The tag functions behind h: h.div(props | null, ...children) creates and returns the real element; void elements (input, img, br, ...) and textarea take no children. */');
lines.push('  export interface H {');
lines.push(...table);
lines.push('  }');

const target = process.argv[2];
const START = '  // <generated:elements>';
const END = '  // </generated:elements>';
const src = fs.readFileSync(target, 'utf8');
const a = src.indexOf(START), b = src.indexOf(END);
if (a < 0 || b < a) throw new Error('markers not found in ' + target);
const header = `${START} from lib.dom.d.ts (TypeScript 7.0.2) by tools/gen-elements.cjs (v2); do not edit by hand\n`;
fs.writeFileSync(target, src.slice(0, a) + header + lines.join('\n') + '\n' + src.slice(b));
console.log(JSON.stringify({ tags, interfaces: done.size, lines: lines.length }));
