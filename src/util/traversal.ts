import { AllStringKeys, Comparable, SafeLookup } from "../types";

// --- SubLens: a property accessor that carries the resolved type ---

// A chainable sublens result. Calling it with a key drills deeper into the type.
// Utility methods (.size(), .length(), .keys(), etc.) project to a derived type.

// Base: phantom type + utility projections
interface LensResultBase<T> {
    readonly __phantom: T;

    // .size() — for arrays, sets, maps, or strings → number
    size(): T extends { length: number } | { size: number } ? LensResult<number> : never;

    // .length() — alias for .size() on array/string
    length(): T extends { length: number } ? LensResult<number> : never;

    // .keys() — for objects/maps → string[]
    keys(): T extends Record<string, any> ? LensResult<string[]> : never;

    // .values() — for objects/maps → array of values
    values(): T extends Record<string, infer V> ? LensResult<V[]> : never;

    // .at(n) — for arrays → element type
    at(index: number): T extends (infer E)[] ? LensResult<E> : never;
}

// Deep property access: only available when T is an object (not a primitive)
// Uses AllStringKeys/SafeLookup to distribute over union members.
interface LensResultCallable<T> {
    <K extends AllStringKeys<T>>(key: K): LensResult<SafeLookup<T, K>>;
}

// Combine: call signature only present for object types
type LensResult<T> = LensResultBase<T> & (NonNullable<T> extends object ? LensResultCallable<NonNullable<T>> : {});

// The builder function the user calls: $("age") => SubLensResult<number>
// D = data shape, M = meta-fields (structure-specific: ID, DEPTH, PARENT, etc.)
type LensBuilder<D, M = {}> = {
    <K extends AllStringKeys<D>>(key: K): LensResult<SafeLookup<D, K>>;
} & { readonly [K in keyof M]: LensResult<M[K]> };

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
                    ? E | LensResult<E>
                    : never
                : Op extends HasAnyOfOp | HasAllOfOp
                  ? T extends (infer E)[]
                      ? (E | LensResult<E>)[]
                      : never
                  : // Any-of / all-of for equality/ordering/string: RHS is array of T
                    Op extends AnyOfOp
                    ? (T | LensResult<T>)[]
                    : // Default: RHS is T
                          T | LensResult<T>;

// --- The Predicate tuples ---
// 3-member: [sublens, op, value]        — standard ops
// 4-member: [sublens, rangeOp, lo, hi]  — range ops (avoids nested tuple inference issues)

// --- or() / and() with mapped variadic tuples ---

type PredicateResult = { readonly __predicate: true };

// Validate a single predicate tuple (3 or 4 members)
type ValidPredicate<D, M, Tuple> =
    // 4-member: range op
    Tuple extends [LensResult<infer T>, infer Op, any, any]
        ? Op extends RangeOp
            ? [LensResult<T>, Op, T | LensResult<T>, T | LensResult<T>]
            : [LensResult<T>, RangeOp, "ERROR: only range ops use 4-member predicates"]
        : // 3-member: standard op
          Tuple extends [LensResult<infer T>, infer Op, any]
          ? Op extends OperatorFor<T>
              ? [LensResult<T>, Op, OperandFor<T, Op>]
              : [LensResult<T>, OperatorFor<T>, "ERROR: invalid operator for this type"]
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
type WhereCombinator<D, M> = LensBuilder<D, M> & CombinatorFn<D, M>;

// --- Exported clause types (generic over pipeline return type) ---

type SortDirection = "asc" | "desc";

export type WhereClause<D, M, P> = {
    // 3-member tuple: .where($ => [$("age"), ">", 12])
    <T, Op extends OperatorFor<T>>(predicate: (sb: WhereCombinator<D, M>) => [LensResult<T>, Op, OperandFor<T, Op>]): P;

    // 4-member tuple: .where($ => [$("age"), "><", 18, 65])
    <T>(predicate: (sb: WhereCombinator<D, M>) => [LensResult<T>, RangeOp, T | LensResult<T>, T | LensResult<T>]): P;

    // Combinator: .where($ => $.or([...], [...]))
    (predicate: (sb: WhereCombinator<D, M>) => PredicateResult): P;
};

export type SortClause<D, M, P> = {
    <T>(accessor: (sb: LensBuilder<D, M>) => LensResult<T>, direction: SortDirection): P;
};

// ============================================================
// Lens Tests (isolated — no pipeline dependency)
// ============================================================

type TestData = {
    name: string;
    age: number;
    roles: string[];
    active: boolean;
    nested: { deep: number; tags: string[] };
    logins: number;
};

type TestMeta = {
    ID: string;
    DEPTH: number;
};

// Use a minimal stub pipeline — just needs to be a distinct type we can check against
type StubPipeline = { __stub: true };

