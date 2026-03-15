import { SelectorLens, SelectorLensOf, MutatorLens, MutatorLensOf, ApplierLens, ApplierLensOf, PathLens } from "./types";
import { Compare, Contains, Equals, TypeOf, LensNav, DeepReadonly, LensPathSegment } from "../../types";

//#region - Public API

export namespace Lens {
    export const get = <D, R>(data: D, lens: ($: SelectorLens<D>) => SelectorLensOf<R>): R => {
        const proxy = createProxy({ value: data, isEach: false, path: [], filters: [] });
        const result = lens(proxy);
        return (result as any)[LENS].value;
    };

    export type Context = { path: LensPathSegment[]; index: number; count: number };

    export const mutate = <D, R>(data: D, lens: ($: MutatorLens<D>) => MutatorLensOf<R>, value: R | ((prev: R, index: number, context: Lens.Context) => R)): void => {
        const proxy = createProxy({ value: data, isEach: false, path: [], filters: [] });
        const result = lens(proxy as any);
        const { path } = (result as any)[LENS] as LensState;
        if (path.length === 0) return; // can't replace root by reference
        const updater = typeof value === "function" ? (value as (prev: R, index: number, context: Lens.Context) => R) : () => value;
        doMutate(data, path, 0, updater as any, { path: [], index: 0, count: 1 });
    };

    export const apply = <D, R>(data: D, lens: ($: ApplierLens<D>) => ApplierLensOf<R>, value: R | ((prev: DeepReadonly<R>, index: number, context: Lens.Context) => R)): D => {
        const proxy = createProxy({ value: data, isEach: false, path: [], filters: [] });
        const result = lens(proxy as any);
        const { path } = (result as any)[LENS] as LensState;
        const updater = typeof value === "function" ? (value as (prev: R, index: number, context: Lens.Context) => R) : () => value;
        if (path.length === 0) return updater(data as any, 0, { path: [], index: 0, count: 1 }) as any;
        return doApply(data, path, 0, updater as any, { path: [], index: 0, count: 1 });
    };

    export const path = <D>(lens: ($: PathLens<D>) => PathLens<any>): LensPathSegment[] => {
        const proxy = createProxy({ value: undefined, isEach: false, path: [], filters: [] });
        const result = lens(proxy as any);
        const steps = ((result as any)[LENS] as LensState).path;
        return steps.map((step) => {
            switch (step.type) {
                case "prop":
                    return seg.fromPropStep(step.key);
                case "custom":
                    return seg.acc(step.prop, ...step.args.map(String));
                default:
                    throw new Error(`Unexpected step type in PathLens: ${step.type}`);
            }
        });
    };
}

//#endregion

//#region - Symbols

const LENS = Symbol("lens");
const PRED = Symbol("pred");

type FilterOp = { type: "where"; predFn: Function } | { type: "filter"; fn: Function } | { type: "slice"; start: number; end?: number } | { type: "sort"; args: any[] };

type PathStep =
    | { type: "prop"; key: string | number }
    | { type: "at"; index: number; filters?: FilterOp[] }
    | { type: "each"; filters?: FilterOp[]; callback?: Function }
    | { type: "mapGet"; key: unknown }
    | { type: "custom"; prop: string; args: unknown[] };

type LensState = { value: unknown; isEach: boolean; path: PathStep[]; filters: FilterOp[] };

//#endregion

//#region - Shared helpers

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compare(a: unknown, b: unknown): number | null {
    // 1. Left-side Compare symbol
    if (a != null && typeof a === "object" && Compare in a) {
        const result = (a as any)[Compare](b);
        if (result !== null && !isNaN(result)) return result;
    }
    // 2. Right-side Compare symbol (flipped sign)
    if (b != null && typeof b === "object" && Compare in b) {
        const result = (b as any)[Compare](a);
        if (result !== null && !isNaN(result)) return -result;
    }
    // 3. Numeric comparison
    if (typeof a === "number" && typeof b === "number") return a - b;
    if (typeof a === "bigint" && typeof b === "bigint") return Number(a - b);
    // 4. String comparison with natural collation
    if (typeof a === "string" && typeof b === "string") return collator.compare(a, b);
    // 5. Incomparable types
    return null;
}

