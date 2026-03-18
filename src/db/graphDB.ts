import { Codec, DBMeta, GraphNodeOf, GraphLinkOf, ListOf, Updater } from "../types";
import { IndexStore, stringifyIndex } from "../util/indices";
import { Lens, sortCompare, SelectorLens, PathLens, LogicalOps, PredicateResult, Predicate, MutatorLens, MutatorLensOf } from "../util/lens";

// ------------------------------------------------------------
// GraphDB<N, L>
// ------------------------------------------------------------

const TYPE = "graph";
const VERSION = 1;

type GraphRecord<N, L> = GraphNodeOf<N> | GraphLinkOf<L>;

export type GraphStep<N, L> = [GraphNodeOf<N>, GraphLinkOf<L>, GraphNodeOf<N>];
export type GraphPath<N, L> = GraphStep<N, L>[];

export class GraphDB<N, L, U = null> {
    private nodeMap: { [id: string]: GraphNodeOf<N> } = {};
    private linkMap: { [id: string]: GraphLinkOf<L> } = {};
    private usermeta: U | null = null;
    private codec: Codec<GraphRecord<N, L>, DBMeta<U | null>>;
    private nodeIndices = new IndexStore();
    private nodeIndexLenses: { [serializedKey: string]: Function } = {};
    private linkIndices = new IndexStore();
    private linkIndexLenses: { [serializedKey: string]: Function } = {};

    constructor(codec: Codec<GraphRecord<N, L>, DBMeta<U | null>>) {
        this.codec = codec;
        this.usermeta = null;
    }

    private get records(): { [id: string]: GraphRecord<N, L> } {
        return { ...this.nodeMap, ...this.linkMap };
    }

    async load() {
        const [records, meta] = await this.codec.load();
        this.nodeMap = {};
        this.linkMap = {};
        for (const record of Object.values(records)) {
            if (record.type === "node") {
                this.nodeMap[record.id] = record as GraphNodeOf<N>;
            } else {
                this.linkMap[record.id] = record as GraphLinkOf<L>;
            }
        }
        this.usermeta = meta?.user ?? null;
        return this.usermeta;
    }

    getMeta() {
        return this.usermeta;
    }

    async setMeta(value: U) {
        this.usermeta = value;
        await this.codec.setMeta({ version: VERSION, type: TYPE, user: this.usermeta }, this.records);
    }

    // --- Node CRUD ---

    get(target: string): GraphNodeOf<N> | undefined;
    get(target: ListOf<string>): GraphNodeOf<N>[];
    get(target: string | ListOf<string>): GraphNodeOf<N> | undefined | GraphNodeOf<N>[] {
        if (typeof target === "string") return this.nodeMap[target];
        const results: GraphNodeOf<N>[] = [];
        for (const id of target) {
            const item = this.nodeMap[id];
            if (item) results.push(item);
        }
        return results;
    }

    async insert(data: N): Promise<GraphNodeOf<N>>;
    async insert(data: N[]): Promise<GraphNodeOf<N>[]>;
    async insert(data: N | N[]): Promise<GraphNodeOf<N> | GraphNodeOf<N>[]> {
        const created: GraphNodeOf<N>[] = [];

        if (Array.isArray(data)) {
            for (const d of data) {
                const id = crypto.randomUUID();
                const node: GraphNodeOf<N> = { id, type: "node", in: [], out: [], data: d };
                this.nodeMap[id] = node;
                this.indexNodeRecord(id, d);
                created.push(node);
            }
        } else {
            const id = crypto.randomUUID();
            const node: GraphNodeOf<N> = { id, type: "node", in: [], out: [], data };
            this.nodeMap[id] = node;
            this.indexNodeRecord(id, data);
            created.push(node);
        }

        await this.codec.insert(created, this.records, { version: VERSION, type: TYPE, user: this.usermeta });
        return Array.isArray(data) ? created : created[0];
    }

    async updateNode(id: string, data: N | ((prev: N, item: GraphNodeOf<N>) => N)): Promise<GraphNodeOf<N> | undefined>;
    async updateNode(payload: { [key: string]: N }): Promise<GraphNodeOf<N>[]>;
    async updateNode(ids: ListOf<string>, updater: (prev: N, item: GraphNodeOf<N>) => N): Promise<GraphNodeOf<N>[]>;
    async updateNode(idOrPayload: string | { [key: string]: N } | ListOf<string>, dataOrUpdater?: N | ((prev: N, item: GraphNodeOf<N>) => N)): Promise<GraphNodeOf<N> | undefined | GraphNodeOf<N>[]> {
        const items: GraphNodeOf<N>[] = [];

        if (typeof idOrPayload === "string") {
            const existing = this.nodeMap[idOrPayload];
            if (!existing) return undefined;
            const newData = typeof dataOrUpdater === "function" ? (dataOrUpdater as (prev: N, item: GraphNodeOf<N>) => N)(existing.data, existing) : (dataOrUpdater as N);
            this.deindexNodeRecord(idOrPayload, existing.data);
            existing.data = newData;
            this.indexNodeRecord(idOrPayload, newData);
            await this.codec.update([existing], this.records, { version: VERSION, type: TYPE, user: this.usermeta });
            return existing;
        } else if (idOrPayload instanceof Set || Array.isArray(idOrPayload)) {
            const updater = dataOrUpdater as (prev: N, item: GraphNodeOf<N>) => N;
            for (const id of idOrPayload) {
                const existing = this.nodeMap[id];
                if (!existing) continue;
                const newData = updater(existing.data, existing);
                this.deindexNodeRecord(id, existing.data);
                existing.data = newData;
                this.indexNodeRecord(id, newData);
                items.push(existing);
            }
        } else {
            for (const [id, d] of Object.entries(idOrPayload)) {
                const existing = this.nodeMap[id];
                if (!existing) continue;
                this.deindexNodeRecord(id, existing.data);
                existing.data = d as N;
                this.indexNodeRecord(id, d as N);
                items.push(existing);
            }
        }

        if (items.length > 0) await this.codec.update(items, this.records, { version: VERSION, type: TYPE, user: this.usermeta });
        return items;
    }

    async remove(target: string): Promise<{ nodes: GraphNodeOf<N>[]; links: GraphLinkOf<L>[] }>;
    async remove(target: ListOf<string>): Promise<{ nodes: GraphNodeOf<N>[]; links: GraphLinkOf<L>[] }>;
    async remove(target: string | ListOf<string>): Promise<{ nodes: GraphNodeOf<N>[]; links: GraphLinkOf<L>[] }> {
        const ids = typeof target === "string" ? [target] : [...target];
        const removedNodes: GraphNodeOf<N>[] = [];
        const removedLinks: GraphLinkOf<L>[] = [];

        for (const id of ids) {
            const node = this.nodeMap[id];
            if (!node) continue;

            // Cascade-delete connected links
            for (const linkId of [...node.in, ...node.out]) {
                const removed = this.removeLinkInternal(linkId);
                if (removed) removedLinks.push(removed);
            }

            this.deindexNodeRecord(id, node.data);
            delete this.nodeMap[id];
            removedNodes.push(node);
        }

        if (removedLinks.length > 0) await this.codec.delete(removedLinks, this.records, { version: VERSION, type: TYPE, user: this.usermeta });
        if (removedNodes.length > 0) await this.codec.delete(removedNodes, this.records, { version: VERSION, type: TYPE, user: this.usermeta });

        return { nodes: removedNodes, links: removedLinks };
    }

    // --- Link CRUD ---

    getLink(target: string): GraphLinkOf<L> | undefined;
    getLink(target: ListOf<string>): GraphLinkOf<L>[];
    getLink(target: string | ListOf<string>): GraphLinkOf<L> | undefined | GraphLinkOf<L>[] {
        if (typeof target === "string") return this.linkMap[target];
        const results: GraphLinkOf<L>[] = [];
        for (const id of target) {
            const item = this.linkMap[id];
            if (item) results.push(item);
        }
        return results;
    }

