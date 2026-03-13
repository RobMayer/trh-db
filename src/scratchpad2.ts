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

    D11 — Sublens on both sides of comparators
        The right-hand side of .where() can be a value OR another sublens, enabling
        intra-item comparisons:
            .where($ => [$("age"), "=", $("logins")])
        $ is in scope for the entire tuple expression, so sublens-on-RHS is natural.

    D12 — Shared infrastructure across DB shapes
        Sublens, .where(), .sort(), .distinct(), .paginate(), .first(), .last(), .get(),
        .update() etc. are shared across all DB types.
        DB-specific methods:
        - Tree: .roots(), .children(), .parent(), .ancestors(), .deep(), .wide(), .siblings()
        - Graph: TBD — complicated by dual item types (nodes + links)
        - Collection: essentially just the shared base

    D13 — Operator system carried forward from typeScratchpad.ts
        The full operator set ("=", "!=", ">", "<", ">=", "<=", "><", "%", "#", "=|", etc.)
        and their semantics carry forward unchanged. Numerify ops omitted —
        sublens .size() + standard ordering covers that. "#" is used for array containment
        ("has"), replacing the earlier "?" symbol.

    D14 — Unified tuple .where() syntax
        .where() always takes a single callback returning a tuple (or PredicateResult for combinators).
        Three forms:
            .where($ => [$("age"), ">", 12])            — 3-member standard
            .where($ => [$("age"), "><", 18, 65])        — 4-member range
            .where($ => $.or([...], [...]))              — combinator
        This replaced the earlier three-arg form and solved RHS callback inference issues.

    D15 — Range ops use 4-member tuples exclusively
        RangeOp ("><", "!><", ">=<", "!>=<") is excluded from OperatorFor<T> and only appears in
        4-member predicates: [sublens, rangeOp, lo, hi]. This avoids nested tuple inference
        issues that occurred with [sublens, "><", [lo, hi]].

    D16 — Typeof RHS is open-ended string
        The typeof operators (":", "!:", ":|", "!:|") use string / string[] as RHS, not a
        closed union. Users can register custom type descriptors, so the type system should
        not restrict to built-in type names.

    D17 — SubLens conditional callable
        SubLensResult<T> splits into SubLensResultBase<T> (phantom + utilities like .size())
        and SubLensResultCallable<T> (deep property access via call signature). The callable
        part is only included for object types — primitives like number/string don't get a
        call signature, preventing keyof pollution (e.g., "toFixed" showing up as a valid key).

    Open questions:
    - Mutation method specifics: what .update(), .move(), etc. look like as terminals
    - Wildcard sublens: $("array")("*")("prop") — multi-value resolution, operator semantics (any/all?)
    - WhereClause cardinality narrowing: matching by ID could narrow "multi" → "single"


*/

import { ListOf, ListOr, TreeId, TreeItemOf, Updater } from "./types";
import { GetterLens } from "./util/lens";
import { WhereClause, SortClause } from "./util/traversal";

// todo: what will eventually replace WhereClause
type WhereClauseNew = <D>(
    $: GetterLens<D> & {
        ID: GetterLens<string>;
        PARENT: GetterLens<string | null>;
        CHILDREN: GetterLens<string[]>;
        DEPTH: GetterLens<number>;
    },
) => unknown;

class TreeDBNew<D> {
    // --- Direct methods (bypass pipeline) ---
    get: {
        (target: TreeId): Promise<Item<D> | undefined>;
        (target: ListOf<TreeId>): Promise<Item<D>[]>;
    } = async () => undefined as any;
    pluck: {
        (target: TreeId): Promise<Item<D> | undefined>;
        (target: ListOf<TreeId>): Promise<Item<D>[]>;
    } = async () => undefined as any;
    move: {
        (target: TreeId, newParent: Updater<string | null, TreeItemOf<D>>): Promise<Item<D> | undefined>;
        (target: ListOf<TreeId>, newParent: Updater<string | null, TreeItemOf<D>>): Promise<Item<D>[]>;
        (payload: { [id: TreeId]: Updater<string | null, TreeItemOf<D>> }): Promise<Item<D>[]>;
    } = async () => undefined as any;

