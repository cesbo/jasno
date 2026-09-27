// jasno check's AST rules (design.md (e) check 5, 6) over the TypeScript 7 API's syntax tree. The enums come from
// the project's own TypeScript at run time (SyntaxKind numbers are not TS 5's).
import { dirname, join, resolve, sep } from 'node:path';
import type { Checker, Type } from 'typescript/unstable/sync';
import type { Node, SourceFile } from 'typescript/unstable/ast';
import { lineCol, type Problem } from './report.ts';

type AstModule = typeof import('typescript/unstable/ast');
/** Loose view of a syntax node: the rules read kind-specific properties (expression, name, arguments, ...). */
type N = Node & { [key: string]: any };

export interface FileContext {
  file: string;
  root: string;
  text: string;
  browser: boolean;
  entry: boolean;
}

export interface CssTemplate { file: string; text: string; offset: number; content: string; classes: ReadonlySet<string> }

export interface FileResult { problems: Problem[]; css: CssTemplate[] }

const INTERACTIVE_TAGS = new Set(['button', 'a', 'input', 'select', 'textarea', 'summary']);
/** A declaration in TypeScript's DOM lib: the name is the browser global, not a local of the same name. */
const DOM_LIB = /[\\/]lib\.dom(\.[\w-]+)?\.d\.ts$/;

/** `/// <reference types="node" />` in the file header (NODE_TYPES_IN_BROWSER_CODE); also runs on .d.ts files. */
export function referenceRule(sf: SourceFile, ctx: FileContext): Problem[] {
  const first = (sf.statements as unknown as N[])[0];
  const header = ctx.text.slice(0, first ? first.getStart(sf) : ctx.text.length);
  return [...header.matchAll(/^[ \t]*\/\/\/\s*<reference\s+types\s*=\s*["']node["']/gm)].map((m) => ({
    code: 'NODE_TYPES_IN_BROWSER_CODE', severity: 'error' as const, file: ctx.file, ...lineCol(ctx.text, m.index + m[0].indexOf('/')),
    message: '/// <reference types="node" /> in a browser file gives every browser file Node globals (process, Buffer, setTimeout(): Timeout).',
    hint: 'Delete it; tests get Node types from tsconfig.test.json.',
  }));
}