    async connect(from: string, to: string, data: L): Promise<GraphLinkOf<L>> {
        const id = crypto.randomUUID();
        const link: GraphLinkOf<L> = { id, type: "link", from, to, data };
        this.linkMap[id] = link;
        this.indexLinkRecord(id, data);

        const fromNode = this.nodeMap[from];
        if (fromNode) fromNode.out.push(id);
        const toNode = this.nodeMap[to];
        if (toNode) toNode.in.push(id);

        await this.codec.insert([link], this.records, { version: VERSION, type: TYPE, user: this.usermeta });
        return link;
    }

    async updateLink(id: string, data: L | ((prev: L, item: GraphLinkOf<L>, from: GraphNodeOf<N>, to: GraphNodeOf<N>) => L)): Promise<GraphLinkOf<L> | undefined>;
    async updateLink(payload: { [key: string]: L }): Promise<GraphLinkOf<L>[]>;
    async updateLink(ids: ListOf<string>, updater: (prev: L, item: GraphLinkOf<L>, from: GraphNodeOf<N>, to: GraphNodeOf<N>) => L): Promise<GraphLinkOf<L>[]>;
    async updateLink(idOrPayload: string | { [key: string]: L } | ListOf<string>, dataOrUpdater?: L | ((prev: L, item: GraphLinkOf<L>, from: GraphNodeOf<N>, to: GraphNodeOf<N>) => L)): Promise<GraphLinkOf<L> | undefined | GraphLinkOf<L>[]> {
        const items: GraphLinkOf<L>[] = [];

        if (typeof idOrPayload === "string") {
            const existing = this.linkMap[idOrPayload];
            if (!existing) return undefined;
            const fromNode = this.nodeMap[existing.from];
            const toNode = this.nodeMap[existing.to];
            const newData = typeof dataOrUpdater === "function" ? (dataOrUpdater as (prev: L, item: GraphLinkOf<L>, from: GraphNodeOf<N>, to: GraphNodeOf<N>) => L)(existing.data, existing, fromNode, toNode) : (dataOrUpdater as L);
            this.deindexLinkRecord(idOrPayload, existing.data);
            existing.data = newData;
            this.indexLinkRecord(idOrPayload, newData);
            await this.codec.update([existing], this.records, { version: VERSION, type: TYPE, user: this.usermeta });
            return existing;
        } else if (idOrPayload instanceof Set || Array.isArray(idOrPayload)) {
            const updater = dataOrUpdater as (prev: L, item: GraphLinkOf<L>, from: GraphNodeOf<N>, to: GraphNodeOf<N>) => L;
            for (const id of idOrPayload) {
                const existing = this.linkMap[id];
                if (!existing) continue;
                const fromNode = this.nodeMap[existing.from];
                const toNode = this.nodeMap[existing.to];
                const newData = updater(existing.data, existing, fromNode, toNode);
                this.deindexLinkRecord(id, existing.data);
                existing.data = newData;
                this.indexLinkRecord(id, newData);
                items.push(existing);
            }
        } else {
            for (const [id, d] of Object.entries(idOrPayload)) {
                const existing = this.linkMap[id];
                if (!existing) continue;
                this.deindexLinkRecord(id, existing.data);
                existing.data = d as L;
                this.indexLinkRecord(id, d as L);
                items.push(existing);
            }
        }

        if (items.length > 0) await this.codec.update(items, this.records, { version: VERSION, type: TYPE, user: this.usermeta });
        return items;
    }

    async sever(target: string): Promise<GraphLinkOf<L> | undefined>;
    async sever(target: ListOf<string>): Promise<GraphLinkOf<L>[]>;
    async sever(target: string | ListOf<string>): Promise<GraphLinkOf<L> | undefined | GraphLinkOf<L>[]> {
        const ids = typeof target === "string" ? [target] : [...target];
        const removed: GraphLinkOf<L>[] = [];

        for (const id of ids) {
            const link = this.removeLinkInternal(id);
            if (link) removed.push(link);
        }

        if (removed.length > 0) await this.codec.delete(removed, this.records, { version: VERSION, type: TYPE, user: this.usermeta });
        return typeof target === "string" ? removed[0] : removed;
    }

    async disconnect(nodeA: string, nodeB: string): Promise<GraphLinkOf<L>[]> {
        const toRemove: string[] = [];
        for (const [id, link] of Object.entries(this.linkMap)) {
            if ((link.from === nodeA && link.to === nodeB) || (link.from === nodeB && link.to === nodeA)) {
                toRemove.push(id);
            }
        }
        if (toRemove.length === 0) return [];
        return (await this.sever(toRemove)) as GraphLinkOf<L>[];
    }

    async isolate(target: string | ListOf<string>): Promise<GraphLinkOf<L>[]> {
        const ids = typeof target === "string" ? [target] : [...target];
        const linkIds = new Set<string>();
        for (const id of ids) {
            const node = this.nodeMap[id];
            if (!node) continue;
            for (const linkId of node.in) linkIds.add(linkId);
            for (const linkId of node.out) linkIds.add(linkId);
        }
        if (linkIds.size === 0) return [];
        return (await this.sever([...linkIds])) as GraphLinkOf<L>[];
    }

    async isolateIn(target: string | ListOf<string>): Promise<GraphLinkOf<L>[]> {
        const ids = typeof target === "string" ? [target] : [...target];
        const linkIds = new Set<string>();
        for (const id of ids) {
            const node = this.nodeMap[id];
            if (node) for (const linkId of node.in) linkIds.add(linkId);
        }
        if (linkIds.size === 0) return [];
        return (await this.sever([...linkIds])) as GraphLinkOf<L>[];
    }

    async isolateOut(target: string | ListOf<string>): Promise<GraphLinkOf<L>[]> {
        const ids = typeof target === "string" ? [target] : [...target];
        const linkIds = new Set<string>();
        for (const id of ids) {
            const node = this.nodeMap[id];
            if (node) for (const linkId of node.out) linkIds.add(linkId);
        }
        if (linkIds.size === 0) return [];
        return (await this.sever([...linkIds])) as GraphLinkOf<L>[];
    }

    // --- Internal: link removal ---

    private removeLinkInternal(linkId: string): GraphLinkOf<L> | undefined {
        const link = this.linkMap[linkId];
        if (!link) return undefined;

        const fromNode = this.nodeMap[link.from];
        if (fromNode) {
            const idx = fromNode.out.indexOf(linkId);
            if (idx !== -1) fromNode.out.splice(idx, 1);
        }

        const toNode = this.nodeMap[link.to];
        if (toNode) {
            const idx = toNode.in.indexOf(linkId);
            if (idx !== -1) toNode.in.splice(idx, 1);
        }

        this.deindexLinkRecord(linkId, link.data);
        delete this.linkMap[linkId];
        return link;
    }

    // --- Index management ---

    addNodeIndex<T>(lens: ($: PathLens<N>) => PathLens<T>): void {
        const segments = Lens.path(lens);
        const key = stringifyIndex(segments);
        if (this.nodeIndexLenses[key]) return;
        this.nodeIndexLenses[key] = lens;
        this.nodeIndices.create(segments);
        for (const [id, node] of Object.entries(this.nodeMap)) {
            const value = Lens.get(node.data as N, lens as any);
            if (value !== undefined) this.nodeIndices.index(key, value, id);
        }
    }

    dropNodeIndex<T>(lens: ($: PathLens<N>) => PathLens<T>): void {
        const segments = Lens.path(lens);
        const key = stringifyIndex(segments);
        delete this.nodeIndexLenses[key];
        this.nodeIndices.drop(segments);
    }

    addLinkIndex<T>(lens: ($: PathLens<L>) => PathLens<T>): void {
        const segments = Lens.path(lens);
        const key = stringifyIndex(segments);
        if (this.linkIndexLenses[key]) return;
        this.linkIndexLenses[key] = lens;
        this.linkIndices.create(segments);
        for (const [id, link] of Object.entries(this.linkMap)) {
            const value = Lens.get(link.data as L, lens as any);
            if (value !== undefined) this.linkIndices.index(key, value, id);
        }
    }

    dropLinkIndex<T>(lens: ($: PathLens<L>) => PathLens<T>): void {
        const segments = Lens.path(lens);
        const key = stringifyIndex(segments);
        delete this.linkIndexLenses[key];
        this.linkIndices.drop(segments);
    }

    // --- Index maintenance (private) ---

    private indexNodeRecord(id: string, data: N): void {
        for (const [key, lens] of Object.entries(this.nodeIndexLenses)) {
            const value = Lens.get(data, lens as any);
            if (value !== undefined) this.nodeIndices.index(key, value, id);
        }
    }

