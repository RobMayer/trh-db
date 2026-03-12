/*
    Design Decisions — Pipeline/Cursor API

    D1 — Pipeline model, not monolithic lens
        The DB query system uses a chainable pipeline rather than a single lens callback.
        Each pipeline step transforms the working set of items. The pipeline always operates
        on a flat set of items (not data properties — just whole items).

    D2 — Terminal verbs
        The CRUD action is the *terminator* of the chain, not the initiator.
        .get() returns results. .update(), .pluck(), .prune(), .move(), etc. perform mutations.
        Everything before the terminal is targeting/filtering/traversal.

    D3 — Flexible entry points
        The DB class offers multiple entry points depending on how much you already know:
        - Direct:       myDb.get("someId")                         — bypass pipeline entirely
        - Traversal:    myDb.ancestors("someId").where(...).get()   — start from a known node
        - Full pipeline: myDb.where(...).ancestors().get()          — discovery via filtering

        Shorthand traversal entry points like myDb.children("id"), myDb.deep("id")
        are sugar for myDb.where($ => $.ID, "=", "id").children(), etc.

    D4 — Sublens is a minimal property accessor
        The sublens ($ => $("age"), $ => $("roles").size()) is used only for pointing at
        properties within item data. It does NOT carry query logic, traversal, or filtering.
        This makes it data-shape-agnostic and reusable across DB types (tree, graph, collection).

    D5 — Structural traversal lives on the pipeline
        Methods like .ancestors(), .children(), .deep(), .wide(), .siblings(), .parent()
        are cursor/pipeline methods, not part of the sublens. They expand or transform
        the working set of items by following structural relationships.

    D6 — Flat set default with .each() for per-item sub-pipelines
        Traversal methods (e.g., .ancestors()) flatMap by default — all results go into
        one flat set. For per-item semantics, use .each():
            myDb.where(...).each(q => q.ancestors().last()).get()
        .each() scopes a sub-pipeline per item, collects results back into the outer set.
        .each() can be nested.

    D7 — Items only; projection is a separate terminal
        The pipeline always yields whole items (TreeItemOf<D>, etc.), never raw data values.
        The sublens peeks into data for filtering/sorting purposes, but the pipeline result
        is always items. If data reshaping is needed, a .project() terminal handles it.
        This eliminates the "items vs data" mode tracking from the lens design.

    D8 — Cardinality tracking (single vs multi)
        The pipeline tracks whether the result is a single item or multiple items.
        .first(), .last(), .at(n) collapse to single. .where(), traversals stay multi.
        The terminal's return type reflects this:
            .get() after multi  → Item[]
            .get() after single → Item | undefined
            .get("someId")      → Item | undefined

    D9 — Presentation methods on the pipeline
        .sort(), .distinct(), .paginate(), .slice(), .first(), .last(), .at()
        are pipeline methods that shape results without changing what's selected.
        .distinct() is explicit — deduplication is never implicit.

    D10 — Implicit AND for chained .where(), combinatorial logic for OR
        Multiple .where() calls chain as implicit AND.
        OR / complex boolean logic uses $.or() and $.and() inside a single .where():
            myDb.where($ => $.or(
                [$("age"), ">", 12],
                [$("roles"), "=|", ["admin", "superadmin"]]
            )).get()
        Tuple form [sublens, operator, value] for predicates within combinators (to be validated).

    D11 — Sublens on both sides of comparators
        The right-hand side of .where() can be a value OR another sublens, enabling
        intra-item comparisons:
            .where($ => $("age"), "=", $ => $("roles").size())

    D12 — Shared infrastructure across DB shapes
        Sublens, .where(), .sort(), .distinct(), .paginate(), .first(), .last(), .get(),
        .update() etc. are shared across all DB types.
        DB-specific methods:
        - Tree: .roots(), .children(), .parent(), .ancestors(), .deep(), .wide(), .siblings()
        - Graph: TBD — complicated by dual item types (nodes + links)
        - Collection: essentially just the shared base

    D13 — Operator system carried forward from typeScratchpad.ts
        The full operator set ("=", "!=", ">", "<", ">=", "<=", "><", "%", "?", "=|", etc.)
        and their semantics (including range tuples for "><") carry forward unchanged.

    Open questions:
    - Tuple predicate typing: can generics + mapped variadic tuples make [sublens, op, value] type-safe?
    - Mutation method specifics: what .update(), .move(), etc. look like as terminals

    

*/

