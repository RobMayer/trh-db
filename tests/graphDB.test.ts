import { describe, it, expect } from "vitest";
import { GraphDB, GraphStep, GraphPath, GraphLinkOf, GraphNodeOf } from "../src/db/graphDB";
import { MemoryCodec } from "../src/codec/memoryCodec";
type NodeData = { name: string; weight: number };
type LinkData = { label: string; cost: number };

function makeDB() {
    return new GraphDB<NodeData, LinkData>(new MemoryCodec());
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
        const nodes = await db.insert([
            { name: "A", weight: 10 },
            { name: "B", weight: 20 },
        ]);
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
        const [a, b] = await db.insert([
            { name: "A", weight: 1 },
            { name: "B", weight: 2 },
        ]);
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
        const [a, b] = await db.insert([
            { name: "A", weight: 1 },
            { name: "B", weight: 2 },
        ]);
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
        const { db } = await seededDB();
        db.addNodeIndex(($) => $("name"));
        expect(db.getNodeIndices()["name"]).toContain("A");
    });

    it("indexes on insert", async () => {
        const db = makeDB();
        db.addNodeIndex(($) => $("weight"));
        await db.insert({ name: "X", weight: 42 });
        expect(db.getNodeIndices()["weight"]).toContain("42");
    });

    it("deindexes on remove", async () => {
        const { db, a } = await seededDB();
        db.addNodeIndex(($) => $("name"));
        await db.remove(a.id);
        expect(db.getNodeIndices()["name"] ?? []).not.toContain("A");
    });
});

describe("link index", () => {
    it("creates index and backfills", async () => {
        const { db } = await seededDB();
        db.addLinkIndex(($) => $("label"));
        expect(db.getLinkIndices()["label"]).toContain("ab");
    });

    it("deindexes on sever", async () => {
        const { db, ab } = await seededDB();
        db.addLinkIndex(($) => $("label"));
        await db.sever(ab.id);
        expect(db.getLinkIndices()["label"] ?? []).not.toContain("ab");
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
        expect(result!.data.name).toBe("A");
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
        const result = await db
            .nodes()
            .sort(($) => $("weight"), "asc")
            .get();
        const weights = result.map((r: any) => r.data.weight);
        expect(weights).toEqual([10, 20, 30, 40, 50]);
    });

    it("first/last/at", async () => {
        const { db } = await seededDB();
        const first = await db
            .nodes()
            .sort(($) => $("weight"), "asc")
            .first()
            .get();
        expect(first!.data.weight).toBe(10);
        const last = await db
            .nodes()
            .sort(($) => $("weight"), "asc")
            .last()
            .get();
        expect(last!.data.weight).toBe(50);
        const at2 = await db
            .nodes()
            .sort(($) => $("weight"), "asc")
            .at(2)
            .get();
        expect(at2!.data.weight).toBe(30);
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
        expect(result.some((r: any) => r.data.name === "A")).toBe(true);
    });
});

describe("node pipeline: via", () => {
    it("via() hops to adjacent nodes", async () => {
        const { db, a } = await seededDB();
        const result = await db.node(a.id).via().get();
        const names = result.map((r: any) => r.data.name).sort();
        expect(names).toEqual(["B", "C", "D"]); // a -> b, c, d
    });

    it("viaOut() follows outbound links only", async () => {
        const { db, b } = await seededDB();
        const result = await db.node(b.id).viaOut().get();
        const names = result.map((r: any) => r.data.name);
        expect(names).toEqual(["C"]); // b -> c
    });

    it("viaIn() follows inbound links only", async () => {
        const { db, b } = await seededDB();
        const result = await db.node(b.id).viaIn().get();
        const names = result.map((r: any) => r.data.name);
        expect(names).toEqual(["A"]); // a -> b
    });

    it("via with link predicate filters by link data", async () => {
        const { db, a } = await seededDB();
        const result = await db
            .node(a.id)
            .via(($) => [$("cost"), "<", 3])
            .get();
        const names = result.map((r: any) => r.data.name).sort();
        expect(names).toEqual(["B"]); // ab cost=1, ac cost=5, ad cost=3
    });

    it("chains multiple via hops", async () => {
        const { db, a } = await seededDB();
        const result = await db.node(a.id).viaOut().viaOut().get();
        // a -> b,c,d then from those -> c,e (b->c, d->e, c has no outbound)
        const names = result.map((r: any) => r.data.name).sort();
        expect(names).toEqual(["C", "E"]);
    });
});

