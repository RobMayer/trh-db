import { describe, it, expect } from "vitest";
import { GraphDB, GraphStep, GraphPath } from "../src/db/graphDB";
import { MemoryCodec } from "../src/codec/memoryCodec";
import { GraphNodeOf, GraphLinkOf } from "../src/types";
import { IndexStore } from "../src/util/indices";

type NodeData = { name: string; weight: number };
type LinkData = { label: string; cost: number };

function makeDB() {
    return new GraphDB<NodeData, LinkData>(new MemoryCodec());
}

function nodeIdx(db: GraphDB<any, any>): IndexStore {
    return (db as any).nodeIndices;
}

function linkIdx(db: GraphDB<any, any>): IndexStore {
    return (db as any).linkIndices;
}

/**
 * Builds a graph:
 *
 *   (a)--[ab]-->(b)--[bc]-->(c)
 *    |                        ^
 *    +--------[ac]------------+
 *    |
 *    +--[ad]-->(d)--[de]-->(e)
 */
type Seeded = {
    db: GraphDB<NodeData, LinkData>;
    a: GraphNodeOf<NodeData>;
    b: GraphNodeOf<NodeData>;
    c: GraphNodeOf<NodeData>;
    d: GraphNodeOf<NodeData>;
    e: GraphNodeOf<NodeData>;
    ab: GraphLinkOf<LinkData>;
    bc: GraphLinkOf<LinkData>;
    ac: GraphLinkOf<LinkData>;
    ad: GraphLinkOf<LinkData>;
    de: GraphLinkOf<LinkData>;
};

async function seededDB(): Promise<Seeded> {
    const db = makeDB();
    const [a, b, c, d, e] = await db.insert([
        { name: "A", weight: 10 },
        { name: "B", weight: 20 },
        { name: "C", weight: 30 },
        { name: "D", weight: 40 },
        { name: "E", weight: 50 },
    ]);
    const ab = await db.connect(a.id, b.id, { label: "ab", cost: 1 });
    const bc = await db.connect(b.id, c.id, { label: "bc", cost: 2 });
    const ac = await db.connect(a.id, c.id, { label: "ac", cost: 5 });
    const ad = await db.connect(a.id, d.id, { label: "ad", cost: 3 });
    const de = await db.connect(d.id, e.id, { label: "de", cost: 4 });
    return { db, a, b, c, d, e, ab, bc, ac, ad, de };
}

// ============================================================
// Node CRUD
// ============================================================

describe("insert", () => {
    it("inserts a single node and returns it with generated id", async () => {
        const db = makeDB();
        const node = await db.insert({ name: "A", weight: 10 });
        expect(node.id).toBeDefined();
        expect(node.data.name).toBe("A");
        expect(node.in).toEqual([]);
        expect(node.out).toEqual([]);
        expect(db.get(node.id)).toBeDefined();
    });

    it("inserts a batch of nodes", async () => {
        const db = makeDB();
        const nodes = await db.insert([{ name: "A", weight: 10 }, { name: "B", weight: 20 }]);
        expect(nodes).toHaveLength(2);
        expect(nodes[0].id).not.toBe(nodes[1].id);
    });
});

describe("get", () => {
    it("returns undefined for missing id", () => {
        const db = makeDB();
        expect(db.get("missing")).toBeUndefined();
    });

    it("returns single node by id", async () => {
        const { db, a } = await seededDB();
        const result = db.get(a.id);
        expect(result?.data.name).toBe("A");
    });

    it("returns multiple nodes by id list", async () => {
        const { db, a, b } = await seededDB();
        const result = db.get([a.id, b.id]);
        expect(result).toHaveLength(2);
    });
});

