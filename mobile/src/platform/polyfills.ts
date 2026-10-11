/**
 * structuredClone fallback for older Hermes. Handles the shapes the game
 * state actually contains: plain objects, arrays, Set, Map, and primitives.
 * (Card defs are shared by reference on purpose — matches structuredClone
 * semantics closely enough for this engine's use.)
 */
export function installPolyfills(): void {
  const g = globalThis as { structuredClone?: unknown };
  if (typeof g.structuredClone === 'function') return;

  const clone = (v: unknown, seen: Map<object, unknown>): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v as object)) return seen.get(v as object);
    if (v instanceof Set) {
      const s = new Set<unknown>();
      seen.set(v, s);
      for (const x of v) s.add(clone(x, seen));
      return s;
    }
    if (v instanceof Map) {
      const m = new Map<unknown, unknown>();
      seen.set(v, m);
      for (const [k, x] of v) m.set(k, clone(x, seen));
      return m;
    }
    if (Array.isArray(v)) {
      const a: unknown[] = [];
      seen.set(v, a);
      for (const x of v) a.push(clone(x, seen));
      return a;
    }
    const o: Record<string, unknown> = {};
    seen.set(v as object, o);
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      o[k] = clone(x, seen);
    }
    return o;
  };

  g.structuredClone = <T>(v: T): T => clone(v, new Map()) as T;
}