describe("node pipeline: deep/wide traversals", () => {
    it("deepDownstreamNodes returns all downstream in DFS", async () => {
        const { db, a } = await seededDB();
        const result = await db.node(a.id).deepDownstreamNodes().get();
        expect(result.length).toBeGreaterThanOrEqual(4); // b, c, d, e
    });

    it("wideDownstreamNodes returns all downstream in BFS", async () => {
        const { db, a } = await seededDB();
        const result = await db.node(a.id).wideDownstreamNodes().get();
        expect(result.length).toBeGreaterThanOrEqual(4);
    });

    it("handles cycles without infinite loop", async () => {
        const db = makeDB();
        const [x, y, z] = await db.insert([
            { name: "X", weight: 1 },
            { name: "Y", weight: 2 },
            { name: "Z", weight: 3 },
        ]);
        await db.connect(x.id, y.id, { label: "xy", cost: 1 });
        await db.connect(y.id, z.id, { label: "yz", cost: 1 });
        await db.connect(z.id, x.id, { label: "zx", cost: 1 }); // cycle!
        const result = await db.node(x.id).deepDownstreamNodes().get();
        expect(result.length).toBe(2); // y, z (not infinite)
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
        expect(result!.data.label).toBe("ab");
    });

    it("sorts and slices", async () => {
        const { db } = await seededDB();
        const result = await db
            .links()
            .sort(($) => $("cost"), "desc")
            .first()
            .get();
        expect(result!.data.label).toBe("ac"); // cost 5
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
        expect(result[0].id).toBe(a.id);
    });

    it(".to() gets target nodes", async () => {
        const { db, ab, b } = await seededDB();
        const result = await db.link(ab.id).to().get();
        expect(result[0].id).toBe(b.id);
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
        expect(result.length).toBeGreaterThanOrEqual(4);
    });
});

describe("chaining across modes", () => {
    it("node → out links → to nodes", async () => {
        const { db, a } = await seededDB();
        const result = await db.node(a.id).out().to().get();
        const names = result.map((r: any) => r.data.name).sort();
        expect(names).toEqual(["B", "C", "D"]);
    });

    it("node → out links → where → to nodes", async () => {
        const { db, a } = await seededDB();
        const result = await db
            .node(a.id)
            .out()
            .where(($) => [$("cost"), "<", 3])
            .to()
            .get();
        const names = result.map((r: any) => r.data.name).sort();
        expect(names).toEqual(["B"]); // only ab has cost < 3
    });
});

// ============================================================
// Path pipeline
// ============================================================