describe("updateNode", () => {
    it("updates with static data and returns it", async () => {
        const { db, a } = await seededDB();
        const updated = await db.updateNode(a.id, { name: "A2", weight: 99 });
        expect(updated?.data.name).toBe("A2");
        expect(db.get(a.id)?.data.weight).toBe(99);
    });

    it("updates with updater function", async () => {
        const { db, a } = await seededDB();
        await db.updateNode(a.id, (prev) => ({ ...prev, weight: prev.weight + 5 }));
        expect(db.get(a.id)?.data.weight).toBe(15);
    });

    it("returns undefined for missing id", async () => {
        const { db } = await seededDB();
        expect(await db.updateNode("missing", { name: "X", weight: 0 })).toBeUndefined();
    });

    it("updates batch via payload object", async () => {
        const { db, a, b } = await seededDB();
        const updated = await db.updateNode({ [a.id]: { name: "A2", weight: 1 }, [b.id]: { name: "B2", weight: 2 } });
        expect(updated).toHaveLength(2);
        expect(db.get(a.id)?.data.name).toBe("A2");
        expect(db.get(b.id)?.data.name).toBe("B2");
    });
});

describe("remove", () => {
    it("removes a node and cascade-deletes its links", async () => {
        const { db, a, ab, ac, ad, b } = await seededDB();
        const result = await db.remove(a.id);
        expect(result.nodes).toHaveLength(1);
        expect(result.nodes[0].id).toBe(a.id);
        expect(result.links.length).toBe(3); // ab, ac, ad
        expect(db.get(a.id)).toBeUndefined();
        expect(db.getLink(ab.id)).toBeUndefined();
        // b should no longer have ab in its in array
        expect(db.get(b.id)?.in).not.toContain(ab.id);
    });

    it("removes multiple nodes", async () => {
        const { db, a, b } = await seededDB();
        const result = await db.remove([a.id, b.id]);
        expect(result.nodes).toHaveLength(2);
        expect(db.get(a.id)).toBeUndefined();
        expect(db.get(b.id)).toBeUndefined();
    });

    it("returns empty for missing id", async () => {
        const { db } = await seededDB();
        const result = await db.remove("missing");
        expect(result.nodes).toHaveLength(0);
        expect(result.links).toHaveLength(0);
    });
});

// ============================================================
// Link CRUD
// ============================================================

describe("connect", () => {
    it("creates a link and updates adjacency", async () => {
        const db = makeDB();
        const [a, b] = await db.insert([{ name: "A", weight: 1 }, { name: "B", weight: 2 }]);
        const link = await db.connect(a.id, b.id, { label: "x", cost: 10 });
        expect(link.from).toBe(a.id);
        expect(link.to).toBe(b.id);
        expect(link.data.label).toBe("x");
        expect(db.get(a.id)?.out).toContain(link.id);
        expect(db.get(b.id)?.in).toContain(link.id);
    });
});

describe("getLink", () => {
    it("returns a link by id", async () => {
        const { db, ab } = await seededDB();
        const result = db.getLink(ab.id);
        expect(result?.data.label).toBe("ab");
    });

    it("returns multiple links", async () => {
        const { db, ab, bc } = await seededDB();
        const result = db.getLink([ab.id, bc.id]);
        expect(result).toHaveLength(2);
    });
});

describe("updateLink", () => {
    it("updates with static data", async () => {
        const { db, ab } = await seededDB();
        const updated = await db.updateLink(ab.id, { label: "ab-updated", cost: 99 });
        expect(updated?.data.label).toBe("ab-updated");
    });

    it("updates with updater receiving from/to nodes", async () => {
        const { db, ab } = await seededDB();
        await db.updateLink(ab.id, (prev, _item, from, to) => ({
            ...prev,
            label: `${from.data.name}->${to.data.name}`,
        }));
        expect(db.getLink(ab.id)?.data.label).toBe("A->B");
    });
});

describe("sever", () => {
    it("removes a link and updates adjacency", async () => {
        const { db, ab, a, b } = await seededDB();
        const result = await db.sever(ab.id);
        expect(result?.id).toBe(ab.id);
        expect(db.getLink(ab.id)).toBeUndefined();
        expect(db.get(a.id)?.out).not.toContain(ab.id);
        expect(db.get(b.id)?.in).not.toContain(ab.id);
    });

    it("severs multiple links", async () => {
        const { db, ab, bc } = await seededDB();
        const result = await db.sever([ab.id, bc.id]);
        expect(result).toHaveLength(2);
    });
});