function performEquality(a: unknown, b: unknown): boolean {
    // 1. Left-side Equals symbol
    if (a != null && typeof a === "object" && Equals in a) {
        const result = (a as any)[Equals](b);
        if (result !== null) return result;
    }
    // 2. Right-side Equals symbol
    if (b != null && typeof b === "object" && Equals in b) {
        const result = (b as any)[Equals](a);
        if (result !== null) return result;
    }
    // 3. Strict equality fallback
    return a === b;
}

function resolveTypeOf(value: unknown): string {
    if (value === null) return "nullish/null";
    if (value === undefined) return "nullish/undefined";
    switch (typeof value) {
        case "number":
            return "number/native";
        case "bigint":
            return "number/bigint";
        case "boolean":
            return "boolean";
        case "string":
            return "string";
        case "symbol":
            return "symbol";
        case "function":
            return "function";
    }
    // Check custom TypeOf symbol first
    if (typeof (value as any)[TypeOf] === "function") {
        const custom = (value as any)[TypeOf]();
        if (typeof custom === "string") return custom;
    }
    if (Array.isArray(value)) return "array";
    if (value instanceof Date) return "date";
    if (value instanceof Set) return "set";
    if (value instanceof Map) return "map";
    if (value instanceof RegExp) return "regexp";
    if (value instanceof Promise) return "promise";
    if (value instanceof Error) return "error";
    const tag = (value as any)[Symbol.toStringTag];
    if (typeof tag === "string") return tag.toLowerCase();
    return "object";
}

function convertToString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    switch (typeof value) {
        case "string":
            return value;
        case "number":
        case "bigint":
            return value.toString();
        case "boolean":
            return null;
    }
    if (Array.isArray(value)) return null;
    if (typeof (value as any).toString === "function" && (value as any).toString !== Object.prototype.toString) {
        return (value as any).toString();
    }
    return null;
}

export function sortCompare(a: unknown, b: unknown): number {
    // 1. Compare symbol / native types
    const cmp = compare(a, b);
    if (cmp !== null) return cmp;

    // 2. Numeric coercion
    const numA = Number(a);
    const numB = Number(b);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;

    // 3. String fallback
    return collator.compare(String(a), String(b));
}

/** If arg is a LENS proxy, extract its value. Otherwise return as-is. */
const unwrap = (arg: unknown): unknown => {
    const lens = typeof arg === "function" ? (arg as any)[LENS] : undefined;
    return lens ? lens.value : arg;
};

//#endregion

//#region - Operator table

const OPS: Record<string, (subject: any, operand: any, operand2?: any) => boolean> = {
    "=": (s, o) => performEquality(s, o),
    "==": (s, o) => s == o,
    ">": (s, o) => {
        const c = compare(s, o);
        return c !== null && c > 0;
    },
    "<": (s, o) => {
        const c = compare(s, o);
        return c !== null && c < 0;
    },
    ">=": (s, o) => {
        const c = compare(s, o);
        return c !== null && c >= 0;
    },
    "<=": (s, o) => {
        const c = compare(s, o);
        return c !== null && c <= 0;
    },
    "%": (s, o) => {
        const a = convertToString(s),
            b = convertToString(o);
        return a !== null && b !== null && a.includes(b);
    },
    "%^": (s, o) => {
        const a = convertToString(s),
            b = convertToString(o);
        return a !== null && b !== null && a.toLowerCase().includes(b.toLowerCase());
    },
    "%_": (s, o) => {
        const a = convertToString(s),
            b = convertToString(o);
        return a !== null && b !== null && a.startsWith(b);
    },
    "%^_": (s, o) => {
        const a = convertToString(s),
            b = convertToString(o);
        return a !== null && b !== null && a.toLowerCase().startsWith(b.toLowerCase());
    },
    "_%": (s, o) => {
        const a = convertToString(s),
            b = convertToString(o);
        return a !== null && b !== null && a.endsWith(b);
    },
    "_%^": (s, o) => {
        const a = convertToString(s),
            b = convertToString(o);
        return a !== null && b !== null && a.toLowerCase().endsWith(b.toLowerCase());
    },
    "~": (s, o) => {
        const str = convertToString(s);
        if (str === null) return false;
        try {
            return (o instanceof RegExp ? o : new RegExp(o)).test(str);
        } catch {
            return false;
        }
    },
    "#": (s, o) => (s != null && typeof s === "object" && Contains in s ? (s as any)[Contains](o) : Array.isArray(s) ? s.includes(o) : s instanceof Set ? s.has(o) : false),
    ":": (s, o) => resolveTypeOf(s).startsWith(String(o)),
    "><": (s, lo, hi) => {
        const ord = compare(lo, hi);
        if (ord === null) return false;
        const [l, h] = ord <= 0 ? [lo, hi] : [hi, lo];
        const cL = compare(s, l);
        const cH = compare(s, h);
        return cL !== null && cH !== null && cL > 0 && cH < 0;
    },
    ">=<": (s, lo, hi) => {
        const ord = compare(lo, hi);
        if (ord === null) return false;
        const [l, h] = ord <= 0 ? [lo, hi] : [hi, lo];
        const cL = compare(s, l);
        const cH = compare(s, h);
        return cL !== null && cH !== null && cL >= 0 && cH <= 0;
    },
};

