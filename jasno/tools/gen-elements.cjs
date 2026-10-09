// Generates the closed element prop interfaces and the `H` tag table for jasno.elements.d.ts from lib.dom.d.ts.
// Usage: node tools/gen-elements.cjs ../design/jasno.elements.d.ts   (rewrites the region between the <generated:elements> markers)
// Uses TypeScript 7's unstable API (typescript/unstable/sync, as jasno check does) and its own lib files, so the
// prop set is what users compile against. Re-run for every lib.dom update.
// v2 changes: live props may return undefined (MaybeRead<X | undefined>); aria-* keys are a closed set derived
// from lib.dom's ARIAMixin (a typo is TS2353; tsc offers no 'Did you mean' for quoted, hyphenated keys); void
// elements and textarea take no children; dialog.open is message-typed (it makes a NON-modal dialog; modals use
// showModal()).
const { API, SignatureKind, SymbolFlags } = require('typescript/unstable/sync');
const { SyntaxKind } = require('typescript/unstable/ast');
const fs = require('fs');
const os = require('os');
const path = require('path');

// The API opens projects from a tsconfig on disk: an empty module with only the es2025 and dom libs.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jasno-gen-elements-'));
fs.writeFileSync(path.join(dir, 'x.ts'), 'export {};\n');
fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { lib: ['es2025', 'dom'], strict: true, noEmit: true, types: [] }, files: ['x.ts'] }));
const api = new API({ cwd: dir });
const c = api.updateSnapshot({ openProjects: [path.join(dir, 'tsconfig.json')] }).getProject(path.join(dir, 'tsconfig.json')).checker;
const typeOf = (name) => c.getDeclaredTypeOfSymbol(c.resolveName(name, SymbolFlags.Type, undefined, false));
const propsOf = (type) => c.getPropertiesOfType(type);
const declsOf = (p) => p.declarations.map((d) => d.resolve());

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

// Content attributes whose DOM property is a readonly element reference: the prop is the attribute, an id (B15.4).
// lib.dom cannot tell them apart: label, legend and option also have a readonly form property but no form attribute.
const ID_ATTRS = { HTMLInputElement: ['list', 'form'], HTMLButtonElement: ['form'], HTMLFieldSetElement: ['form'],
  HTMLOutputElement: ['form'], HTMLSelectElement: ['form'], HTMLTextAreaElement: ['form'] };

const isReadonly = (p) => {
  const decls = declsOf(p);
  return decls.every((d) =>
    (d.kind === SyntaxKind.PropertySignature && d.modifiers?.some((m) => m.kind === SyntaxKind.ReadonlyKeyword)) ||
    (d.kind === SyntaxKind.GetAccessor && !decls.some((x) => x.kind === SyntaxKind.SetAccessor)));
};
const isDeprecated = (p) => p.getJsDocTags(c).some((t) => t.name === 'deprecated');
const keep = (p) => {
  const n = p.name;
  if (OMIT.has(n) || n.startsWith('on') || n.startsWith('__') || /^aria[A-Z]/.test(n)) return false;
  if (isReadonly(p) || isDeprecated(p)) return false;
  return !c.getSignaturesOfType(c.getNonNullableType(c.getTypeOfSymbol(p)), SignatureKind.Call).length;
};
// Setter type when it differs from the getter (e.g. HTMLOutputElement.htmlFor: get DOMTokenList, set string).
const propType = (p, owner) => {
  const setter = declsOf(p).find((d) => d.kind === SyntaxKind.SetAccessor);
  if (setter && setter.parameters[0]?.type) {
    const setT = c.typeToString(c.getTypeFromTypeNode(setter.parameters[0].type));
    const getT = c.typeToString(c.getTypeOfSymbol(p));
    if (setT !== getT) return setT + ' | undefined';
  }
  return `${owner}['${p.name}'] | undefined`;
};

const evKeys = (m) => propsOf(typeOf(m)).map((p) => p.name);
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
const ariaNames = propsOf(typeOf('ARIAMixin')).map((p) => p.name).filter((n) => n.startsWith('aria'))
  .map((n) => 'aria-' + n.slice(4).replace(/Elements?$/, '').toLowerCase()).sort();
const VOID = new Set(['area', 'br', 'col', 'hr', 'img', 'input', 'source', 'track', 'wbr', 'textarea']);
const base = typeOf('HTMLElement');
const baseNames = new Set(propsOf(base).map((p) => p.name));
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
for (const p of propsOf(base).filter(keep)) lines.push(`    ${p.name}?: MaybeRead<${propType(p, 'E')}> | undefined;`);
lines.push('  }');

const table = [];
const done = new Set();
let tags = 0;
for (const tagSym of propsOf(typeOf('HTMLElementTagNameMap'))) {
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
  const own = propsOf(elType).filter((p) => !baseNames.has(p.name) && keep(p))
    .map((p) => el === 'HTMLDialogElement' && p.name === 'open'
      ? `    open?: ${banned('open makes a NON-modal dialog; call el.showModal() in a handler and el.close() to close')};`
      : `    ${p.name}?: MaybeRead<${propType(p, el)}> | undefined;`)
    .concat((ID_ATTRS[el] ?? []).map((a) => `    ${a}?: MaybeRead<string | undefined> | undefined;`));
  const body = [...own, ...extraEvents(el)];
  lines.push(`  /** Props for h.${tag}${el === 'HTMLElement' ? ' and every other tag whose element is a plain HTMLElement' : ''} (${el}). */`);
  lines.push(`  export interface ${iface} extends GlobalProps<${el}> {${body.length ? '\n' + body.join('\n') + '\n  ' : ''}}`);
}
lines.push('  /** The tag functions behind h: h.div(props | null, ...children) creates and returns the real element; void elements (input, img, br, ...) and textarea take no children. */');
lines.push('  export interface H {');
lines.push(...table);
lines.push('  }');
api.close();
fs.rmSync(dir, { recursive: true });

const target = process.argv[2];
const START = '  // <generated:elements>';
const END = '  // </generated:elements>';
const src = fs.readFileSync(target, 'utf8');
const a = src.indexOf(START), b = src.indexOf(END);
if (a < 0 || b < a) throw new Error('markers not found in ' + target);
const header = `${START} from lib.dom.d.ts (TypeScript 7.0.2) by tools/gen-elements.cjs; do not edit by hand\n`;
fs.writeFileSync(target, src.slice(0, a) + header + lines.join('\n') + '\n' + src.slice(b));
console.log(JSON.stringify({ tags, interfaces: done.size, lines: lines.length }));
