import { ListOf, ListOr, TreeId, TreeItemOf, Updater } from "../types";
import { GetterLens, PathLens } from "../util/lens";
import { LogicalOps, PredicateResult } from "../util/logic";
import { Predicate } from "../util/predicate";

class TreeDB<D> {
    // --- Direct methods (bypass pipeline) ---
    get: {
        (target: TreeId): Promise<TreeItemOf<D> | undefined>;
        (target: ListOf<TreeId>): Promise<TreeItemOf<D>[]>;
    } = async () => undefined as any;
    pluck: {
        (target: TreeId): Promise<TreeItemOf<D> | undefined>;
        (target: ListOf<TreeId>): Promise<TreeItemOf<D>[]>;
    } = async () => undefined as any;
    move: {
        (target: TreeId, newParent: Updater<string | null, TreeItemOf<D>>): Promise<TreeItemOf<D> | undefined>;
        (target: ListOf<TreeId>, newParent: Updater<string | null, TreeItemOf<D>>): Promise<TreeItemOf<D>[]>;
        (payload: { [id: TreeId]: Updater<string | null, TreeItemOf<D>> }): Promise<TreeItemOf<D>[]>;
    } = async () => undefined as any;

    // --- Chain starters → pipeline ---
    where: {
        <T>(lens: ($: GetterLens<D> & LensMeta & LogicalOps) => Predicate<T> | PredicateResult): TreePipeline<D, "multi">;
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

type LensMeta = {
    ID: GetterLens<string>;
    PARENT: GetterLens<string | null>;
    CHILDREN: GetterLens<string[]>;
    DEPTH: GetterLens<number>;
};

// ============================================================
// Pipeline Interface
// ============================================================

// The item type for a tree pipeline
type Item<D> = TreeItemOf<D>;

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
    where: {
        <T>(lens: ($: GetterLens<D> & LensMeta & LogicalOps) => Predicate<T> | PredicateResult): TreePipeline<D, C>;
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
    sort: <T>(lens: ($: PathLens<D> & LensMeta) => PathLens<T>, dir: "asc" | "desc") => TreePipeline<D, C>;
    distinct(): TreePipeline<D, C>;
    slice(start: number, end?: number): TreePipeline<D, C>;
    paginate(page: number, perPage: number): TreePipeline<D, C>;

    // Per-item sub-pipeline
    each(fn: (sub: TreePipeline<D, "single">) => TreePipeline<D, Cardinality>): TreePipeline<D, "multi">;
}