describe("disconnect", () => {
    it("removes all links between two nodes (bidirectional)", async () => {
        const db = makeDB();
        const [a, b] = await db.insert([{ name: "A", weight: 1 }, { name: "B", weight: 2 }]);
        await db.connect(a.id, b.id, { label: "1", cost: 1 });
        await db.connect(b.id, a.id, { label: "2", cost: 2 });
        const removed = await db.disconnect(a.id, b.id);
        expect(removed).toHaveLength(2);
        expect(db.get(a.id)?.out).toEqual([]);
        expect(db.get(a.id)?.in).toEqual([]);
    });
});

describe("isolate", () => {
    it("strips all links from a node", async () => {
        const { db, a } = await seededDB();
        const removed = await db.isolate(a.id);
        expect(removed.length).toBe(3); // ab, ac, ad
        expect(db.get(a.id)?.in).toEqual([]);
        expect(db.get(a.id)?.out).toEqual([]);
    });

    it("isolateIn strips only inbound links", async () => {
        const { db, b, ab } = await seededDB();
        const removed = await db.isolateIn(b.id);
        expect(removed.length).toBe(1);
        expect(removed[0].id).toBe(ab.id);
        // b still has outbound bc
        expect(db.get(b.id)?.out.length).toBe(1);
    });

    it("isolateOut strips only outbound links", async () => {
        const { db, a } = await seededDB();
        const removed = await db.isolateOut(a.id);
        expect(removed.length).toBe(3); // ab, ac, ad are all outbound from a
        expect(db.get(a.id)?.out).toEqual([]);
    });
});

// ============================================================
// Index management
// ============================================================

describe("node index", () => {
    it("creates index and backfills", async () => {
        const { db, a } = await seededDB();
        db.addNodeIndex(($) => $("name"));
        expect(nodeIdx(db).eq("name", "A")).toEqual(new Set([a.id]));
    });

    it("indexes on insert", async () => {
        const db = makeDB();
        db.addNodeIndex(($) => $("weight"));
        const n = await db.insert({ name: "X", weight: 42 });
        expect(nodeIdx(db).eq("weight", 42)).toEqual(new Set([n.id]));
    });

    it("deindexes on remove", async () => {
        const { db, a } = await seededDB();
        db.addNodeIndex(($) => $("name"));
        await db.remove(a.id);
        expect(nodeIdx(db).eq("name", "A")).toEqual(new Set());
    });
});

describe("link index", () => {
    it("creates index and backfills", async () => {
        const { db, ab } = await seededDB();
        db.addLinkIndex(($) => $("label"));
        expect(linkIdx(db).eq("label", "ab")).toEqual(new Set([ab.id]));
    });

    it("deindexes on sever", async () => {
        const { db, ab } = await seededDB();
        db.addLinkIndex(($) => $("label"));
        await db.sever(ab.id);
        expect(linkIdx(db).eq("label", "ab")).toEqual(new Set());
    });
});

// ============================================================
// Node pipeline
// ============================================================

describe("node pipeline: chain starters", () => {
    it("nodes() returns all nodes", async () => {
        const { db } = await seededDB();
        const result = await db.nodes().get();
        expect(result).toHaveLength(5);
    });

    it("nodesWhere filters by predicate", async () => {
        const { db } = await seededDB();
        const result = await db.nodesWhere(($) => [$("weight"), ">", 25]).get();
        expect(result).toHaveLength(3); // C(30), D(40), E(50)
    });

    it("node(id) selects single node", async () => {
        const { db, a } = await seededDB();
        const result = await db.node(a.id).get();
        expect((result as any).data.name).toBe("A");
    });

    it("node(ids) selects multiple nodes", async () => {
        const { db, a, b } = await seededDB();
        const result = await db.node([a.id, b.id]).get();
        expect(result).toHaveLength(2);
    });
});