export function fileRules(sf: SourceFile, ctx: FileContext, ast: AstModule, checker?: Checker): FileResult {
  const K = ast.SyntaxKind;
  const problems: Problem[] = [];
  /** Findings that hold only when a name resolves to the DOM global (checked in one batch at the end). */
  const domChecks: { node: N; problem: Problem }[] = [];
  const css: CssTemplate[] = [];
  const classes = new Set<string>();
  const TS_CLASS_MODIFIERS = new Map<number, string>([
    [K.PrivateKeyword, 'private'], [K.ProtectedKeyword, 'protected'], [K.PublicKeyword, 'public'], [K.ReadonlyKeyword, 'readonly'],
    [K.AbstractKeyword, 'abstract'], [K.OverrideKeyword, 'override'], [K.DeclareKeyword, 'declare'],
  ]);
  const problem = (node: N, code: string, severity: Problem['severity'], message: string, hint?: string): Problem =>
    ({ code, severity, message, hint, file: ctx.file, ...lineCol(ctx.text, node.getStart(sf)) });
  const at = (node: N, code: string, severity: Problem['severity'], message: string, hint?: string): void => {
    problems.push(problem(node, code, severity, message, hint));
  };
  const ifDom = (node: N, p: Problem): void => { domChecks.push({ node, problem: p }); };
  const name = (node: N | undefined): string | undefined => (node && (node.kind === K.Identifier || node.kind === K.PrivateIdentifier) ? node.text as string : undefined);
  const isFunction = (node: N): boolean => node.kind === K.ArrowFunction || node.kind === K.FunctionExpression || node.kind === K.FunctionDeclaration
    || node.kind === K.MethodDeclaration || node.kind === K.GetAccessor || node.kind === K.SetAccessor || node.kind === K.Constructor;
  const isAsync = (fn: N): boolean => (fn.modifierFlags & ast.ModifierFlags.Async) !== 0;
  /** `a.b.c` as text for identifiers and property accesses, else undefined. */
  const dotted = (node: N | undefined): string | undefined => {
    if (!node) return undefined;
    if (node.kind === K.Identifier) return node.text as string;
    if (node.kind === K.MetaProperty) return `${node.keywordToken === K.ImportKeyword ? 'import' : 'new'}.${name(node.name)}`;
    if (node.kind === K.PropertyAccessExpression) { const l = dotted(node.expression); return l && `${l}.${name(node.name)}`; }
    return undefined;
  };
  const stringValue = (node: N | undefined): string | undefined =>
    node && (node.kind === K.StringLiteral || node.kind === K.NoSubstitutionTemplateLiteral) ? node.text as string : undefined;
  const unparen = (node: N): N => (node.kind === K.ParenthesizedExpression ? unparen(node.expression) : node);
  const contains = (outer: N, inner: N): boolean => inner.pos >= outer.pos && inner.end <= outer.end;

  // Local names bound to jasno's exports: effect, component, css, h and svg rules apply to those only.
  const jasno = new Map<string, string>();
  for (const st of sf.statements as unknown as N[]) {
    if (st.kind !== K.ImportDeclaration || stringValue(st.moduleSpecifier) !== 'jasno') continue;
    const bindings = st.importClause?.namedBindings as N | undefined;
    if (bindings?.kind === K.NamedImports) for (const el of bindings.elements as N[]) jasno.set(el.name.text, (el.propertyName ?? el.name).text);
  }
  const isJasno = (node: N | undefined, exported: string): boolean => !!node && node.kind === K.Identifier && jasno.get(node.text) === exported;

  /** An h.* or svg() props object: its on* entries are event handlers. */
  const isPropsObject = (obj: N | undefined): boolean => {
    const call = obj?.parent as N | undefined;
    if (!obj || obj.kind !== K.ObjectLiteralExpression || call?.kind !== K.CallExpression || !(call.arguments as N[]).includes(obj)) return false;
    const callee = call.expression as N;
    return (callee.kind === K.PropertyAccessExpression && isJasno(callee.expression, 'h')) || isJasno(callee, 'svg');
  };
  const EVENT_NAME = /^on[a-z]+$/;
  function isHandler(fn: N): boolean {
    const p = fn.parent as N | undefined;
    if (!p) return false;
    if (fn.kind === K.MethodDeclaration) return EVENT_NAME.test(name(fn.name) ?? '') && isPropsObject(p);
    if (p.kind === K.PropertyAssignment) return EVENT_NAME.test(name(p.name) ?? stringValue(p.name) ?? '') && isPropsObject(p.parent);
    if (p.kind === K.CallExpression && p.expression.kind === K.PropertyAccessExpression && name(p.expression.name) === 'addEventListener') return p.arguments?.[1] === fn;
    if (p.kind === K.BinaryExpression && p.operatorToken.kind === K.EqualsToken && p.right === fn && p.left.kind === K.PropertyAccessExpression) return EVENT_NAME.test(name(p.left.name) ?? '');
    return false;
  }

  /** CURRENT_TARGET_AFTER_AWAIT: a use of <param>.currentTarget that an await (or for await) precedes on some path. */
  function currentTargetRule(fn: N): void {
    const param = name((fn.parameters as N[])?.[0]?.name);
    if (!param || !fn.body) return;
    const awaits: N[] = [];
    const findAwait = (n: N): void => {
      if (n.kind === K.AwaitExpression || (n.kind === K.ForOfStatement && n.awaitModifier)) awaits.push(n);
      if (!isFunction(n)) n.forEachChild((c) => findAwait(c as N));
    };
    fn.body.forEachChild((c: Node) => findAwait(c as N));
    if (!awaits.length) return;
    /** An await inside a block that ends in return/throw precedes only what is inside that block. */
    const precedes = (a: N, use: N): boolean => {
      if (a.pos > use.pos) return false;
      for (let b = a.parent as N; b && b !== fn.body; b = b.parent as N) {
        if (b.kind === K.Block && !contains(b, use)) {
          const last = (b.statements as N[]).at(-1);
          return !(last && (last.kind === K.ReturnStatement || last.kind === K.ThrowStatement));
        }
      }
      return true;
    };
    const visitUse = (n: N): void => {
      if (n !== fn && isFunction(n) && (n.parameters as N[] | undefined)?.some((p) => name(p.name) === param)) return; // rebinds the name
      if (n.kind === K.PropertyAccessExpression && name(n.name) === 'currentTarget' && name(n.expression) === param && awaits.some((a) => precedes(a, n))) {
        at(n, 'CURRENT_TARGET_AFTER_AWAIT', 'error', `${param}.currentTarget after an await is null: the DOM clears it when the handler returns.`, `Read it before the first await: const el = ${param}.currentTarget;`);
      }
      n.forEachChild((c) => visitUse(c as N));
    };
    visitUse(fn.body);
  }

  /** ASYNC_IN_EFFECT: async work that runs during the effect run (callbacks it only installs do not count). */
  function asyncInEffect(fn: N): string | undefined {
    if (isAsync(fn)) return 'is async';
    const asyncNames = new Set<string>();
    const called = new Set<string>();
    let found: string | undefined;
    const run = (n: N): void => {
      if (found) return;
      if (n !== fn && isFunction(n)) {
        const p = n.parent as N;
        const iife = unparen(p).kind === K.CallExpression && unparen(p.expression ?? p) === n
          || (p.kind === K.ParenthesizedExpression && (p.parent as N)?.kind === K.CallExpression && unparen((p.parent as N).expression) === n);
        if (iife) { if (isAsync(n)) { found = 'runs an async function'; return; } }
        else {
          if (isAsync(n)) {
            if (n.kind === K.FunctionDeclaration && n.name) asyncNames.add(n.name.text);
            if (p.kind === K.VariableDeclaration && name(p.name)) asyncNames.add(name(p.name)!);
          }
          return; // installed, not run
        }
      }
      if (n.kind === K.CallExpression) {
        const callee = n.expression as N;
        if (dotted(callee) === 'fetch') { found = 'calls fetch'; return; }
        if (callee.kind === K.PropertyAccessExpression && name(callee.name) === 'then') { found = 'uses .then('; return; }
        if (callee.kind === K.Identifier) called.add(callee.text);
      }
      n.forEachChild((c) => run(c as N));
    };
    run(fn);
    if (!found && [...asyncNames].some((n) => called.has(n))) found = 'runs an async function';
    return found;
  }

  const visit = (node: N, fnDepth: number): void => {
    const k = node.kind;
    if (k === K.Decorator) at(node, 'NO_DECORATORS', 'error', 'Decorators pass tsc and the type stripper, then fail in V8 (no engine ships them).', 'Use a plain function call instead.');
    const member = k === K.PropertyDeclaration || k === K.MethodDeclaration || k === K.GetAccessor || k === K.SetAccessor || k === K.Constructor
      || (k === K.IndexSignature && ((node.parent as N)?.kind === K.ClassDeclaration || (node.parent as N)?.kind === K.ClassExpression));
    if (node.modifiers && member) {
      for (const m of node.modifiers as N[]) {
        if (m.kind === K.AccessorKeyword) at(m, 'NO_ACCESSOR', 'error', '`accessor` fields pass tsc and the type stripper, then fail in V8.', 'Write a #private field with a getter and setter.');
        const word = TS_CLASS_MODIFIERS.get(m.kind);
        if (word) at(m, 'NO_TS_CLASS_MODIFIER', 'error', `\`${word}\` is a TypeScript-only class modifier.`, 'Use a #private field (or drop the modifier); jasno code is erasable TypeScript.');
      }
    }
    if (k === K.VariableDeclarationList && ((node.flags & ast.NodeFlags.Using) !== 0)) {
      at(node, 'NO_USING', 'error', '`using` declarations are not supported (TS2318 has no location, and engines below the floor lack them).', 'Call the cleanup in try/finally, or return it from onMount.');
    }
    if (ctx.browser && !ctx.entry && fnDepth === 0 && (k === K.AwaitExpression || (k === K.ForOfStatement && node.awaitModifier))) {
      at(node, 'TLA_OUTSIDE_ENTRY', 'error', 'Top-level await outside the entry named in index.html (Safari < 27 supports it only partially there).', 'Move the await into a function, or into src/main.ts.');
    }
    if (ctx.browser && (k === K.ImportDeclaration || k === K.ExportDeclaration || k === K.ImportType || (k === K.CallExpression && node.expression.kind === K.ImportKeyword))) {
      const spec = stringValue(k === K.ImportType ? node.argument?.literal : k === K.CallExpression ? node.arguments?.[0] : node.moduleSpecifier);
      if (spec?.startsWith('node:')) at(node, 'NODE_TYPES_IN_BROWSER_CODE', 'error', `"${spec}" in a browser file: Node modules and their types do not exist in the browser.`, 'Keep Node code in tests and config files (the test program).');
    }
    if (k === K.NewExpression) {
      const callee = node.expression as N;
      const ctor = callee.kind === K.PropertyAccessExpression ? callee.name as N : callee;
      const ctorName = name(ctor);
      if (ctx.browser && (ctorName === 'Worker' || ctorName === 'SharedWorker')) ifDom(ctor, problem(node, 'WORKER_UNSUPPORTED', 'error', `new ${ctorName}(): import maps do not apply to workers, and jasno v1 has no worker story.`));
      if (ctx.browser && ctorName === 'URL' && node.arguments?.length >= 2) {
        const rel = stringValue(node.arguments[0]);
        if (rel && (rel.startsWith('./') || rel.startsWith('../')) && dotted(node.arguments[1]) === 'import.meta.url') {
          const target = resolve(dirname(ctx.file), rel);
          if (target.startsWith(join(ctx.root, 'src') + sep)) {
            at(node, 'ASSET_OUTSIDE_ASSETS', 'error', `new URL('${rel}', import.meta.url) points into src/; jasno dist publishes only modules there (under hashed names), so this URL 404s in production.`, `Put the file in assets/ and use '/assets/${rel.split('/').pop()}'.`);
          }
        }
      }
    }
    if (ctx.browser && k === K.BinaryExpression && (node.operatorToken.kind === K.EqualsToken || node.operatorToken.kind === K.PlusEqualsToken)) {
      const left = node.left as N;
      const prop = left.kind === K.PropertyAccessExpression ? name(left.name) : left.kind === K.ElementAccessExpression ? stringValue(left.argumentExpression) : undefined;
      if (prop === 'innerHTML' || prop === 'outerHTML' || prop === 'srcdoc') {
        at(left.kind === K.PropertyAccessExpression ? left.name : left, 'NO_HTML_SINK', 'error', `Assigning ${prop} is blocked by the production Trusted Types CSP.`, 'Build nodes with h.* (text children are escaped).');
      }
    }
    if (k === K.CallExpression) {
      const callee = dotted(node.expression);
      const method = node.expression.kind === K.PropertyAccessExpression ? node.expression.name as N : undefined;
      const methodName = name(method);
      if (ctx.browser) {
        if (methodName === 'insertAdjacentHTML' || callee === 'document.write' || callee === 'document.writeln') at(node.expression, 'NO_HTML_SINK', 'error', `${methodName === 'insertAdjacentHTML' ? 'insertAdjacentHTML' : callee}() is blocked by the production Trusted Types CSP.`, 'Build nodes with h.*.');
        if (method && (methodName === 'pushState' || methodName === 'replaceState')) {
          ifDom(method, problem(node.expression, 'USE_ROUTER', 'error', `${callee ?? `history.${methodName}`}() bypasses the router: its url, data, title and focus go stale.`, 'Use router.navigate(url, { replace }).'));
        }
        if (method && methodName === 'register' && node.expression.expression?.kind === K.PropertyAccessExpression && name(node.expression.expression.name) === 'serviceWorker') {
          ifDom(method, problem(node.expression, 'WORKER_UNSUPPORTED', 'error', 'serviceWorker.register(): import maps do not apply to workers, and jasno v1 has no worker story.'));
        }
      }
      if (isJasno(node.expression, 'component') && node.arguments?.length) {
        const fn = node.arguments[0] as N;
        if (fn.kind === K.ArrowFunction || (fn.kind === K.FunctionExpression && !fn.name)) {
          at(fn, 'ANONYMOUS_COMPONENT', 'warn', 'component() was given an anonymous function: owner paths and diagnostics show <anonymous>.', 'component(function Card(p: CardProps): Node { ... })');
        }
        if ((fn.kind === K.ArrowFunction || fn.kind === K.FunctionExpression) && !fn.type) {
          at(fn, 'COMPONENT_RETURN_TYPE', 'warn', 'Component function without a `: Node` return annotation: an inferred return type can make tsc report TS7022 far away (the route table).', 'component(function Card(p: CardProps): Node { ... })');
        }
      }
      if (isJasno(node.expression, 'effect') && node.arguments?.length && isFunction(node.arguments[0])) {
        const found = asyncInEffect(node.arguments[0]);
        if (found) at(node, 'ASYNC_IN_EFFECT', 'warn', `This effect ${found}: async work in an effect races and is not cancelled.`, 'Use resource({ params, loader }) for async data.');
      }
      // Interactive h.* tags with a string class: their classes count for FOCUS_STYLE_REMOVED.
      if (node.expression.kind === K.PropertyAccessExpression && isJasno(node.expression.expression, 'h') && INTERACTIVE_TAGS.has(name(node.expression.name) ?? '')) {
        const props = node.arguments?.[0] as N | undefined;
        if (props?.kind === K.ObjectLiteralExpression) {
          for (const p of props.properties as N[]) {
            if (p.kind === K.PropertyAssignment && (name(p.name) ?? stringValue(p.name)) === 'class') {
              for (const c of (stringValue(p.initializer) ?? '').split(/\s+/)) if (c) classes.add(c);
            }
          }
        }
      }
    }
    if (ctx.browser && k === K.PropertyAccessExpression && (name(node.name) === 'pathname' || name(node.name) === 'search')) {
      const obj = node.expression as N;
      const loc = obj.kind === K.Identifier ? obj : obj.kind === K.PropertyAccessExpression ? obj.name as N : undefined;
      if (name(loc) === 'location') {
        ifDom(loc!, problem(node, 'USE_ROUTER', 'warn', `${dotted(obj) ?? 'location'}.${name(node.name)} is read outside the router: it does not update your view.`, 'Read router.url() (a signal).'));
      }
    }
    if (k === K.TaggedTemplateExpression && isJasno(node.tag, 'css') && node.template.kind === K.NoSubstitutionTemplateLiteral) {
      const start = node.template.getStart(sf) + 1;
      css.push({ file: ctx.file, text: ctx.text, offset: start, content: ctx.text.slice(start, node.template.end - 1), classes });
    }
    if (isFunction(node) && isAsync(node) && isHandler(node)) currentTargetRule(node);
    // COMPONENT_NOT_WRAPPED: an exported PascalCase function returning Node.
    if ((k === K.FunctionDeclaration || k === K.VariableStatement) && (node.modifierFlags & ast.ModifierFlags.Export)) {
      const decls: [N | undefined, N | undefined][] = k === K.FunctionDeclaration ? [[node.name, node]] : (node.declarationList.declarations as N[]).map((d) => [d.name, d.initializer]);
      for (const [id, fn] of decls) {
        const n = name(id);
        if (n && /^[A-Z]/.test(n) && fn && (fn.kind === K.FunctionDeclaration || fn.kind === K.ArrowFunction || fn.kind === K.FunctionExpression) && fn.type && fn.type.getText(sf) === 'Node') {
          at(id!, 'COMPONENT_NOT_WRAPPED', 'warn', `${n} returns Node but is not wrapped in component(): it gets no owner, so its effects and cleanups leak into the caller.`, `export const ${n} = component(function ${n}(p: ${n}Props): Node { ... })`);
        }
      }
    }
    const inner = isFunction(node) ? fnDepth + 1 : fnDepth;
    node.forEachChild((c) => visit(c as N, inner));
  };

  if (ctx.browser) problems.push(...referenceRule(sf, ctx));
  visit(sf as N, 0);
  if (domChecks.length) {
    const symbols = checker ? checker.getSymbolAtLocation(domChecks.map((d) => d.node) as readonly Node[]) : undefined;
    domChecks.forEach((d, i) => {
      if (!symbols || symbols[i]?.declarations.some((decl) => DOM_LIB.test(decl.path))) problems.push(d.problem);
    });
  }
  return { problems, css };
}