declare const where: WhereClause<TestData, TestMeta, StubPipeline>;
declare const sort: SortClause<TestData, TestMeta, StubPipeline>;

// --- SubLens property access ---

// Top-level property
const l1: StubPipeline = where(($) => [$("age"), ">", 12]);

// Nested property
const l2: StubPipeline = where(($) => [$("nested")("deep"), ">", 5]);

// Utility: .size() on array
const l3: StubPipeline = where(($) => [$("roles").size(), ">", 2]);

// Utility: .size() on string
const l4: StubPipeline = where(($) => [$("name").size(), ">", 3]);

// Utility: .at() on array
const l5: StubPipeline = where(($) => [$("roles").at(0), "=", "admin"]);

// Utility: .length() on array
const l6: StubPipeline = where(($) => [$("roles").length(), ">=", 1]);

// Nested array utility
const l7: StubPipeline = where(($) => [$("nested")("tags").size(), ">", 0]);

// --- Meta-field access ---

const m1: StubPipeline = where(($) => [$.ID, "=", "abc"]);
const m2: StubPipeline = where(($) => [$.DEPTH, ">", 3]);

// --- Sublens on RHS ---

const rhs1: StubPipeline = where(($) => [$("age"), "=", $("logins")]);
const rhs2: StubPipeline = where(($) => [$("age"), ">", $("logins")]);

// --- Operator coverage ---

// Equality
const op_eq: StubPipeline = where(($) => [$("name"), "=", "Alice"]);
const op_neq: StubPipeline = where(($) => [$("name"), "!=", "Bob"]);
const op_seq: StubPipeline = where(($) => [$("name"), "==", "Alice"]);
const op_sneq: StubPipeline = where(($) => [$("name"), "!==", "Bob"]);

// Equality any-of
const op_eqany: StubPipeline = where(($) => [$("age"), "=|", [18, 21, 25]]);
const op_neqany: StubPipeline = where(($) => [$("age"), "!=|", [18, 21]]);

// Ordering (number)
const op_gt: StubPipeline = where(($) => [$("age"), ">", 18]);
const op_gte: StubPipeline = where(($) => [$("age"), ">=", 18]);
const op_lt: StubPipeline = where(($) => [$("age"), "<", 65]);
const op_lte: StubPipeline = where(($) => [$("age"), "<=", 65]);
const op_ngt: StubPipeline = where(($) => [$("age"), "!>", 100]);
const op_ngte: StubPipeline = where(($) => [$("age"), "!>=", 18]);

// Ordering (string)
const op_gt_s: StubPipeline = where(($) => [$("name"), ">", "Alice"]);

// String ops
const op_contains: StubPipeline = where(($) => [$("name"), "%", "ali"]);
const op_ncontains: StubPipeline = where(($) => [$("name"), "!%", "ali"]);
const op_contains_cs: StubPipeline = where(($) => [$("name"), "%^", "Ali"]);
const op_starts: StubPipeline = where(($) => [$("name"), "%_", "ali"]);
const op_ends: StubPipeline = where(($) => [$("name"), "_%", "ice"]);
const op_str_anyof: StubPipeline = where(($) => [$("name"), "%|", ["ali", "bob"]]);
const op_str_allof: StubPipeline = where(($) => [$("name"), "%&", ["hello", "world"]]);

// Regex
const op_regex: StubPipeline = where(($) => [$("name"), "~", /^Alice/i]);
const op_nregex: StubPipeline = where(($) => [$("name"), "!~", /^Bob/]);
const op_regex_any: StubPipeline = where(($) => [$("name"), "~|", [/^Alice/, /^Bob/]]);
const op_regex_all: StubPipeline = where(($) => [$("name"), "~&", [/^A/, /e$/]]);

// Array has
const op_has: StubPipeline = where(($) => [$("roles"), "#", "admin"]);
const op_nhas: StubPipeline = where(($) => [$("roles"), "!#", "banned"]);
const op_has_any: StubPipeline = where(($) => [$("roles"), "#|", ["admin", "mod"]]);
const op_has_all: StubPipeline = where(($) => [$("roles"), "#&", ["admin", "editor"]]);

// Typeof
const op_typeof: StubPipeline = where(($) => [$("name"), ":", "string"]);
const op_ntypeof: StubPipeline = where(($) => [$("name"), "!:", "number"]);
const op_typeof_any: StubPipeline = where(($) => [$("age"), ":|", ["number", "string"]]);

// --- Range (4-member) ---

const r1: StubPipeline = where(($) => [$("age"), "><", 18, 65]);
const r2: StubPipeline = where(($) => [$("age"), ">=<", 18, 65]);
const r3: StubPipeline = where(($) => [$("age"), "!><", 18, 65]);
const r4: StubPipeline = where(($) => [$("age"), "><", 18, $("logins")]);

