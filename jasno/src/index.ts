// jasno: public runtime API (types: jasno.d.ts). Everything else is internal.
import { DEV } from '#dev';
import { findNode, hooks, liveNodes, nameOf, nodeOf, ownerPath, preview, whyOf, type RNode } from './core.ts';
import { clearDiagnostics, diagnostics } from './diag.ts';
import { describeElement } from './dom.ts';

export {
  computed, createContext, createRoot, effect, flush, linkedSignal, onMount, provide, selector, signal, untracked, useContext,
} from './core.ts';
export { bindChecked, bindNumber, bindValue, catchError, component, css, each, h, match, mount, show, svg } from './dom.ts';
export { optimistic, resource } from './resource.ts';

export const version = '0.4.0';

// window.__JASNO__ (design.md (d)); graph() and why() are minimal in the prototype.
if (DEV && typeof globalThis === 'object') {
  const graphNode = (n: RNode) => {
    const owner = (n as { owner?: unknown; parent?: unknown }).owner ?? (n as { parent?: unknown }).parent;
    const value = 'value' in n && n.kind !== 'binding' ? preview((n as { value: unknown }).value) : undefined;
    return { id: n.id, kind: n.kind, name: nameOf(n), ownerPath: ownerPath(owner as never), value, runs: (n as { total?: number }).total };
  };
  const edgesOf = (n: RNode, dir: 'deps' | 'subs') => {
    const out: RNode[] = [];
    for (let l = n[dir]; l; l = dir === 'deps' ? l.nextDep : l.nextSub) out.push((dir === 'deps' ? l.dep : l.sub) as RNode);
    return out;
  };
  const resolve = (t: number | string | Function) => (typeof t === 'function' ? nodeOf(t) : findNode(t));
  (globalThis as Record<string, unknown>).__JASNO__ = {
    version,
    diagnostics,
    clearDiagnostics,
    graph(filter: { ownerPath?: string; name?: string } = {}) {
      const nodes = liveNodes().map(graphNode)
        .filter((g) => (!filter.ownerPath || g.ownerPath.startsWith(filter.ownerPath)) && (!filter.name || g.name === filter.name));
      const ids = new Set(nodes.map((g) => g.id));
      const edges = liveNodes().filter((n) => ids.has(n.id))
        .flatMap((n) => edgesOf(n, 'deps').map((d) => ({ consumer: n.id, producer: d.id })));
      return { nodes, edges };
    },
    inspect(target: number | string | Node) {
      if (typeof target === 'object' && typeof Node === 'function' && target instanceof Node) {
        return { kind: 'element', ...describeElement(target), sources: [], observers: [] };
      }
      const n = resolve(target as number | string);
      if (!n) return undefined;
      return { ...graphNode(n), sources: edgesOf(n, 'deps').map(nameOf), observers: edgesOf(n, 'subs').map(nameOf) };
    },
    why(target: number | string) {
      const n = resolve(target);
      return n && whyOf(n);
    },
    router: () => hooks.routerInfo?.(),
  };
}