//#endregion

//#region - Predicate evaluation

function evalPredicate(pred: any): boolean {
    // PredicateResult pass-through
    if (pred != null && typeof pred === "object" && PRED in pred) return (pred as any)[PRED];

    const tuple = pred as unknown[];

    const unwrap = (v: unknown): unknown => {
        const state = (v as any)?.[LENS] as LensState | undefined;
        return state !== undefined ? state.value : v;
    };

    // Arity 2 — unary
    if (tuple.length === 2) {
        const val = unwrap(tuple[0]);
        return tuple[1] === "?" ? !!val : !val;
    }

    const subject = unwrap(tuple[0]);
    const rawOp = tuple[1] as string;

    // Parse operator: !prefix, |/& suffix
    let negate = false;
    let mode: "single" | "any" | "all" = "single";
    let base = rawOp;

    if (base.startsWith("!")) {
        negate = true;
        base = base.slice(1);
    }
    if (base.endsWith("|")) {
        mode = "any";
        base = base.slice(0, -1);
    } else if (base.endsWith("&")) {
        mode = "all";
        base = base.slice(0, -1);
    }

    const op = OPS[base];
    if (!op) return false;

    let result: boolean;

    if (tuple.length === 4) {
        // Range op — two operands
        result = op(subject, unwrap(tuple[2]), unwrap(tuple[3]));
    } else if (mode === "single") {
        result = op(subject, unwrap(tuple[2]));
    } else {
        // any-of or all-of — operand is an array
        const operands = tuple[2] as unknown[];
        const method = mode === "any" ? "some" : "every";
        result = operands[method]((o: unknown) => op(subject, unwrap(o)));
    }

    return negate ? !result : result;
}

//#endregion

//#region - Proxy factory

