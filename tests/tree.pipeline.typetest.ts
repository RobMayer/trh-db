import { ListOf, ListOr, TreeId, TreeItemOf, Updater } from "../src/types";
import { QueryLens } from "../src/util/lens";
import { LogicalOps, PredicateResult } from "../src/util/logic";
import { Predicate } from "../src/util/predicate";

// ============================================================
// Pipeline Type Definitions (prototype)
// ============================================================

type LensMeta = {
    ID: QueryLens<string>;
    PARENT: QueryLens<string | null>;
    CHILDREN: QueryLens<string[]>;
    DEPTH: QueryLens<number>;
};

type Item<D> = TreeItemOf<D>;
type Cardinality = "single" | "multi";
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

interface TreePipeline<D, C extends Cardinality> extends Terminals<D, C> {
    // Filtering
    where: {
        <T>(lens: ($: QueryLens<D> & LensMeta & LogicalOps) => Predicate<T> | PredicateResult): TreePipeline<D, C>;
    };

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
    sort: {
        <T>(accessor: ($: QueryLens<D> & LensMeta) => QueryLens<T>, direction: "asc" | "desc"): TreePipeline<D, C>;
    };
    distinct(): TreePipeline<D, C>;
    slice(start: number, end?: number): TreePipeline<D, C>;
    paginate(page: number, perPage: number): TreePipeline<D, C>;

    // Per-item sub-pipeline
    each(fn: (sub: TreePipeline<D, "single">) => TreePipeline<D, Cardinality>): TreePipeline<D, "multi">;
}

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
    where: {
        <T>(lens: ($: QueryLens<D> & LensMeta & LogicalOps) => Predicate<T> | PredicateResult): TreePipeline<D, "multi">;
    } = (() => {}) as any;
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
// Test Data
// ============================================================

type TestData = {
    name: string;
    age: number;
    roles: string[];
    logins: number;
    active: boolean;
    nested: { deep: number };
};

declare const myDb: TreeDBNew<TestData>;

// ============================================================
// Pipeline Chaining & Cardinality
// ============================================================

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

// ============================================================
// Operator Coverage (through pipeline)
// ============================================================

const op1 = myDb.where(($) => [$("age"), "=|", [18, 21, 25]]).get();
const op2 = myDb.where(($) => [$("age"), "!=|", [18, 21, 25]]).get();
const op3 = myDb.where(($) => [$("roles"), "#&", ["admin", "editor"]]).get();
const op4 = myDb.where(($) => [$("roles"), "!#", "banned"]).get();
const op5 = myDb.where(($) => [$("age"), ">=<", 18, 65]).get();
const op6 = myDb.where(($) => [$("name"), "~", /^Alice/i]).get();
const op7 = myDb.where(($) => [$("name"), "~|", [/^Alice/, /^Bob/]]).get();
const op8 = myDb.where(($) => [$("name"), ":", "string"]).get();
const op9 = myDb.where(($) => [$("age"), ":|", ["number", "string"]]).get();
const op10 = myDb.where(($) => [$("name"), "%_", "ali"]).get();
const op11 = myDb.where(($) => [$("age"), "!>=", 18]).get();

// ============================================================
// Sort with meta-fields
// ============================================================

const s1 = myDb
    .where(($) => [$("age"), ">", 0])
    .sort(($) => $("name"), "asc")
    .get();
const s2 = myDb
    .where(($) => [$("age"), ">", 0])
    .sort(($) => $.DEPTH, "desc")
    .get();
const s3 = myDb
    .where(($) => [$("age"), ">", 0])
    .sort(($) => $("nested")("deep"), "asc")
    .get();
