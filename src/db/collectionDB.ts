import { Codec, CollectionId, CollectionMemberOf, CollectionOf, ListOf, Updater } from "../types";
import { IndexStore, stringifyIndex } from "../util/indices";
import { Lens } from "../util/lens";
import { sortCompare } from "../util/predicate";
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
    private codec: Codec<CollectionMemberOf<D>>;
    private indices = new IndexStore();
    private indexLenses: { [serializedKey: string]: Function } = {};

    constructor(codec: Codec<CollectionMemberOf<D>>) {
        this.codec = codec;
    }

    async load() {
        return this.codec.load();
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
            const newData = typeof dataOrUpdater === "function" ? (dataOrUpdater as (prev: D, meta: Item<D>) => D)(existing.data, existing) : (dataOrUpdater as D);
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

    // --- Chain starters → pipeline ---
    where: {
        <T>(lens: ($: SelectorLens<D> & CollectionMeta & LogicalOps) => Predicate<T> | PredicateResult): CollectionPipeline<D, "multi">;
    } = ((predFn: Function) => createPipeline(this, { type: "where", predFn })) as any;
    select: {
        (target: CollectionId): CollectionPipeline<D, "single">;
        (target: ListOf<CollectionId>): CollectionPipeline<D, "multi">;
    } = ((target: CollectionId | ListOf<CollectionId>) => {
        if (typeof target === "string") return createPipeline(this, { type: "selectOne", id: target });
        return createPipeline(this, { type: "select", ids: [...target] });
    }) as any;
    all: {
        (): CollectionPipeline<D, "multi">;
    } = (() => createPipeline(this, { type: "all" })) as any;
}

// ------------------------------------------------------------
// Pipeline Runtime
// ------------------------------------------------------------

type PipelineSeed = { type: "all" } | { type: "select"; ids: string[] } | { type: "selectOne"; id: string } | { type: "where"; predFn: Function };

type PipelineOp =
    | { type: "where"; predFn: Function }
    | { type: "sort"; lensFn: Function; dir: "asc" | "desc" }
    | { type: "first" }
    | { type: "last" }
    | { type: "at"; index: number }
    | { type: "distinct" }
    | { type: "slice"; start: number; end?: number };

const INDEX_OPS: { [op: string]: (idx: IndexStore, key: string, operand: unknown, operand2?: unknown) => ReadonlySet<string> | Set<string> } = {
    "=": (idx, key, v) => idx.eq(key, v),
    ">": (idx, key, v) => idx.gt(key, v),
    ">=": (idx, key, v) => idx.gte(key, v),
    "<": (idx, key, v) => idx.lt(key, v),
    "<=": (idx, key, v) => idx.lte(key, v),
    "><": (idx, key, lo, hi) => idx.range(key, lo, hi, false, false),
    ">=<": (idx, key, lo, hi) => idx.range(key, lo, hi, true, false),
};

function evalWhereForItem<D>(predFn: Function, item: Item<D>): boolean {
    return Lens.match(item.data, predFn, { ID: item.id });
}

function tryIndexAccelerate<D>(predFn: Function, db: CollectionDB<D>): Set<string> | null {
    const probed = Lens.probe(predFn);
    if (!probed) return null;

    const { path, operator, operand, operand2 } = probed;

    // Check if path is indexed
    const pathKey = stringifyIndex(path);
    const indices = (db as any).indices as IndexStore;
    if (!indices.keys().includes(pathKey)) return null;

    // Strip negation — we can't accelerate negated ops via index (would need complement)
    if (operator.startsWith("!")) return null;
    // Strip any-of/all-of suffixes — not directly index-accelerable
    if (operator.endsWith("|") || operator.endsWith("&")) return null;

    const indexOp = INDEX_OPS[operator];
    if (!indexOp) return null;

    if (operand2 !== undefined) {
        return indexOp(indices, pathKey, operand, operand2) as Set<string>;
    }
    return indexOp(indices, pathKey, operand) as Set<string>;
}

