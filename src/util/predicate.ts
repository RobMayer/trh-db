import { TrhSymbols } from "@trh/symbols";
import { SelectorLens, SelectorLensOf } from "./lens/types";

// --- Operator catalog ---

// Equality: any type
type EqualityOp = "=" | "!=" | "==" | "!==";

// Ordering: number, bigint, string, or Comparable
type OrderingOp = ">" | "!>" | ">=" | "!>=" | "<" | "!<" | "<=" | "!<=";

// Any-of equality: value matches any/none in array
type EqualityAnyOfOp = "=|" | "!=|";

// Range: 4-member predicates only
type RangeOp = "><" | "!><" | ">=<" | "!>=<";

// String: contains, starts/ends with, case sensitive/insensitive
type StringContainsOp = "%" | "!%" | "%^" | "!%^";
type StringStartsWithOp = "%_" | "!%_" | "%^_" | "!%^_";
type StringEndsWithOp = "_%" | "!_%" | "_%^" | "!_%^";
type StringAnyOfOp = "%|" | "!%|" | "%^|" | "!%^|" | "%_|" | "!%_|" | "_%|" | "!_%|";
type StringAllOfOp = "%&" | "!%&" | "%^&" | "!%^&";
type StringOp = StringContainsOp | StringStartsWithOp | StringEndsWithOp;

// Regex: match against RegExp
type RegexOp = "~" | "!~";
type RegexAnyOfOp = "~|" | "!~|";
type RegexAllOfOp = "~&" | "!~&";

// Array has: array contains element(s)
type HasOp = "#" | "!#";
type HasAnyOfOp = "#|" | "!#|";
type HasAllOfOp = "#&" | "!#&";

// Typeof: runtime type check (RHS is string, not a closed union — users can register custom type descriptors)
type TypeofOp = ":" | "!:";
type TypeofAnyOfOp = ":|" | "!:|";

// --- Operator → type mapping (parameterized by arity) ---

// Unary: no operand (truthiness check)
type UnaryOp = "?" | "!?";

// A = 2: unary ops; A = 3: standard ops; A = 4: range ops only
export type OperatorFor<O, A extends 2 | 3 | 4> = A extends 4
    ? O extends number | bigint | string | TrhSymbols.Comparable
        ? RangeOp
        : never
    : A extends 2
      ? UnaryOp
      : // A extends 3
            | EqualityOp
            | EqualityAnyOfOp
            | TypeofOp
            | TypeofAnyOfOp
            | (O extends number | bigint | string | TrhSymbols.Comparable ? OrderingOp : never)
            | (O extends string ? StringOp | StringAnyOfOp | StringAllOfOp | RegexOp | RegexAnyOfOp | RegexAllOfOp : never)
            | (O extends any[] | Set<any> | TrhSymbols.Containable<any> ? HasOp | HasAnyOfOp | HasAllOfOp : never);

// --- Operand type mapping ---

// Ops that take an array of values as RHS (any-of / all-of)
type AnyOfOp = EqualityAnyOfOp | StringAnyOfOp | StringAllOfOp | RegexAnyOfOp | RegexAllOfOp | HasAnyOfOp | HasAllOfOp | TypeofAnyOfOp;

// Map from operator to valid operand type
export type OperandFor<O, Op> =
    // Typeof: RHS is string
    Op extends TypeofOp
        ? string
        : Op extends TypeofAnyOfOp
          ? string[]
          : // Regex: RHS is RegExp
            Op extends RegexOp
            ? RegExp
            : Op extends RegexAnyOfOp | RegexAllOfOp
              ? RegExp[]
              : // Array contains: RHS is element type
                Op extends HasOp
                ? O extends (infer E)[]
                    ? E | SelectorLens<E>
                    : O extends Set<infer E>
                      ? E | SelectorLens<E>
                      : O extends TrhSymbols.Containable<infer E>
                        ? E | SelectorLens<E>
                        : never
                : Op extends HasAnyOfOp | HasAllOfOp
                  ? O extends (infer E)[]
                      ? (E | SelectorLens<E>)[]
                      : O extends Set<infer E>
                        ? (E | SelectorLens<E>)[]
                        : O extends TrhSymbols.Containable<infer E>
                          ? (E | SelectorLens<E>)[]
                          : never
                  : // Any-of / all-of: RHS is array of O
                    Op extends AnyOfOp
                    ? (O | SelectorLens<O>)[]
                    : // Default: RHS is O
                          O | SelectorLens<O>;

// --- The Predicate tuple ---

export type Predicate<O> =
    | [subject: O | SelectorLensOf<O>, op: NoInfer<OperatorFor<O, 2>>]
    | [subject: O | SelectorLensOf<O>, op: NoInfer<OperatorFor<O, 3>>, operand: NoInfer<OperandFor<O, OperatorFor<O, 3>>> | SelectorLensOf<any>]
    | [
          subject: O | SelectorLensOf<O>,
          op: NoInfer<OperatorFor<O, 4>>,
          operand1: NoInfer<OperandFor<O, OperatorFor<O, 4>>> | SelectorLensOf<any>,
          operand2: NoInfer<OperandFor<O, OperatorFor<O, 4>>> | SelectorLensOf<any>,
      ];

// --- Comparison helpers ---

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compare(a: unknown, b: unknown): number | null {
    // 1. Left-side Compare symbol
    if (a != null && typeof a === "object" && TrhSymbols.Compare in a) {
        const result = (a as any)[TrhSymbols.Compare](b);
        if (result !== null && !isNaN(result)) return result;
    }
    // 2. Right-side Compare symbol (flipped sign)
    if (b != null && typeof b === "object" && TrhSymbols.Compare in b) {
        const result = (b as any)[TrhSymbols.Compare](a);
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
    if (a != null && typeof a === "object" && TrhSymbols.Equals in a) {
        const result = (a as any)[TrhSymbols.Equals](b);
        if (result !== null) return result;
    }
    // 2. Right-side Equals symbol
    if (b != null && typeof b === "object" && TrhSymbols.Equals in b) {
        const result = (b as any)[TrhSymbols.Equals](a);
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
    if (typeof (value as any)[TrhSymbols.TypeOf] === "function") {
        const custom = (value as any)[TrhSymbols.TypeOf]();
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

// --- Operator table ---

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
    "#": (s, o) => (s != null && typeof s === "object" && TrhSymbols.Contains in s ? (s as any)[TrhSymbols.Contains](o) : Array.isArray(s) ? s.includes(o) : s instanceof Set ? s.has(o) : false),
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

// --- Predicate evaluation ---

/** Evaluate a predicate tuple to boolean. Expects already-unwrapped values (no Lens proxies). */
export function evalPredicate(tuple: unknown[]): boolean {
    // Arity 2 — unary
    if (tuple.length === 2) {
        const val = tuple[0];
        return tuple[1] === "?" ? !!val : !val;
    }

    const subject = tuple[0];
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
        result = op(subject, tuple[2], tuple[3]);
    } else if (mode === "single") {
        result = op(subject, tuple[2]);
    } else {
        // any-of or all-of — operand is an array
        const operands = tuple[2] as unknown[];
        const method = mode === "any" ? "some" : "every";
        result = operands[method]((o: unknown) => op(subject, o));
    }

    return negate ? !result : result;
}
