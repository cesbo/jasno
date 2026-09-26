// Production build: no prop table (UNKNOWN_PROP is a dev check); every key is applied as the element property.
export const GLOBAL_PROPS: ReadonlySet<string> = new Set();
export const TAG_PROPS: Readonly<Record<string, readonly string[]>> = {};
export const FORBIDDEN_PROPS: Readonly<Record<string, string>> = {};