function createPipeline<D>(db: CollectionDB<D>, seed: PipelineSeed): any {
    const ops: PipelineOp[] = [];
    const data = (db as any).data as CollectionOf<D>;

    function resolve(): Item<D>[] {
        switch (seed.type) {
            case "all":
                return Object.values(data);
            case "selectOne": {
                const item = data[seed.id];
                return item ? [item] : [];
            }
            case "select":
                return seed.ids.map((id) => data[id]).filter(Boolean) as Item<D>[];
            case "where": {
                // Try index acceleration
                const indexed = tryIndexAccelerate(seed.predFn, db);
                if (indexed) {
                    // Index gave us candidate IDs — fetch and filter (index may be stale for complex predicates)
                    const candidates = [...indexed].map((id) => data[id]).filter(Boolean) as Item<D>[];
                    return candidates.filter((item) => evalWhereForItem(seed.predFn, item));
                }
                // Full scan
                return Object.values(data).filter((item) => evalWhereForItem(seed.predFn, item));
            }
        }
    }

    function execute(): Item<D>[] | Item<D> | undefined {
        let items = resolve();
        let isSingle = seed.type === "selectOne";

        for (const op of ops) {
            switch (op.type) {
                case "where":
                    items = items.filter((item) => evalWhereForItem(op.predFn, item));
                    break;
                case "sort": {
                    items = [...items].sort((a, b) => {
                        const aVal = Lens.get(a.data as any, op.lensFn as any, { ID: a.id });
                        const bVal = Lens.get(b.data as any, op.lensFn as any, { ID: b.id });
                        const cmp = sortCompare(aVal, bVal);
                        return op.dir === "desc" ? -cmp : cmp;
                    });
                    break;
                }
                case "first":
                    items = items.length > 0 ? [items[0]] : [];
                    isSingle = true;
                    break;
                case "last":
                    items = items.length > 0 ? [items[items.length - 1]] : [];
                    isSingle = true;
                    break;
                case "at":
                    items = op.index < items.length ? [items[op.index]] : [];
                    isSingle = true;
                    break;
                case "distinct": {
                    const seen = new Set<string>();
                    items = items.filter((item) => {
                        if (seen.has(item.id)) return false;
                        seen.add(item.id);
                        return true;
                    });
                    break;
                }
                case "slice":
                    items = items.slice(op.start, op.end);
                    break;
            }
        }

        if (isSingle) return items[0];
        return items;
    }

    const pipeline: any = {
        // --- Chaining ---
        where(predFn: Function) {
            ops.push({ type: "where", predFn });
            return pipeline;
        },
        sort(lensFn: Function, dir: "asc" | "desc") {
            ops.push({ type: "sort", lensFn, dir });
            return pipeline;
        },
        first() {
            ops.push({ type: "first" });
            return pipeline;
        },
        last() {
            ops.push({ type: "last" });
            return pipeline;
        },
        at(index: number) {
            ops.push({ type: "at", index });
            return pipeline;
        },
        distinct() {
            ops.push({ type: "distinct" });
            return pipeline;
        },
        slice(start: number, end?: number) {
            ops.push({ type: "slice", start, end });
            return pipeline;
        },
        paginate(page: number, count: number) {
            ops.push({ type: "slice", start: (page - 1) * count, end: page * count });
            return pipeline;
        },
        window(skip: number, take: number) {
            ops.push({ type: "slice", start: skip, end: skip + take });
            return pipeline;
        },

        // --- Read terminals ---
        async get() {
            return execute();
        },
        async count() {
            const r = execute();
            return Array.isArray(r) ? r.length : r ? 1 : 0;
        },
        async exists() {
            const r = execute();
            return Array.isArray(r) ? r.length > 0 : r !== undefined;
        },
        async id() {
            const r = execute();
            return Array.isArray(r) ? r.map((i: Item<D>) => i.id) : (r as Item<D> | undefined)?.id;
        },

        // --- Write terminals ---
        async update(...args: any[]) {
            const result = execute();
            const items = Array.isArray(result) ? result : result ? [result] : [];
            if (items.length === 0) return result;

            if (typeof args[0] === "function" && args.length === 1) {
                // Whole-data updater: update(fn)
                const ids = items.map((i) => i.id);
                const updater = args[0] as (prev: D, meta: Item<D>) => D;
                await db.update(ids, updater);
            } else if (typeof args[0] === "function") {
                // Lens-targeted: update(lensFn, value)
                const lensFn = args[0];
                const value = args[1];
                const ids = items.map((i) => i.id);
                await db.update(ids, (prev: D) => {
                    Lens.mutate(prev, lensFn, value);
                    return prev;
                });
            } else {
                // Whole-data static: update(staticValue)
                const payload: { [key: CollectionId]: D } = {};
                for (const item of items) payload[item.id] = args[0] as D;
                await db.update(payload);
            }
            return result;
        },

        async remove() {
            const result = execute();
            const items = Array.isArray(result) ? result : result ? [result] : [];
            if (items.length > 0) {
                const ids = items.map((i) => i.id);
                await db.remove(ids);
            }
            return result;
        },
    };

    return pipeline;
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