/**
 * Type-aware rules, batched per file: one getTypeAtLocation(nodes[]) per file, signatures memoized by type id
 * (design.md (e) check 6). SIGNAL_IN_TEMPLATE / SIGNAL_COERCED key on any zero-parameter call signature, so Read
 * props count as well as signals (A02).
 */
export function typeRules(sf: SourceFile, ctx: FileContext, ast: AstModule, checker: Checker, componentSetup: boolean): Problem[] {
  const K = ast.SyntaxKind;
  const problems: Problem[] = [];
  const template: N[] = [];
  const coerced: N[] = [];
  const snapshots: N[] = [];
  const visit = (node: N, inSetup: boolean): void => {
    if (node.kind === K.TemplateExpression && node.parent?.kind !== K.TaggedTemplateExpression) for (const span of node.templateSpans as N[]) template.push(span.expression);
    if (node.kind === K.BinaryExpression && node.operatorToken.kind === K.PlusToken) {
      const l = node.left as N, r = node.right as N;
      if (l.kind === K.StringLiteral || l.kind === K.NoSubstitutionTemplateLiteral || l.kind === K.TemplateExpression) coerced.push(r);
      else if (r.kind === K.StringLiteral || r.kind === K.NoSubstitutionTemplateLiteral || r.kind === K.TemplateExpression) coerced.push(l);
    }
    if (node.kind === K.CallExpression && node.expression.kind === K.Identifier && node.expression.text === 'String' && node.arguments?.length === 1) coerced.push(node.arguments[0]);
    if (componentSetup && inSetup && node.kind === K.CallExpression && !node.arguments?.length) {
      const p = node.parent as N;
      if ((p.kind === K.CallExpression && (p.arguments as N[] | undefined)?.includes(node)) || (p.kind === K.PropertyAssignment && p.initializer === node)) snapshots.push(node);
    }
    const parent = node.parent as N | undefined;
    const isComponentFn = (node.kind === K.ArrowFunction || node.kind === K.FunctionExpression) && parent?.kind === K.CallExpression && parent.expression.kind === K.Identifier && parent.expression.text === 'component';
    const fn = node.kind === K.ArrowFunction || node.kind === K.FunctionExpression || node.kind === K.FunctionDeclaration || node.kind === K.MethodDeclaration;
    node.forEachChild((c) => visit(c as N, isComponentFn ? true : fn ? false : inSetup));
  };
  visit(sf as N, false);
  const candidates = [...template, ...coerced, ...snapshots.map((s) => s.expression as N)];
  if (!candidates.length) return problems;
  const types = checker.getTypeAtLocation(candidates);
  const memo = new Map<number, boolean>();
  const callable = (t: Type | undefined): boolean => {
    if (!t) return false;
    const id = (t as { id: number }).id;
    let v = memo.get(id);
    if (v === undefined) {
      v = checker.getSignaturesOfType(t, 0).some((s) => (s as { parameters: readonly unknown[] }).parameters.length === 0);
      memo.set(id, v);
    }
    return v;
  };
  const at = (node: N, code: string, severity: Problem['severity'], message: string, hint: string): void => {
    problems.push({ code, severity, message, hint, file: ctx.file, ...lineCol(ctx.text, node.getStart(sf)) });
  };
  template.forEach((e, i) => {
    if (callable(types[i])) at(e, 'SIGNAL_IN_TEMPLATE', 'error', `\`${e.getText(sf)}\` is a function (a signal or Read) inside a template literal: it prints its source, not its value.`, `Call it: \${${e.getText(sf)}()}, and wrap the whole string in a function to keep it live.`);
  });
  coerced.forEach((e, i) => {
    if (callable(types[template.length + i])) at(e, 'SIGNAL_COERCED', 'error', `\`${e.getText(sf)}\` is a function (a signal or Read) coerced to a string.`, `Call it: ${e.getText(sf)}(), inside a function to keep it live.`);
  });
  snapshots.forEach((call, i) => {
    const t = types[template.length + coerced.length + i];
    if (!t || !callable(t) || !/\b(Signal|WritableSignal|Read)</.test(checker.typeToString(t))) return;
    const ctxType = checker.getContextualType(call as Parameters<Checker['getContextualType']>[0]);
    if (ctxType && /MaybeRead</.test(checker.typeToString(ctxType))) {
      at(call, 'SNAPSHOT_TO_ACCESSOR', 'warn', `\`${call.getText(sf)}\` passes a snapshot where a live value is accepted: it never updates.`, `Pass ${call.expression.getText(sf)} itself (or () => ...).`);
    }
  });
  return problems;
}