import { ListOr, TreeId, TreeItemOf, Updater } from "./types";

class TreeDBNew<D> {
    // without chain building
    get: {
        (target: ListOr<TreeId>): Promise<unknown>;
    } = async () => {};
    pluck: {
        (target: ListOr<TreeId>): Promise<unknown>;
    } = async () => {};
    move: {
        (target: ListOr<TreeId>, newParent: Updater<string | null, TreeItemOf<D>>): Promise<unknown>;
        (payload: { [id: TreeId]: Updater<string | null, TreeItemOf<D>> }): Promise<unknown>;
    } = async () => {};
    // etc....

    // chain quickstart
    ancestors: {
        (target: ListOr<TreeId>): unknown; // chain...
    } = () => {};

    select: {
        (target: ListOr<TreeId>): unknown; // chain...
    } = () => {};

    parent: {
        (target: ListOr<TreeId>): unknown; // chain...
    } = () => {};

    children: {
        (target: ListOr<TreeId>): unknown; // chain...
    } = () => {};

    where: {
        (nowTheFunBegins: unknown): unknown; //chain
    } = () => {};
}

interface SelectorTerminator {
    get: () => Promise<unknown>;
    move: (newParent: string | null | ((item: unknown) => string | null)) => Promise<unknown>;
    pluck: () => Promise<unknown>;
    //...etc
}

// ============================================================
// Tuple Predicate Typing Experiment
// ============================================================

// Test data shape
type TestData = {
    name: string;
    age: number;
    roles: string[];
    logins: number;
    active: boolean;
    nested: { deep: number };
};

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
type SubLensBuilder<D> = {
    <K extends keyof D>(key: K): SubLensResult<D[K]>;
    // meta-fields
    readonly ID: SubLensResult<string>;
    readonly DEPTH: SubLensResult<number>;
};

// --- Operators grouped by the type they apply to ---

type EqualityOp = "=" | "!=";
type OrderingOp = ">" | "<" | ">=" | "<=";
type RangeOp = "><";
type StringOp = "%" | "%|";
type ArrayContainsOp = "?";
type ArrayIncludesOp = "=|" | "!|";

// Map from value type T to valid operators (3-member predicates only)
// RangeOp excluded — range ops always use 4-member predicates.
type OpFor<T> = EqualityOp | (T extends number ? OrderingOp : never) | (T extends string ? OrderingOp | StringOp : never) | (T extends any[] ? ArrayContainsOp | ArrayIncludesOp : never);

// Map from operator to valid RHS type (for 3-member predicates)
// Range ops use 4-member predicates instead, so excluded here.
type RhsFor<T, Op> = Op extends ArrayContainsOp ? (T extends (infer E)[] ? E | SubLensResult<E> : never) : T | SubLensResult<T>;

// --- The Predicate tuples ---
// 3-member: [sublens, op, value]        — standard ops
// 4-member: [sublens, rangeOp, lo, hi]  — range ops (avoids nested tuple inference issues)

type Predicate3<T, Op extends Exclude<OpFor<T>, RangeOp> = Exclude<OpFor<T>, RangeOp>> = [SubLensResult<T>, Op, RhsFor<T, Op>];
type Predicate4<T> = [SubLensResult<T>, RangeOp, T | SubLensResult<T>, T | SubLensResult<T>];

// --- or() / and() with mapped variadic tuples ---

type PredicateResult = { readonly __predicate: true };

// Extract T from a SubLensResult sitting in position 0 of a tuple
type InferT<Tuple> = Tuple extends [SubLensResult<infer T>, ...any[]] ? T : never;