describe("node pipeline: standard ops", () => {
    it("sorts ascending", async () => {
        const { db } = await seededDB();
        const result = await db.nodes().sort(($) => $("weight"), "asc").get();
        const weights = (result as any[]).map((r: any) => r.data.weight);
        expect(weights).toEqual([10, 20, 30, 40, 50]);
    });

    it("first/last/at", async () => {
        const { db } = await seededDB();
        const first = await db.nodes().sort(($) => $("weight"), "asc").first().get();
        expect((first as any).data.weight).toBe(10);
        const last = await db.nodes().sort(($) => $("weight"), "asc").last().get();
        expect((last as any).data.weight).toBe(50);
        const at2 = await db.nodes().sort(($) => $("weight"), "asc").at(2).get();
        expect((at2 as any).data.weight).toBe(30);
    });

    it("count/exists", async () => {
        const { db } = await seededDB();
        expect(await db.nodes().count()).toBe(5);
        expect(await db.nodesWhere(($) => [$("weight"), ">", 100]).exists()).toBe(false);
    });

    it("where filters by $.ID", async () => {
        const { db, a } = await seededDB();
        const result = await db.nodesWhere(($) => [$.ID, "=", a.id]).get();
        expect(result).toHaveLength(1);
    });

    it("where filters by $.DEGREE", async () => {
        const { db } = await seededDB();
        // A has degree 3 (ab, ac, ad out), B has degree 2 (ab in, bc out)
        const result = await db.nodesWhere(($) => [$.DEGREE, ">", 2]).get();
        expect((result as any[]).some((r: any) => r.data.name === "A")).toBe(true);
    });
});

describe("node pipeline: via", () => {
    it("via() hops to adjacent nodes", async () => {
        const { db, a } = await seededDB();
        const result = await db.node(a.id).via().get();
        const names = (result as any[]).map((r: any) => r.data.name).sort();
        expect(names).toEqual(["B", "C", "D"]); // a -> b, c, d
    });

    it("viaOut() follows outbound links only", async () => {
        const { db, b } = await seededDB();
        const result = await db.node(b.id).viaOut().get();
        const names = (result as any[]).map((r: any) => r.data.name);
        expect(names).toEqual(["C"]); // b -> c
    });

    it("viaIn() follows inbound links only", async () => {
        const { db, b } = await seededDB();
        const result = await db.node(b.id).viaIn().get();
        const names = (result as any[]).map((r: any) => r.data.name);
        expect(names).toEqual(["A"]); // a -> b
    });

    it("via with link predicate filters by link data", async () => {
        const { db, a } = await seededDB();
        const result = await db.node(a.id).via(($) => [$("cost"), "<", 3]).get();
        const names = (result as any[]).map((r: any) => r.data.name).sort();
        expect(names).toEqual(["B"]); // ab cost=1, ac cost=5, ad cost=3
    });

    it("chains multiple via hops", async () => {
        const { db, a } = await seededDB();
        const result = await db.node(a.id).viaOut().viaOut().get();
        // a -> b,c,d then from those -> c,e (b->c, d->e, c has no outbound)
        const names = (result as any[]).map((r: any) => r.data.name).sort();
        expect(names).toEqual(["C", "E"]);
    });
});

describe("node pipeline: deep/wide traversals", () => {
    it("deepDownstreamNodes returns all downstream in DFS", async () => {
        const { db, a } = await seededDB();
        const result = await db.node(a.id).deepDownstreamNodes().get();
        expect((result as any[]).length).toBeGreaterThanOrEqual(4); // b, c, d, e
    });

    it("wideDownstreamNodes returns all downstream in BFS", async () => {
        const { db, a } = await seededDB();
        const result = await db.node(a.id).wideDownstreamNodes().get();
        expect((result as any[]).length).toBeGreaterThanOrEqual(4);
    });

    it("handles cycles without infinite loop", async () => {
        const db = makeDB();
        const [x, y, z] = await db.insert([{ name: "X", weight: 1 }, { name: "Y", weight: 2 }, { name: "Z", weight: 3 }]);
        await db.connect(x.id, y.id, { label: "xy", cost: 1 });
        await db.connect(y.id, z.id, { label: "yz", cost: 1 });
        await db.connect(z.id, x.id, { label: "zx", cost: 1 }); // cycle!
        const result = await db.node(x.id).deepDownstreamNodes().get();
        expect((result as any[]).length).toBe(2); // y, z (not infinite)
    });
});

// ============================================================
// Link pipeline
// ============================================================

