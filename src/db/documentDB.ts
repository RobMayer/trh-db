import { Codec, DBMeta, ListOf, Updater } from "../types";
import { IndexStore, stringifyIndex } from "../util/indices";
import { Lens, sortCompare, SelectorLens, PathLens, LogicalOps, PredicateResult, Predicate, MutatorLens, MutatorLensOf } from "../util/lens";

// ------------------------------------------------------------
// DocumentDB<D>
// ------------------------------------------------------------

export type DocumentId = string;
export type DocumentsOf<D> = { [id: DocumentId]: DocumentOf<D> };
export type DocumentOf<D> = { id: DocumentId; type: "document"; data: D };

const TYPE = "documents";
const VERSION = 1;

export class DocumentDB<D, U = null> {
    private data: DocumentsOf<D> = {};
    private usermeta: U | null = null;
    private codec: Codec<DocumentOf<D>, DBMeta<U | null>>;
    private indices = new IndexStore();
    private indexLenses: { [serializedKey: string]: Function } = {};

    constructor(codec: Codec<DocumentOf<D>, DBMeta<U | null>>) {
        this.codec = codec;
        this.usermeta = null;
    }

    async load() {
        const [data, meta] = await this.codec.load();
        this.data = data;
        this.usermeta = meta?.user ?? null;
        return this.usermeta;
    }

    getMeta() {
        return this.usermeta;
    }

    async setMeta(value: U) {
        this.usermeta = value;
        await this.codec.setMeta({ version: VERSION, type: TYPE, user: this.usermeta }, this.data);
    }

    // --- Direct methods (bypass pipeline) ---

    get(target: DocumentId): DocumentOf<D> | undefined;
    get(target: ListOf<DocumentId>): DocumentOf<D>[];
    get(target: DocumentId | ListOf<DocumentId>): DocumentOf<D> | undefined | DocumentOf<D>[] {
        if (typeof target === "string") {
            return this.data[target];
        }
        const ids = target instanceof Set ? target : target;
        const results: DocumentOf<D>[] = [];
        for (const id of ids) {
            const item = this.data[id];
            if (item) results.push(item);
        }
        return results;
    }

