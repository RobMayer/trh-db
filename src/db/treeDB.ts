import { Codec, DBMeta, ListOf, ListOr, TreeId, TreeItemOf, TreeOf, Updater } from "../types";
import { IndexStore, stringifyIndex } from "../util/indices";
import { Lens, sortCompare, SelectorLens, PathLens, LogicalOps, PredicateResult, Predicate, MutatorLens, MutatorLensOf } from "../util/lens";

// ------------------------------------------------------------
// TreeDB<D>
// ------------------------------------------------------------

const TYPE = "tree";
const VERSION = 1;

type Item<D> = TreeItemOf<D>;

function detach<D>(data: TreeOf<D>, id: string): void {
    const item = data[id];
    if (!item || item.parent === null) return;
    const parent = data[item.parent];
    if (parent) {
        const idx = parent.children.indexOf(id);
        if (idx !== -1) parent.children.splice(idx, 1);
    }
}

export class TreeDB<D, U = null> {
    private data: TreeOf<D> = {};
    private rootIds = new Set<string>();
    private usermeta: U | null = null;
    private codec: Codec<TreeItemOf<D>, DBMeta<U | null>>;
    private indices = new IndexStore();
    private indexLenses: { [serializedKey: string]: Function } = {};

    constructor(codec: Codec<TreeItemOf<D>, DBMeta<U | null>>) {
        this.codec = codec;
        this.usermeta = null;
    }