describe("link pipeline", () => {
    it("links() returns all links", async () => {
        const { db } = await seededDB();
        const result = await db.links().get();
        expect(result).toHaveLength(5);
    });

    it("linksWhere filters by predicate", async () => {
        const { db } = await seededDB();
        const result = await db.linksWhere(($) => [$("cost"), ">", 3]).get();
        expect(result).toHaveLength(2); // ac(5), de(4)
    });

    it("link(id) selects single link", async () => {
        const { db, ab } = await seededDB();
        const result = await db.link(ab.id).get();
        expect((result as any).data.label).toBe("ab");
    });

    it("sorts and slices", async () => {
        const { db } = await seededDB();
        const result = await db.links().sort(($) => $("cost"), "desc").first().get();
        expect((result as any).data.label).toBe("ac"); // cost 5
    });

    it("where filters by $.FROM", async () => {
        const { db, a } = await seededDB();
        const result = await db.linksWhere(($) => [$.FROM, "=", a.id]).get();
        expect(result).toHaveLength(3); // ab, ac, ad
    });

    it("sever terminal removes matched links", async () => {
        const { db, a } = await seededDB();
        await db.linksWhere(($) => [$.FROM, "=", a.id]).sever();
        expect(db.get(a.id)?.out).toEqual([]);
    });
});

// ============================================================
// Mode switches
// ============================================================

describe("mode switches: node → link", () => {
    it(".out() gets outbound links", async () => {
        const { db, a } = await seededDB();
        const result = await db.node(a.id).out().get();
        expect(result).toHaveLength(3); // ab, ac, ad
    });

    it(".in() gets inbound links", async () => {
        const { db, c } = await seededDB();
        const result = await db.node(c.id).in().get();
        expect(result).toHaveLength(2); // bc, ac
    });

    it(".links() gets all connected links", async () => {
        const { db, b } = await seededDB();
        const result = await db.node(b.id).links().get();
        expect(result).toHaveLength(2); // ab (in), bc (out)
    });
});

describe("mode switches: link → node", () => {
    it(".from() gets source nodes", async () => {
        const { db, ab, a } = await seededDB();
        const result = await db.link(ab.id).from().get();
        expect((result as any[])[0].id).toBe(a.id);
    });

    it(".to() gets target nodes", async () => {
        const { db, ab, b } = await seededDB();
        const result = await db.link(ab.id).to().get();
        expect((result as any[])[0].id).toBe(b.id);
    });

    it(".nodes() gets both endpoints", async () => {
        const { db, ab } = await seededDB();
        const result = await db.link(ab.id).nodes().get();
        expect(result).toHaveLength(2);
    });
});

describe("mode switches: deep/wide link traversals", () => {
    it("deepDownstreamLinks collects links in DFS", async () => {
        const { db, a } = await seededDB();
        const result = await db.node(a.id).deepDownstreamLinks().get();
        expect((result as any[]).length).toBeGreaterThanOrEqual(4);
    });
});

describe("chaining across modes", () => {
    it("node → out links → to nodes", async () => {
        const { db, a } = await seededDB();
        const result = await db.node(a.id).out().to().get();
        const names = (result as any[]).map((r: any) => r.data.name).sort();
        expect(names).toEqual(["B", "C", "D"]);
    });

    it("node → out links → where → to nodes", async () => {
        const { db, a } = await seededDB();
        const result = await db.node(a.id).out().where(($) => [$("cost"), "<", 3]).to().get();
        const names = (result as any[]).map((r: any) => r.data.name).sort();
        expect(names).toEqual(["B"]); // only ab has cost < 3
    });
});

// ============================================================
// Path pipeline
// ============================================================