// ------------------------------------------------ FOCUS_STYLE_REMOVED (ADR-33, ADR-24)

interface CssRule { selector: string; decls: { prop: string; value: string; offset: number }[] }

/** Rules of a static css`...` template, nesting flattened with `&` (comments blanked, offsets kept). */
export function cssRules(content: string): CssRule[] {
  const text = content.replace(/\/\*[\s\S]*?\*\//g, (c) => ' '.repeat(c.length));
  const out: CssRule[] = [];
  const block = (from: number, to: number, parent: string): void => {
    let i = from;
    let declStart = from;
    const rule: CssRule = { selector: parent, decls: [] };
    const flushDecls = (end: number): void => {
      for (const part of splitDecls(text, declStart, end)) {
        const colon = part.text.indexOf(':');
        if (colon > 0) rule.decls.push({ prop: part.text.slice(0, colon).trim().toLowerCase(), value: part.text.slice(colon + 1).trim().toLowerCase(), offset: part.offset + (part.text.length - part.text.trimStart().length) });
      }
    };
    while (i < to) {
      const open = text.indexOf('{', i);
      if (open < 0 || open >= to) break;
      // The selector starts after the last ';' or '}' before the brace.
      let s = open - 1;
      while (s >= declStart && text[s] !== ';' && text[s] !== '}') s--;
      flushDecls(s + 1);
      const selector = text.slice(s + 1, open).trim();
      const close = matching(text, open, to);
      const combined = selector.startsWith('@') ? parent : combine(parent, selector);
      block(open + 1, close, combined);
      i = close + 1;
      declStart = i;
    }
    flushDecls(to);
    if (parent && rule.decls.length) out.push(rule);
  };
  block(0, text.length, '');
  return out;
}

function matching(text: string, open: number, limit: number): number {
  let depth = 0;
  for (let i = open; i < limit; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  return limit;
}

function splitDecls(text: string, from: number, to: number): { text: string; offset: number }[] {
  const out: { text: string; offset: number }[] = [];
  let start = from;
  for (let i = from; i <= to; i++) {
    if (i === to || text[i] === ';') {
      if (text.slice(start, i).trim()) out.push({ text: text.slice(start, i), offset: start });
      start = i + 1;
    }
  }
  return out;
}

function combine(parent: string, selector: string): string {
  if (!parent) return selector;
  const parents = parent.split(',').map((s) => s.trim());
  return selector.split(',').map((s) => s.trim()).flatMap((s) => parents.map((p) => (s.includes('&') ? s.replaceAll('&', p) : `${p} ${s}`))).join(', ');
}

const removesOutline = (d: { prop: string; value: string }): boolean => {
  const v = d.value.replace(/\s*!important$/, '');
  return (d.prop === 'outline' && /^(none|0(px|em|rem)?)$/.test(v)) || (d.prop === 'all' && /^(unset|initial|revert|revert-layer)$/.test(v));
};

function reachesInteractive(selector: string, classes: ReadonlySet<string>): boolean {
  return selector.split(',').some((part) => {
    if (/:not\(\s*:focus-visible\s*\)/i.test(part)) return false; // hides the ring for mouse focus only; keyboard focus keeps it
    if (/(^|[\s>+~(])(button|a|input|select|textarea|summary)(?=$|[\s>+~.#:[)])/i.test(part)) return true;
    if (/\[\s*(tabindex|contenteditable)\b/i.test(part) || /(^|[\s>+~(])\*/.test(part) || /:focus/i.test(part)) return true;
    return [...part.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].some((m) => classes.has(m[1]!));
  });
}

/** Program-wide: warnings only when no css template anywhere shows focus with more than `outline: none`. */
export function focusStyleRule(templates: readonly CssTemplate[]): Problem[] {
  const parsed = templates.map((t) => ({ t, rules: cssRules(t.content) }));
  const showsFocus = parsed.some(({ rules }) => rules.some((r) => /:focus/i.test(r.selector) && r.decls.some((d) => !removesOutline(d))));
  if (showsFocus) return [];
  const out: Problem[] = [];
  for (const { t, rules } of parsed) {
    for (const r of rules) {
      if (!reachesInteractive(r.selector, t.classes)) continue;
      for (const d of r.decls) {
        if (!removesOutline(d)) continue;
        out.push({
          code: 'FOCUS_STYLE_REMOVED', severity: 'warn', file: t.file, ...lineCol(t.text, t.offset + d.offset),
          message: `\`${r.selector} { ${d.prop}: ${d.value} }\` removes the focus outline of interactive elements, and no css rule shows focus another way (WCAG 2.4.7).`,
          hint: 'Add a :focus-visible rule with an outline, box-shadow or border, or drop the reset.',
        });
      }
    }
  }
  return out;
}