describe("path pipeline", () => {
    it("pathTo finds downstream paths", async () => {
        const { db, a, c } = await seededDB();
        const paths = await db.node(a.id).pathTo(c.id).get();
        // Two paths: a->b->c and a->c
        expect(paths.length).toBeGreaterThanOrEqual(2);
    });

    it("pathFrom finds upstream paths", async () => {
        const { db, c, a } = await seededDB();
        // c has no outbound to a, but a->c exists, so upstream from c should find a
        const paths = await db.node(c.id).pathFrom(a.id).get();
        expect(paths.length).toBeGreaterThanOrEqual(1);
    });

    it("pathFrom returns empty when no upstream path exists", async () => {
        const { db, a, e } = await seededDB();
        // a has no inbound links, so upstream from a can't reach e
        expect(await db.node(a.id).pathFrom(e.id).exists()).toBe(false);
    });

    it("pathBetween finds paths in any direction", async () => {
        const { db, e, a } = await seededDB();
        // e has no outbound, but pathBetween follows any direction
        // e<-d<-a, so going upstream from e reaches a
        const paths = await db.node(e.id).pathBetween(a.id).get();
        expect(paths.length).toBeGreaterThanOrEqual(1);
    });

    it("shortest returns all paths of minimum length", async () => {
        const { db, a, c } = await seededDB();
        const paths = await db.node(a.id).pathTo(c.id).shortest().get();
        // a->c direct is 1 step, a->b->c is 2 steps. Shortest keeps only 1-step paths.
        expect(paths.length).toBe(1);
        expect(paths[0].length).toBe(1);
    });

    it("longest returns all paths of maximum length", async () => {
        const { db, a, c } = await seededDB();
        const paths = await db.node(a.id).pathTo(c.id).longest().get();
        expect(paths.length).toBe(1);
        expect(paths[0].length).toBe(2);
    });

    it("first narrows to single path", async () => {
        const { db, a, c } = await seededDB();
        const path = await db.node(a.id).pathTo(c.id).first().get();
        // Single path — an array of steps, not an array of paths
        expect(Array.isArray(path)).toBe(true);
        expect(Array.isArray(path![0])).toBe(true); // first element is a step (tuple)
        expect(path![0].length).toBe(3); // [node, link, node]
    });

    it("step narrows to single step per path", async () => {
        const { db, a, c } = await seededDB();
        const steps = await db.node(a.id).pathTo(c.id).step(0).get();
        // Multi paths, single step each → array of steps
        expect(steps.length).toBeGreaterThanOrEqual(2);
        for (const s of steps) {
            expect(s.length).toBe(3); // [node, link, node]
        }
    });

    it("first then step gives a single step", async () => {
        const { db, a, c } = await seededDB();
        const step = await db.node(a.id).pathTo(c.id).first().step(0).get();
        // Single path, single step → one step tuple
        expect(step!.length).toBe(3); // [node, link, node]
    });

    it("origin gets start node", async () => {
        const { db, a, c } = await seededDB();
        const result = await db.node(a.id).pathTo(c.id).first().origin().get();
        expect(result!.data.name).toBe("A");
    });

    it("destination gets end node", async () => {
        const { db, a, c } = await seededDB();
        const result = await db.node(a.id).pathTo(c.id).first().destination().get();
        expect(result!.data.name).toBe("C");
    });

    it("nodes() extracts all unique nodes from paths", async () => {
        const { db, a, c } = await seededDB();
        const result = await db.node(a.id).pathTo(c.id).nodes().get();
        const names = result.map((r: any) => r.data.name).sort();
        expect(names).toContain("A");
        expect(names).toContain("C");
    });

    it("links() extracts all unique links from paths", async () => {
        const { db, a, c } = await seededDB();
        const result = await db.node(a.id).pathTo(c.id).links().get();
        expect(result.length).toBeGreaterThanOrEqual(2);
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

    it("where with $.links() filters paths by link data (all links must pass)", async () => {
        const { db, a, c } = await seededDB();
        // Only paths where ALL links have cost < 3
        const paths = await db
            .node(a.id)
            .pathTo(c.id)
            .where(($: any) => [
                $.links()
                    .where((_: any) => [_("cost"), ">=", 3])
                    .size(),
                "=",
                0,
            ])
            .get();
        // a->b(cost 1)->c(cost 2) passes, a->c(cost 5) fails
        expect(paths.length).toBe(1);
    });

    it("segment slices steps within each path", async () => {
        const { db, a, c } = await seededDB();
        // Get the 2-step path a->b->c, take only the first step
        const paths = await db.node(a.id).pathTo(c.id).longest().segment(0, 1).get();
        expect(paths[0].length).toBe(1); // 1 step remaining
    });

    it("where with $.links() navigates into link data", async () => {
        const { db, a, c } = await seededDB();
        // Filter paths where the last link has cost < 3
        const paths = await db
            .node(a.id)
            .pathTo(c.id)
            .where(($: any) => [$.links().at(-1)("cost"), "<", 3])
            .get();
        // a->b->c: last link is bc (cost 2) → passes
        // a->c: last link is ac (cost 5) → fails
        expect(paths.length).toBe(1);
    });

    it("where with $.links().where() filters links by meta fields", async () => {
        const { db, a, c, ac } = await seededDB();
        // Filter paths that contain link ac (by ID)
        const paths = await db
            .node(a.id)
            .pathTo(c.id)
            .where(($: any) => [
                $.links()
                    .where((_: any) => [_.ID, "=", ac.id])
                    .size(),
                ">",
                0,
            ])
            .get();
        // Only the direct a->c path contains link ac
        expect(paths.length).toBe(1);
    });

    it("where with $.nodes() accesses node data within paths", async () => {
        const { db, a, c } = await seededDB();
        // Filter paths where any node has weight > 15
        const paths = await db
            .node(a.id)
            .pathTo(c.id)
            .where(($: any) => [
                $.nodes()
                    .where((_: any) => [_("weight"), ">", 15])
                    .size(),
                ">",
                0,
            ])
            .get();
        // Both paths go through nodes with weight > 15 (B=20, C=30)
        expect(paths.length).toBe(2);
    });

    it("where with $.NODES checks path passes through a node", async () => {
        const { db, a, c, b } = await seededDB();
        // Filter paths that pass through node B
        const paths = await db
            .node(a.id)
            .pathTo(c.id)
            .where(($: any) => [$.NODES, "#", b.id])
            .get();
        // Only a->b->c passes through B
        expect(paths.length).toBe(1);
    });

    it("where with $.LINKS checks path uses a specific link", async () => {
        const { db, a, c, ac } = await seededDB();
        // Filter paths that use link ac
        const paths = await db
            .node(a.id)
            .pathTo(c.id)
            .where(($: any) => [$.LINKS, "#", ac.id])
            .get();
        // Only the direct a->c path uses link ac
        expect(paths.length).toBe(1);
    });

    it("where with $.links().where() filters by data field with size threshold", async () => {
        const { db, a, e } = await seededDB();
        // Paths from a to e: a->d->e (links ad cost=3, de cost=4)
        // Filter paths where at least 1 link has cost > 3
        const paths = await db
            .node(a.id)
            .pathTo(e.id)
            .where(($: any) => [
                $.links()
                    .where((_: any) => [_("cost"), ">", 3])
                    .size(),
                ">=",
                1,
            ])
            .get();
        // a->d->e has de(cost=4) which passes
        expect(paths.length).toBe(1);
    });

    it("where with $.nodes().where() filters by per-element meta _.ID", async () => {
        const { db, a, c, b } = await seededDB();
        // Filter paths where node B is among the nodes
        const paths = await db
            .node(a.id)
            .pathTo(c.id)
            .where(($: any) => [
                $.nodes()
                    .where((_: any) => [_.ID, "=", b.id])
                    .size(),
                ">",
                0,
            ])
            .get();
        // Only a->b->c passes through B
        expect(paths.length).toBe(1);
    });

    it("where with $.nodes().at(0) accesses first node data", async () => {
        const { db, a, c } = await seededDB();
        // Filter paths where the first node has weight = 10 (which is A)
        const paths = await db
            .node(a.id)
            .pathTo(c.id)
            .where(($: any) => [$.nodes().at(0)("weight"), "=", 10])
            .get();
        // Both paths start at A (weight 10)
        expect(paths.length).toBe(2);
    });

    it("where with $.links().at(0) accesses first link data", async () => {
        const { db, a, c, ab } = await seededDB();
        // Filter paths where the first link has cost = 1 (ab)
        const paths = await db
            .node(a.id)
            .pathTo(c.id)
            .where(($: any) => [$.links().at(0)("cost"), "=", 1])
            .get();
        // a->b->c starts with ab (cost 1) → passes
        // a->c starts with ac (cost 5) → fails
        expect(paths.length).toBe(1);
    });

    it("where with $.nodes().where() filters by per-element meta _.DEGREE", async () => {
        const { db, a, c } = await seededDB();
        // Filter paths where any node has degree > 3
        // A has degree 3 (ab, ac, ad out), so DEGREE = 3, not > 3
        // No node has degree > 3 in our test graph... B has degree 2, C has degree 2
        const paths = await db
            .node(a.id)
            .pathTo(c.id)
            .where(($: any) => [
                $.nodes()
                    .where((_: any) => [_.DEGREE, ">", 3])
                    .size(),
                ">",
                0,
            ])
            .get();
        expect(paths.length).toBe(0);
    });

    it("where with $.nodes().where() filters by per-element meta _.DEGREE (positive)", async () => {
        const { db, a, c } = await seededDB();
        // Filter paths where any node has degree >= 3
        // A has degree 3 (ab out, ac out, ad out = 3 out, 0 in = 3 total)
        const paths = await db
            .node(a.id)
            .pathTo(c.id)
            .where(($: any) => [
                $.nodes()
                    .where((_: any) => [_.DEGREE, ">=", 3])
                    .size(),
                ">",
                0,
            ])
            .get();
        // Both paths include A which has degree 3
        expect(paths.length).toBe(2);
    });

    it("where with $.LENGTH filters by path length", async () => {
        const { db, a, c } = await seededDB();
        const paths = await db
            .node(a.id)
            .pathTo(c.id)
            .where(($: any) => [$.LENGTH, "=", 1])
            .get();
        // Only the direct a->c path has length 1
        expect(paths.length).toBe(1);
    });
});

// ============================================================
// Set operations
// ============================================================

describe("set operations", () => {
    it("intersection of node pipelines", async () => {
        const { db } = await seededDB();
        const result = await db
            .intersection(
                db.nodesWhere(($) => [$("weight"), ">", 15]),
                db.nodesWhere(($) => [$("weight"), "<", 45]),
            )
            .get();
        const names = result.map((r: any) => r.data.name).sort();
        expect(names).toEqual(["B", "C", "D"]);
    });

    it("union of node pipelines", async () => {
        const { db } = await seededDB();
        const result = await db
            .union(
                db.nodesWhere(($) => [$("weight"), "<", 15]),
                db.nodesWhere(($) => [$("weight"), ">", 45]),
            )
            .get();
        const names = result.map((r: any) => r.data.name).sort();
        expect(names).toEqual(["A", "E"]);
    });

    it("exclusion of node pipelines", async () => {
        const { db } = await seededDB();
        const result = await db
            .exclusion(
                db.nodes(),
                db.nodesWhere(($) => [$("weight"), ">", 30]),
            )
            .get();
        const names = result.map((r: any) => r.data.name).sort();
        expect(names).toEqual(["A", "B", "C"]);
    });

    it("nested set operations", async () => {
        const { db } = await seededDB();
        const result = await db
            .union(
                db.nodesWhere(($) => [$("weight"), "<", 15]),
                db.intersection(
                    db.nodesWhere(($) => [$("weight"), ">", 25]),
                    db.nodesWhere(($) => [$("weight"), "<", 45]),
                ),
            )
            .get();
        const names = result.map((r: any) => r.data.name).sort();
        expect(names).toEqual(["A", "C", "D"]);
    });
});

// ============================================================
// Join
// ============================================================

describe("join", () => {
    it("creates links between pipeline results", async () => {
        const db = makeDB();
        const [a, b, c] = await db.insert([
            { name: "A", weight: 1 },
            { name: "B", weight: 2 },
            { name: "C", weight: 3 },
        ]);
        const created = await db.join(db.node(a.id), db.node([b.id, c.id]), { label: "joined", cost: 0 });
        expect(created).toHaveLength(2);
        expect(db.get(a.id)?.out.length).toBe(2);
    });

    it("join with callback can skip pairs", async () => {
        const db = makeDB();
        const [a, b, c] = await db.insert([
            { name: "A", weight: 1 },
            { name: "B", weight: 2 },
            { name: "C", weight: 3 },
        ]);
        const created = await db.join(db.node(a.id), db.node([b.id, c.id]), (from, to) => (to.data.weight > 2 ? { label: "heavy", cost: 99 } : undefined));
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

// ============================================================
// Deep/wide upstream traversals
// ============================================================

describe("deep/wide upstream traversals", () => {
    it("deepUpstreamNodes from e finds d, a", async () => {
        const { db, e, d, a } = await seededDB();
        const result = await db.node(e.id).deepUpstreamNodes().get();
        const ids = result.map((r: any) => r.id);
        expect(ids).toContain(d.id);
        expect(ids).toContain(a.id);
        expect(ids).toHaveLength(2);
    });

    it("wideUpstreamNodes from e finds d, a", async () => {
        const { db, e, d, a } = await seededDB();
        const result = await db.node(e.id).wideUpstreamNodes().get();
        const ids = result.map((r: any) => r.id);
        expect(ids).toContain(d.id);
        expect(ids).toContain(a.id);
        expect(ids).toHaveLength(2);
    });

    it("deepUpstreamLinks from c finds links bc, ab, ac", async () => {
        const { db, c, bc, ab, ac } = await seededDB();
        const result = await db.node(c.id).deepUpstreamLinks().get();
        const ids = result.map((r: any) => r.id);
        expect(ids).toContain(bc.id);
        expect(ids).toContain(ab.id);
        expect(ids).toContain(ac.id);
    });

    it("wideUpstreamLinks from c finds links bc, ac, ab", async () => {
        const { db, c, bc, ac, ab } = await seededDB();
        const result = await db.node(c.id).wideUpstreamLinks().get();
        const ids = result.map((r: any) => r.id);
        expect(ids).toContain(bc.id);
        expect(ids).toContain(ac.id);
        expect(ids).toContain(ab.id);
    });
});

// ============================================================
// Any-direction traversals
// ============================================================

describe("any-direction traversals", () => {
    it("deepNodes from b finds all reachable nodes", async () => {
        const { db, b, a, c, d, e } = await seededDB();
        const result = await db.node(b.id).deepNodes().get();
        const ids = result.map((r: any) => r.id);
        // b connects to a (in), c (out); a connects to c, d; d connects to e
        expect(ids).toContain(a.id);
        expect(ids).toContain(c.id);
        expect(ids).toContain(d.id);
        expect(ids).toContain(e.id);
        expect(ids).not.toContain(b.id); // should not include self
    });

    it("wideNodes from b finds all reachable nodes BFS", async () => {
        const { db, b, a, c, d, e } = await seededDB();
        const result = await db.node(b.id).wideNodes().get();
        const ids = result.map((r: any) => r.id);
        expect(ids).toContain(a.id);
        expect(ids).toContain(c.id);
        expect(ids).toContain(d.id);
        expect(ids).toContain(e.id);
        expect(ids).not.toContain(b.id);
    });
});

// ============================================================
// Node pipeline: paginate, window, slice, distinct, id
// ============================================================

describe("node pipeline: paginate, window, slice, distinct, id", () => {
    it("paginate returns correct page of nodes", async () => {
        const { db } = await seededDB();
        const page1 = await db
            .nodes()
            .sort(($) => $("weight"), "asc")
            .paginate(1, 2)
            .get();
        const page2 = await db
            .nodes()
            .sort(($) => $("weight"), "asc")
            .paginate(2, 2)
            .get();
        expect(page1).toHaveLength(2);
        expect(page2).toHaveLength(2);
        expect(page1[0].data.weight).toBe(10);
        expect(page2[0].data.weight).toBe(30);
    });

    it("window returns correct window of nodes", async () => {
        const { db } = await seededDB();
        const result = await db
            .nodes()
            .sort(($) => $("weight"), "asc")
            .window(1, 2)
            .get();
        expect(result).toHaveLength(2);
        expect(result[0].data.weight).toBe(20);
        expect(result[1].data.weight).toBe(30);
    });

    it("slice returns correct slice of nodes", async () => {
        const { db } = await seededDB();
        const result = await db
            .nodes()
            .sort(($) => $("weight"), "asc")
            .slice(2, 4)
            .get();
        expect(result).toHaveLength(2);
        expect(result[0].data.weight).toBe(30);
        expect(result[1].data.weight).toBe(40);
    });

    it("distinct deduplicates nodes", async () => {
        const { db } = await seededDB();
        const result = await db.nodes().distinct().get();
        expect(result).toHaveLength(5);
    });

    it("id terminal returns ids", async () => {
        const { db, a } = await seededDB();
        const singleId = await db.node(a.id).id();
        expect(singleId).toBe(a.id);

        const multiIds = await db
            .nodes()
            .sort(($) => $("weight"), "asc")
            .id();
        expect(multiIds).toHaveLength(5);
    });
});

// ============================================================
// Link pipeline: paginate, window, slice, distinct, id
// ============================================================

describe("link pipeline: paginate, window, slice, distinct, id", () => {
    it("paginate returns correct page of links", async () => {
        const { db } = await seededDB();
        const page1 = await db
            .links()
            .sort(($) => $("cost"), "asc")
            .paginate(1, 2)
            .get();
        const page2 = await db
            .links()
            .sort(($) => $("cost"), "asc")
            .paginate(2, 2)
            .get();
        expect(page1).toHaveLength(2);
        expect(page2).toHaveLength(2);
        expect(page1[0].data.cost).toBe(1);
        expect(page2[0].data.cost).toBe(3);
    });

    it("window returns correct window of links", async () => {
        const { db } = await seededDB();
        const result = await db
            .links()
            .sort(($) => $("cost"), "asc")
            .window(1, 2)
            .get();
        expect(result).toHaveLength(2);
        expect(result[0].data.cost).toBe(2);
        expect(result[1].data.cost).toBe(3);
    });

    it("slice returns correct slice of links", async () => {
        const { db } = await seededDB();
        const result = await db
            .links()
            .sort(($) => $("cost"), "asc")
            .slice(1, 3)
            .get();
        expect(result).toHaveLength(2);
        expect(result[0].data.cost).toBe(2);
        expect(result[1].data.cost).toBe(3);
    });

    it("distinct deduplicates links", async () => {
        const { db } = await seededDB();
        const result = await db.links().distinct().get();
        expect(result).toHaveLength(5);
    });

    it("id terminal returns link ids", async () => {
        const { db, ab } = await seededDB();
        const singleId = await db.link(ab.id).id();
        expect(singleId).toBe(ab.id);

        const multiIds = await db
            .links()
            .sort(($) => $("cost"), "asc")
            .id();
        expect(multiIds).toHaveLength(5);
    });
});

// ============================================================
// Pipeline lens-targeted update
// ============================================================

describe("pipeline: lens-targeted update", () => {
    it("node pipeline updates a specific field via lens", async () => {
        const { db, e } = await seededDB();
        await db.nodesWhere(($) => [$("weight"), ">", 40]).update(($: any) => $("weight"), 99);
        expect(db.get(e.id)?.data.weight).toBe(99);
    });

    it("link pipeline updates a specific field via lens", async () => {
        const { db, ac } = await seededDB();
        await db.linksWhere(($) => [$("cost"), ">", 4]).update(($: any) => $("cost"), 0);
        expect(db.getLink(ac.id)?.data.cost).toBe(0);
    });
});

// ============================================================
// Pipeline terminals: isolateIn / isolateOut
// ============================================================

describe("pipeline: isolateIn / isolateOut", () => {
    it("isolateIn strips inbound links via pipeline", async () => {
        const { db, b, ab } = await seededDB();
        await db.node(b.id).isolateIn();
        expect(db.get(b.id)?.in).toEqual([]);
        // b should still have outbound bc
        expect(db.get(b.id)?.out.length).toBe(1);
        expect(db.getLink(ab.id)).toBeUndefined();
    });

    it("isolateOut strips outbound links via pipeline", async () => {
        const { db, a } = await seededDB();
        await db.node(a.id).isolateOut();
        expect(db.get(a.id)?.out).toEqual([]);
        // a has no inbound links, so in should be empty too
        expect(db.get(a.id)?.in).toEqual([]);
    });
});

// ============================================================
// Path: step() combined with other ops
// ============================================================

describe("path: step combined with other ops", () => {
    it("first step of longest path", async () => {
        const { db, a, c } = await seededDB();
        const step = await db.node(a.id).pathTo(c.id).longest().step(0).get();
        // longest path is a->b->c (2 steps), first step is [a, ab, b]
        // After longest() (multi->multi paths, keeps max-length paths), step(0) narrows each path to its first step
        // longest() keeps 1 path (a->b->c, 2 steps), step(0) extracts first step from each
        // multi/single → GraphStep[] with 1 element
        expect(Array.isArray(step)).toBe(true);
        expect(step.length).toBe(1);
        expect(step[0].length).toBe(3);
    });

    it("last step of each path via step(-1)", async () => {
        const { db, a, c } = await seededDB();
        const steps = await db.node(a.id).pathTo(c.id).step(-1).get();
        // two paths: a->b->c (last step: b->bc->c) and a->c (last step: a->ac->c)
        expect(steps.length).toBe(2);
        for (const s of steps) {
            expect(s.length).toBe(3); // [node, link, node]
        }
    });
});

// ============================================================
// Path: segment()
// ============================================================

describe("path: segment", () => {
    it("segment(0, 1) returns first segment of a path", async () => {
        const { db, a, e } = await seededDB();
        const paths = await db.node(a.id).pathTo(e.id).first().segment(0, 1).get();
        // path a->d->e has 2 steps, segment(0,1) gives first step only
        expect(Array.isArray(paths)).toBe(true);
        expect(paths!.length).toBe(1);
    });
});

// ============================================================
// Path: pathFrom and pathBetween more thoroughly
// ============================================================

describe("path: pathFrom and pathBetween thorough", () => {
    it("pathFrom count: upstream paths from c to a", async () => {
        const { db, c, a } = await seededDB();
        const count = await db.node(c.id).pathFrom(a.id).count();
        // c has inbound from a (direct ac) and from b (bc, and b has inbound from a via ab)
        // so paths: c<-a and c<-b<-a = 2 paths
        expect(count).toBe(2);
    });

    it("pathBetween shortest from e to a", async () => {
        const { db, e, a } = await seededDB();
        const paths = await db.node(e.id).pathBetween(a.id).shortest().get();
        // e<-d<-a is 2 steps (bidirectional), only one shortest path
        expect(paths.length).toBe(1);
        expect(paths[0].length).toBe(2); // 2 steps
    });
});

// ============================================================
// Join: callback returning undefined for some pairs
// ============================================================

describe("join: complex callback scenarios", () => {
    it("join with callback returning undefined skips those pairs", async () => {
        const db = makeDB();
        const [a, b, c, d] = await db.insert([
            { name: "A", weight: 1 },
            { name: "B", weight: 2 },
            { name: "C", weight: 3 },
            { name: "D", weight: 4 },
        ]);
        const created = await db.join(db.node([a.id, b.id]), db.node([c.id, d.id]), (from: any, to: any) => {
            // Only connect if from weight + to weight > 4
            if (from.data.weight + to.data.weight > 4) {
                return { label: `${from.data.name}->${to.data.name}`, cost: from.data.weight + to.data.weight };
            }
            return undefined;
        });
        // a(1)+c(3)=4 no, a(1)+d(4)=5 yes, b(2)+c(3)=5 yes, b(2)+d(4)=6 yes
        expect(created).toHaveLength(3);
    });
});

// ============================================================
// Link pipeline: last / at
// ============================================================

describe("link pipeline: last / at", () => {
    it("last returns last link by sort order", async () => {
        const { db } = await seededDB();
        const result = await db
            .links()
            .sort(($) => $("cost"), "asc")
            .last()
            .get();
        expect(result!.data.cost).toBe(5); // ac has highest cost
    });

    it("at returns link at specific index", async () => {
        const { db } = await seededDB();
        const result = await db
            .links()
            .sort(($) => $("cost"), "asc")
            .at(2)
            .get();
        expect(result!.data.cost).toBe(3); // ab(1), bc(2), ad(3), de(4), ac(5)
    });
});

// ============================================================
// Mode switches: wideDownstreamLinks, deepLinks, wideLinks
// ============================================================

describe("mode switches: remaining link traversals", () => {
    it("wideDownstreamLinks collects links in BFS from a node", async () => {
        const { db, a, ab, ac, ad } = await seededDB();
        const result = await db.node(a.id).wideDownstreamLinks().get();
        const ids = result.map((r: any) => r.id);
        expect(ids).toContain(ab.id);
        expect(ids).toContain(ac.id);
        expect(ids).toContain(ad.id);
    });

    it("deepLinks collects all reachable links in any direction (DFS)", async () => {
        const { db, b } = await seededDB();
        const result = await db.node(b.id).deepLinks().get();
        // b connects to a (in via ab), c (out via bc); from there all other links are reachable
        expect(result.length).toBe(5); // all 5 links
    });

    it("wideLinks collects all reachable links in any direction (BFS)", async () => {
        const { db, b } = await seededDB();
        const result = await db.node(b.id).wideLinks().get();
        expect(result.length).toBe(5); // all 5 links
    });
});

// ============================================================
// Path: nodeAt, linkAt, ends
// ============================================================

describe("path: nodeAt, linkAt, ends", () => {
    it("nodeAt(1) returns the second node in each path", async () => {
        const { db, a, c, b } = await seededDB();
        const result = await db.node(a.id).pathTo(c.id).nodeAt(1).get();
        const ids = result.map((r: any) => r.id);
        // path a->b->c: nodeAt(1) = b
        // path a->c: nodeAt(1) = c
        expect(ids).toContain(b.id);
        expect(ids).toContain(c.id);
    });

    it("linkAt(0) returns the first link in each path", async () => {
        const { db, a, c, ab, ac } = await seededDB();
        const result = await db.node(a.id).pathTo(c.id).linkAt(0).get();
        const ids = result.map((r: any) => r.id);
        // path a->b->c: linkAt(0) = ab
        // path a->c: linkAt(0) = ac
        expect(ids).toContain(ab.id);
        expect(ids).toContain(ac.id);
    });

    it("ends() returns start and end nodes of all paths", async () => {
        const { db, a, c } = await seededDB();
        const result = await db.node(a.id).pathTo(c.id).ends().get();
        const ids = result.map((r: any) => r.id);
        // both paths start at a and end at c
        expect(ids).toContain(a.id);
        expect(ids).toContain(c.id);
        expect(ids).toHaveLength(2); // deduplicated
    });
});

// ============================================================
// Path: last, at on paths
// ============================================================

describe("path: last / at on path collection", () => {
    it("last returns the last path", async () => {
        const { db, a, c } = await seededDB();
        const path = await db.node(a.id).pathTo(c.id).last().get();
        // single path returned
        expect(Array.isArray(path)).toBe(true);
        expect(path![0].length).toBe(3); // first element is a step [node, link, node]
    });

    it("at(0) returns the first path", async () => {
        const { db, a, c } = await seededDB();
        const path = await db.node(a.id).pathTo(c.id).at(0).get();
        expect(Array.isArray(path)).toBe(true);
        expect(path![0].length).toBe(3);
    });

    it("at(1) returns the second path", async () => {
        const { db, a, c } = await seededDB();
        const path = await db.node(a.id).pathTo(c.id).at(1).get();
        expect(Array.isArray(path)).toBe(true);
        expect(path![0].length).toBe(3);
    });
});

// ============================================================
// Path: sort, slice, paginate, window
// ============================================================

describe("path: sort, slice, paginate, window", () => {
    it("sort by $.LENGTH orders paths by step count", async () => {
        const { db, a, c } = await seededDB();
        const paths = await db
            .node(a.id)
            .pathTo(c.id)
            .sort(($: any) => $.LENGTH, "asc")
            .get();
        // a->c (1 step) should come before a->b->c (2 steps)
        expect(paths[0].length).toBe(1);
        expect(paths[1].length).toBe(2);
    });

    it("slice returns subset of paths", async () => {
        const { db, a, c } = await seededDB();
        const paths = await db
            .node(a.id)
            .pathTo(c.id)
            .sort(($: any) => $.LENGTH, "asc")
            .slice(0, 1)
            .get();
        expect(paths.length).toBe(1);
        expect(paths[0].length).toBe(1); // shortest path only
    });

    it("paginate returns correct page of paths", async () => {
        const { db, a, c } = await seededDB();
        const page1 = await db
            .node(a.id)
            .pathTo(c.id)
            .sort(($: any) => $.LENGTH, "asc")
            .paginate(1, 1)
            .get();
        const page2 = await db
            .node(a.id)
            .pathTo(c.id)
            .sort(($: any) => $.LENGTH, "asc")
            .paginate(2, 1)
            .get();
        expect(page1.length).toBe(1);
        expect(page2.length).toBe(1);
        expect(page1[0].length).toBe(1); // 1-step path
        expect(page2[0].length).toBe(2); // 2-step path
    });

    it("window returns correct window of paths", async () => {
        const { db, a, c } = await seededDB();
        const result = await db
            .node(a.id)
            .pathTo(c.id)
            .sort(($: any) => $.LENGTH, "asc")
            .window(1, 1)
            .get();
        expect(result.length).toBe(1);
        expect(result[0].length).toBe(2); // second path (2-step)
    });
});

// ============================================================
// Path: chaining (pathTo/pathFrom/pathBetween on path pipeline)
// ============================================================

describe("path: chaining", () => {
    it("pathTo chains a downstream extension from terminal node", async () => {
        const { db, a, b, c } = await seededDB();
        // a->b then b->c — combined path should be a->ab->b->bc->c (2 steps)
        const paths = await db.node(a.id).pathTo(b.id).pathTo(c.id).get();
        expect(paths.length).toBe(1);
        expect(paths[0].length).toBe(2); // two steps: a->b, b->c
        expect(paths[0][0][0].id).toBe(a.id);
        expect(paths[0][0][2].id).toBe(b.id);
        expect(paths[0][1][0].id).toBe(b.id);
        expect(paths[0][1][2].id).toBe(c.id);
    });

    it("pathTo chains through waypoint, filtering between segments", async () => {
        const { db, a, b, c } = await seededDB();
        // Only paths a->b where cost < 2, then b->c — filters first segment
        const paths = await db
            .node(a.id)
            .pathTo(b.id)
            .where(($: any) => [
                $.links()
                    .where((_: any) => [_("cost"), ">=", 2])
                    .size(),
                "=",
                0,
            ])
            .pathTo(c.id)
            .get();
        // a->b via ab (cost 1) passes, then extends to c — 1 combined path
        expect(paths.length).toBe(1);
        expect(paths[0].length).toBe(2);
    });

    it("chained pathTo resets cardinality to multi", async () => {
        const { db, a, b, c } = await seededDB();
        // first() narrows to single path, then pathTo resets to multi
        const paths = await db.node(a.id).pathTo(b.id).first().pathTo(c.id).get();
        expect(Array.isArray(paths)).toBe(true);
    });

    it("pathTo on path pipeline with no terminal yields empty result", async () => {
        const { db, a, e } = await seededDB();
        // a->e has no direct pathTo route (e has no outbound), chaining further yields nothing
        const paths = await db.node(a.id).pathTo(e.id).pathTo(a.id).get();
        expect(paths.length).toBe(0);
    });
});
