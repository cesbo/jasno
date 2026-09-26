// Types for the vendored alien-signals 3.2.1 system (flags are plain numbers: Mutable 1, Watching 2,
// RecursedCheck 4, Recursed 8, Dirty 16, Pending 32).
export interface ReactiveNode {
  deps?: Link | undefined;
  depsTail?: Link | undefined;
  subs?: Link | undefined;
  subsTail?: Link | undefined;
  flags: number;
}
export interface Link {
  version: number;
  dep: ReactiveNode;
  sub: ReactiveNode;
  prevSub: Link | undefined;
  nextSub: Link | undefined;
  prevDep: Link | undefined;
  nextDep: Link | undefined;
}
export declare function createReactiveSystem(hooks: {
  update(sub: ReactiveNode): boolean;
  notify(sub: ReactiveNode): void;
  unwatched(sub: ReactiveNode): void;
}): {
  link: (dep: ReactiveNode, sub: ReactiveNode, version: number) => void;
  unlink: (link: Link, sub?: ReactiveNode) => Link | undefined;
  propagate: (link: Link, innerWrite: boolean) => void;
  checkDirty: (link: Link, sub: ReactiveNode) => boolean;
  shallowPropagate: (link: Link) => void;
};
