import { Codec, CollectionId, CollectionMemberOf, CollectionOf, LensPathSegment, ListOf, Updater } from "../types";
import { IndexStore, stringifyIndex } from "../util/indices";
import { Lens } from "../util/lens";
import { DataLens, SelectorLens, PathLens } from "../util/lens/types";
import { LogicalOps, PredicateResult } from "../util/logic";
import { Predicate } from "../util/predicate";

// ------------------------------------------------------------
// CollectionDB<D>
// ------------------------------------------------------------

type CollectionItemMeta = {
    id: string;
};

export class CollectionDB<D> {
    private data: CollectionOf<D> = {};
    private codec: Codec<CollectionMemberOf<D>, CollectionOf<D>>;
    private indices = new IndexStore();
    private indexLenses: { [serializedKey: string]: Function } = {};

    constructor(codec: Codec<CollectionMemberOf<D>, CollectionOf<D>>) {
        this.codec = codec;
    }

    // --- Direct methods (bypass pipeline) ---

    get(target: CollectionId): CollectionMemberOf<D> | undefined;
    get(target: ListOf<CollectionId>): CollectionMemberOf<D>[];
    get(target: CollectionId | ListOf<CollectionId>): CollectionMemberOf<D> | undefined | CollectionMemberOf<D>[] {
        if (typeof target === "string") {
            return this.data[target];
        }
        const ids = target instanceof Set ? target : target;
        const results: CollectionMemberOf<D>[] = [];
        for (const id of ids) {
            const item = this.data[id];
            if (item) results.push(item);
        }
        return results;
    }

    async update(id: CollectionId, data: D | ((prev: D, meta: Item<D>) => D)): Promise<void>;
    async update(payload: { [key: CollectionId]: D }): Promise<void>;
    async update(ids: ListOf<CollectionId>, updater: (prev: D, meta: Item<D>) => D): Promise<void>;
    async update(idOrPayload: CollectionId | { [key: CollectionId]: D } | ListOf<CollectionId>, dataOrUpdater?: D | ((prev: D, meta: Item<D>) => D)): Promise<void> {
        const items: CollectionMemberOf<D>[] = [];

        if (typeof idOrPayload === "string") {
            const existing = this.data[idOrPayload];
            if (!existing) return;
            const newData = typeof dataOrUpdater === "function" ? (dataOrUpdater as (prev: D, meta: Item<D>) => D)(existing.data, existing) : dataOrUpdater as D;
            this.deindexRecord(idOrPayload, existing.data);
            existing.data = newData;
            this.indexRecord(idOrPayload, newData);
            items.push(existing);
        } else if (idOrPayload instanceof Set || Array.isArray(idOrPayload)) {
            const updater = dataOrUpdater as (prev: D, meta: Item<D>) => D;
            for (const id of idOrPayload) {
                const existing = this.data[id];
                if (!existing) continue;
                const newData = updater(existing.data, existing);
                this.deindexRecord(id, existing.data);
                existing.data = newData;
                this.indexRecord(id, newData);
                items.push(existing);
            }
        } else {
            for (const [id, d] of Object.entries(idOrPayload)) {
                const existing = this.data[id];
                if (!existing) continue;
                this.deindexRecord(id, existing.data);
                existing.data = d as D;
                this.indexRecord(id, d as D);
                items.push(existing);
            }
        }

        if (items.length > 0) await this.codec.update(items, this.data);
    }

    async insert(id: CollectionId, data: D): Promise<void>;
    async insert(payload: { [id: CollectionId]: D }): Promise<void>;
    async insert(idOrPayload: CollectionId | { [id: CollectionId]: D }, data?: D): Promise<void> {
        const items: CollectionMemberOf<D>[] = [];

        if (typeof idOrPayload === "string") {
            const member: CollectionMemberOf<D> = { id: idOrPayload, data: data! };
            this.data[idOrPayload] = member;
            this.indexRecord(idOrPayload, data!);
            items.push(member);
        } else {
            for (const [id, d] of Object.entries(idOrPayload)) {
                const member: CollectionMemberOf<D> = { id, data: d as D };
                this.data[id] = member;
                this.indexRecord(id, d as D);
                items.push(member);
            }
        }

        await this.codec.insert(items, this.data);
    }

    async remove(target: CollectionId): Promise<void>;
    async remove(target: ListOf<CollectionId>): Promise<void>;
    async remove(target: CollectionId | ListOf<CollectionId>): Promise<void> {
        const items: CollectionMemberOf<D>[] = [];

        if (typeof target === "string") {
            const item = this.data[target];
            if (item) {
                this.deindexRecord(target, item.data);
                delete this.data[target];
                items.push(item);
            }
        } else {
            for (const id of target) {
                const item = this.data[id];
                if (item) {
                    this.deindexRecord(id, item.data);
                    delete this.data[id];
                    items.push(item);
                }
            }
        }

        if (items.length > 0) await this.codec.delete(items, this.data);
    }

    // --- Index management ---

    addIndex<T>(lens: ($: PathLens<D>) => PathLens<T>): void {
        const segments = Lens.path(lens);
        const key = stringifyIndex(segments);
        if (this.indexLenses[key]) return;
        this.indexLenses[key] = lens;
        this.indices.create(segments);
        for (const [id, item] of Object.entries(this.data)) {
            const value = Lens.get(item.data as D, lens as any);
            if (value !== undefined) this.indices.index(key, value, id);
        }
    }

    dropIndex<T>(lens: ($: PathLens<D>) => PathLens<T>): void {
        const segments = Lens.path(lens);
        const key = stringifyIndex(segments);
        delete this.indexLenses[key];
        this.indices.drop(segments);
    }

    // --- Index maintenance (private) ---

    private indexRecord(id: string, data: D): void {
        for (const [key, lens] of Object.entries(this.indexLenses)) {
            const value = Lens.get(data, lens as any);
            if (value !== undefined) this.indices.index(key, value, id);
        }
    }

    private deindexRecord(id: string, data: D): void {
        for (const [key, lens] of Object.entries(this.indexLenses)) {
            const value = Lens.get(data, lens as any);
            if (value !== undefined) this.indices.deindex(key, value, id);
        }
    }

    // --- Chain starters → pipeline (stubs) ---
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