// Validate a single predicate tuple (3 or 4 members)
type ValidPredicate<D, Tuple> =
    // 4-member: range op
    Tuple extends [SubLensResult<infer T>, infer Op, any, any]
        ? Op extends RangeOp
            ? [SubLensResult<T>, Op, T | SubLensResult<T>, T | SubLensResult<T>]
            : [SubLensResult<T>, RangeOp, "ERROR: only range ops use 4-member predicates"]
        : // 3-member: standard op
          Tuple extends [SubLensResult<infer T>, infer Op, any]
          ? Op extends OpFor<T>
              ? [SubLensResult<T>, Op, RhsFor<T, Op>]
              : [SubLensResult<T>, OpFor<T>, "ERROR: invalid operator for this type"]
          : never;

// The combinator functions
// Each condition can be a predicate tuple (3 or 4 members) OR a nested PredicateResult
type CombinatorArg<D, T> = T extends PredicateResult ? T : ValidPredicate<D, T>;

type CombinatorFn<D> = {
    or<Tuples extends ([any, any, any] | [any, any, any, any] | PredicateResult)[]>(...conditions: { [K in keyof Tuples]: CombinatorArg<D, Tuples[K]> }): PredicateResult;
    and<Tuples extends ([any, any, any] | [any, any, any, any] | PredicateResult)[]>(...conditions: { [K in keyof Tuples]: CombinatorArg<D, Tuples[K]> }): PredicateResult;
};

// The $ passed into .where() for combinatorial logic
type WhereCombinator<D> = SubLensBuilder<D> & CombinatorFn<D>;

// ============================================================
// Pipeline Interface
// ============================================================

// The item type for a tree pipeline
type Item<D> = TreeItemOf<D>;

// --- .where() overloads on the pipeline ---
// Unified: always a single callback returning either a tuple or a PredicateResult.
// $ is in scope for the whole expression, so sublens-on-RHS is natural.

type WhereClause<D> = {
    // 3-member tuple: .where($ => [$("age"), ">", 12])
    <T, Op extends OpFor<T>>(predicate: (sb: WhereCombinator<D>) => [SubLensResult<T>, Op, RhsFor<T, Op>]): TreePipeline<D, "multi">;

    // 4-member tuple: .where($ => [$("age"), "><", 18, 65])
    <T>(predicate: (sb: WhereCombinator<D>) => [SubLensResult<T>, RangeOp, T | SubLensResult<T>, T | SubLensResult<T>]): TreePipeline<D, "multi">;

    // Combinator: .where($ => $.or([...], [...]))
    (predicate: (sb: WhereCombinator<D>) => PredicateResult): TreePipeline<D, "multi">;
};

// --- Sort ---

type SortDirection = "asc" | "desc";

type SortClause<D, C extends Cardinality> = {
    <T>(accessor: (sb: SubLensBuilder<D>) => SubLensResult<T>, direction: SortDirection): TreePipeline<D, C>;
};

// --- Cardinality ---

type Cardinality = "single" | "multi";

// --- Terminals ---
// Return type depends on cardinality

type TerminalResult<D, C extends Cardinality> = C extends "single" ? Item<D> | undefined : Item<D>[];

interface Terminals<D, C extends Cardinality> {
    get(): Promise<TerminalResult<D, C>>;
    update(updater: Updater<D, Item<D>>): Promise<TerminalResult<D, C>>;
    pluck(): Promise<TerminalResult<D, C>>;
    splice(): Promise<TerminalResult<D, C>>;
    prune(): Promise<TerminalResult<D, C>>;
    trim(): Promise<TerminalResult<D, C>>;
    move(newParent: string | null | ((item: Item<D>) => string | null)): Promise<TerminalResult<D, C>>;
}

// --- The Pipeline ---

interface TreePipeline<D, C extends Cardinality> extends Terminals<D, C> {
    // Filtering
    where: WhereClause<D>;