    private deindexNodeRecord(id: string, data: N): void {
        for (const [key, lens] of Object.entries(this.nodeIndexLenses)) {
            const value = Lens.get(data, lens as any);
            if (value !== undefined) this.nodeIndices.deindex(key, value, id);
        }
    }

    private indexLinkRecord(id: string, data: L): void {
        for (const [key, lens] of Object.entries(this.linkIndexLenses)) {
            const value = Lens.get(data, lens as any);
            if (value !== undefined) this.linkIndices.index(key, value, id);
        }
    }

    private deindexLinkRecord(id: string, data: L): void {
        for (const [key, lens] of Object.entries(this.linkIndexLenses)) {
            const value = Lens.get(data, lens as any);
            if (value !== undefined) this.linkIndices.deindex(key, value, id);
        }
    }

    // --- Chain starters → node pipeline ---

    nodes: { (): GraphNodePipeline<N, L, "multi"> } = (() => createNodePipeline(this, { type: "all" })) as any;

    nodesWhere: {
        <T>(lens: ($: SelectorLens<N> & GraphNodeMeta & LogicalOps) => Predicate<T> | PredicateResult): GraphNodePipeline<N, L, "multi">;
    } = ((predFn: Function) => createNodePipeline(this, { type: "where", predFn })) as any;

    node: {
        (target: string): GraphNodePipeline<N, L, "single">;
        (target: ListOf<string>): GraphNodePipeline<N, L, "multi">;
    } = ((target: string | ListOf<string>) => {
        if (typeof target === "string") return createNodePipeline(this, { type: "selectOne", id: target });
        return createNodePipeline(this, { type: "select", ids: [...target] });
    }) as any;

    // --- Chain starters → link pipeline ---

    links: { (): GraphLinkPipeline<N, L, "multi"> } = (() => createLinkPipeline(this, { type: "all" })) as any;

    linksWhere: {
        <T>(lens: ($: SelectorLens<L> & GraphLinkMeta & LogicalOps) => Predicate<T> | PredicateResult): GraphLinkPipeline<N, L, "multi">;
    } = ((predFn: Function) => createLinkPipeline(this, { type: "where", predFn })) as any;

    link: {
        (target: string): GraphLinkPipeline<N, L, "single">;
        (target: ListOf<string>): GraphLinkPipeline<N, L, "multi">;
    } = ((target: string | ListOf<string>) => {
        if (typeof target === "string") return createLinkPipeline(this, { type: "selectOne", id: target });
        return createLinkPipeline(this, { type: "select", ids: [...target] });
    }) as any;

    // --- Set operations ---

    intersection(...pipelines: (GraphNodePipeline<N, L, any> | GraphLinkPipeline<N, L, any>)[]): GraphNodePipeline<N, L, "multi"> | GraphLinkPipeline<N, L, "multi"> {
        const sets = pipelines.map((p) => new Set<string>((p as any)[RESOLVE]().map((i: { id: string }) => i.id)));
        const result = sets.reduce((acc, s) => { for (const id of acc) { if (!s.has(id)) acc.delete(id); } return acc; });
        // Determine if node or link pipeline by checking first result
        const firstItems = (pipelines[0] as any)[RESOLVE]();
        const isLink = firstItems.length > 0 && "from" in firstItems[0];
        if (isLink) return createLinkPipeline(this, { type: "ids", ids: [...result] }) as any;
        return createNodePipeline(this, { type: "ids", ids: [...result] }) as any;
    }

    union(...pipelines: (GraphNodePipeline<N, L, any> | GraphLinkPipeline<N, L, any>)[]): GraphNodePipeline<N, L, "multi"> | GraphLinkPipeline<N, L, "multi"> {
        const seen = new Set<string>();
        for (const p of pipelines) for (const item of (p as any)[RESOLVE]()) seen.add((item as { id: string }).id);
        const firstItems = (pipelines[0] as any)[RESOLVE]();
        const isLink = firstItems.length > 0 && "from" in firstItems[0];
        if (isLink) return createLinkPipeline(this, { type: "ids", ids: [...seen] }) as any;
        return createNodePipeline(this, { type: "ids", ids: [...seen] }) as any;
    }

    exclusion(from: GraphNodePipeline<N, L, any> | GraphLinkPipeline<N, L, any>, ...subtract: (GraphNodePipeline<N, L, any> | GraphLinkPipeline<N, L, any>)[]): GraphNodePipeline<N, L, "multi"> | GraphLinkPipeline<N, L, "multi"> {
        const base = new Set<string>((from as any)[RESOLVE]().map((i: { id: string }) => i.id));
        for (const p of subtract) for (const item of (p as any)[RESOLVE]()) base.delete((item as { id: string }).id);
        const firstItems = (from as any)[RESOLVE]();
        const isLink = firstItems.length > 0 && "from" in firstItems[0];
        if (isLink) return createLinkPipeline(this, { type: "ids", ids: [...base] }) as any;
        return createNodePipeline(this, { type: "ids", ids: [...base] }) as any;
    }

    // --- Join ---

    async join(
        fromPipeline: GraphNodePipeline<N, L, any>,
        toPipeline: GraphNodePipeline<N, L, any>,
        data: L | ((from: GraphNodeOf<N>, to: GraphNodeOf<N>) => L | undefined),
    ): Promise<GraphLinkOf<L>[]> {
        const fromNodes = (fromPipeline as any)[RESOLVE]() as GraphNodeOf<N>[];
        const toNodes = (toPipeline as any)[RESOLVE]() as GraphNodeOf<N>[];
        const created: GraphLinkOf<L>[] = [];
        for (const f of fromNodes) {
            for (const t of toNodes) {
                const linkData = typeof data === "function" ? (data as (from: GraphNodeOf<N>, to: GraphNodeOf<N>) => L | undefined)(f, t) : data;
                if (linkData === undefined) continue;
                const link = await this.connect(f.id, t.id, linkData);
                created.push(link);
            }
        }
        return created;
    }
}

// ------------------------------------------------------------
// Meta types
// ------------------------------------------------------------

export type GraphNodeMeta = {
    ID: SelectorLens<string>;
    IN_DEGREE: SelectorLens<number>;
    OUT_DEGREE: SelectorLens<number>;
    DEGREE: SelectorLens<number>;
};

export type GraphLinkMeta = {
    ID: SelectorLens<string>;
    FROM: SelectorLens<string>;
    TO: SelectorLens<string>;
};

export type GraphPathMeta = {
    LENGTH: SelectorLens<number>;
};

// ------------------------------------------------------------
// Pipeline Seeds
// ------------------------------------------------------------

type NodePipelineSeed =
    | { type: "all" }
    | { type: "selectOne"; id: string }
    | { type: "select"; ids: string[] }
    | { type: "where"; predFn: Function }
    | { type: "ids"; ids: string[] };

type LinkPipelineSeed =
    | { type: "all" }
    | { type: "selectOne"; id: string }
    | { type: "select"; ids: string[] }
    | { type: "where"; predFn: Function }
    | { type: "ids"; ids: string[] };

// ------------------------------------------------------------
// Pipeline Ops
// ------------------------------------------------------------

type NodePipelineOp =
    | { type: "where"; predFn: Function }
    | { type: "sort"; lensFn: Function; dir: "asc" | "desc" }
    | { type: "first" }
    | { type: "last" }
    | { type: "at"; index: number }
    | { type: "distinct" }
    | { type: "slice"; start: number; end?: number }
    | { type: "via"; predFn?: Function }
    | { type: "viaOut"; predFn?: Function }
    | { type: "viaIn"; predFn?: Function }
    | { type: "deepDownstream" }
    | { type: "deepUpstream" }
    | { type: "deepAll" }
    | { type: "wideDownstream" }
    | { type: "wideUpstream" }
    | { type: "wideAll" };

type LinkPipelineOp =
    | { type: "where"; predFn: Function }
    | { type: "sort"; lensFn: Function; dir: "asc" | "desc" }
    | { type: "first" }
    | { type: "last" }
    | { type: "at"; index: number }
    | { type: "distinct" }
    | { type: "slice"; start: number; end?: number };