    // --- Chain starters → pipeline ---
    where: WhereClause<D, TreeMeta, TreePipeline<D, "multi">> = (() => {}) as any;
    select: {
        (target: TreeId): TreePipeline<D, "single">;
        (target: ListOf<TreeId>): TreePipeline<D, "multi">;
    } = () => ({}) as any;
    ancestors: {
        (target: ListOr<TreeId>): TreePipeline<D, "multi">;
    } = () => ({}) as any;
    children: {
        (target: ListOr<TreeId>): TreePipeline<D, "multi">;
    } = () => ({}) as any;
    parent: {
        (target: TreeId): TreePipeline<D, "single">;
        (target: ListOr<TreeId>): TreePipeline<D, "multi">;
    } = () => ({}) as any;
    roots: {
        (): TreePipeline<D, "multi">;
    } = () => ({}) as any;
    deep: {
        (target: ListOr<TreeId>): TreePipeline<D, "multi">;
    } = () => ({}) as any;
    wide: {
        (target: ListOr<TreeId>): TreePipeline<D, "multi">;
    } = () => ({}) as any;
    siblings: {
        (target: ListOr<TreeId>): TreePipeline<D, "multi">;
    } = () => ({}) as any;
}

// ============================================================
// Predicate & Operator Type System
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

// ============================================================
// Pipeline Interface
// ============================================================

// The item type for a tree pipeline
type Item<D> = TreeItemOf<D>;

// WhereClause and SortClause imported from ./util/lens

// --- Tree meta-fields (available via $ in .where() and .sort()) ---

type TreeMeta = {
    ID: string;
    DEPTH: number;
    PARENT: string | null;
    CHILDREN: string[];
};

// --- Cardinality ---

type Cardinality = "single" | "multi";

// --- Terminals ---
// Return type depends on cardinality

type TerminalResult<D, C extends Cardinality> = C extends "single" ? Item<D> | undefined : Item<D>[];

interface Terminals<D, C extends Cardinality> {
    get(): Promise<TerminalResult<D, C>>;
    count(): Promise<number>;
    exists(): Promise<boolean>;
    update(updater: Updater<D, Item<D>>): Promise<TerminalResult<D, C>>;
    pluck(): Promise<TerminalResult<D, C>>;
    splice(): Promise<TerminalResult<D, C>>;
    prune(): Promise<TerminalResult<D, C>>;
    trim(): Promise<TerminalResult<D, C>>;
    move(newParent: string | null | ((item: Item<D>) => string | null)): Promise<TerminalResult<D, C>>;
    id(): Promise<C extends "multi" ? string[] : string | undefined>;
}

// --- The Pipeline ---

interface TreePipeline<D, C extends Cardinality> extends Terminals<D, C> {
    // Filtering
    where: WhereClause<D, TreeMeta, TreePipeline<D, C>>;

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
    sort: SortClause<D, TreeMeta, TreePipeline<D, C>>;
    distinct(): TreePipeline<D, C>;
    slice(start: number, end?: number): TreePipeline<D, C>;
    paginate(page: number, perPage: number): TreePipeline<D, C>;

    // Per-item sub-pipeline
    each(fn: (sub: TreePipeline<D, "single">) => TreePipeline<D, Cardinality>): TreePipeline<D, "multi">;
}

// --- Test the Pipeline ---

declare const myDb: TreeDBNew<TestData>;

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
const r6 = myDb.where(($) => $.or([$("age"), ">", 18], [$("roles"), "#", "admin"])).get();
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

// --- Operator coverage tests ---

// =| (equality any-of): age is any of these values
const op1 = myDb.where(($) => [$("age"), "=|", [18, 21, 25]]).get();

// !=| (not in): age is none of these
const op2 = myDb.where(($) => [$("age"), "!=|", [18, 21, 25]]).get();

// #& (array has all): roles contains ALL of these
const op3 = myDb.where(($) => [$("roles"), "#&", ["admin", "editor"]]).get();

// !# (array does not have): roles does not contain "banned"
const op4 = myDb.where(($) => [$("roles"), "!#", "banned"]).get();

// >=< (inclusive range, 4-member)
const op5 = myDb.where(($) => [$("age"), ">=<", 18, 65]).get();

// ~ (regex match)
const op6 = myDb.where(($) => [$("name"), "~", /^Alice/i]).get();

// ~| (regex any-of)
const op7 = myDb.where(($) => [$("name"), "~|", [/^Alice/, /^Bob/]]).get();

// : (typeof check)
const op8 = myDb.where(($) => [$("name"), ":", "string"]).get();

// :| (typeof any-of)
const op9 = myDb.where(($) => [$("age"), ":|", ["number", "string"]]).get();

// %_ (starts with, insensitive)
const op10 = myDb.where(($) => [$("name"), "%_", "ali"]).get();

// !>= (not greater or equal)
const op11 = myDb.where(($) => [$("age"), "!>=", 18]).get();