    // Tree traversal (always produces multi)
    ancestors(): TreePipeline<D, "multi">;
    parent(): TreePipeline<D, "multi">;
    children(): TreePipeline<D, "multi">;
    siblings(): TreePipeline<D, "multi">;
    deep(): TreePipeline<D, "multi">;
    wide(): TreePipeline<D, "multi">;
    roots(): TreePipeline<D, "multi">;

    // Cardinality reducers (multi → single)
    first(): TreePipeline<D, "single">;
    last(): TreePipeline<D, "single">;
    at(index: number): TreePipeline<D, "single">;

    // Presentation (preserves cardinality)
    sort: SortClause<D, C>;
    distinct(): TreePipeline<D, C>;
    slice(start: number, end?: number): TreePipeline<D, C>;
    paginate(page: number, perPage: number): TreePipeline<D, C>;

    // Per-item sub-pipeline
    each(fn: (sub: TreePipeline<D, "single">) => TreePipeline<D, Cardinality>): TreePipeline<D, "multi">;
}

// --- Test the Pipeline ---

declare const myDb: {
    // Direct methods
    get(target: ListOr<TreeId>): Promise<Item<TestData> | undefined>;
    pluck(target: ListOr<TreeId>): Promise<Item<TestData> | undefined>;

    // Chain starters → pipeline
    where: WhereClause<TestData>;
    select(target: ListOr<TreeId>): TreePipeline<TestData, "multi">;
    ancestors(target: ListOr<TreeId>): TreePipeline<TestData, "multi">;
    children(target: ListOr<TreeId>): TreePipeline<TestData, "multi">;
    parent(target: ListOr<TreeId>): TreePipeline<TestData, "single">;
    deep(target: ListOr<TreeId>): TreePipeline<TestData, "multi">;
    wide(target: ListOr<TreeId>): TreePipeline<TestData, "multi">;
};

// --- Pipeline test cases ---

// Basic: where → get (multi)
const r1 = myDb.where(($) => [$("age"), ">", 12]).get();
//    ^? Promise<Item<TestData>[]>

// Cardinality collapse: where → first → get (single)
const r2 = myDb
    .where(($) => [$("age"), ">", 12])
    .first()
    .get();
//    ^? Promise<Item<TestData> | undefined>

// Traversal shortcut → chain
const r3 = myDb
    .ancestors("someId")
    .where(($) => [$.DEPTH, "=", 0])
    .get();
//    ^? Promise<Item<TestData>[]>

// Full rootsOfMinors pipeline
const r4 = myDb
    .where(($) => [$("age"), "<", 18])
    .each((q) => q.ancestors().last())
    .distinct()
    .get();
//    ^? Promise<Item<TestData>[]>

// Sort + paginate
const r5 = myDb
    .where(($) => [$("age"), ">", 12])
    .sort(($) => $("name"), "asc")
    .paginate(2, 30)
    .get();
//    ^? Promise<Item<TestData>[]>

// Combinator where
const r6 = myDb.where(($) => $.or([$("age"), ">", 18], [$("roles"), "?", "admin"])).get();
//    ^? Promise<Item<TestData>[]>

// Mutation terminal
const r7 = myDb.where(($) => [$("active"), "=", false]).prune();
//    ^? Promise<Item<TestData>[]>

// Sublens on RHS
const r8 = myDb.where(($) => [$("age"), "=", $("logins")]).get();
//    ^? Promise<Item<TestData>[]>

// Range with sublens on one side (4-member tuple)
const r9 = myDb.where(($) => [$("age"), "><", 18, $("logins")]).get();
//    ^? Promise<Item<TestData>[]>

// Range inside combinator (4-member tuple in $.or)
const r9b = myDb.where(($) => $.or([$("age"), "><", 18, 25], [$("name"), "%", "A"])).get();
//    ^? Promise<Item<TestData>[]>

// Deep sublens access
const r10 = myDb.where(($) => [$("nested")("deep"), ">", 5]).get();
//    ^? Promise<Item<TestData>[]>

// Sublens utility
const r11 = myDb.where(($) => [$("roles").size(), ">", 2]).get();
//    ^? Promise<Item<TestData>[]>