describe("path pipeline", () => {
    it("pathTo finds paths between nodes", async () => {
        const { db, a, c } = await seededDB();
        const paths = await db.node(a.id).pathTo(c.id).get();
        // Two paths: a->b->c and a->c
        expect((paths as any[]).length).toBeGreaterThanOrEqual(2);
    });

    it("shortest returns all paths of minimum length", async () => {
        const { db, a, c } = await seededDB();
        const paths = await db.node(a.id).pathTo(c.id).shortest().get();
        // a->c direct is 1 step, a->b->c is 2 steps. Shortest keeps only 1-step paths.
        expect((paths as any[]).length).toBe(1);
        expect((paths as any[])[0].length).toBe(1);
    });

    it("longest returns all paths of maximum length", async () => {
        const { db, a, c } = await seededDB();
        const paths = await db.node(a.id).pathTo(c.id).longest().get();
        expect((paths as any[]).length).toBe(1);
        expect((paths as any[])[0].length).toBe(2);
    });

    it("first narrows to single path", async () => {
        const { db, a, c } = await seededDB();
        const path = await db.node(a.id).pathTo(c.id).first().get();
        // Single path — an array of steps, not an array of paths
        expect(Array.isArray(path)).toBe(true);
        expect(Array.isArray((path as any)[0])).toBe(true); // first element is a step (tuple)
        expect((path as any)[0].length).toBe(3); // [node, link, node]
    });

    it("step narrows to single step per path", async () => {
        const { db, a, c } = await seededDB();
        const steps = await db.node(a.id).pathTo(c.id).step(0).get();
        // Multi paths, single step each → array of steps
        expect((steps as any[]).length).toBeGreaterThanOrEqual(2);
        for (const s of steps as any[]) {
            expect(s.length).toBe(3); // [node, link, node]
        }
    });

    it("first then step gives a single step", async () => {
        const { db, a, c } = await seededDB();
        const step = await db.node(a.id).pathTo(c.id).first().step(0).get();
        // Single path, single step → one step tuple
        expect((step as any).length).toBe(3); // [node, link, node]
    });

    it("origin gets start node", async () => {
        const { db, a, c } = await seededDB();
        const result = await db.node(a.id).pathTo(c.id).first().origin().get();
        expect((result as any).data.name).toBe("A");
    });

    it("destination gets end node", async () => {
        const { db, a, c } = await seededDB();
        const result = await db.node(a.id).pathTo(c.id).first().destination().get();
        expect((result as any).data.name).toBe("C");
    });

    it("nodes() extracts all unique nodes from paths", async () => {
        const { db, a, c } = await seededDB();
        const result = await db.node(a.id).pathTo(c.id).nodes().get();
        const names = (result as any[]).map((r: any) => r.data.name).sort();
        expect(names).toContain("A");
        expect(names).toContain("C");
    });

    it("links() extracts all unique links from paths", async () => {
        const { db, a, c } = await seededDB();
        const result = await db.node(a.id).pathTo(c.id).links().get();
        expect((result as any[]).length).toBeGreaterThanOrEqual(2);
    });

    it("count returns number of paths", async () => {
        const { db, a, c } = await seededDB();
        const count = await db.node(a.id).pathTo(c.id).count();
        expect(count).toBeGreaterThanOrEqual(2);
    });

    it("exists returns true when paths found", async () => {
        const { db, a, c } = await seededDB();
        expect(await db.node(a.id).pathTo(c.id).exists()).toBe(true);
    });

    it("exists returns false when no path", async () => {
        const { db, e, a } = await seededDB();
        expect(await db.node(e.id).pathTo(a.id).exists()).toBe(false);
    });

    it("whereLinks filters paths by link data", async () => {
        const { db, a, c } = await seededDB();
        // Only paths where ALL links have cost < 3
        const paths = await db.node(a.id).pathTo(c.id).whereLinks(($) => [$("cost"), "<", 3]).get();
        // a->b(cost 1)->c(cost 2) passes, a->c(cost 5) fails
        expect((paths as any[]).length).toBe(1);
    });

    it("segment slices steps within each path", async () => {
        const { db, a, c } = await seededDB();
        // Get the 2-step path a->b->c, take only the first step
        const paths = await db.node(a.id).pathTo(c.id).longest().segment(0, 1).get();
        expect((paths as any[])[0].length).toBe(1); // 1 step remaining
    });
});

// ============================================================
// Set operations
// ============================================================