// ------------------------------------------------------------
// Shared
// ------------------------------------------------------------

const RESOLVE = Symbol();

const NODE_INDEX_OPS: { [op: string]: (idx: IndexStore, key: string, operand: unknown, operand2?: unknown) => ReadonlySet<string> | Set<string> } = {
    "=": (idx, key, v) => idx.eq(key, v),
    ">": (idx, key, v) => idx.gt(key, v),
    ">=": (idx, key, v) => idx.gte(key, v),
    "<": (idx, key, v) => idx.lt(key, v),
    "<=": (idx, key, v) => idx.lte(key, v),
    "><": (idx, key, lo, hi) => idx.range(key, lo, hi, false, false),
    ">=<": (idx, key, lo, hi) => idx.range(key, lo, hi, true, false),
};

function nodeMetaFor<N>(node: GraphNodeOf<N>): { ID: string; IN_DEGREE: number; OUT_DEGREE: number; DEGREE: number } {
    return { ID: node.id, IN_DEGREE: node.in.length, OUT_DEGREE: node.out.length, DEGREE: node.in.length + node.out.length };
}

function linkMetaFor<L>(link: GraphLinkOf<L>): { ID: string; FROM: string; TO: string } {
    return { ID: link.id, FROM: link.from, TO: link.to };
}

function evalNodeWhere<N>(predFn: Function, node: GraphNodeOf<N>): boolean {
    return Lens.match(node.data, predFn, nodeMetaFor(node));
}

function evalLinkWhere<L>(predFn: Function, link: GraphLinkOf<L>): boolean {
    return Lens.match(link.data, predFn, linkMetaFor(link));
}

function tryNodeIndexAccelerate<N, L>(predFn: Function, db: GraphDB<N, L, any>): Set<string> | null {
    const probed = Lens.probe(predFn);
    if (!probed) return null;
    const { path, operator, operand, operand2 } = probed;
    const pathKey = stringifyIndex(path);
    const indices = (db as any).nodeIndices as IndexStore;
    if (!indices.keys().includes(pathKey)) return null;
    if (operator.startsWith("!")) return null;
    if (operator.endsWith("|") || operator.endsWith("&")) return null;
    const indexOp = NODE_INDEX_OPS[operator];
    if (!indexOp) return null;
    if (operand2 !== undefined) return indexOp(indices, pathKey, operand, operand2) as Set<string>;
    return indexOp(indices, pathKey, operand) as Set<string>;
}

function tryLinkIndexAccelerate<N, L>(predFn: Function, db: GraphDB<N, L, any>): Set<string> | null {
    const probed = Lens.probe(predFn);
    if (!probed) return null;
    const { path, operator, operand, operand2 } = probed;
    const pathKey = stringifyIndex(path);
    const indices = (db as any).linkIndices as IndexStore;
    if (!indices.keys().includes(pathKey)) return null;
    if (operator.startsWith("!")) return null;
    if (operator.endsWith("|") || operator.endsWith("&")) return null;
    const indexOp = NODE_INDEX_OPS[operator];
    if (!indexOp) return null;
    if (operand2 !== undefined) return indexOp(indices, pathKey, operand, operand2) as Set<string>;
    return indexOp(indices, pathKey, operand) as Set<string>;
}

// ------------------------------------------------------------
// Graph traversal helpers
// ------------------------------------------------------------

function resolveVia<N, L>(items: GraphNodeOf<N>[], direction: "any" | "out" | "in", links: { [id: string]: GraphLinkOf<L> }, nodes: { [id: string]: GraphNodeOf<N> }, predFn?: Function): GraphNodeOf<N>[] {
    const result: GraphNodeOf<N>[] = [];
    const seen = new Set<string>();

    for (const node of items) {
        const linkIds = direction === "out" ? node.out : direction === "in" ? node.in : [...node.out, ...node.in];
        for (const linkId of linkIds) {
            const link = links[linkId];
            if (!link) continue;
            if (predFn && !Lens.match(link.data, predFn, linkMetaFor(link))) continue;
            const targetId = link.from === node.id ? link.to : link.from;
            if (seen.has(targetId)) continue;
            seen.add(targetId);
            const target = nodes[targetId];
            if (target) result.push(target);
        }
    }

    return result;
}

function resolveDeepWideNodes<N, L>(
    items: GraphNodeOf<N>[],
    direction: "downstream" | "upstream" | "any",
    order: "deep" | "wide",
    links: { [id: string]: GraphLinkOf<L> },
    nodes: { [id: string]: GraphNodeOf<N> },
): GraphNodeOf<N>[] {
    const result: GraphNodeOf<N>[] = [];
    const seen = new Set<string>();
    for (const item of items) seen.add(item.id);

    const queue = [...items];
    if (order === "deep") queue.reverse();

    while (queue.length > 0) {
        const current = order === "deep" ? queue.pop()! : queue.shift()!;
        const linkIds = direction === "downstream" ? current.out : direction === "upstream" ? current.in : [...current.out, ...current.in];

        for (const linkId of linkIds) {
            const link = links[linkId];
            if (!link) continue;
            const targetId = link.from === current.id ? link.to : link.from;
            if (seen.has(targetId)) continue;
            seen.add(targetId);
            const target = nodes[targetId];
            if (target) {
                result.push(target);
                if (order === "deep") queue.push(target);
                else queue.push(target);
            }
        }
    }

    return result;
}

function resolveDeepWideLinks<N, L>(
    items: GraphNodeOf<N>[],
    direction: "downstream" | "upstream" | "any",
    order: "deep" | "wide",
    links: { [id: string]: GraphLinkOf<L> },
    nodes: { [id: string]: GraphNodeOf<N> },
): GraphLinkOf<L>[] {
    const result: GraphLinkOf<L>[] = [];
    const seenNodes = new Set<string>();
    const seenLinks = new Set<string>();
    for (const item of items) seenNodes.add(item.id);

    const queue = [...items];
    if (order === "deep") queue.reverse();

    while (queue.length > 0) {
        const current = order === "deep" ? queue.pop()! : queue.shift()!;
        const linkIds = direction === "downstream" ? current.out : direction === "upstream" ? current.in : [...current.out, ...current.in];

        for (const linkId of linkIds) {
            if (seenLinks.has(linkId)) continue;
            seenLinks.add(linkId);
            const link = links[linkId];
            if (!link) continue;
            result.push(link);
            const targetId = link.from === current.id ? link.to : link.from;
            if (!seenNodes.has(targetId)) {
                seenNodes.add(targetId);
                const target = nodes[targetId];
                if (target) queue.push(target);
            }
        }
    }

    return result;
}

// ------------------------------------------------------------
// Path finding
// ------------------------------------------------------------

function findPaths<N, L>(
    startIds: string[],
    target: string | Function,
    direction: "downstream" | "upstream" | "any",
    links: { [id: string]: GraphLinkOf<L> },
    nodes: { [id: string]: GraphNodeOf<N> },
): GraphPath<N, L>[] {
    const paths: GraphPath<N, L>[] = [];
    const isTargetFn = typeof target === "function";

    for (const startId of startIds) {
        const startNode = nodes[startId];
        if (!startNode) continue;

        const queue: { nodeId: string; path: GraphStep<N, L>[] }[] = [{ nodeId: startId, path: [] }];
        const visited = new Set<string>([startId]);

        while (queue.length > 0) {
            const { nodeId, path } = queue.shift()!;
            const current = nodes[nodeId];
            if (!current) continue;

            const linkIds = direction === "downstream" ? current.out : direction === "upstream" ? current.in : [...current.out, ...current.in];

            for (const linkId of linkIds) {
                const link = links[linkId];
                if (!link) continue;
                const targetId = link.from === nodeId ? link.to : link.from;
                const targetNode = nodes[targetId];
                if (!targetNode) continue;

                const step: GraphStep<N, L> = [current, link, targetNode];
                const newPath = [...path, step];

                const isMatch = isTargetFn ? (target as Function)(targetNode.data, nodeMetaFor(targetNode)) : targetId === target;
                if (isMatch) {
                    paths.push(newPath);
                }

                if (!visited.has(targetId)) {
                    visited.add(targetId);
                    queue.push({ nodeId: targetId, path: newPath });
                }
            }
        }
    }

    return paths;
}