function createProxy(state: LensState): any {
    const { value, isEach, path, filters } = state;

    // Transform value without recording a path step (read-only ops: size, length, keys, values, has, transform)
    const apply = (fn: (v: any) => unknown): any => createProxy({ value: isEach ? (value as any[]).map(fn) : fn(value), isEach, path, filters: [] });

    // Transform value AND record a path step (navigational ops used by mutate/apply)
    const nav = (fn: (v: any) => unknown, s: PathStep): any => createProxy({ value: isEach ? (value as any[]).map(fn) : fn(value), isEach, path: [...path, s], filters: [] });

    // Fold current filters into a path step (only when there are pending filters)
    const foldFilters = (): FilterOp[] | undefined => (filters.length ? [...filters] : undefined);

    const handler: ProxyHandler<Function> = {
        // $("key") / $(index) — property/index access (supports negative indices on arrays)
        apply(_target, _thisArg, args) {
            const key = unwrap(args[0]);
            if (typeof key === "number" && key < 0) {
                return createProxy({
                    value: isEach ? (value as any[]).map((v: any) => v?.[v.length + key]) : (value as any)?.[(value as any[]).length + key],
                    isEach,
                    path: [...path, { type: "at" as const, index: key, filters: foldFilters() }],
                    filters: [],
                });
            }
            return nav((v: any) => (v == null ? undefined : v[key as string | number]), { type: "prop", key: key as string | number });
        },

        get(_target, prop) {
            // Internal state extraction
            if (prop === LENS) return state;

            switch (prop) {
                //#region - Universal
                case "transform":
                    return (fn: (v: any) => any) => apply(fn);
                //#endregion

                //#region - Size / Length
                case "size":
                    return () =>
                        apply((v: any) => {
                            if (v == null) return 0;
                            if (typeof v === "string" || Array.isArray(v)) return v.length;
                            if (v instanceof Map || v instanceof Set) return v.size;
                            if (typeof v === "object") return Object.keys(v).length;
                            return 0;
                        });
                case "length":
                    return () => apply((v: any) => v?.length ?? 0);
                //#endregion

                //#region - Array accessors
                case "at":
                    return (rawIndex: number) => {
                        const index = unwrap(rawIndex) as number;
                        return createProxy({
                            value: isEach ? (value as any[]).map((v: any) => v?.[index < 0 ? v.length + index : index]) : (value as any)?.[index < 0 ? (value as any[]).length + index : index],
                            isEach,
                            path: [...path, { type: "at" as const, index, filters: foldFilters() }],
                            filters: [],
                        });
                    };
                case "each":
                    return (callback?: Function) => {
                        const filters = foldFilters();
                        if (callback) {
                            const arr = isEach ? (value as any[]).flat(1) : (value as any[]);
                            const mapped = (arr ?? []).map((item: any) => {
                                const elProxy = createProxy({ value: item, isEach: false, path: [], filters: [] });
                                const result = callback(elProxy);
                                const inner = (result as any)[LENS];
                                return inner.isEach ? inner.value : [inner.value];
                            }).flat(1);
                            return createProxy({
                                value: mapped,
                                isEach: true,
                                path: [...path, { type: "each" as const, filters, callback }],
                                filters: [],
                            });
                        }
                        const nextPath = [...path, { type: "each" as const, filters }];
                        if (isEach) return createProxy({ value: (value as any[]).flat(1), isEach: true, path: nextPath, filters: [] });
                        return createProxy({ value, isEach: true, path: nextPath, filters: [] });
                    };
                //#endregion

                //#region - Object / Map accessors
                case "keys":
                    return () =>
                        apply((v: any) => {
                            if (v instanceof Map) return [...v.keys()];
                            if (v != null && typeof v === "object") return Object.keys(v);
                            return [];
                        });
                case "values":
                    return () =>
                        apply((v: any) => {
                            if (v instanceof Map) return [...v.values()];
                            if (v != null && typeof v === "object") return Object.values(v);
                            return [];
                        });
                case "entries":
                    return () =>
                        apply((v: any) => {
                            if (v instanceof Map) return [...v.entries()];
                            if (v != null && typeof v === "object") return Object.entries(v);
                            return [];
                        });
                //#endregion

                //#region - Map / Set
                case "get":
                    return (rawKey: any) => { const key = unwrap(rawKey); return nav((v: any) => v?.get?.(key), { type: "mapGet", key }); };
                case "has":
                    return (rawVal: any) => { const val = unwrap(rawVal); return apply((v: any) => v?.has?.(val) ?? false); };
                //#endregion

                //#region - Filtering (accumulate in state.filters, don't record path steps)
                case "where":
                    return (predFn: Function) => {
                        const filterArr = (arr: any[]) =>
                            arr.filter((item) => {
                                const itemProxy = createProxy({ value: item, isEach: false, path: [], filters: [] });
                                return evalPredicate(predFn(itemProxy));
                            });
                        const nextFilters = [...filters, { type: "where" as const, predFn }];
                        if (isEach) return createProxy({ value: (value as any[]).map((v) => filterArr(v)), isEach: true, path, filters: nextFilters });
                        return createProxy({ value: filterArr(value as any[]), isEach: false, path, filters: nextFilters });
                    };
                case "filter":
                    return (fn: Function) => {
                        const nextFilters = [...filters, { type: "filter" as const, fn }];
                        if (isEach) return createProxy({ value: (value as any[]).map((v: any[]) => v.filter(fn as any)), isEach: true, path, filters: nextFilters });
                        return createProxy({ value: (value as any[]).filter(fn as any), isEach: false, path, filters: nextFilters });
                    };
                //#endregion

                //#region - Sort / Slice
                case "sort":
                    return (...args: any[]) => {
                        const sortArr = (arr: any[]) => {
                            if (typeof args[0] === "function" && args.length === 1) {
                                // Comparator overload
                                return [...arr].sort(args[0]);
                            }
                            // Accessor + direction/config overload
                            const [accessor, dirOrConfig] = args;
                            const dir = typeof dirOrConfig === "string" ? dirOrConfig : (dirOrConfig?.direction ?? "asc");
                            const nullish = typeof dirOrConfig === "object" ? (dirOrConfig?.nullish ?? "last") : "last";

                            // Extract sort keys once, then sort with stable tiebreaker
                            const keyed = arr.map((item, i) => ({ item, key: Lens.get(item, accessor as any), idx: i }));
                            keyed.sort((a, b) => {
                                // Nullish handling — independent of direction
                                const aN = a.key === null || a.key === undefined;
                                const bN = b.key === null || b.key === undefined;
                                if (aN || bN) {
                                    if (aN && bN) return a.idx - b.idx;
                                    if (aN) return nullish === "first" ? -1 : 1;
                                    return nullish === "first" ? 1 : -1;
                                }
                                const cmp = sortCompare(a.key, b.key);
                                if (cmp !== 0) return dir === "desc" ? -cmp : cmp;
                                return a.idx - b.idx; // stable tiebreaker
                            });
                            return keyed.map((e) => e.item);
                        };
                        const nextFilters = [...filters, { type: "sort" as const, args }];
                        if (isEach) return createProxy({ value: (value as any[]).map(sortArr), isEach: true, path, filters: nextFilters });
                        return createProxy({ value: sortArr(value as any[]), isEach: false, path, filters: nextFilters });
                    };
                case "slice":
                    return (rawStart: number, rawEnd?: number) => {
                        const start = unwrap(rawStart) as number;
                        const end = rawEnd !== undefined ? unwrap(rawEnd) as number : undefined;
                        const nextFilters = [...filters, { type: "slice" as const, start, end }];
                        if (isEach) return createProxy({ value: (value as any[]).map((v: any[]) => v.slice(start, end)), isEach: true, path, filters: nextFilters });
                        return createProxy({ value: (value as any[]).slice(start, end), isEach: false, path, filters: nextFilters });
                    };
                //#endregion

                //#region - Logical combinators
                case "or":
                    return (...preds: any[]) => ({ [PRED]: preds.some((p) => evalPredicate(p)) });
                case "and":
                    return (...preds: any[]) => ({ [PRED]: preds.every((p) => evalPredicate(p)) });
                case "not":
                    return (pred: any) => ({ [PRED]: !evalPredicate(pred) });
                case "xor":
                    return (...preds: any[]) => ({ [PRED]: preds.filter((p) => evalPredicate(p)).length % 2 === 1 });
                //#endregion
            }

            //#region - Custom accessor dispatch
            if (typeof prop === "string") {
                // Custom accessors (LensNav — object protocol)
                const customDispatch = (v: any): ((...args: any[]) => unknown) | undefined => {
                    const accessor = v?.[LensNav]?.[prop];
                    return accessor && typeof accessor.select === "function"
                        ? (...args: any[]) => accessor.select(...args)
                        : undefined;
                };

                if (isEach) {
                    const hasAny = (value as any[]).some((v) => customDispatch(v));
                    if (hasAny)
                        return (...rawArgs: any[]) => {
                            const args = rawArgs.map(unwrap);
                            return createProxy({ value: (value as any[]).map((v) => customDispatch(v)?.(...args)), isEach: true, path: [...path, { type: "custom" as const, prop, args }], filters: [] });
                        };
                } else {
                    const fn = customDispatch(value);
                    if (fn)
                        return (...rawArgs: any[]) => {
                            const args = rawArgs.map(unwrap);
                            return nav(() => fn(...args), { type: "custom", prop, args });
                        };
                }
            }
            //#endregion

            return undefined;
        },
    };

    return new Proxy(function () {}, handler);
}

