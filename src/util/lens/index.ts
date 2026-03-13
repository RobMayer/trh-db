import { GetterLens, GetterLensOf, QueryLens, QueryLensOf } from "./types";
import { Compare, Equals, TypeOf, LensSubQuery, LensSubAccess, LensQuery, LensAccess } from "../../types";

//#region - Public API

export namespace Lens {
    export const query = <D, R>(data: D, lens: ($: QueryLens<D>) => QueryLensOf<R>): R => {
        const proxy = createProxy({ value: data, isEach: false });
        const result = lens(proxy);
        return (result as any)[LENS].value;
    };
    export const get = <D, R>(data: D, lens: ($: GetterLens<D>) => GetterLensOf<R>): R => {
        const proxy = createProxy({ value: data, isEach: false });
        const result = lens(proxy as any);
        return (result as any)[LENS].value;
    };
    /*
    todo: after we solidify what MutateLens and ApplyLens is like
    const mutate = <D, R>(data: D, lens: ($: UpdaterLens<D>) => UpdaterLens<R>, value: R | ((prev: R) => R)): void => {};
    const apply = <D, R>(data: D, lens: ($: UpdaterLens<D>) => UpdaterLens<R>, value: R | ((prev: readonly R) => R)): D => { // note: readonly R probably needs to be deeply-nested readonly somehow?
        return {} as any;
    };
    */
}

//#endregion

//#region - Symbols

const LENS = Symbol("lens");
const PRED = Symbol("pred");

type LensState = { value: unknown; isEach: boolean };

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

function sortCompare(a: unknown, b: unknown): number {
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
    "#": (s, o) => Array.isArray(s) && s.includes(o),
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
    const { value, isEach } = state;

    // Apply a transform, respecting each-mode
    const apply = (fn: (v: any) => unknown): any => createProxy({ value: isEach ? (value as any[]).map(fn) : fn(value), isEach });

    const handler: ProxyHandler<Function> = {
        // $("key") / $(0) — property/index access
        apply(_target, _thisArg, args) {
            const key = args[0];
            return apply((v: any) => (v == null ? undefined : v[key]));
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
                    return (index: number) => apply((v: any) => v?.[index < 0 ? v.length + index : index]);
                case "each":
                    return () => {
                        if (isEach) return createProxy({ value: (value as any[]).flat(1), isEach: true });
                        return createProxy({ value, isEach: true });
                    };
                //#endregion

                //#region - Object accessors
                case "keys":
                    return () => apply((v: any) => (v != null && typeof v === "object" ? Object.keys(v) : []));
                case "values":
                    return () => apply((v: any) => (v != null && typeof v === "object" ? Object.values(v) : []));
                //#endregion

                //#region - Map / Set
                case "get":
                    return (key: any) => apply((v: any) => v?.get?.(key));
                case "has":
                    return (val: any) => apply((v: any) => v?.has?.(val) ?? false);
                //#endregion

                //#region - Filtering
                case "where":
                    return (predFn: Function) => {
                        const filterArr = (arr: any[]) =>
                            arr.filter((item) => {
                                const itemProxy = createProxy({ value: item, isEach: false });
                                return evalPredicate(predFn(itemProxy));
                            });
                        if (isEach) return createProxy({ value: (value as any[]).map((v) => filterArr(v)), isEach: true });
                        return createProxy({ value: filterArr(value as any[]), isEach: false });
                    };
                case "filter":
                    return (fn: Function) => {
                        if (isEach) return createProxy({ value: (value as any[]).map((v: any[]) => v.filter(fn as any)), isEach: true });
                        return createProxy({ value: (value as any[]).filter(fn as any), isEach: false });
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
                        if (isEach) return createProxy({ value: (value as any[]).map(sortArr), isEach: true });
                        return createProxy({ value: sortArr(value as any[]), isEach: false });
                    };
                case "slice":
                    return (start: number, end?: number) => {
                        if (isEach) return createProxy({ value: (value as any[]).map((v: any[]) => v.slice(start, end)), isEach: true });
                        return createProxy({ value: (value as any[]).slice(start, end), isEach: false });
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
                // Keyed (LensSubQuery / LensSubAccess)
                const keyedDispatch = (v: any): ((key: any) => unknown) | undefined => {
                    const sub = v?.[LensSubQuery]?.[prop] ?? v?.[LensSubAccess]?.[prop];
                    return typeof sub === "function" ? sub : undefined;
                };

                if (isEach) {
                    const hasAny = (value as any[]).some((v) => keyedDispatch(v));
                    if (hasAny) return (key: any) => createProxy({ value: (value as any[]).map((v) => keyedDispatch(v)?.(key)), isEach: true });
                } else {
                    const fn = keyedDispatch(value);
                    if (fn) return (key: any) => apply(() => fn(key));
                }

                // Named property (LensQuery / LensAccess)
                const namedDispatch = (v: any): (() => unknown) | undefined => {
                    const sub = v?.[LensQuery]?.[prop] ?? v?.[LensAccess]?.[prop];
                    return typeof sub === "function" ? sub : undefined;
                };

                if (isEach) {
                    const hasAny = (value as any[]).some((v) => namedDispatch(v));
                    if (hasAny) return () => createProxy({ value: (value as any[]).map((v) => namedDispatch(v)?.()), isEach: true });
                } else {
                    const fn = namedDispatch(value);
                    if (fn) return () => apply(() => fn());
                }
            }
            //#endregion

            return undefined;
        },
    };

    return new Proxy(function () {}, handler);
}

//#endregion
