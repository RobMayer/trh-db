import { Comparable } from "../types";

// --- SubLens: a property accessor that carries the resolved type ---

// A chainable sublens result. Calling it with a key drills deeper into the type.
// Utility methods (.size(), .length(), .keys(), etc.) project to a derived type.

// Base: phantom type + utility projections
interface SubLensResultBase<T> {
    readonly __phantom: T;

    // .size() — for arrays, sets, maps, or strings → number
    size(): T extends { length: number } | { size: number } ? SubLensResult<number> : never;

    // .length() — alias for .size() on array/string
    length(): T extends { length: number } ? SubLensResult<number> : never;

    // .keys() — for objects/maps → string[]
    keys(): T extends Record<string, any> ? SubLensResult<string[]> : never;

    // .values() — for objects/maps → array of values
    values(): T extends Record<string, infer V> ? SubLensResult<V[]> : never;

    // .at(n) — for arrays → element type
    at(index: number): T extends (infer E)[] ? SubLensResult<E> : never;
}

// Deep property access: only available when T is an object (not a primitive)
interface SubLensResultCallable<T> {
    <K extends keyof T>(key: K): SubLensResult<T[K]>;
}

// Combine: call signature only present for object types
type SubLensResult<T> = SubLensResultBase<T> & (NonNullable<T> extends object ? SubLensResultCallable<NonNullable<T>> : {});

// The builder function the user calls: $("age") => SubLensResult<number>
// D = data shape, M = meta-fields (structure-specific: ID, DEPTH, PARENT, etc.)
type SubLensBuilder<D, M = {}> = {
    <K extends keyof D>(key: K): SubLensResult<D[K]>;
} & { readonly [K in keyof M]: SubLensResult<M[K]> };

// --- Operator catalog ---
// Migrated from typeScratchpad.ts. Numerify ops (#=, #>, etc.) omitted —
// use sublens .size() + standard ordering instead.

// Equality: any type
type EqualityOp = "=" | "!=" | "==" | "!==";

// Ordering: number or string
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

// --- Operator → type mapping ---

// Ops valid for 3-member predicates (RangeOp excluded — always 4-member)
type OperatorFor<T> =
    | EqualityOp
    | EqualityAnyOfOp
    | TypeofOp
    | TypeofAnyOfOp
    | (T extends number | bigint | string | Comparable ? OrderingOp : never)
    | (T extends string ? StringOp | StringAnyOfOp | StringAllOfOp | RegexOp | RegexAnyOfOp | RegexAllOfOp : never)
    | (T extends any[] ? HasOp | HasAnyOfOp | HasAllOfOp : never);

// Ops that take an array of values as RHS (any-of / all-of)
type AnyOfOp = EqualityAnyOfOp | StringAnyOfOp | StringAllOfOp | RegexAnyOfOp | RegexAllOfOp | HasAnyOfOp | HasAllOfOp | TypeofAnyOfOp;

// Map from operator to valid operand type
type OperandFor<T, Op> =
    // Typeof: RHS is string (open-ended — users can register custom type descriptors)
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
                ? T extends (infer E)[]
                    ? E | SubLensResult<E>
                    : never
                : Op extends HasAnyOfOp | HasAllOfOp
                  ? T extends (infer E)[]
                      ? (E | SubLensResult<E>)[]
                      : never
                  : // Any-of / all-of for equality/ordering/string: RHS is array of T
                    Op extends AnyOfOp
                    ? (T | SubLensResult<T>)[]
                    : // Default: RHS is T
                          T | SubLensResult<T>;

// --- The Predicate tuples ---
// 3-member: [sublens, op, value]        — standard ops
// 4-member: [sublens, rangeOp, lo, hi]  — range ops (avoids nested tuple inference issues)

// --- or() / and() with mapped variadic tuples ---

type PredicateResult = { readonly __predicate: true };

// Validate a single predicate tuple (3 or 4 members)
type ValidPredicate<D, M, Tuple> =
    // 4-member: range op
    Tuple extends [SubLensResult<infer T>, infer Op, any, any]
        ? Op extends RangeOp
            ? [SubLensResult<T>, Op, T | SubLensResult<T>, T | SubLensResult<T>]
            : [SubLensResult<T>, RangeOp, "ERROR: only range ops use 4-member predicates"]
        : // 3-member: standard op
          Tuple extends [SubLensResult<infer T>, infer Op, any]
          ? Op extends OperatorFor<T>
              ? [SubLensResult<T>, Op, OperandFor<T, Op>]
              : [SubLensResult<T>, OperatorFor<T>, "ERROR: invalid operator for this type"]
          : never;

// The combinator functions
// Each condition can be a predicate tuple (3 or 4 members) OR a nested PredicateResult
type CombinatorArg<D, M, T> = T extends PredicateResult ? T : ValidPredicate<D, M, T>;

type CombinatorFn<D, M> = {
    or<Tuples extends ([any, any, any] | [any, any, any, any] | PredicateResult)[]>(...conditions: { [K in keyof Tuples]: CombinatorArg<D, M, Tuples[K]> }): PredicateResult;
    and<Tuples extends ([any, any, any] | [any, any, any, any] | PredicateResult)[]>(...conditions: { [K in keyof Tuples]: CombinatorArg<D, M, Tuples[K]> }): PredicateResult;
    not<T extends [any, any, any] | [any, any, any, any] | PredicateResult>(condition: CombinatorArg<D, M, T>): PredicateResult;
    xor<Tuples extends ([any, any, any] | [any, any, any, any] | PredicateResult)[]>(...conditions: { [K in keyof Tuples]: CombinatorArg<D, M, Tuples[K]> }): PredicateResult;
};

// The $ passed into .where() for combinatorial logic
type WhereCombinator<D, M> = SubLensBuilder<D, M> & CombinatorFn<D, M>;

// --- Exported clause types (generic over pipeline return type) ---

type SortDirection = "asc" | "desc";

export type WhereClause<D, M, P> = {
    // 3-member tuple: .where($ => [$("age"), ">", 12])
    <T, Op extends OperatorFor<T>>(predicate: (sb: WhereCombinator<D, M>) => [SubLensResult<T>, Op, OperandFor<T, Op>]): P;

    // 4-member tuple: .where($ => [$("age"), "><", 18, 65])
    <T>(predicate: (sb: WhereCombinator<D, M>) => [SubLensResult<T>, RangeOp, T | SubLensResult<T>, T | SubLensResult<T>]): P;

    // Combinator: .where($ => $.or([...], [...]))
    (predicate: (sb: WhereCombinator<D, M>) => PredicateResult): P;
};

export type SortClause<D, M, P> = {
    <T>(accessor: (sb: SubLensBuilder<D, M>) => SubLensResult<T>, direction: SortDirection): P;
};