    async load() {
        const [data, meta] = await this.codec.load();
        this.data = data;
        this.rootIds.clear();
        for (const item of Object.values(data)) {
            if (item.parent === null) this.rootIds.add(item.id);
        }
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

    get(target: TreeId): Item<D> | undefined;
    get(target: ListOf<TreeId>): Item<D>[];
    get(target: TreeId | ListOf<TreeId>): Item<D> | undefined | Item<D>[] {
        if (typeof target === "string") {
            return this.data[target];
        }
        const results: Item<D>[] = [];
        for (const id of target) {
            const item = this.data[id];
            if (item) results.push(item);
        }
        return results;
    }

    async add(id: TreeId, data: D, parent: string | null): Promise<void> {
        const item: Item<D> = { id, data, parent, children: [] };
        this.data[id] = item;
        this.indexRecord(id, data);

        if (parent !== null) {
            const parentItem = this.data[parent];
            if (parentItem) parentItem.children.push(id);
        } else {
            this.rootIds.add(id);
        }

        await this.codec.insert([item], this.data, { version: VERSION, type: TYPE, user: this.usermeta });
    }

    async update(id: TreeId, data: D | ((prev: D, item: Item<D>) => D)): Promise<void>;
    async update(payload: { [key: TreeId]: D }): Promise<void>;
    async update(ids: ListOf<TreeId>, updater: (prev: D, item: Item<D>) => D): Promise<void>;
    async update(idOrPayload: TreeId | { [key: TreeId]: D } | ListOf<TreeId>, dataOrUpdater?: D | ((prev: D, item: Item<D>) => D)): Promise<void> {
        const items: Item<D>[] = [];

        if (typeof idOrPayload === "string") {
            const existing = this.data[idOrPayload];
            if (!existing) return;
            const newData = typeof dataOrUpdater === "function" ? (dataOrUpdater as (prev: D, item: Item<D>) => D)(existing.data, existing) : (dataOrUpdater as D);
            this.deindexRecord(idOrPayload, existing.data);
            existing.data = newData;
            this.indexRecord(idOrPayload, newData);
            items.push(existing);
        } else if (idOrPayload instanceof Set || Array.isArray(idOrPayload)) {
            const updater = dataOrUpdater as (prev: D, item: Item<D>) => D;
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
    }

    async move(id: TreeId, newParent: string | null): Promise<void> {
        const item = this.data[id];
        if (!item) return;
        if (item.parent === newParent) return;

        detach(this.data, id);
        this.rootIds.delete(id);
        item.parent = newParent;
        if (newParent !== null) {
            const newParentItem = this.data[newParent];
            if (newParentItem) newParentItem.children.push(id);
        } else {
            this.rootIds.add(id);
        }

        await this.codec.struct([item], this.data, { version: VERSION, type: TYPE, user: this.usermeta });
    }

    // --- Remove variants ---

    async pluck(target: TreeId): Promise<Item<D> | undefined>;
    async pluck(target: ListOf<TreeId>): Promise<Item<D>[]>;
    async pluck(target: TreeId | ListOf<TreeId>): Promise<Item<D> | undefined | Item<D>[]> {
        const ids = typeof target === "string" ? [target] : [...target];
        const removed: Item<D>[] = [];
        const structChanged: Item<D>[] = [];

        for (const id of ids) {
            const item = this.data[id];
            if (!item) continue;

            // orphan children as roots
            for (const childId of item.children) {
                const child = this.data[childId];
                if (child) {
                    child.parent = null;
                    this.rootIds.add(childId);
                    structChanged.push(child);
                }
            }

            detach(this.data, id);
            this.rootIds.delete(id);
            this.deindexRecord(id, item.data);
            delete this.data[id];
            removed.push(item);
        }

        if (structChanged.length > 0) await this.codec.struct(structChanged, this.data, { version: VERSION, type: TYPE, user: this.usermeta });
        if (removed.length > 0) await this.codec.delete(removed, this.data, { version: VERSION, type: TYPE, user: this.usermeta });

        return typeof target === "string" ? removed[0] : removed;
    }

    async splice(target: TreeId): Promise<Item<D> | undefined>;
    async splice(target: ListOf<TreeId>): Promise<Item<D>[]>;
    async splice(target: TreeId | ListOf<TreeId>): Promise<Item<D> | undefined | Item<D>[]> {
        const ids = typeof target === "string" ? [target] : [...target];
        const removed: Item<D>[] = [];
        const structChanged: Item<D>[] = [];

        for (const id of ids) {
            const item = this.data[id];
            if (!item) continue;

            const parentId = item.parent;

            // reparent children to this node's parent
            for (const childId of item.children) {
                const child = this.data[childId];
                if (child) {
                    child.parent = parentId;
                    if (parentId !== null) {
                        const parent = this.data[parentId];
                        if (parent) parent.children.push(childId);
                    } else {
                        this.rootIds.add(childId);
                    }
                    structChanged.push(child);
                }
            }

            detach(this.data, id);
            this.rootIds.delete(id);
            this.deindexRecord(id, item.data);
            delete this.data[id];
            removed.push(item);
        }

        if (structChanged.length > 0) await this.codec.struct(structChanged, this.data, { version: VERSION, type: TYPE, user: this.usermeta });
        if (removed.length > 0) await this.codec.delete(removed, this.data, { version: VERSION, type: TYPE, user: this.usermeta });

        return typeof target === "string" ? removed[0] : removed;
    }

    async prune(target: TreeId): Promise<Item<D> | undefined>;
    async prune(target: ListOf<TreeId>): Promise<Item<D>[]>;
    async prune(target: TreeId | ListOf<TreeId>): Promise<Item<D> | undefined | Item<D>[]> {
        const ids = typeof target === "string" ? [target] : [...target];
        const removed: Item<D>[] = [];

        for (const id of ids) {
            const item = this.data[id];
            if (!item) continue;

            detach(this.data, id);
            this.rootIds.delete(id);
            this.deindexRecord(id, item.data);
            delete this.data[id];
            removed.push(item);

            // collect and remove all descendants
            const stack = [...item.children];
            while (stack.length > 0) {
                const descId = stack.pop()!;
                const desc = this.data[descId];
                if (!desc) continue;
                for (let i = desc.children.length - 1; i >= 0; i--) {
                    stack.push(desc.children[i]);
                }
                this.deindexRecord(descId, desc.data);
                delete this.data[descId];
                removed.push(desc);
            }
        }

        if (removed.length > 0) await this.codec.delete(removed, this.data, { version: VERSION, type: TYPE, user: this.usermeta });

        return typeof target === "string" ? removed[0] : removed;
    }

    async trim(target: TreeId): Promise<Item<D> | undefined>;
    async trim(target: ListOf<TreeId>): Promise<Item<D>[]>;
    async trim(target: TreeId | ListOf<TreeId>): Promise<Item<D> | undefined | Item<D>[]> {
        const ids = typeof target === "string" ? [target] : [...target];
        const removed: Item<D>[] = [];

        for (const id of ids) {
            const item = this.data[id];
            if (!item || item.children.length > 0) continue;

            detach(this.data, id);
            this.rootIds.delete(id);
            this.deindexRecord(id, item.data);
            delete this.data[id];
            removed.push(item);
        }

        if (removed.length > 0) await this.codec.delete(removed, this.data, { version: VERSION, type: TYPE, user: this.usermeta });

        return typeof target === "string" ? removed[0] : removed;
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
        <T>(lens: ($: SelectorLens<D> & TreeMeta & LogicalOps) => Predicate<T> | PredicateResult): TreePipeline<D, "multi">;
    } = ((predFn: Function) => createPipeline(this, { type: "where", predFn })) as any;
    select: {
        (target: TreeId): TreePipeline<D, "single">;
        (target: ListOf<TreeId>): TreePipeline<D, "multi">;
    } = ((target: TreeId | ListOf<TreeId>) => {
        if (typeof target === "string") return createPipeline(this, { type: "selectOne", id: target });
        return createPipeline(this, { type: "select", ids: [...target] });
    }) as any;
    roots: {
        (): TreePipeline<D, "multi">;
    } = (() => createPipeline(this, { type: "roots" })) as any;
    deep: {
        (): TreePipeline<D, "multi">;
    } = (() => createPipeline(this, { type: "deep" })) as any;
    wide: {
        (): TreePipeline<D, "multi">;
    } = (() => createPipeline(this, { type: "wide" })) as any;
    ancestors: {
        (target: ListOr<TreeId>): TreePipeline<D, "multi">;
    } = ((target: ListOr<TreeId>) => createPipeline(this, { type: "ancestors", ids: normalizeIds(target) })) as any;
    children: {
        (target: ListOr<TreeId>): TreePipeline<D, "multi">;
    } = ((target: ListOr<TreeId>) => createPipeline(this, { type: "children", ids: normalizeIds(target) })) as any;
    parent: {
        (target: TreeId): TreePipeline<D, "single">;
        (target: ListOr<TreeId>): TreePipeline<D, "multi">;
    } = ((target: TreeId | ListOr<TreeId>) => {
        if (typeof target === "string") return createPipeline(this, { type: "parentOne", id: target });
        return createPipeline(this, { type: "parent", ids: normalizeIds(target) });
    }) as any;
    deepDescendants: {
        (target: ListOr<TreeId>): TreePipeline<D, "multi">;
    } = ((target: ListOr<TreeId>) => createPipeline(this, { type: "deepDescendants", ids: normalizeIds(target) })) as any;
    wideDescendants: {
        (target: ListOr<TreeId>): TreePipeline<D, "multi">;
    } = ((target: ListOr<TreeId>) => createPipeline(this, { type: "wideDescendants", ids: normalizeIds(target) })) as any;
    siblings: {
        (target: ListOr<TreeId>): TreePipeline<D, "multi">;
    } = ((target: ListOr<TreeId>) => createPipeline(this, { type: "siblings", ids: normalizeIds(target) })) as any;
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function normalizeIds(target: ListOr<string>): string[] {
    if (typeof target === "string") return [target];
    return [...target];
}

function depthOf<D>(data: TreeOf<D>, id: string): number {
    let depth = 0;
    let current = data[id];
    while (current && current.parent !== null) {
        depth++;
        current = data[current.parent];
    }
    return depth;
}

// ------------------------------------------------------------
// TreeMeta
// ------------------------------------------------------------

export type TreeMeta = {
    ID: SelectorLens<string>;
    PARENT: SelectorLens<string | null>;
    CHILDREN: SelectorLens<string[]>;
    DEPTH: SelectorLens<number>;
};

// ------------------------------------------------------------
// Pipeline Runtime
// ------------------------------------------------------------

type PipelineSeed =
    | { type: "select"; ids: string[] }
    | { type: "selectOne"; id: string }
    | { type: "where"; predFn: Function }
    | { type: "roots" }
    | { type: "deep" }
    | { type: "wide" }
    | { type: "ancestors"; ids: string[] }
    | { type: "children"; ids: string[] }
    | { type: "parentOne"; id: string }
    | { type: "parent"; ids: string[] }
    | { type: "deepDescendants"; ids: string[] }
    | { type: "wideDescendants"; ids: string[] }
    | { type: "siblings"; ids: string[] };

type PipelineOp =
    | { type: "where"; predFn: Function }
    | { type: "sort"; lensFn: Function; dir: "asc" | "desc" }
    | { type: "first" }
    | { type: "last" }
    | { type: "at"; index: number }
    | { type: "distinct" }
    | { type: "slice"; start: number; end?: number }
    | { type: "ancestors" }
    | { type: "parent" }
    | { type: "children" }
    | { type: "siblings" }
    | { type: "deepDescendants" }
    | { type: "wideDescendants" }
    | { type: "roots" };

const INDEX_OPS: { [op: string]: (idx: IndexStore, key: string, operand: unknown, operand2?: unknown) => ReadonlySet<string> | Set<string> } = {
    "=": (idx, key, v) => idx.eq(key, v),
    ">": (idx, key, v) => idx.gt(key, v),
    ">=": (idx, key, v) => idx.gte(key, v),
    "<": (idx, key, v) => idx.lt(key, v),
    "<=": (idx, key, v) => idx.lte(key, v),
    "><": (idx, key, lo, hi) => idx.range(key, lo, hi, false, false),
    ">=<": (idx, key, lo, hi) => idx.range(key, lo, hi, true, false),
};

function metaFor<D>(item: Item<D>, data: TreeOf<D>): { ID: string; PARENT: string | null; CHILDREN: string[]; DEPTH: number } {
    return { ID: item.id, PARENT: item.parent, CHILDREN: item.children, DEPTH: depthOf(data, item.id) };
}

function evalWhereForItem<D>(predFn: Function, item: Item<D>, data: TreeOf<D>): boolean {
    return Lens.match(item.data, predFn, metaFor(item, data));
}

function tryIndexAccelerate<D>(predFn: Function, db: TreeDB<D, any>): Set<string> | null {
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

function resolveTraversal<D>(items: Item<D>[], opType: string, data: TreeOf<D>, rootIds: Set<string>): Item<D>[] {
    const result: Item<D>[] = [];
    const seen = new Set<string>();

    function addUnique(item: Item<D>) {
        if (!seen.has(item.id)) {
            seen.add(item.id);
            result.push(item);
        }
    }

    for (const item of items) {
        switch (opType) {
            case "ancestors": {
                let current = item.parent;
                while (current !== null) {
                    const ancestor = data[current];
                    if (!ancestor) break;
                    addUnique(ancestor);
                    current = ancestor.parent;
                }
                break;
            }
            case "parent": {
                if (item.parent !== null) {
                    const p = data[item.parent];
                    if (p) addUnique(p);
                }
                break;
            }
            case "children": {
                for (const childId of item.children) {
                    const child = data[childId];
                    if (child) addUnique(child);
                }
                break;
            }
            case "siblings": {
                const parentId = item.parent;
                const siblingSource = parentId !== null ? data[parentId]?.children : rootIds;
                for (const sibId of siblingSource) {
                    if (sibId === item.id) continue;
                    const sib = data[sibId];
                    if (sib) addUnique(sib);
                }
                break;
            }
            case "deepDescendants": {
                const stack = [...item.children];
                while (stack.length > 0) {
                    const currentId = stack.pop()!;
                    const current = data[currentId];
                    if (!current) continue;
                    addUnique(current);
                    for (let i = current.children.length - 1; i >= 0; i--) {
                        stack.push(current.children[i]);
                    }
                }
                break;
            }
            case "wideDescendants": {
                const queue = [...item.children];
                while (queue.length > 0) {
                    const currentId = queue.shift()!;
                    const current = data[currentId];
                    if (!current) continue;
                    addUnique(current);
                    queue.push(...current.children);
                }
                break;
            }
            case "roots": {
                for (const id of rootIds) {
                    const node = data[id];
                    if (node) addUnique(node);
                }
                break;
            }
        }
    }

    return result;
}

function createPipeline<D>(db: TreeDB<D, any>, seed: PipelineSeed): any {
    const ops: PipelineOp[] = [];
    const data = (db as any).data as TreeOf<D>;
    const rootIds = (db as any).rootIds as Set<string>;

    function resolve(): Item<D>[] {
        switch (seed.type) {
            case "deep": {
                const result: Item<D>[] = [];
                const roots = [...rootIds].map((id) => data[id]).filter(Boolean) as Item<D>[];
                const stack = [...roots].reverse();
                while (stack.length > 0) {
                    const current = stack.pop()!;
                    result.push(current);
                    for (let i = current.children.length - 1; i >= 0; i--) {
                        const child = data[current.children[i]];
                        if (child) stack.push(child);
                    }
                }
                return result;
            }
            case "wide": {
                const result: Item<D>[] = [];
                const roots = [...rootIds].map((id) => data[id]).filter(Boolean) as Item<D>[];
                const queue = [...roots];
                while (queue.length > 0) {
                    const current = queue.shift()!;
                    result.push(current);
                    for (const childId of current.children) {
                        const child = data[childId];
                        if (child) queue.push(child);
                    }
                }
                return result;
            }
            case "selectOne": {
                const item = data[seed.id];
                return item ? [item] : [];
            }
            case "select":
                return seed.ids.map((id) => data[id]).filter(Boolean) as Item<D>[];
            case "where": {
                const indexed = tryIndexAccelerate(seed.predFn, db);
                if (indexed) {
                    const candidates = [...indexed].map((id) => data[id]).filter(Boolean) as Item<D>[];
                    return candidates.filter((item) => evalWhereForItem(seed.predFn, item, data));
                }
                return Object.values(data).filter((item) => evalWhereForItem(seed.predFn, item, data));
            }
            case "roots": {
                const result: Item<D>[] = [];
                for (const id of rootIds) {
                    const item = data[id];
                    if (item) result.push(item);
                }
                return result;
            }
            case "ancestors": {
                const result: Item<D>[] = [];
                const seen = new Set<string>();
                for (const id of seed.ids) {
                    let current = data[id]?.parent ?? null;
                    while (current !== null) {
                        if (seen.has(current)) break;
                        seen.add(current);
                        const ancestor = data[current];
                        if (!ancestor) break;
                        result.push(ancestor);
                        current = ancestor.parent;
                    }
                }
                return result;
            }
            case "children": {
                const result: Item<D>[] = [];
                const seen = new Set<string>();
                for (const id of seed.ids) {
                    const item = data[id];
                    if (!item) continue;
                    for (const childId of item.children) {
                        if (seen.has(childId)) continue;
                        seen.add(childId);
                        const child = data[childId];
                        if (child) result.push(child);
                    }
                }
                return result;
            }
            case "parentOne": {
                const item = data[seed.id];
                if (!item || item.parent === null) return [];
                const p = data[item.parent];
                return p ? [p] : [];
            }
            case "parent": {
                const result: Item<D>[] = [];
                const seen = new Set<string>();
                for (const id of seed.ids) {
                    const item = data[id];
                    if (!item || item.parent === null) continue;
                    if (seen.has(item.parent)) continue;
                    seen.add(item.parent);
                    const p = data[item.parent];
                    if (p) result.push(p);
                }
                return result;
            }
            case "deepDescendants": {
                const result: Item<D>[] = [];
                const seen = new Set<string>();
                for (const id of seed.ids) {
                    const item = data[id];
                    if (!item) continue;
                    const stack = [...item.children];
                    while (stack.length > 0) {
                        const currentId = stack.pop()!;
                        if (seen.has(currentId)) continue;
                        seen.add(currentId);
                        const current = data[currentId];
                        if (!current) continue;
                        result.push(current);
                        for (let i = current.children.length - 1; i >= 0; i--) {
                            stack.push(current.children[i]);
                        }
                    }
                }
                return result;
            }
            case "wideDescendants": {
                const result: Item<D>[] = [];
                const seen = new Set<string>();
                for (const id of seed.ids) {
                    const item = data[id];
                    if (!item) continue;
                    const queue = [...item.children];
                    while (queue.length > 0) {
                        const currentId = queue.shift()!;
                        if (seen.has(currentId)) continue;
                        seen.add(currentId);
                        const current = data[currentId];
                        if (!current) continue;
                        result.push(current);
                        queue.push(...current.children);
                    }
                }
                return result;
            }
            case "siblings": {
                const result: Item<D>[] = [];
                const seen = new Set<string>();
                const exclude = new Set(seed.ids);
                for (const id of seed.ids) {
                    const item = data[id];
                    if (!item) continue;
                    const parentId = item.parent;
                    const siblingSource: Iterable<string> | undefined = parentId !== null ? data[parentId]?.children : rootIds;
                    if (!siblingSource) continue;
                    for (const sibId of siblingSource) {
                        if (exclude.has(sibId) || seen.has(sibId)) continue;
                        seen.add(sibId);
                        const sib = data[sibId];
                        if (sib) result.push(sib);
                    }
                }
                return result;
            }
        }
    }

    function execute(): Item<D>[] | Item<D> | undefined {
        let items = resolve();
        let isSingle = seed.type === "selectOne" || seed.type === "parentOne";

        for (const op of ops) {
            switch (op.type) {
                case "where":
                    items = items.filter((item) => evalWhereForItem(op.predFn, item, data));
                    break;
                case "sort": {
                    items = [...items].sort((a, b) => {
                        const aVal = Lens.get(a.data as any, op.lensFn as any, metaFor(a, data));
                        const bVal = Lens.get(b.data as any, op.lensFn as any, metaFor(b, data));
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
                // Traversal ops
                case "ancestors":
                case "parent":
                case "children":
                case "siblings":
                case "deepDescendants":
                case "wideDescendants":
                case "roots":
                    items = resolveTraversal(items, op.type, data, rootIds);
                    isSingle = false;
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

        // --- Traversal chaining ---
        ancestors() {
            ops.push({ type: "ancestors" });
            return pipeline;
        },
        parent() {
            ops.push({ type: "parent" });
            return pipeline;
        },
        children() {
            ops.push({ type: "children" });
            return pipeline;
        },
        siblings() {
            ops.push({ type: "siblings" });
            return pipeline;
        },
        deepDescendants() {
            ops.push({ type: "deepDescendants" });
            return pipeline;
        },
        wideDescendants() {
            ops.push({ type: "wideDescendants" });
            return pipeline;
        },
        roots() {
            ops.push({ type: "roots" });
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
                const ids = items.map((i) => i.id);
                const updater = args[0] as (prev: D, item: Item<D>) => D;
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
                const payload: { [key: TreeId]: D } = {};
                for (const item of items) payload[item.id] = args[0] as D;
                await db.update(payload);
            }
            return result;
        },
        async pluck() {
            const result = execute();
            const items = Array.isArray(result) ? result : result ? [result] : [];
            if (items.length > 0) await db.pluck(items.map((i) => i.id));
            return result;
        },
        async splice() {
            const result = execute();
            const items = Array.isArray(result) ? result : result ? [result] : [];
            if (items.length > 0) await db.splice(items.map((i) => i.id));
            return result;
        },
        async prune() {
            const result = execute();
            const items = Array.isArray(result) ? result : result ? [result] : [];
            if (items.length > 0) await db.prune(items.map((i) => i.id));
            return result;
        },
        async trim() {
            const result = execute();
            const items = Array.isArray(result) ? result : result ? [result] : [];
            if (items.length > 0) await db.trim(items.map((i) => i.id));
            return result;
        },
        async move(newParent: string | null | ((item: Item<D>) => string | null)) {
            const result = execute();
            const items = Array.isArray(result) ? result : result ? [result] : [];
            for (const item of items) {
                const target = typeof newParent === "function" ? newParent(item) : newParent;
                await db.move(item.id, target);
            }
            return result;
        },
    };

    return pipeline;
}

// ------------------------------------------------------------
// Pipeline Interface
// ------------------------------------------------------------

type Cardinality = "single" | "multi";
type TerminalResult<D, C extends Cardinality> = C extends "single" ? Item<D> | undefined : Item<D>[];

// ------------------------------------------------------------
// Terminals
// ------------------------------------------------------------

interface TreeTerminals<D, C extends Cardinality> {
    // --- Read terminals ---
    get(): Promise<TerminalResult<D, C>>;
    count(): Promise<number>;
    exists(): Promise<boolean>;
    id(): Promise<C extends "multi" ? string[] : string | undefined>;

    // --- Write terminals (whole-data) ---
    update(updater: Updater<D, Item<D>>): Promise<TerminalResult<D, C>>;
    pluck(): Promise<TerminalResult<D, C>>;
    splice(): Promise<TerminalResult<D, C>>;
    prune(): Promise<TerminalResult<D, C>>;
    trim(): Promise<TerminalResult<D, C>>;
    move(newParent: string | null | ((item: Item<D>) => string | null)): Promise<TerminalResult<D, C>>;

    // --- Write terminals (lens-targeted) ---
    update<R>(lens: ($: MutatorLens<D>) => MutatorLensOf<R>, updater: Updater<R, Item<D>>): Promise<TerminalResult<D, C>>;
}

// ------------------------------------------------------------
// The Pipeline
// ------------------------------------------------------------

export interface TreePipeline<D, C extends Cardinality> extends TreeTerminals<D, C> {
    // Filtering
    where<T>(lens: ($: SelectorLens<D> & TreeMeta & LogicalOps) => Predicate<T> | PredicateResult): TreePipeline<D, C>;

    // Tree traversal (always produces multi)
    ancestors(): TreePipeline<D, "multi">;
    parent(): TreePipeline<D, "multi">;
    children(): TreePipeline<D, "multi">;
    siblings(): TreePipeline<D, "multi">;
    deepDescendants(): TreePipeline<D, "multi">;
    wideDescendants(): TreePipeline<D, "multi">;
    roots(): TreePipeline<D, "multi">;

    // Cardinality reducers (multi → single)
    first(): TreePipeline<D, "single">;
    last(): TreePipeline<D, "single">;
    at(index: number): TreePipeline<D, "single">;

    // Presentation (preserves cardinality)
    sort<T>(lens: ($: SelectorLens<D> & TreeMeta) => SelectorLens<T>, dir: "asc" | "desc"): TreePipeline<D, C>;
    distinct(): TreePipeline<D, C>;
    slice(start: number, end?: number): TreePipeline<D, C>;
    paginate(page: number, perPage: number): TreePipeline<D, C>;
    window(skip: number, take: number): TreePipeline<D, C>;
}
