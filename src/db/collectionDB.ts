import { Codec, CollectionId, CollectionMemberOf, CollectionOf, LensPathSegment, ListOf, Updater } from "../types";
import { IndexStore } from "../util/indices";
import { DataLens, SelectorLens, PathLens } from "../util/lens/types";
import { LogicalOps, PredicateResult } from "../util/logic";
import { Predicate } from "../util/predicate";

// ------------------------------------------------------------
// CollectionDB<D>
// ------------------------------------------------------------

export class CollectionDB<D> {
    #data: CollectionOf<D>;
    #codec: Codec<CollectionMemberOf<D>, CollectionOf<D>>;
    #indices: IndexStore;

    constructor(codec: Codec<CollectionMemberOf<D>, CollectionOf<D>>) {
        this.#data = {};
        this.#indices = new IndexStore();
        this.#codec = codec;
    }

    // --- Direct methods (bypass pipeline) ---
    get: {
        (target: CollectionId): Promise<CollectionMemberOf<D> | undefined>;
        (target: ListOf<CollectionId>): Promise<CollectionMemberOf<D>[]>;
    } = async () => undefined as any;
    insert: {
        (id: CollectionId, data: D): Promise<CollectionMemberOf<D>>;
        (payload: { [id: CollectionId]: D }): Promise<CollectionMemberOf<D>[]>;
    } = async () => undefined as any;
    remove: {
        (target: CollectionId): Promise<CollectionMemberOf<D> | undefined>;
        (target: ListOf<CollectionId>): Promise<CollectionMemberOf<D>[]>;
    } = async () => undefined as any;

    // --- Chain starters → pipeline ---
    where: {
        <T>(lens: ($: SelectorLens<D> & CollectionMeta & LogicalOps) => Predicate<T> | PredicateResult): CollectionPipeline<D, "multi">;
    } = (() => {}) as any;
    select: {
        (target: CollectionId): CollectionPipeline<D, "single">;
        (target: ListOf<CollectionId>): CollectionPipeline<D, "multi">;
    } = () => ({}) as any;
    all: {
        (): CollectionPipeline<D, "multi">;
    } = () => ({}) as any;

    addIndex: {
        // index options as second arg?
        <T>(lens: ($: PathLens<D>) => PathLens<T>): void;
    } = () => ({}) as any;

    dropIndex: {
        <T>(lens: ($: PathLens<D>) => PathLens<T>): void;
    } = () => ({}) as any;
}

// ------------------------------------------------------------
// CollectionMeta
// ------------------------------------------------------------

export type CollectionMeta = {
    ID: SelectorLens<string>;
};

// ------------------------------------------------------------
// Pipeline Interface
// ------------------------------------------------------------

type Item<D> = CollectionMemberOf<D>;
type Cardinality = "single" | "multi";
type TerminalResult<D, C extends Cardinality> = C extends "single" ? Item<D> | undefined : Item<D>[];

// ------------------------------------------------------------
// Terminals
// ------------------------------------------------------------

interface CollectionTerminals<D, C extends Cardinality> {
    // --- Read terminals ---
    get(): Promise<TerminalResult<D, C>>;
    count(): Promise<number>;
    exists(): Promise<boolean>;
    id(): Promise<C extends "multi" ? string[] : string | undefined>;

    // --- Write terminals (whole-data) ---
    update(updater: Updater<D, Item<D>>): Promise<TerminalResult<D, C>>;
    remove(): Promise<TerminalResult<D, C>>;

    // --- Write terminals (lens-targeted) ---
    update<R>(lens: ($: DataLens<D>) => DataLens<R, any, any>, updater: Updater<R, Item<D>>): Promise<TerminalResult<D, C>>;
}

// ------------------------------------------------------------
// The Pipeline
// ------------------------------------------------------------

export interface CollectionPipeline<D, C extends Cardinality> extends CollectionTerminals<D, C> {
    // Filtering
    where<T>(lens: ($: SelectorLens<D> & CollectionMeta & LogicalOps) => Predicate<T> | PredicateResult): CollectionPipeline<D, C>;

    // Cardinality reducers (multi → single)
    first(): CollectionPipeline<D, "single">;
    last(): CollectionPipeline<D, "single">;
    at(index: number): CollectionPipeline<D, "single">;

    // Presentation (preserves cardinality)
    sort<T>(lens: ($: SelectorLens<D> & CollectionMeta) => SelectorLens<T>, dir: "asc" | "desc"): CollectionPipeline<D, C>;
    distinct(): CollectionPipeline<D, C>;
    slice(start: number, end?: number): CollectionPipeline<D, C>;
    paginate(page: number, count: number): CollectionPipeline<D, C>;
    window(skip: number, take: number): CollectionPipeline<D, C>; // variation that can use slice under the hood. Give me up-to-Y-items starting at X
}