describe("set operations", () => {
    it("intersection of node pipelines", async () => {
        const { db } = await seededDB();
        const result = await db.intersection(
            db.nodesWhere(($) => [$("weight"), ">", 15]),
            db.nodesWhere(($) => [$("weight"), "<", 45]),
        ).get();
        const names = (result as any[]).map((r: any) => r.data.name).sort();
        expect(names).toEqual(["B", "C", "D"]);
    });

    it("union of node pipelines", async () => {
        const { db } = await seededDB();
        const result = await db.union(
            db.nodesWhere(($) => [$("weight"), "<", 15]),
            db.nodesWhere(($) => [$("weight"), ">", 45]),
        ).get();
        const names = (result as any[]).map((r: any) => r.data.name).sort();
        expect(names).toEqual(["A", "E"]);
    });

    it("exclusion of node pipelines", async () => {
        const { db } = await seededDB();
        const result = await db.exclusion(
            db.nodes(),
            db.nodesWhere(($) => [$("weight"), ">", 30]),
        ).get();
        const names = (result as any[]).map((r: any) => r.data.name).sort();
        expect(names).toEqual(["A", "B", "C"]);
    });

    it("nested set operations", async () => {
        const { db } = await seededDB();
        const result = await db.union(
            db.nodesWhere(($) => [$("weight"), "<", 15]),
            db.intersection(
                db.nodesWhere(($) => [$("weight"), ">", 25]),
                db.nodesWhere(($) => [$("weight"), "<", 45]),
            ),
        ).get();
        const names = (result as any[]).map((r: any) => r.data.name).sort();
        expect(names).toEqual(["A", "C", "D"]);
    });
});

// ============================================================
// Join
// ============================================================

describe("join", () => {
    it("creates links between pipeline results", async () => {
        const db = makeDB();
        const [a, b, c] = await db.insert([{ name: "A", weight: 1 }, { name: "B", weight: 2 }, { name: "C", weight: 3 }]);
        const created = await db.join(
            db.node(a.id),
            db.node([b.id, c.id]),
            { label: "joined", cost: 0 },
        );
        expect(created).toHaveLength(2);
        expect(db.get(a.id)?.out.length).toBe(2);
    });

    it("join with callback can skip pairs", async () => {
        const db = makeDB();
        const [a, b, c] = await db.insert([{ name: "A", weight: 1 }, { name: "B", weight: 2 }, { name: "C", weight: 3 }]);
        const created = await db.join(
            db.node(a.id),
            db.node([b.id, c.id]),
            (from, to) => to.data.weight > 2 ? { label: "heavy", cost: 99 } : undefined,
        );
        expect(created).toHaveLength(1); // only a->c
        expect(created[0].data.label).toBe("heavy");
    });
});

// ============================================================
// Write terminals
// ============================================================

describe("node pipeline: write terminals", () => {
    it("update terminal updates matched nodes", async () => {
        const { db } = await seededDB();
        await db.nodesWhere(($) => [$("weight"), ">", 40]).update((prev) => ({ ...prev, weight: 0 }));
        const result = await db.nodesWhere(($) => [$("weight"), "=", 0]).get();
        expect(result).toHaveLength(1); // E was 50
    });

    it("remove terminal cascade-deletes", async () => {
        const { db, a } = await seededDB();
        await db.node(a.id).remove();
        expect(db.get(a.id)).toBeUndefined();
    });

    it("isolate terminal strips links", async () => {
        const { db, a } = await seededDB();
        await db.node(a.id).isolate();
        expect(db.get(a.id)?.out).toEqual([]);
        expect(db.get(a.id)?.in).toEqual([]);
    });
});

describe("link pipeline: write terminals", () => {
    it("update terminal updates matched links", async () => {
        const { db } = await seededDB();
        await db.linksWhere(($) => [$("cost"), ">", 4]).update({ label: "expensive", cost: 100 });
        const result = await db.linksWhere(($) => [$("cost"), "=", 100]).get();
        expect(result).toHaveLength(1); // ac was cost 5
    });

    it("sever terminal removes matched links", async () => {
        const { db } = await seededDB();
        await db.linksWhere(($) => [$("cost"), ">", 3]).sever();
        const remaining = await db.links().count();
        expect(remaining).toBe(3); // ab(1), bc(2), ad(3) remain
    });
});