// ------------------------------------------------------------
// Node Pipeline
// ------------------------------------------------------------

function createNodePipeline<N, L>(db: GraphDB<N, L, any>, seed: NodePipelineSeed): any {
    const ops: NodePipelineOp[] = [];
    const nodeData = (db as any).nodeMap as { [id: string]: GraphNodeOf<N> };
    const linkData = (db as any).linkMap as { [id: string]: GraphLinkOf<L> };

    function resolve(): GraphNodeOf<N>[] {
        switch (seed.type) {
            case "all":
                return Object.values(nodeData);
            case "selectOne": {
                const item = nodeData[seed.id];
                return item ? [item] : [];
            }
            case "select":
            case "ids":
                return seed.ids.map((id) => nodeData[id]).filter(Boolean) as GraphNodeOf<N>[];
            case "where": {
                const indexed = tryNodeIndexAccelerate(seed.predFn, db);
                if (indexed) {
                    const candidates = [...indexed].map((id) => nodeData[id]).filter(Boolean) as GraphNodeOf<N>[];
                    return candidates.filter((node) => evalNodeWhere(seed.predFn, node));
                }
                return Object.values(nodeData).filter((node) => evalNodeWhere(seed.predFn, node));
            }
        }
    }

    function execute(): GraphNodeOf<N>[] | GraphNodeOf<N> | undefined {
        let items = resolve();
        let isSingle = seed.type === "selectOne";

        for (const op of ops) {
            switch (op.type) {
                case "where":
                    items = items.filter((node) => evalNodeWhere(op.predFn, node));
                    break;
                case "sort": {
                    items = [...items].sort((a, b) => {
                        const aVal = Lens.get(a.data as any, op.lensFn as any, nodeMetaFor(a));
                        const bVal = Lens.get(b.data as any, op.lensFn as any, nodeMetaFor(b));
                        return op.dir === "desc" ? -sortCompare(aVal, bVal) : sortCompare(aVal, bVal);
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
                    items = items.filter((node) => { if (seen.has(node.id)) return false; seen.add(node.id); return true; });
                    break;
                }
                case "slice":
                    items = items.slice(op.start, op.end);
                    break;
                case "via":
                    items = resolveVia(items, "any", linkData, nodeData, op.predFn);
                    isSingle = false;
                    break;
                case "viaOut":
                    items = resolveVia(items, "out", linkData, nodeData, op.predFn);
                    isSingle = false;
                    break;
                case "viaIn":
                    items = resolveVia(items, "in", linkData, nodeData, op.predFn);
                    isSingle = false;
                    break;
                case "deepDownstream":
                    items = resolveDeepWideNodes(items, "downstream", "deep", linkData, nodeData);
                    isSingle = false;
                    break;
                case "deepUpstream":
                    items = resolveDeepWideNodes(items, "upstream", "deep", linkData, nodeData);
                    isSingle = false;
                    break;
                case "deepAll":
                    items = resolveDeepWideNodes(items, "any", "deep", linkData, nodeData);
                    isSingle = false;
                    break;
                case "wideDownstream":
                    items = resolveDeepWideNodes(items, "downstream", "wide", linkData, nodeData);
                    isSingle = false;
                    break;
                case "wideUpstream":
                    items = resolveDeepWideNodes(items, "upstream", "wide", linkData, nodeData);
                    isSingle = false;
                    break;
                case "wideAll":
                    items = resolveDeepWideNodes(items, "any", "wide", linkData, nodeData);
                    isSingle = false;
                    break;
            }
        }

        if (isSingle) return items[0];
        return items;
    }

    const pipeline: any = {
        [RESOLVE](): GraphNodeOf<N>[] {
            const r = execute();
            return Array.isArray(r) ? r : r ? [r] : [];
        },
        // --- Standard chaining ---
        where(predFn: Function) { ops.push({ type: "where", predFn }); return pipeline; },
        sort(lensFn: Function, dir: "asc" | "desc") { ops.push({ type: "sort", lensFn, dir }); return pipeline; },
        first() { ops.push({ type: "first" }); return pipeline; },
        last() { ops.push({ type: "last" }); return pipeline; },
        at(index: number) { ops.push({ type: "at", index }); return pipeline; },
        distinct() { ops.push({ type: "distinct" }); return pipeline; },
        slice(start: number, end?: number) { ops.push({ type: "slice", start, end }); return pipeline; },
        paginate(page: number, count: number) { ops.push({ type: "slice", start: (page - 1) * count, end: page * count }); return pipeline; },
        window(skip: number, take: number) { ops.push({ type: "slice", start: skip, end: skip + take }); return pipeline; },

        // --- Via (stay node mode) ---
        via(predFn?: Function) { ops.push({ type: "via", predFn }); return pipeline; },
        viaOut(predFn?: Function) { ops.push({ type: "viaOut", predFn }); return pipeline; },
        viaIn(predFn?: Function) { ops.push({ type: "viaIn", predFn }); return pipeline; },

        // --- Deep/wide node traversals (stay node mode) ---
        deepDownstreamNodes() { ops.push({ type: "deepDownstream" }); return pipeline; },
        deepUpstreamNodes() { ops.push({ type: "deepUpstream" }); return pipeline; },
        deepNodes() { ops.push({ type: "deepAll" }); return pipeline; },
        wideDownstreamNodes() { ops.push({ type: "wideDownstream" }); return pipeline; },
        wideUpstreamNodes() { ops.push({ type: "wideUpstream" }); return pipeline; },
        wideNodes() { ops.push({ type: "wideAll" }); return pipeline; },

        // --- Mode switches to link pipeline (eager resolve) ---
        links() {
            const items = pipeline[RESOLVE]() as GraphNodeOf<N>[];
            const linkIds = new Set<string>();
            for (const n of items) { for (const id of [...n.in, ...n.out]) linkIds.add(id); }
            return createLinkPipeline(db, { type: "ids", ids: [...linkIds] });
        },
        out() {
            const items = pipeline[RESOLVE]() as GraphNodeOf<N>[];
            const linkIds = new Set<string>();
            for (const n of items) { for (const id of n.out) linkIds.add(id); }
            return createLinkPipeline(db, { type: "ids", ids: [...linkIds] });
        },
        in() {
            const items = pipeline[RESOLVE]() as GraphNodeOf<N>[];
            const linkIds = new Set<string>();
            for (const n of items) { for (const id of n.in) linkIds.add(id); }
            return createLinkPipeline(db, { type: "ids", ids: [...linkIds] });
        },

        // --- Deep/wide link traversals (mode switch to link pipeline) ---
        deepDownstreamLinks() {
            const items = pipeline[RESOLVE]() as GraphNodeOf<N>[];
            const result = resolveDeepWideLinks(items, "downstream", "deep", linkData, nodeData);
            return createLinkPipeline(db, { type: "ids", ids: result.map((l) => l.id) });
        },
        deepUpstreamLinks() {
            const items = pipeline[RESOLVE]() as GraphNodeOf<N>[];
            const result = resolveDeepWideLinks(items, "upstream", "deep", linkData, nodeData);
            return createLinkPipeline(db, { type: "ids", ids: result.map((l) => l.id) });
        },
        deepLinks() {
            const items = pipeline[RESOLVE]() as GraphNodeOf<N>[];
            const result = resolveDeepWideLinks(items, "any", "deep", linkData, nodeData);
            return createLinkPipeline(db, { type: "ids", ids: result.map((l) => l.id) });
        },
        wideDownstreamLinks() {
            const items = pipeline[RESOLVE]() as GraphNodeOf<N>[];
            const result = resolveDeepWideLinks(items, "downstream", "wide", linkData, nodeData);
            return createLinkPipeline(db, { type: "ids", ids: result.map((l) => l.id) });
        },
        wideUpstreamLinks() {
            const items = pipeline[RESOLVE]() as GraphNodeOf<N>[];
            const result = resolveDeepWideLinks(items, "upstream", "wide", linkData, nodeData);
            return createLinkPipeline(db, { type: "ids", ids: result.map((l) => l.id) });
        },
        wideLinks() {
            const items = pipeline[RESOLVE]() as GraphNodeOf<N>[];
            const result = resolveDeepWideLinks(items, "any", "wide", linkData, nodeData);
            return createLinkPipeline(db, { type: "ids", ids: result.map((l) => l.id) });
        },

        // --- Mode switch to path pipeline ---
        pathTo(target: string | Function) {
            const items = pipeline[RESOLVE]() as GraphNodeOf<N>[];
            const paths = findPaths(items.map((n) => n.id), target, "downstream", linkData, nodeData);
            return createPathPipeline(db, paths);
        },
        pathFrom(target: string | Function) {
            const items = pipeline[RESOLVE]() as GraphNodeOf<N>[];
            const paths = findPaths(items.map((n) => n.id), target, "upstream", linkData, nodeData);
            return createPathPipeline(db, paths);
        },
        pathUntil(target: string | Function) {
            const items = pipeline[RESOLVE]() as GraphNodeOf<N>[];
            const paths = findPaths(items.map((n) => n.id), target, "any", linkData, nodeData);
            return createPathPipeline(db, paths);
        },

        // --- Read terminals ---
        async get() { return execute(); },
        async count() { const r = execute(); return Array.isArray(r) ? r.length : r ? 1 : 0; },
        async exists() { const r = execute(); return Array.isArray(r) ? r.length > 0 : r !== undefined; },
        async id() { const r = execute(); return Array.isArray(r) ? r.map((i: GraphNodeOf<N>) => i.id) : (r as GraphNodeOf<N> | undefined)?.id; },

        // --- Write terminals ---
        async update(...args: any[]) {
            const result = execute();
            const items = Array.isArray(result) ? result : result ? [result] : [];
            if (items.length === 0) return result;
            if (typeof args[0] === "function" && args.length === 1) {
                await db.updateNode(items.map((i) => i.id), args[0]);
            } else if (typeof args[0] === "function") {
                const lensFn = args[0]; const value = args[1];
                await db.updateNode(items.map((i) => i.id), (prev: N) => { Lens.mutate(prev, lensFn, value); return prev; });
            } else {
                const payload: { [key: string]: N } = {};
                for (const item of items) payload[item.id] = args[0] as N;
                await db.updateNode(payload);
            }
            return result;
        },
        async remove() {
            const result = execute();
            const items = Array.isArray(result) ? result : result ? [result] : [];
            if (items.length > 0) await db.remove(items.map((i) => i.id));
            return result;
        },
        async isolate() {
            const result = execute();
            const items = Array.isArray(result) ? result : result ? [result] : [];
            if (items.length > 0) await db.isolate(items.map((i) => i.id));
            return result;
        },
        async isolateIn() {
            const result = execute();
            const items = Array.isArray(result) ? result : result ? [result] : [];
            if (items.length > 0) await db.isolateIn(items.map((i) => i.id));
            return result;
        },
        async isolateOut() {
            const result = execute();
            const items = Array.isArray(result) ? result : result ? [result] : [];
            if (items.length > 0) await db.isolateOut(items.map((i) => i.id));
            return result;
        },
    };

    return pipeline;
}

// ------------------------------------------------------------
// Link Pipeline
// ------------------------------------------------------------

function createLinkPipeline<N, L>(db: GraphDB<N, L, any>, seed: LinkPipelineSeed): any {
    const ops: LinkPipelineOp[] = [];
    const linkData = (db as any).linkMap as { [id: string]: GraphLinkOf<L> };
    const nodeData = (db as any).nodeMap as { [id: string]: GraphNodeOf<N> };

    function resolve(): GraphLinkOf<L>[] {
        switch (seed.type) {
            case "all":
                return Object.values(linkData);
            case "selectOne": {
                const item = linkData[seed.id];
                return item ? [item] : [];
            }
            case "select":
            case "ids":
                return seed.ids.map((id) => linkData[id]).filter(Boolean) as GraphLinkOf<L>[];
            case "where": {
                const indexed = tryLinkIndexAccelerate(seed.predFn, db);
                if (indexed) {
                    const candidates = [...indexed].map((id) => linkData[id]).filter(Boolean) as GraphLinkOf<L>[];
                    return candidates.filter((link) => evalLinkWhere(seed.predFn, link));
                }
                return Object.values(linkData).filter((link) => evalLinkWhere(seed.predFn, link));
            }
        }
    }

    function execute(): GraphLinkOf<L>[] | GraphLinkOf<L> | undefined {
        let items = resolve();
        let isSingle = seed.type === "selectOne";

        for (const op of ops) {
            switch (op.type) {
                case "where":
                    items = items.filter((link) => evalLinkWhere(op.predFn, link));
                    break;
                case "sort": {
                    items = [...items].sort((a, b) => {
                        const aVal = Lens.get(a.data as any, op.lensFn as any, linkMetaFor(a));
                        const bVal = Lens.get(b.data as any, op.lensFn as any, linkMetaFor(b));
                        return op.dir === "desc" ? -sortCompare(aVal, bVal) : sortCompare(aVal, bVal);
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
                    items = items.filter((link) => { if (seen.has(link.id)) return false; seen.add(link.id); return true; });
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
        [RESOLVE](): GraphLinkOf<L>[] {
            const r = execute();
            return Array.isArray(r) ? r : r ? [r] : [];
        },
        // --- Standard chaining ---
        where(predFn: Function) { ops.push({ type: "where", predFn }); return pipeline; },
        sort(lensFn: Function, dir: "asc" | "desc") { ops.push({ type: "sort", lensFn, dir }); return pipeline; },
        first() { ops.push({ type: "first" }); return pipeline; },
        last() { ops.push({ type: "last" }); return pipeline; },
        at(index: number) { ops.push({ type: "at", index }); return pipeline; },
        distinct() { ops.push({ type: "distinct" }); return pipeline; },
        slice(start: number, end?: number) { ops.push({ type: "slice", start, end }); return pipeline; },
        paginate(page: number, count: number) { ops.push({ type: "slice", start: (page - 1) * count, end: page * count }); return pipeline; },
        window(skip: number, take: number) { ops.push({ type: "slice", start: skip, end: skip + take }); return pipeline; },

        // --- Mode switches to node pipeline (eager resolve) ---
        from() {
            const items = pipeline[RESOLVE]() as GraphLinkOf<L>[];
            const nodeIds = new Set<string>();
            for (const link of items) nodeIds.add(link.from);
            return createNodePipeline(db, { type: "ids", ids: [...nodeIds] });
        },
        to() {
            const items = pipeline[RESOLVE]() as GraphLinkOf<L>[];
            const nodeIds = new Set<string>();
            for (const link of items) nodeIds.add(link.to);
            return createNodePipeline(db, { type: "ids", ids: [...nodeIds] });
        },
        nodes() {
            const items = pipeline[RESOLVE]() as GraphLinkOf<L>[];
            const nodeIds = new Set<string>();
            for (const link of items) { nodeIds.add(link.from); nodeIds.add(link.to); }
            return createNodePipeline(db, { type: "ids", ids: [...nodeIds] });
        },

        // --- Read terminals ---
        async get() { return execute(); },
        async count() { const r = execute(); return Array.isArray(r) ? r.length : r ? 1 : 0; },
        async exists() { const r = execute(); return Array.isArray(r) ? r.length > 0 : r !== undefined; },
        async id() { const r = execute(); return Array.isArray(r) ? r.map((i: GraphLinkOf<L>) => i.id) : (r as GraphLinkOf<L> | undefined)?.id; },

        // --- Write terminals ---
        async update(...args: any[]) {
            const result = execute();
            const items = Array.isArray(result) ? result : result ? [result] : [];
            if (items.length === 0) return result;
            if (typeof args[0] === "function" && args.length === 1) {
                await db.updateLink(items.map((i) => i.id), args[0]);
            } else if (typeof args[0] === "function") {
                const lensFn = args[0]; const value = args[1];
                const updater: any = (prev: L) => { Lens.mutate(prev, lensFn, value); return prev; };
                await db.updateLink(items.map((i) => i.id), updater);
            } else {
                const payload: { [key: string]: L } = {};
                for (const item of items) payload[item.id] = args[0] as L;
                await db.updateLink(payload);
            }
            return result;
        },
        async sever() {
            const result = execute();
            const items = Array.isArray(result) ? result : result ? [result] : [];
            if (items.length > 0) await db.sever(items.map((i) => i.id));
            return result;
        },
    };

    return pipeline;
}

// ------------------------------------------------------------
// Path Pipeline
// ------------------------------------------------------------

function createPathPipeline<N, L>(db: GraphDB<N, L, any>, initialPaths: GraphPath<N, L>[]): any {
    let paths = initialPaths;
    let isSinglePath = false;
    let isSingleStep = false;
    let steps: GraphStep<N, L>[] | null = null; // populated when step() narrows SC

    function execute(): GraphPath<N, L>[] | GraphPath<N, L> | GraphStep<N, L>[] | GraphStep<N, L> | undefined {
        if (isSingleStep && isSinglePath) {
            // single path, single step → one step
            if (steps && steps.length > 0) return steps[0];
            if (paths.length > 0 && paths[0].length > 0) return paths[0][0];
            return undefined;
        }
        if (isSingleStep) {
            // multi path, single step → array of steps
            return steps ?? paths.map((p) => p[0]).filter(Boolean);
        }
        if (isSinglePath) {
            // single path, multi step → one path
            return paths[0];
        }
        // multi path, multi step → array of paths
        return paths;
    }

    const pipeline: any = {
        [RESOLVE](): GraphPath<N, L>[] {
            return paths;
        },

        // --- Path filters (PC stays multi) ---
        whereNodes(predFn: Function) {
            paths = paths.filter((path) => {
                const nodesSeen = new Set<string>();
                for (const step of path) {
                    for (const node of [step[0], step[2]]) {
                        if (!nodesSeen.has(node.id)) {
                            nodesSeen.add(node.id);
                            if (!Lens.match(node.data, predFn, nodeMetaFor(node))) return false;
                        }
                    }
                }
                return true;
            });
            return pipeline;
        },
        whereLinks(predFn: Function) {
            paths = paths.filter((path) => {
                for (const step of path) {
                    if (!Lens.match(step[1].data, predFn, linkMetaFor(step[1]))) return false;
                }
                return true;
            });
            return pipeline;
        },
        where(predFn: Function) {
            paths = paths.filter((path) => Lens.match({ length: path.length } as any, predFn, { LENGTH: path.length }));
            return pipeline;
        },
        shortest() {
            if (paths.length === 0) return pipeline;
            let minLen = paths[0].length;
            for (let i = 1; i < paths.length; i++) { if (paths[i].length < minLen) minLen = paths[i].length; }
            paths = paths.filter((p) => p.length === minLen);
            return pipeline;
        },
        longest() {
            if (paths.length === 0) return pipeline;
            let maxLen = paths[0].length;
            for (let i = 1; i < paths.length; i++) { if (paths[i].length > maxLen) maxLen = paths[i].length; }
            paths = paths.filter((p) => p.length === maxLen);
            return pipeline;
        },
        sort(lensFn: Function, dir: "asc" | "desc") {
            paths = [...paths].sort((a, b) => {
                const aVal = Lens.get({ length: a.length } as any, lensFn as any, { LENGTH: a.length });
                const bVal = Lens.get({ length: b.length } as any, lensFn as any, { LENGTH: b.length });
                return dir === "desc" ? -sortCompare(aVal, bVal) : sortCompare(aVal, bVal);
            });
            return pipeline;
        },
        slice(start: number, end?: number) { paths = paths.slice(start, end); return pipeline; },
        paginate(page: number, count: number) { paths = paths.slice((page - 1) * count, page * count); return pipeline; },
        window(skip: number, take: number) { paths = paths.slice(skip, skip + take); return pipeline; },

        // --- PC cardinality reducers (narrow to single path) ---
        first() { paths = paths.length > 0 ? [paths[0]] : []; isSinglePath = true; return pipeline; },
        last() { paths = paths.length > 0 ? [paths[paths.length - 1]] : []; isSinglePath = true; return pipeline; },
        at(index: number) { paths = index < paths.length ? [paths[index]] : []; isSinglePath = true; return pipeline; },

        // --- SC cardinality reducer (narrow to single step) ---
        step(n: number) {
            const result: GraphStep<N, L>[] = [];
            for (const path of paths) {
                const idx = n < 0 ? path.length + n : n;
                if (idx >= 0 && idx < path.length) {
                    result.push(path[idx]);
                }
            }
            steps = result;
            isSingleStep = true;
            return pipeline;
        },

        // --- SC preserving (slices steps within each path) ---
        segment(a: number, b?: number) {
            const newPaths: GraphPath<N, L>[] = [];
            for (const path of paths) {
                const start = a < 0 ? path.length + a : a;
                const end = b === undefined ? path.length : b < 0 ? path.length + b : b;
                if (start < end && start >= 0 && end <= path.length) {
                    newPaths.push(path.slice(start, end));
                }
            }
            paths = newPaths;
            return pipeline;
        },

        // --- Path accessors (mode switches) ---
        nodeAt(n: number) {
            const nodeIds = new Set<string>();
            for (const path of paths) {
                const nodeCount = path.length + 1;
                const idx = n < 0 ? nodeCount + n : n;
                if (idx >= 0 && idx < nodeCount) {
                    const nodeId = idx === path.length ? path[idx - 1][2].id : path[idx][0].id;
                    nodeIds.add(nodeId);
                }
            }
            const ids = [...nodeIds];
            if (isSinglePath) return createNodePipeline(db, ids.length === 1 ? { type: "selectOne", id: ids[0] } : { type: "ids", ids });
            return createNodePipeline(db, { type: "ids", ids });
        },
        linkAt(n: number) {
            const linkIds = new Set<string>();
            for (const path of paths) {
                const idx = n < 0 ? path.length + n : n;
                if (idx >= 0 && idx < path.length) {
                    linkIds.add(path[idx][1].id);
                }
            }
            const ids = [...linkIds];
            if (isSinglePath) return createLinkPipeline(db, ids.length === 1 ? { type: "selectOne", id: ids[0] } : { type: "ids", ids });
            return createLinkPipeline(db, { type: "ids", ids });
        },
        origin() { return pipeline.nodeAt(0); },
        destination() { return pipeline.nodeAt(-1); },
        ends() {
            const nodeIds = new Set<string>();
            for (const path of paths) {
                if (path.length > 0) {
                    nodeIds.add(path[0][0].id);
                    nodeIds.add(path[path.length - 1][2].id);
                }
            }
            return createNodePipeline(db, { type: "ids", ids: [...nodeIds] });
        },

        // --- Mode switches ---
        nodes() {
            const nodeIds = new Set<string>();
            for (const path of paths) {
                for (const s of path) { nodeIds.add(s[0].id); nodeIds.add(s[2].id); }
            }
            return createNodePipeline(db, { type: "ids", ids: [...nodeIds] });
        },
        links() {
            const linkIds = new Set<string>();
            for (const path of paths) {
                for (const s of path) linkIds.add(s[1].id);
            }
            return createLinkPipeline(db, { type: "ids", ids: [...linkIds] });
        },

        // --- Read terminals ---
        async get() { return execute(); },
        async count() { return isSingleStep ? (steps?.length ?? 0) : paths.length; },
        async exists() { return isSingleStep ? (steps?.length ?? 0) > 0 : paths.length > 0; },
    };

    return pipeline;
}

// ------------------------------------------------------------
// Pipeline Interfaces
// ------------------------------------------------------------

type Cardinality = "single" | "multi";
type NodeTerminalResult<N, C extends Cardinality> = C extends "single" ? GraphNodeOf<N> | undefined : GraphNodeOf<N>[];
type LinkTerminalResult<L, C extends Cardinality> = C extends "single" ? GraphLinkOf<L> | undefined : GraphLinkOf<L>[];

// --- Node terminals ---

interface GraphNodeTerminals<N, L, C extends Cardinality> {
    get(): Promise<NodeTerminalResult<N, C>>;
    count(): Promise<number>;
    exists(): Promise<boolean>;
    id(): Promise<C extends "multi" ? string[] : string | undefined>;
    update(updater: Updater<N, GraphNodeOf<N>>): Promise<NodeTerminalResult<N, C>>;
    update<R>(lens: ($: MutatorLens<N>) => MutatorLensOf<R>, updater: Updater<R, GraphNodeOf<N>>): Promise<NodeTerminalResult<N, C>>;
    remove(): Promise<NodeTerminalResult<N, C>>;
    isolate(): Promise<NodeTerminalResult<N, C>>;
    isolateIn(): Promise<NodeTerminalResult<N, C>>;
    isolateOut(): Promise<NodeTerminalResult<N, C>>;
}

// --- Link terminals ---

interface GraphLinkTerminals<N, L, C extends Cardinality> {
    get(): Promise<LinkTerminalResult<L, C>>;
    count(): Promise<number>;
    exists(): Promise<boolean>;
    id(): Promise<C extends "multi" ? string[] : string | undefined>;
    update(updater: Updater<L, GraphLinkOf<L>>): Promise<LinkTerminalResult<L, C>>;
    update<R>(lens: ($: MutatorLens<L>) => MutatorLensOf<R>, updater: Updater<R, GraphLinkOf<L>>): Promise<LinkTerminalResult<L, C>>;
    sever(): Promise<LinkTerminalResult<L, C>>;
}

// --- Path terminals ---

type PathTerminalResult<N, L, PC extends Cardinality, SC extends Cardinality> =
    PC extends "single"
        ? SC extends "single" ? GraphStep<N, L> | undefined : GraphPath<N, L> | undefined
        : SC extends "single" ? GraphStep<N, L>[] : GraphPath<N, L>[];

interface GraphPathTerminals<N, L, PC extends Cardinality, SC extends Cardinality> {
    get(): Promise<PathTerminalResult<N, L, PC, SC>>;
    count(): Promise<number>;
    exists(): Promise<boolean>;
}

// --- Node pipeline interface ---

export interface GraphNodePipeline<N, L, C extends Cardinality> extends GraphNodeTerminals<N, L, C> {
    where<T>(lens: ($: SelectorLens<N> & GraphNodeMeta & LogicalOps) => Predicate<T> | PredicateResult): GraphNodePipeline<N, L, C>;
    sort<T>(lens: ($: SelectorLens<N> & GraphNodeMeta) => SelectorLens<T>, dir: "asc" | "desc"): GraphNodePipeline<N, L, C>;
    first(): GraphNodePipeline<N, L, "single">;
    last(): GraphNodePipeline<N, L, "single">;
    at(index: number): GraphNodePipeline<N, L, "single">;
    distinct(): GraphNodePipeline<N, L, C>;
    slice(start: number, end?: number): GraphNodePipeline<N, L, C>;
    paginate(page: number, count: number): GraphNodePipeline<N, L, C>;
    window(skip: number, take: number): GraphNodePipeline<N, L, C>;

    // Via (stay node mode)
    via<T>(predFn?: ($: SelectorLens<L> & GraphLinkMeta & LogicalOps) => Predicate<T> | PredicateResult): GraphNodePipeline<N, L, "multi">;
    viaOut<T>(predFn?: ($: SelectorLens<L> & GraphLinkMeta & LogicalOps) => Predicate<T> | PredicateResult): GraphNodePipeline<N, L, "multi">;
    viaIn<T>(predFn?: ($: SelectorLens<L> & GraphLinkMeta & LogicalOps) => Predicate<T> | PredicateResult): GraphNodePipeline<N, L, "multi">;

    // Deep/wide (stay node mode)
    deepDownstreamNodes(): GraphNodePipeline<N, L, "multi">;
    deepUpstreamNodes(): GraphNodePipeline<N, L, "multi">;
    deepNodes(): GraphNodePipeline<N, L, "multi">;
    wideDownstreamNodes(): GraphNodePipeline<N, L, "multi">;
    wideUpstreamNodes(): GraphNodePipeline<N, L, "multi">;
    wideNodes(): GraphNodePipeline<N, L, "multi">;

    // Deep/wide (switch to link mode)
    deepDownstreamLinks(): GraphLinkPipeline<N, L, "multi">;
    deepUpstreamLinks(): GraphLinkPipeline<N, L, "multi">;
    deepLinks(): GraphLinkPipeline<N, L, "multi">;
    wideDownstreamLinks(): GraphLinkPipeline<N, L, "multi">;
    wideUpstreamLinks(): GraphLinkPipeline<N, L, "multi">;
    wideLinks(): GraphLinkPipeline<N, L, "multi">;

    // Mode switches
    links(): GraphLinkPipeline<N, L, "multi">;
    out(): GraphLinkPipeline<N, L, "multi">;
    in(): GraphLinkPipeline<N, L, "multi">;
    pathTo(target: string): GraphPathPipeline<N, L, "multi", "multi">;
    pathFrom(target: string): GraphPathPipeline<N, L, "multi", "multi">;
    pathUntil(target: string): GraphPathPipeline<N, L, "multi", "multi">;
}

// --- Link pipeline interface ---

export interface GraphLinkPipeline<N, L, C extends Cardinality> extends GraphLinkTerminals<N, L, C> {
    where<T>(lens: ($: SelectorLens<L> & GraphLinkMeta & LogicalOps) => Predicate<T> | PredicateResult): GraphLinkPipeline<N, L, C>;
    sort<T>(lens: ($: SelectorLens<L> & GraphLinkMeta) => SelectorLens<T>, dir: "asc" | "desc"): GraphLinkPipeline<N, L, C>;
    first(): GraphLinkPipeline<N, L, "single">;
    last(): GraphLinkPipeline<N, L, "single">;
    at(index: number): GraphLinkPipeline<N, L, "single">;
    distinct(): GraphLinkPipeline<N, L, C>;
    slice(start: number, end?: number): GraphLinkPipeline<N, L, C>;
    paginate(page: number, count: number): GraphLinkPipeline<N, L, C>;
    window(skip: number, take: number): GraphLinkPipeline<N, L, C>;

    // Mode switches
    from(): GraphNodePipeline<N, L, "multi">;
    to(): GraphNodePipeline<N, L, "multi">;
    nodes(): GraphNodePipeline<N, L, "multi">;
}

// --- Path pipeline interface ---

export interface GraphPathPipeline<N, L, PC extends Cardinality, SC extends Cardinality = "multi"> extends GraphPathTerminals<N, L, PC, SC> {
    // Filters (PC stays same)
    whereNodes<T>(predFn: ($: SelectorLens<N> & GraphNodeMeta & LogicalOps) => Predicate<T> | PredicateResult): GraphPathPipeline<N, L, PC, SC>;
    whereLinks<T>(predFn: ($: SelectorLens<L> & GraphLinkMeta & LogicalOps) => Predicate<T> | PredicateResult): GraphPathPipeline<N, L, PC, SC>;
    where<T>(predFn: ($: SelectorLens<{ length: number }> & GraphPathMeta & LogicalOps) => Predicate<T> | PredicateResult): GraphPathPipeline<N, L, PC, SC>;
    shortest(): GraphPathPipeline<N, L, PC, SC>;
    longest(): GraphPathPipeline<N, L, PC, SC>;

    // Presentation (PC stays same)
    sort<T>(lens: ($: SelectorLens<{ length: number }> & GraphPathMeta) => SelectorLens<T>, dir: "asc" | "desc"): GraphPathPipeline<N, L, PC, SC>;
    slice(start: number, end?: number): GraphPathPipeline<N, L, PC, SC>;
    paginate(page: number, count: number): GraphPathPipeline<N, L, PC, SC>;
    window(skip: number, take: number): GraphPathPipeline<N, L, PC, SC>;

    // PC cardinality reducers (narrow to single path)
    first(): GraphPathPipeline<N, L, "single", SC>;
    last(): GraphPathPipeline<N, L, "single", SC>;
    at(index: number): GraphPathPipeline<N, L, "single", SC>;

    // SC cardinality reducer (narrow to single step)
    step(n: number): GraphPathPipeline<N, L, PC, "single">;

    // SC preserving (slices steps within each path)
    segment(a: number, b?: number): GraphPathPipeline<N, L, PC, SC>;

    // Mode switches
    nodeAt(n: number): GraphNodePipeline<N, L, PC>;
    linkAt(n: number): GraphLinkPipeline<N, L, PC>;
    origin(): GraphNodePipeline<N, L, PC>;
    destination(): GraphNodePipeline<N, L, PC>;
    ends(): GraphNodePipeline<N, L, "multi">;
    nodes(): GraphNodePipeline<N, L, "multi">;
    links(): GraphLinkPipeline<N, L, "multi">;
}