//#endregion

//#region - Replay (mutate / apply)

// Resolve which original indices in `arr` match a chain of accumulated filters
function matchingIndices(arr: any[], ops: FilterOp[]): number[] {
    let indices = Array.from({ length: arr.length }, (_, i) => i);
    for (const f of ops) {
        switch (f.type) {
            case "where":
                indices = indices.filter((i) => {
                    const proxy = createProxy({ value: arr[i], isEach: false, path: [], filters: [] });
                    return evalPredicate(f.predFn(proxy));
                });
                break;
            case "filter":
                indices = indices.filter((i) => (f.fn as Function)(arr[i]));
                break;
            case "slice": {
                const s = f.start < 0 ? Math.max(0, indices.length + f.start) : f.start;
                const e = f.end !== undefined ? (f.end < 0 ? Math.max(0, indices.length + f.end) : f.end) : indices.length;
                indices = indices.slice(s, e);
                break;
            }
            case "sort": {
                const args = f.args;
                if (typeof args[0] === "function" && args.length === 1) {
                    // Comparator overload
                    indices.sort((a, b) => args[0](arr[a], arr[b]));
                } else {
                    // Accessor + direction overload
                    const [accessor, dirOrConfig] = args;
                    const dir = typeof dirOrConfig === "string" ? dirOrConfig : (dirOrConfig?.direction ?? "asc");
                    const nullish = typeof dirOrConfig === "object" ? (dirOrConfig?.nullish ?? "last") : "last";
                    const keyed = indices.map((i, idx) => ({ i, key: Lens.get(arr[i], accessor as any), idx }));
                    keyed.sort((a, b) => {
                        const aN = a.key === null || a.key === undefined;
                        const bN = b.key === null || b.key === undefined;
                        if (aN || bN) {
                            if (aN && bN) return a.idx - b.idx;
                            if (aN) return nullish === "first" ? -1 : 1;
                            return nullish === "first" ? 1 : -1;
                        }
                        const cmp = sortCompare(a.key, b.key);
                        if (cmp !== 0) return dir === "desc" ? -cmp : cmp;
                        return a.idx - b.idx;
                    });
                    indices = keyed.map((e) => e.i);
                }
                break;
            }
        }
    }
    return indices;
}