// --- Combinators ---

const c1: StubPipeline = where(($) => $.or([$("age"), ">", 18], [$("name"), "%", "A"]));
const c2: StubPipeline = where(($) => $.and([$("age"), ">", 18], [$("active"), "=", true]));
const c3: StubPipeline = where(($) => $.not([$("active"), "=", false]));
const c4: StubPipeline = where(($) => $.xor([$("age"), ">", 18], [$("active"), "=", true]));

// Nested combinator
const c5: StubPipeline = where(($) => $.or($.and([$("age"), ">", 18], [$("active"), "=", true]), [$("roles"), "#", "admin"]));

// --- Sort ---

const s1: StubPipeline = sort(($) => $("name"), "asc");
const s2: StubPipeline = sort(($) => $("age"), "desc");
const s3: StubPipeline = sort(($) => $("nested")("deep"), "asc");
const s4: StubPipeline = sort(($) => $.DEPTH, "desc");

// ============================================================
// Discriminated Union Tests
// These tests WILL FAIL until AllStringKeys/SafeLookup support is added.
// Currently, keyof over a union only yields common keys ("type"),
// so variant-specific keys like "age" or "title" are inaccessible.
// ============================================================

type UnionData = { type: "person"; age: number; name: string } | { type: "book"; title: string; pages: number };

type UnionMeta = { ID: string };

declare const uWhere: WhereClause<UnionData, UnionMeta, StubPipeline>;
declare const uSort: SortClause<UnionData, UnionMeta, StubPipeline>;

// Common key — works today
const u1: StubPipeline = uWhere(($) => [$("type"), "=", "person"]);

// Variant-specific keys — FAILS today (keyof gives only "type")
const u2: StubPipeline = uWhere(($) => [$("age"), ">", 18]);
const u3: StubPipeline = uWhere(($) => [$("title"), "%", "TypeScript"]);
const u4: StubPipeline = uWhere(($) => [$("pages"), ">", 100]);
const u5: StubPipeline = uWhere(($) => [$("name"), "=", "Alice"]);

// Variant-specific key in sort — FAILS today
const u6: StubPipeline = uSort(($) => $("age"), "asc");
const u7: StubPipeline = uSort(($) => $("title"), "desc");

// Variant-specific key on RHS — FAILS today
const u8: StubPipeline = uWhere(($) => [$("age"), ">", $("pages")]);

// Variant-specific nested access — FAILS today
type NestedUnionData = { type: "a"; meta: { score: number } } | { type: "b"; meta: { label: string } };

declare const nuWhere: WhereClause<NestedUnionData, UnionMeta, StubPipeline>;

// Common key works, variant-specific nested key fails
const nu1: StubPipeline = nuWhere(($) => [$("type"), "=", "a"]);
const nu2: StubPipeline = nuWhere(($) => [$("meta")("score"), ">", 5]);
const nu3: StubPipeline = nuWhere(($) => [$("meta")("label"), "%", "hello"]);

// Combinator with variant-specific keys — FAILS today
const u9: StubPipeline = uWhere(($) => $.or([$("age"), ">", 18], [$("title"), "%", "Guide"]));

// Equality any-of with variant-specific key — FAILS today
const u10: StubPipeline = uWhere(($) => [$("name"), "=|", ["Alice", "Bob"]]);

// ============================================================
// Optional Field Tests
// ============================================================

type OptionalData = {
    name: string;
    age: number;
    nickname?: string;
    score?: number;
    tags?: string[];
    nested: { value: number; label?: string };
};

declare const oWhere: WhereClause<OptionalData, TestMeta, StubPipeline>;
declare const oSort: SortClause<OptionalData, TestMeta, StubPipeline>;

// Required fields — should work
const o1: StubPipeline = oWhere(($) => [$("name"), "=", "Alice"]);
const o2: StubPipeline = oWhere(($) => [$("age"), ">", 18]);

// Optional fields — should these work?
const o3: StubPipeline = oWhere(($) => [$("nickname"), "=", "Ali"]);
const o4: StubPipeline = oWhere(($) => [$("score"), ">", 50]);
const o5: StubPipeline = oWhere(($) => [$("tags"), "#", "admin"]);

// Optional field in sort
const o6: StubPipeline = oSort(($) => $("score"), "asc");

// String ops on optional string
const o7: StubPipeline = oWhere(($) => [$("nickname"), "%", "Ali"]);

// Nested optional field
const o8: StubPipeline = oWhere(($) => [$("nested")("label"), "%", "hello"]);

// Optional field on RHS
const o9: StubPipeline = oWhere(($) => [$("age"), ">", $("score")]);

// Size of optional array
const o10: StubPipeline = oWhere(($) => [$("tags").size(), ">", 0]);