    async update(id: DocumentId, data: D | ((prev: D, meta: DocumentOf<D>) => D)): Promise<DocumentOf<D> | undefined>;
    async update(payload: { [key: DocumentId]: D }): Promise<DocumentOf<D>[]>;
    async update(ids: ListOf<DocumentId>, updater: (prev: D, meta: DocumentOf<D>) => D): Promise<DocumentOf<D>[]>;
    async update(idOrPayload: DocumentId | { [key: DocumentId]: D } | ListOf<DocumentId>, dataOrUpdater?: D | ((prev: D, meta: DocumentOf<D>) => D)): Promise<DocumentOf<D> | undefined | DocumentOf<D>[]> {
        const items: DocumentOf<D>[] = [];

        if (typeof idOrPayload === "string") {
            const existing = this.data[idOrPayload];
            if (!existing) return undefined;
            const newData = typeof dataOrUpdater === "function" ? (dataOrUpdater as (prev: D, meta: DocumentOf<D>) => D)(existing.data, existing) : (dataOrUpdater as D);
            this.deindexRecord(idOrPayload, existing.data);
            existing.data = newData;
            this.indexRecord(idOrPayload, newData);
            items.push(existing);
            await this.codec.update(items, this.data, { version: VERSION, type: TYPE, user: this.usermeta });
            return existing;
        } else if (idOrPayload instanceof Set || Array.isArray(idOrPayload)) {
            const updater = dataOrUpdater as (prev: D, meta: DocumentOf<D>) => D;
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

        if (items.length > 0) await this.codec.update(items, this.data, { version: VERSION, type: TYPE, user: this.usermeta });
        return items;
    }

    async insert(data: D): Promise<DocumentOf<D>>;
    async insert(data: D[]): Promise<DocumentOf<D>[]>;
    async insert(data: D | D[]): Promise<DocumentOf<D> | DocumentOf<D>[]> {
        const items: DocumentOf<D>[] = [];

        if (Array.isArray(data)) {
            for (const d of data) {
                const id = crypto.randomUUID();
                const member: DocumentOf<D> = { id, type: "document", data: d };
                this.data[id] = member;
                this.indexRecord(id, d);
                items.push(member);
            }
        } else {
            const id = crypto.randomUUID();
            const member: DocumentOf<D> = { id, type: "document", data };
            this.data[id] = member;
            this.indexRecord(id, data);
            items.push(member);
        }

        await this.codec.insert(items, this.data, { version: VERSION, type: TYPE, user: this.usermeta });
        return Array.isArray(data) ? items : items[0];
    }

    async remove(target: DocumentId): Promise<DocumentOf<D> | undefined>;
    async remove(target: ListOf<DocumentId>): Promise<DocumentOf<D>[]>;
    async remove(target: DocumentId | ListOf<DocumentId>): Promise<DocumentOf<D> | undefined | DocumentOf<D>[]> {
        const items: DocumentOf<D>[] = [];

        if (typeof target === "string") {
            const item = this.data[target];
            if (item) {
                this.deindexRecord(target, item.data);
                delete this.data[target];
                await this.codec.delete([item], this.data, { version: VERSION, type: TYPE, user: this.usermeta });
            }
            return item;
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

        if (items.length > 0) await this.codec.delete(items, this.data, { version: VERSION, type: TYPE, user: this.usermeta });
        return items;
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
        <T>(lens: ($: SelectorLens<D> & DocumentMeta & LogicalOps) => Predicate<T> | PredicateResult): DocumentPipeline<D, "multi">;
    } = ((predFn: Function) => createPipeline(this, { type: "where", predFn })) as any;
    select: {
        (target: DocumentId): DocumentPipeline<D, "single">;
        (target: ListOf<DocumentId>): DocumentPipeline<D, "multi">;
    } = ((target: DocumentId | ListOf<DocumentId>) => {
        if (typeof target === "string") return createPipeline(this, { type: "selectOne", id: target });
        return createPipeline(this, { type: "select", ids: [...target] });
    }) as any;
    all: {
        (): DocumentPipeline<D, "multi">;
    } = (() => createPipeline(this, { type: "all" })) as any;

    // --- Set operations ---

    intersection(...pipelines: DocumentPipeline<D, any>[]): DocumentPipeline<D, "multi"> {
        const sets = pipelines.map((p) => new Set<string>((p as any)[RESOLVE]().map((i: { id: string }) => i.id)));
        const result = sets.reduce((acc, s) => {
            for (const id of acc) {
                if (!s.has(id)) acc.delete(id);
            }
            return acc;
        });
        return createPipeline(this, { type: "ids", ids: [...result] }) as any;
    }

    union(...pipelines: DocumentPipeline<D, any>[]): DocumentPipeline<D, "multi"> {
        const seen = new Set<string>();
        for (const p of pipelines) for (const item of (p as any)[RESOLVE]()) seen.add((item as DocumentOf<D>).id);
        return createPipeline(this, { type: "ids", ids: [...seen] }) as any;
    }

    exclusion(from: DocumentPipeline<D, any>, ...subtract: DocumentPipeline<D, any>[]): DocumentPipeline<D, "multi"> {
        const base = new Set<string>((from as any)[RESOLVE]().map((i: { id: string }) => i.id));
        for (const p of subtract) for (const item of (p as any)[RESOLVE]()) base.delete((item as DocumentOf<D>).id);
        return createPipeline(this, { type: "ids", ids: [...base] }) as any;
    }
}

// ------------------------------------------------------------
// Pipeline Runtime
// ------------------------------------------------------------

type PipelineSeed = { type: "all" } | { type: "select"; ids: string[] } | { type: "selectOne"; id: string } | { type: "where"; predFn: Function } | { type: "ids"; ids: string[] };

const RESOLVE = Symbol();

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

function evalWhereForItem<D>(predFn: Function, item: DocumentOf<D>): boolean {
    return Lens.match(item.data, predFn, { ID: item.id });
}

function tryIndexAccelerate<D>(predFn: Function, db: DocumentDB<D>): Set<string> | null {
    const probed = Lens.probe(predFn);
    if (!probed) return null;

    const { path, operator, operand, operand2 } = probed;

    const pathKey = stringifyIndex(path);
    const indices = (db as any).indices as IndexStore;
    if (!indices.keys().includes(pathKey)) return null;

    if (operator.startsWith("!")) return null;
    if (operator.endsWith("|") || operator.endsWith("&")) return null;

    const indexOp = INDEX_OPS[operator];
    if (!indexOp) return null;

    if (operand2 !== undefined) {
        return indexOp(indices, pathKey, operand, operand2) as Set<string>;
    }
    return indexOp(indices, pathKey, operand) as Set<string>;
}

function createPipeline<D>(db: DocumentDB<D, any>, seed: PipelineSeed): any {
    const ops: PipelineOp[] = [];
    const data = (db as any).data as DocumentsOf<D>;

    function resolve(): DocumentOf<D>[] {
        switch (seed.type) {
            case "all":
                return Object.values(data);
            case "selectOne": {
                const item = data[seed.id];
                return item ? [item] : [];
            }
            case "select":
                return seed.ids.map((id) => data[id]).filter(Boolean) as DocumentOf<D>[];
            case "where": {
                const indexed = tryIndexAccelerate(seed.predFn, db);
                if (indexed) {
                    const candidates = [...indexed].map((id) => data[id]).filter(Boolean) as DocumentOf<D>[];
                    return candidates.filter((item) => evalWhereForItem(seed.predFn, item));
                }
                return Object.values(data).filter((item) => evalWhereForItem(seed.predFn, item));
            }
            case "ids":
                return seed.ids.map((id) => data[id]).filter(Boolean) as DocumentOf<D>[];
        }
    }

    function execute(): DocumentOf<D>[] | DocumentOf<D> | undefined {
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
        [RESOLVE](): DocumentOf<D>[] {
            const r = execute();
            return Array.isArray(r) ? r : r ? [r] : [];
        },
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
            return Array.isArray(r) ? r.map((i: { id: string }) => i.id) : (r as DocumentOf<D> | undefined)?.id;
        },

        // --- Write terminals ---
        async update(...args: any[]) {
            const result = execute();
            const items = Array.isArray(result) ? result : result ? [result] : [];
            if (items.length === 0) return result;

            if (typeof args[0] === "function" && args.length === 1) {
                const ids = items.map((i) => i.id);
                const updater = args[0] as (prev: D, meta: DocumentOf<D>) => D;
                await db.update(ids, updater);
            } else if (typeof args[0] === "function") {
                const lensFn = args[0];
                const value = args[1];
                const ids = items.map((i) => i.id);
                await db.update(ids, (prev: D) => {
                    Lens.mutate(prev, lensFn, value);
                    return prev;
                });
            } else {
                const payload: { [key: DocumentId]: D } = {};
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
// DocumentMeta
// ------------------------------------------------------------

export type DocumentMeta = {
    ID: SelectorLens<string>;
};

// ------------------------------------------------------------
// Pipeline Interface
// ------------------------------------------------------------

type Cardinality = "single" | "multi";
type TerminalResult<D, C extends Cardinality> = C extends "single" ? DocumentOf<D> | undefined : DocumentOf<D>[];

// ------------------------------------------------------------
// Terminals
// ------------------------------------------------------------

interface DocumentTerminals<D, C extends Cardinality> {
    // --- Read terminals ---
    get(): Promise<TerminalResult<D, C>>;
    count(): Promise<number>;
    exists(): Promise<boolean>;
    id(): Promise<C extends "multi" ? string[] : string | undefined>;

    // --- Write terminals (whole-data) ---
    update(updater: Updater<D, DocumentOf<D>>): Promise<TerminalResult<D, C>>;
    remove(): Promise<TerminalResult<D, C>>;

    // --- Write terminals (lens-targeted) ---
    update<R>(lens: ($: MutatorLens<D>) => MutatorLensOf<R>, updater: Updater<R, DocumentOf<D>>): Promise<TerminalResult<D, C>>;
}

// ------------------------------------------------------------
// The Pipeline
// ------------------------------------------------------------

export interface DocumentPipeline<D, C extends Cardinality> extends DocumentTerminals<D, C> {
    // Filtering
    where<T>(lens: ($: SelectorLens<D> & DocumentMeta & LogicalOps) => Predicate<T> | PredicateResult): DocumentPipeline<D, C>;

    // Cardinality reducers (multi → single)
    first(): DocumentPipeline<D, "single">;
    last(): DocumentPipeline<D, "single">;
    at(index: number): DocumentPipeline<D, "single">;

    // Presentation (preserves cardinality)
    sort<T>(lens: ($: SelectorLens<D> & DocumentMeta) => SelectorLens<T>, dir: "asc" | "desc"): DocumentPipeline<D, C>;
    distinct(): DocumentPipeline<D, C>;
    slice(start: number, end?: number): DocumentPipeline<D, C>;
    paginate(page: number, count: number): DocumentPipeline<D, C>;
    window(skip: number, take: number): DocumentPipeline<D, C>;
}