const seg = {
    prop: (key: string): LensPathSegment => ({ type: "property", key }),
    idx: (index: number): LensPathSegment => ({ type: "index", index }),
    acc: (name: string, ...args: string[]): LensPathSegment => (args.length > 0 ? { type: "accessor", name, args } : { type: "accessor", name }),
    fromPropStep: (key: string | number): LensPathSegment => (typeof key === "number" ? seg.idx(key) : seg.prop(key)),
};

function doApply(current: any, steps: PathStep[], idx: number, updater: (prev: any, index: number, ctx: Lens.Context) => any, ctx: Lens.Context): any {
    if (idx >= steps.length) return updater(current, ctx.index, ctx);

    const step = steps[idx];
    const next = idx + 1;

    switch (step.type) {
        case "prop": {
            const childCtx = { ...ctx, path: [...ctx.path, seg.fromPropStep(step.key)] };
            const child = doApply(current[step.key], steps, next, updater, childCtx);
            if (Array.isArray(current)) {
                const result = [...current];
                result[step.key as number] = child;
                return result;
            }
            return { ...current, [step.key]: child };
        }
        case "at": {
            let resolved: number;
            if (step.filters?.length) {
                const indices = matchingIndices(current, step.filters);
                const fi = step.index < 0 ? indices.length + step.index : step.index;
                resolved = indices[fi];
            } else {
                resolved = step.index < 0 ? current.length + step.index : step.index;
            }
            const childCtx = { ...ctx, path: [...ctx.path, seg.idx(resolved)] };
            const child = doApply(current[resolved], steps, next, updater, childCtx);
            const result = [...current];
            result[resolved] = child;
            return result;
        }
        case "each": {
            if (step.callback) {
                const applyToElement = (item: any, j: number, count: number) => {
                    const elProxy = createProxy({ value: item, isEach: false, path: [], filters: [] });
                    const subResult = step.callback!(elProxy);
                    const subPath = (subResult as any)[LENS].path as PathStep[];
                    const fullPath = [...subPath, ...steps.slice(next)];
                    return doApply(item, fullPath, 0, updater, { path: [...ctx.path, seg.idx(j)], index: j, count });
                };
                if (step.filters?.length) {
                    const indices = matchingIndices(current, step.filters);
                    const result = [...current];
                    for (let j = 0; j < indices.length; j++) {
                        result[indices[j]] = applyToElement(current[indices[j]], j, indices.length);
                    }
                    return result;
                }
                return (current as any[]).map((item: any, j: number) => applyToElement(item, j, current.length));
            }
            if (step.filters?.length) {
                const indices = matchingIndices(current, step.filters);
                const result = [...current];
                for (let j = 0; j < indices.length; j++) {
                    const i = indices[j];
                    const childCtx = { path: [...ctx.path, seg.idx(i)], index: j, count: indices.length };
                    result[i] = doApply(current[i], steps, next, updater, childCtx);
                }
                return result;
            }
            return (current as any[]).map((item: any, j: number) => doApply(item, steps, next, updater, { path: [...ctx.path, seg.idx(j)], index: j, count: current.length }));
        }
        case "mapGet": {
            const map = new Map(current as Map<any, any>);
            const childCtx = { ...ctx, path: [...ctx.path, seg.acc("get", String(step.key))] };
            map.set(step.key, doApply(map.get(step.key), steps, next, updater, childCtx));
            return map;
        }
        case "custom": {
            const accessor = current?.[LensNav]?.[step.prop];
            if (accessor?.select) {
                const childCtx = { ...ctx, path: [...ctx.path, seg.acc(step.prop, ...step.args.map(String))] };
                const readValue = accessor.select(...step.args);
                const newValue = doApply(readValue, steps, next, updater, childCtx);
                return accessor.apply?.(newValue, ...step.args) ?? current;
            }
            return current;
        }
    }
}

function doMutate(current: any, steps: PathStep[], idx: number, updater: (prev: any, index: number, ctx: Lens.Context) => any, ctx: Lens.Context): void {
    const step = steps[idx];
    const next = idx + 1;
    const atLeaf = next >= steps.length;

    // For plain property/index steps, descend or apply at leaf
    const descend = (parent: any, key: string | number, childCtx: Lens.Context) => {
        if (atLeaf) parent[key] = updater(parent[key], childCtx.index, childCtx);
        else doMutate(parent[key], steps, next, updater, childCtx);
    };

    switch (step.type) {
        case "prop":
            descend(current, step.key, { ...ctx, path: [...ctx.path, seg.fromPropStep(step.key)] });
            break;
        case "at": {
            let resolved: number;
            if (step.filters?.length) {
                const indices = matchingIndices(current, step.filters);
                const fi = step.index < 0 ? indices.length + step.index : step.index;
                resolved = indices[fi];
            } else {
                resolved = step.index < 0 ? current.length + step.index : step.index;
            }
            descend(current, resolved, { ...ctx, path: [...ctx.path, seg.idx(resolved)] });
            break;
        }
        case "each": {
            if (step.callback) {
                const mutateElement = (arr: any[], i: number, j: number, count: number) => {
                    const elProxy = createProxy({ value: arr[i], isEach: false, path: [], filters: [] });
                    const subResult = step.callback!(elProxy);
                    const subPath = (subResult as any)[LENS].path as PathStep[];
                    const fullPath = [...subPath, ...steps.slice(next)];
                    doMutate(arr[i], fullPath, 0, updater, { path: [...ctx.path, seg.idx(i)], index: j, count });
                };
                if (step.filters?.length) {
                    const indices = matchingIndices(current, step.filters);
                    for (let j = 0; j < indices.length; j++) {
                        mutateElement(current, indices[j], j, indices.length);
                    }
                } else {
                    for (let i = 0; i < current.length; i++) {
                        mutateElement(current, i, i, current.length);
                    }
                }
                break;
            }
            if (step.filters?.length) {
                const indices = matchingIndices(current, step.filters);
                for (let j = 0; j < indices.length; j++) {
                    const i = indices[j];
                    descend(current, i, { path: [...ctx.path, seg.idx(i)], index: j, count: indices.length });
                }
            } else {
                for (let i = 0; i < current.length; i++) {
                    descend(current, i, { path: [...ctx.path, seg.idx(i)], index: i, count: current.length });
                }
            }
            break;
        }
        case "mapGet": {
            const map = current as Map<any, any>;
            const childCtx = { ...ctx, path: [...ctx.path, seg.acc("get", String(step.key))] };
            if (atLeaf) map.set(step.key, updater(map.get(step.key), ctx.index, childCtx));
            else doMutate(map.get(step.key), steps, next, updater, childCtx);
            break;
        }
        case "custom": {
            const accessor = current?.[LensNav]?.[step.prop];
            if (accessor?.select) {
                const childCtx = { ...ctx, path: [...ctx.path, seg.acc(step.prop, ...step.args.map(String))] };
                const readValue = accessor.select(...step.args);
                if (atLeaf) accessor.mutate?.(updater(readValue, ctx.index, childCtx), ...step.args);
                else accessor.mutate?.(doApply(readValue, steps, next, updater, childCtx), ...step.args);
            }
            break;
        }
    }
}

//#endregion
