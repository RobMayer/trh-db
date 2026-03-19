import { describe, it, expect } from "vitest";
import { TreeDB, TreeItemOf } from "../src/db/treeDB";
import { MemoryCodec } from "../src/codec/memoryCodec";
import { IndexStore } from "../src/util/indices";

type Person = { name: string; age: number };

function makeDB() {
    return new TreeDB<Person>(new MemoryCodec());
}

function idx(db: TreeDB<any>): IndexStore {
    return (db as any).indices;
}

function rootIdSet(db: TreeDB<any>): Set<string> {
    return (db as any).rootIds;
}

/**
 * Builds a tree:
 *
 *   grandpa (60)
 *   ├── dad (35)
 *   │   ├── alice (10)
 *   │   └── bob (8)
 *   └── uncle (32)
 *       └── charlie (7)
 */
type Seeded = {
    db: TreeDB<Person>;
    grandpa: TreeItemOf<Person>;
    dad: TreeItemOf<Person>;
    uncle: TreeItemOf<Person>;
    alice: TreeItemOf<Person>;
    bob: TreeItemOf<Person>;
    charlie: TreeItemOf<Person>;
};

async function seededDB(): Promise<Seeded> {
    const db = makeDB();
    const grandpa = await db.add({ name: "Grandpa", age: 60 }, null);
    const dad = await db.add({ name: "Dad", age: 35 }, grandpa.id);
    const uncle = await db.add({ name: "Uncle", age: 32 }, grandpa.id);
    const alice = await db.add({ name: "Alice", age: 10 }, dad.id);
    const bob = await db.add({ name: "Bob", age: 8 }, dad.id);
    const charlie = await db.add({ name: "Charlie", age: 7 }, uncle.id);
    return { db, grandpa, dad, uncle, alice, bob, charlie };
}

// ============================================================
// get
// ============================================================

describe("get", () => {
    it("returns undefined for missing id", () => {
        const db = makeDB();
        expect(db.get("missing")).toBeUndefined();
    });

    it("returns a single node by id", async () => {
        const { db, alice, dad } = await seededDB();
        const result = db.get(alice.id);
        expect(result).toEqual({ id: alice.id, type: "treeitem", parent: dad.id, children: [], data: { name: "Alice", age: 10 } });
    });

    it("returns multiple nodes by id list", async () => {
        const { db, alice, bob } = await seededDB();
        const result = db.get([alice.id, bob.id]);
        expect(result).toHaveLength(2);
        expect(result.map((r) => r.id)).toEqual(expect.arrayContaining([alice.id, bob.id]));
    });

    it("skips missing ids in list", async () => {
        const { db, alice } = await seededDB();
        const result = db.get([alice.id, "missing"]);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(alice.id);
    });

    it("accepts a Set of ids", async () => {
        const { db, alice, bob } = await seededDB();
        const result = db.get(new Set([alice.id, bob.id]));
        expect(result).toHaveLength(2);
    });
});

// ============================================================
// add
// ============================================================

describe("add", () => {
    it("adds a root node and returns it", async () => {
        const db = makeDB();
        const r = await db.add({ name: "Root", age: 50 }, null);
        expect(r.id).toBeDefined();
        expect(r.parent).toBeNull();
        expect(r.children).toEqual([]);
        expect(r.data.name).toBe("Root");
        expect(db.get(r.id)).toBeDefined();
    });

    it("adds a child node and updates parent children array", async () => {
        const db = makeDB();
        const r = await db.add({ name: "Root", age: 50 }, null);
        const c = await db.add({ name: "Child", age: 20 }, r.id);
        expect(db.get(c.id)?.parent).toBe(r.id);
        expect(db.get(r.id)?.children).toContain(c.id);
    });

    it("tracks root ids", async () => {
        const db = makeDB();
        const r1 = await db.add({ name: "Root1", age: 50 }, null);
        const r2 = await db.add({ name: "Root2", age: 40 }, null);
        await db.add({ name: "Child", age: 20 }, r1.id);
        expect(rootIdSet(db)).toEqual(new Set([r1.id, r2.id]));
    });

    it("bulk adds with per-item parent", async () => {
        const db = makeDB();
        const r = await db.add({ name: "Root", age: 50 }, null);
        const children = await db.add([
            { data: { name: "A", age: 10 }, parent: r.id },
            { data: { name: "B", age: 20 }, parent: r.id },
        ]);
        expect(children).toHaveLength(2);
        expect(db.get(r.id)?.children).toContain(children[0].id);
        expect(db.get(r.id)?.children).toContain(children[1].id);
    });
});

// ============================================================
// update
// ============================================================

describe("update", () => {
    it("updates a single node with static data and returns it", async () => {
        const { db, alice } = await seededDB();
        const updated = await db.update(alice.id, { name: "Alice Updated", age: 11 });
        expect(updated?.data.name).toBe("Alice Updated");
        expect(db.get(alice.id)?.data.age).toBe(11);
    });

    it("updates a single node with updater function", async () => {
        const { db, alice } = await seededDB();
        await db.update(alice.id, (prev) => ({ ...prev, age: prev.age + 1 }));
        expect(db.get(alice.id)?.data.age).toBe(11);
    });

    it("passes item to updater function", async () => {
        const { db, alice } = await seededDB();
        await db.update(alice.id, (prev, item) => ({ ...prev, name: `${prev.name}-${item.id}` }));
        expect(db.get(alice.id)?.data.name).toBe(`Alice-${alice.id}`);
    });

    it("updates a batch via payload object", async () => {
        const { db, alice, bob } = await seededDB();
        await db.update({ [alice.id]: { name: "A", age: 99 }, [bob.id]: { name: "B", age: 99 } });
        expect(db.get(alice.id)?.data.age).toBe(99);
        expect(db.get(bob.id)?.data.age).toBe(99);
    });

    it("updates multiple ids with shared updater", async () => {
        const { db, alice, bob } = await seededDB();
        await db.update([alice.id, bob.id], (prev) => ({ ...prev, age: prev.age + 10 }));
        expect(db.get(alice.id)?.data.age).toBe(20);
        expect(db.get(bob.id)?.data.age).toBe(18);
    });

    it("returns undefined for missing id", async () => {
        const { db } = await seededDB();
        const result = await db.update("missing", { name: "Ghost", age: 0 });
        expect(result).toBeUndefined();
    });

    it("does not affect tree structure", async () => {
        const { db, alice, dad } = await seededDB();
        await db.update(alice.id, { name: "Alice Updated", age: 99 });
        expect(db.get(alice.id)?.parent).toBe(dad.id);
        expect(db.get(dad.id)?.children).toContain(alice.id);
    });
});

// ============================================================
// move
// ============================================================

describe("move", () => {
    it("moves a node to a new parent and returns it", async () => {
        const { db, alice, uncle, dad } = await seededDB();
        const moved = await db.move(alice.id, uncle.id);
        expect(moved?.parent).toBe(uncle.id);
        expect(db.get(uncle.id)?.children).toContain(alice.id);
        expect(db.get(dad.id)?.children).not.toContain(alice.id);
    });

    it("moves a node to root", async () => {
        const { db, alice, dad } = await seededDB();
        await db.move(alice.id, null);
        expect(db.get(alice.id)?.parent).toBeNull();
        expect(db.get(dad.id)?.children).not.toContain(alice.id);
        expect(rootIdSet(db).has(alice.id)).toBe(true);
    });

    it("moves a root to a parent", async () => {
        const { db, grandpa } = await seededDB();
        await db.move(grandpa.id, null); // already root, no-op
        expect(db.get(grandpa.id)?.parent).toBeNull();

        const orphan = await db.add({ name: "Orphan", age: 5 }, null);
        expect(rootIdSet(db).has(orphan.id)).toBe(true);
        await db.move(orphan.id, grandpa.id);
        expect(db.get(orphan.id)?.parent).toBe(grandpa.id);
        expect(rootIdSet(db).has(orphan.id)).toBe(false);
    });

    it("returns undefined for missing node", async () => {
        const { db, grandpa } = await seededDB();
        const result = await db.move("missing", grandpa.id);
        expect(result).toBeUndefined();
    });

    it("returns item when parent is already the same", async () => {
        const { db, alice, dad } = await seededDB();
        const childrenBefore = [...db.get(dad.id)!.children];
        const result = await db.move(alice.id, dad.id);
        expect(result?.id).toBe(alice.id);
        expect(db.get(dad.id)?.children).toEqual(childrenBefore);
    });
});

// ============================================================
// pluck — remove node, orphan children as roots
// ============================================================

describe("pluck", () => {
    it("removes a leaf node", async () => {
        const { db, alice, dad } = await seededDB();
        const result = await db.pluck(alice.id);
        expect(result?.id).toBe(alice.id);
        expect(db.get(alice.id)).toBeUndefined();
        expect(db.get(dad.id)?.children).not.toContain(alice.id);
    });

    it("removes an internal node and orphans children as roots", async () => {
        const { db, dad, alice, bob, grandpa } = await seededDB();
        await db.pluck(dad.id);
        expect(db.get(dad.id)).toBeUndefined();
        expect(db.get(alice.id)?.parent).toBeNull();
        expect(db.get(bob.id)?.parent).toBeNull();
        expect(rootIdSet(db).has(alice.id)).toBe(true);
        expect(rootIdSet(db).has(bob.id)).toBe(true);
        expect(db.get(grandpa.id)?.children).not.toContain(dad.id);
    });

    it("removes multiple nodes", async () => {
        const { db, alice, bob, dad } = await seededDB();
        const result = await db.pluck([alice.id, bob.id]);
        expect(result).toHaveLength(2);
        expect(db.get(alice.id)).toBeUndefined();
        expect(db.get(bob.id)).toBeUndefined();
        expect(db.get(dad.id)?.children).toEqual([]);
    });

    it("no-ops for missing id", async () => {
        const { db } = await seededDB();
        const result = await db.pluck("missing");
        expect(result).toBeUndefined();
    });
});

// ============================================================
// splice — remove node, reparent children to node's parent
// ============================================================

describe("splice", () => {
    it("removes node and reparents children to grandparent", async () => {
        const { db, dad, alice, bob, grandpa } = await seededDB();
        await db.splice(dad.id);
        expect(db.get(dad.id)).toBeUndefined();
        expect(db.get(alice.id)?.parent).toBe(grandpa.id);
        expect(db.get(bob.id)?.parent).toBe(grandpa.id);
        expect(db.get(grandpa.id)?.children).toContain(alice.id);
        expect(db.get(grandpa.id)?.children).toContain(bob.id);
        expect(db.get(grandpa.id)?.children).not.toContain(dad.id);
    });

    it("splicing a root orphans children as roots", async () => {
        const { db, grandpa, dad, uncle } = await seededDB();
        await db.splice(grandpa.id);
        expect(db.get(grandpa.id)).toBeUndefined();
        expect(db.get(dad.id)?.parent).toBeNull();
        expect(db.get(uncle.id)?.parent).toBeNull();
        expect(rootIdSet(db).has(dad.id)).toBe(true);
        expect(rootIdSet(db).has(uncle.id)).toBe(true);
    });

    it("splicing a leaf is the same as pluck", async () => {
        const { db, alice, dad } = await seededDB();
        await db.splice(alice.id);
        expect(db.get(alice.id)).toBeUndefined();
        expect(db.get(dad.id)?.children).not.toContain(alice.id);
    });
});

// ============================================================
// prune — remove node and all descendants
// ============================================================

describe("prune", () => {
    it("removes node and all descendants", async () => {
        const { db, dad, alice, bob, grandpa, uncle, charlie } = await seededDB();
        await db.prune(dad.id);
        expect(db.get(dad.id)).toBeUndefined();
        expect(db.get(alice.id)).toBeUndefined();
        expect(db.get(bob.id)).toBeUndefined();
        expect(db.get(grandpa.id)?.children).not.toContain(dad.id);
        expect(db.get(uncle.id)).toBeDefined();
        expect(db.get(charlie.id)).toBeDefined();
    });

    it("pruning a leaf removes only that node", async () => {
        const { db, alice, bob, dad } = await seededDB();
        await db.prune(alice.id);
        expect(db.get(alice.id)).toBeUndefined();
        expect(db.get(bob.id)).toBeDefined();
        expect(db.get(dad.id)?.children).toEqual([bob.id]);
    });

    it("pruning root removes entire tree", async () => {
        const { db, grandpa, dad, uncle, alice, bob, charlie } = await seededDB();
        await db.prune(grandpa.id);
        expect(db.get(grandpa.id)).toBeUndefined();
        expect(db.get(dad.id)).toBeUndefined();
        expect(db.get(uncle.id)).toBeUndefined();
        expect(db.get(alice.id)).toBeUndefined();
        expect(db.get(bob.id)).toBeUndefined();
        expect(db.get(charlie.id)).toBeUndefined();
    });
});

// ============================================================
// trim — remove node only if it is a leaf
// ============================================================

describe("trim", () => {
    it("removes a leaf node", async () => {
        const { db, alice } = await seededDB();
        const result = await db.trim(alice.id);
        expect(result?.id).toBe(alice.id);
        expect(db.get(alice.id)).toBeUndefined();
    });

    it("no-ops on a node with children", async () => {
        const { db, dad } = await seededDB();
        const result = await db.trim(dad.id);
        expect(result).toBeUndefined();
        expect(db.get(dad.id)).toBeDefined();
    });

    it("trims multiple leaves", async () => {
        const { db, alice, bob, charlie } = await seededDB();
        const result = await db.trim([alice.id, bob.id, charlie.id]);
        expect(result).toHaveLength(3);
        expect(db.get(alice.id)).toBeUndefined();
        expect(db.get(bob.id)).toBeUndefined();
        expect(db.get(charlie.id)).toBeUndefined();
    });

    it("skips non-leaves in a mixed list", async () => {
        const { db, alice, dad } = await seededDB();
        const result = await db.trim([alice.id, dad.id]);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(alice.id);
        expect(db.get(dad.id)).toBeDefined();
    });
});

// ============================================================
// Index management
// ============================================================

describe("index management", () => {
    it("creates an index and backfills from existing data", async () => {
        const { db, alice, bob } = await seededDB();
        db.addIndex(($) => $("name"));
        expect(idx(db).eq("name", "Alice")).toEqual(new Set([alice.id]));
        expect(idx(db).eq("name", "Bob")).toEqual(new Set([bob.id]));
    });

    it("indexes on add", async () => {
        const db = makeDB();
        db.addIndex(($) => $("age"));
        const a = await db.add({ name: "A", age: 10 }, null);
        expect(idx(db).eq("age", 10)).toEqual(new Set([a.id]));
    });

    it("deindexes on prune", async () => {
        const { db, dad, uncle } = await seededDB();
        db.addIndex(($) => $("name"));
        await db.prune(dad.id);
        expect(idx(db).eq("name", "Alice")).toEqual(new Set());
        expect(idx(db).eq("name", "Dad")).toEqual(new Set());
        expect(idx(db).eq("name", "Uncle")).toEqual(new Set([uncle.id]));
    });

    it("updates index on data update", async () => {
        const { db, alice } = await seededDB();
        db.addIndex(($) => $("age"));
        expect(idx(db).eq("age", 10)).toEqual(new Set([alice.id]));
        await db.update(alice.id, { name: "Alice", age: 11 });
        expect(idx(db).eq("age", 10)).toEqual(new Set());
        expect(idx(db).eq("age", 11)).toEqual(new Set([alice.id]));
    });
});

// ============================================================
// Pipeline — chain starters
// ============================================================

describe("pipeline: select", () => {
    it("selects a single node", async () => {
        const { db, alice } = await seededDB();
        const result = await db.select(alice.id).get();
        expect((result as TreeItemOf<Person>).data.name).toBe("Alice");
    });

    it("returns undefined for missing single select", async () => {
        const { db } = await seededDB();
        const result = await db.select("missing").get();
        expect(result).toBeUndefined();
    });

    it("selects multiple nodes", async () => {
        const { db, alice, bob } = await seededDB();
        const result = await db.select([alice.id, bob.id]).get();
        expect(result).toHaveLength(2);
    });
});

describe("pipeline: roots", () => {
    it("returns root nodes", async () => {
        const { db, grandpa } = await seededDB();
        const result = await db.roots().get();
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(grandpa.id);
    });

    it("returns multiple roots", async () => {
        const { db } = await seededDB();
        await db.add({ name: "Other", age: 40 }, null);
        const result = await db.roots().get();
        expect(result).toHaveLength(2);
    });
});

describe("pipeline: deep (all nodes DFS)", () => {
    it("returns all nodes in depth-first order", async () => {
        const { db, grandpa, dad, alice, bob, uncle, charlie } = await seededDB();
        const result = await db.deep().get();
        const ids = result.map((r: any) => r.id);
        expect(ids).toEqual([grandpa.id, dad.id, alice.id, bob.id, uncle.id, charlie.id]);
    });
});

describe("pipeline: wide (all nodes BFS)", () => {
    it("returns all nodes in breadth-first order", async () => {
        const { db, grandpa, dad, uncle, alice, bob, charlie } = await seededDB();
        const result = await db.wide().get();
        const ids = result.map((r: any) => r.id);
        expect(ids).toEqual([grandpa.id, dad.id, uncle.id, alice.id, bob.id, charlie.id]);
    });
});

describe("pipeline: ancestors", () => {
    it("returns ancestors of a node", async () => {
        const { db, alice, dad, grandpa } = await seededDB();
        const result = await db.ancestorsOf(alice.id).get();
        const ids = result.map((r: any) => r.id);
        expect(ids).toEqual([dad.id, grandpa.id]);
    });

    it("returns empty for root", async () => {
        const { db, grandpa } = await seededDB();
        const result = await db.ancestorsOf(grandpa.id).get();
        expect(result).toHaveLength(0);
    });
});

describe("pipeline: children", () => {
    it("returns children of a node", async () => {
        const { db, dad, alice, bob } = await seededDB();
        const result = await db.childrenOf(dad.id).get();
        const ids = result.map((r: any) => r.id);
        expect(ids).toEqual(expect.arrayContaining([alice.id, bob.id]));
        expect(result).toHaveLength(2);
    });

    it("returns empty for leaf", async () => {
        const { db, alice } = await seededDB();
        const result = await db.childrenOf(alice.id).get();
        expect(result).toHaveLength(0);
    });
});

describe("pipeline: parent", () => {
    it("returns parent of a single node", async () => {
        const { db, alice, dad } = await seededDB();
        const result = await db.parentOf(alice.id).get();
        expect((result as TreeItemOf<Person>).id).toBe(dad.id);
    });

    it("returns empty for root node", async () => {
        const { db, grandpa } = await seededDB();
        const result = await db.parentOf(grandpa.id).get();
        expect(result).toBeUndefined();
    });
});

describe("pipeline: deepDescendants", () => {
    it("returns descendants in DFS order", async () => {
        const { db, grandpa, dad, alice, bob, uncle, charlie } = await seededDB();
        const result = await db.deepDescendantsOf(grandpa.id).get();
        const ids = result.map((r: any) => r.id);
        expect(ids).toEqual([dad.id, alice.id, bob.id, uncle.id, charlie.id]);
    });

    it("returns empty for leaf", async () => {
        const { db, alice } = await seededDB();
        const result = await db.deepDescendantsOf(alice.id).get();
        expect(result).toHaveLength(0);
    });
});

describe("pipeline: wideDescendants", () => {
    it("returns descendants in BFS order", async () => {
        const { db, grandpa, dad, uncle, alice, bob, charlie } = await seededDB();
        const result = await db.wideDescendantsOf(grandpa.id).get();
        const ids = result.map((r: any) => r.id);
        expect(ids).toEqual([dad.id, uncle.id, alice.id, bob.id, charlie.id]);
    });
});

describe("pipeline: siblings", () => {
    it("returns siblings excluding self", async () => {
        const { db, alice, bob } = await seededDB();
        const result = await db.siblingsOf(alice.id).get();
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(bob.id);
    });

    it("returns siblings of a root (other roots)", async () => {
        const { db, grandpa } = await seededDB();
        const other = await db.add({ name: "Other", age: 40 }, null);
        const result = await db.siblingsOf(grandpa.id).get();
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(other.id);
    });

    it("returns empty for only child", async () => {
        const { db, charlie } = await seededDB();
        const result = await db.siblingsOf(charlie.id).get();
        expect(result).toHaveLength(0);
    });
});

// ============================================================
// Pipeline — where
// ============================================================

describe("pipeline: where", () => {
    it("filters by equality", async () => {
        const { db } = await seededDB();
        const result = await db.where(($) => [$("name"), "=", "Alice"]).get();
        expect(result).toHaveLength(1);
        expect(result[0].data.name).toBe("Alice");
    });

    it("filters by comparison", async () => {
        const { db } = await seededDB();
        const result = await db.where(($) => [$("age"), "<", 10]).get();
        expect(result).toHaveLength(2); // bob(8), charlie(7)
    });

    it("chains multiple where clauses", async () => {
        const { db } = await seededDB();
        const result = await db
            .where(($) => [$("age"), ">", 7])
            .where(($) => [$("age"), "<", 35])
            .get();
        expect(result).toHaveLength(3); // alice(10), bob(8), uncle(32)
    });

    it("filters by $.ID meta accessor", async () => {
        const { db, bob } = await seededDB();
        const result = await db.where(($) => [$.ID, "=", bob.id]).get();
        expect(result).toHaveLength(1);
        expect(result[0].data.name).toBe("Bob");
    });

    it("filters by $.PARENT meta accessor", async () => {
        const { db, dad } = await seededDB();
        const result = await db.where(($) => [$.PARENT, "=", dad.id]).get();
        expect(result).toHaveLength(2); // alice, bob
    });

    it("uses index acceleration", async () => {
        const { db, charlie } = await seededDB();
        db.addIndex(($) => $("name"));
        const result = await db.where(($) => [$("name"), "=", "Charlie"]).get();
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(charlie.id);
    });
});

// ============================================================
// Pipeline — sort, slice, paginate, window
// ============================================================

describe("pipeline: sort", () => {
    it("sorts ascending by data field", async () => {
        const { db } = await seededDB();
        const result = await db
            .deep()
            .sort(($) => $("age"), "asc")
            .get();
        const ages = result.map((r: any) => r.data.age);
        expect(ages).toEqual([7, 8, 10, 32, 35, 60]);
    });

    it("sorts descending", async () => {
        const { db } = await seededDB();
        const result = await db
            .deep()
            .sort(($) => $("name"), "desc")
            .get();
        const names = result.map((r: any) => r.data.name);
        expect(names).toEqual(["Uncle", "Grandpa", "Dad", "Charlie", "Bob", "Alice"]);
    });
});

describe("pipeline: slice / paginate / window", () => {
    it("slices results", async () => {
        const { db } = await seededDB();
        const result = await db
            .deep()
            .sort(($) => $("age"), "asc")
            .slice(1, 3)
            .get();
        expect(result).toHaveLength(2);
        expect(result[0].data.age).toBe(8);
        expect(result[1].data.age).toBe(10);
    });

    it("paginates results", async () => {
        const { db } = await seededDB();
        const page1 = await db
            .deep()
            .sort(($) => $("age"), "asc")
            .paginate(1, 2)
            .get();
        const page2 = await db
            .deep()
            .sort(($) => $("age"), "asc")
            .paginate(2, 2)
            .get();
        expect(page1).toHaveLength(2);
        expect(page2).toHaveLength(2);
        expect(page1[0].data.age).toBe(7);
        expect(page2[0].data.age).toBe(10);
    });

    it("windows results", async () => {
        const { db } = await seededDB();
        const result = await db
            .deep()
            .sort(($) => $("age"), "asc")
            .window(2, 2)
            .get();
        expect(result).toHaveLength(2);
        expect(result[0].data.age).toBe(10);
        expect(result[1].data.age).toBe(32);
    });
});

// ============================================================
// Pipeline — cardinality reducers
// ============================================================

describe("pipeline: first / last / at", () => {
    it("first returns first item", async () => {
        const { db } = await seededDB();
        const result = await db
            .deep()
            .sort(($) => $("age"), "asc")
            .first()
            .get();
        expect(result!.data.age).toBe(7);
    });

    it("last returns last item", async () => {
        const { db } = await seededDB();
        const result = await db
            .deep()
            .sort(($) => $("age"), "asc")
            .last()
            .get();
        expect(result!.data.age).toBe(60);
    });

    it("at returns item at index", async () => {
        const { db } = await seededDB();
        const result = await db
            .deep()
            .sort(($) => $("age"), "asc")
            .at(2)
            .get();
        expect(result!.data.age).toBe(10);
    });

    it("first on empty returns undefined", async () => {
        const { db } = await seededDB();
        const result = await db
            .where(($) => [$("age"), ">", 100])
            .first()
            .get();
        expect(result).toBeUndefined();
    });
});

// ============================================================
// Pipeline — read terminals
// ============================================================

describe("pipeline: count / exists / id", () => {
    it("count returns number of matches", async () => {
        const { db } = await seededDB();
        expect(await db.deep().count()).toBe(6);
        expect(await db.where(($) => [$("age"), "<", 10]).count()).toBe(2);
    });

    it("exists returns true/false", async () => {
        const { db, alice } = await seededDB();
        expect(await db.select(alice.id).exists()).toBe(true);
        expect(await db.select("missing").exists()).toBe(false);
        expect(await db.where(($) => [$("age"), ">", 100]).exists()).toBe(false);
    });

    it("id returns id(s)", async () => {
        const { db, alice } = await seededDB();
        const singleId = await db.select(alice.id).id();
        expect(singleId).toBe(alice.id);

        const multiIds = await db
            .deep()
            .sort(($) => $("name"), "asc")
            .id();
        expect(multiIds).toHaveLength(6);
    });
});

// ============================================================
// Pipeline — write terminals
// ============================================================

describe("pipeline: update terminal", () => {
    it("updates matched nodes with updater function", async () => {
        const { db, bob, charlie, alice } = await seededDB();
        await db.where(($) => [$("age"), "<", 10]).update((prev) => ({ ...prev, age: prev.age + 100 }));
        expect(db.get(bob.id)?.data.age).toBe(108);
        expect(db.get(charlie.id)?.data.age).toBe(107);
        expect(db.get(alice.id)?.data.age).toBe(10); // unchanged
    });

    it("updates single select with static value", async () => {
        const { db, alice } = await seededDB();
        await db.select(alice.id).update({ name: "Alice Updated", age: 99 });
        expect(db.get(alice.id)?.data.name).toBe("Alice Updated");
    });
});

describe("pipeline: pluck terminal", () => {
    it("plucks matched nodes", async () => {
        const { db, alice, bob, dad } = await seededDB();
        await db.childrenOf(dad.id).pluck();
        expect(db.get(alice.id)).toBeUndefined();
        expect(db.get(bob.id)).toBeUndefined();
        expect(db.get(dad.id)?.children).toEqual([]);
    });
});

describe("pipeline: prune terminal", () => {
    it("prunes matched subtree", async () => {
        const { db, uncle, charlie, grandpa, dad } = await seededDB();
        await db.select(uncle.id).prune();
        expect(db.get(uncle.id)).toBeUndefined();
        expect(db.get(charlie.id)).toBeUndefined();
        expect(db.get(grandpa.id)?.children).toEqual([dad.id]);
    });
});

describe("pipeline: move terminal", () => {
    it("moves matched nodes to new parent", async () => {
        const { db, alice, bob, dad, uncle } = await seededDB();
        await db.childrenOf(dad.id).move(uncle.id);
        expect(db.get(alice.id)?.parent).toBe(uncle.id);
        expect(db.get(bob.id)?.parent).toBe(uncle.id);
        expect(db.get(uncle.id)?.children).toContain(alice.id);
        expect(db.get(uncle.id)?.children).toContain(bob.id);
    });

    it("moves with callback", async () => {
        const { db, alice, dad, uncle } = await seededDB();
        await db.select(alice.id).move((item) => (item.parent === dad.id ? uncle.id : null));
        expect(db.get(alice.id)?.parent).toBe(uncle.id);
    });
});

// ============================================================
// Pipeline — traversal chaining
// ============================================================

describe("pipeline: traversal chaining", () => {
    it("select then children", async () => {
        const { db, grandpa, dad, uncle } = await seededDB();
        const result = await db.select(grandpa.id).children().get();
        const ids = result.map((r: any) => r.id);
        expect(ids).toEqual(expect.arrayContaining([dad.id, uncle.id]));
        expect(result).toHaveLength(2);
    });

    it("select then deepDescendants", async () => {
        const { db, dad, alice, bob } = await seededDB();
        const result = await db.select(dad.id).deepDescendants().get();
        const ids = result.map((r: any) => r.id);
        expect(ids).toEqual([alice.id, bob.id]);
    });

    it("select then ancestors", async () => {
        const { db, alice, dad, grandpa } = await seededDB();
        const result = await db.select(alice.id).ancestors().get();
        const ids = result.map((r: any) => r.id);
        expect(ids).toEqual([dad.id, grandpa.id]);
    });

    it("select then parent", async () => {
        const { db, alice, dad } = await seededDB();
        const result = await db.select(alice.id).parent().get();
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(dad.id);
    });

    it("select then siblings", async () => {
        const { db, alice, bob } = await seededDB();
        const result = await db.select(alice.id).siblings().get();
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(bob.id);
    });

    it("chains traversal then where", async () => {
        const { db, grandpa, bob } = await seededDB();
        const result = await db
            .select(grandpa.id)
            .deepDescendants()
            .where(($) => [$("age"), "<", 10])
            .get();
        const ids = result.map((r: any) => r.id);
        expect(ids).toEqual(expect.arrayContaining([bob.id]));
    });

    it("chains traversal then sort", async () => {
        const { db, grandpa } = await seededDB();
        const result = await db
            .childrenOf(grandpa.id)
            .sort(($) => $("age"), "asc")
            .get();
        const names = result.map((r: any) => r.data.name);
        expect(names).toEqual(["Uncle", "Dad"]);
    });
});

// ============================================================
// Pipeline — distinct
// ============================================================

describe("pipeline: distinct", () => {
    it("deduplicates nodes", async () => {
        const { db } = await seededDB();
        const result = await db.deep().distinct().get();
        expect(result).toHaveLength(6);
    });
});

// ============================================================
// Set operations
// ============================================================

describe("set operations", () => {
    describe("intersection", () => {
        it("returns items present in all pipelines", async () => {
            const { db } = await seededDB();
            const result = await db
                .intersection(
                    db.where(($) => [$("age"), ">", 8]),
                    db.where(($) => [$("age"), "<", 35]),
                )
                .get();
            const names = result.map((r: any) => r.data.name).sort();
            expect(names).toEqual(["Alice", "Uncle"]);
        });

        it("returns empty when no overlap", async () => {
            const { db } = await seededDB();
            const result = await db
                .intersection(
                    db.where(($) => [$("age"), "<", 8]),
                    db.where(($) => [$("age"), ">", 60]),
                )
                .get();
            expect(result).toHaveLength(0);
        });

        it("supports chaining after intersection", async () => {
            const { db } = await seededDB();
            const result = await db
                .intersection(
                    db.where(($) => [$("age"), ">", 8]),
                    db.where(($) => [$("age"), "<", 35]),
                )
                .sort(($) => $("age"), "asc")
                .first()
                .get();
            expect(result!.data.name).toBe("Alice");
        });
    });

    describe("union", () => {
        it("returns items present in any pipeline", async () => {
            const { db } = await seededDB();
            const result = await db
                .union(
                    db.where(($) => [$("age"), "<", 8]),
                    db.where(($) => [$("age"), ">", 35]),
                )
                .get();
            const names = result.map((r: any) => r.data.name).sort();
            expect(names).toEqual(["Charlie", "Grandpa"]);
        });

        it("deduplicates overlapping results", async () => {
            const { db } = await seededDB();
            const result = await db
                .union(
                    db.where(($) => [$("age"), ">", 7]),
                    db.where(($) => [$("age"), "<", 60]),
                )
                .get();
            expect(result).toHaveLength(6);
        });
    });

    describe("exclusion", () => {
        it("returns items in first pipeline not in second", async () => {
            const { db } = await seededDB();
            const result = await db
                .exclusion(
                    db.deep(),
                    db.where(($) => [$("age"), ">", 10]),
                )
                .get();
            const names = result.map((r: any) => r.data.name).sort();
            expect(names).toEqual(["Alice", "Bob", "Charlie"]);
        });

        it("subtracts multiple pipelines", async () => {
            const { db } = await seededDB();
            const result = await db
                .exclusion(
                    db.deep(),
                    db.roots(),
                    db.where(($) => [$("age"), "<", 10]),
                )
                .get();
            const names = result.map((r: any) => r.data.name).sort();
            expect(names).toEqual(["Alice", "Dad", "Uncle"]);
        });
    });

    describe("nesting", () => {
        it("supports nested set operations", async () => {
            const { db } = await seededDB();
            const result = await db
                .union(
                    db.roots(),
                    db.intersection(
                        db.where(($) => [$("age"), ">", 7]),
                        db.where(($) => [$("age"), "<", 32]),
                    ),
                )
                .get();
            const names = result.map((r: any) => r.data.name).sort();
            expect(names).toEqual(["Alice", "Bob", "Grandpa"]);
        });

        it("supports traversal chaining after set operations", async () => {
            const { db } = await seededDB();
            const result = await db
                .intersection(
                    db.where(($) => [$("age"), ">", 30]),
                    db.where(($) => [$("age"), "<", 60]),
                )
                .children()
                .get();
            const names = result.map((r: any) => r.data.name).sort();
            expect(names).toEqual(["Alice", "Bob", "Charlie"]);
        });
    });
});

// ============================================================
// add: bulk with null parent
// ============================================================

describe("add: bulk", () => {
    it("bulk adds with per-item parent including null", async () => {
        const db = makeDB();
        const root = await db.add({ name: "Root", age: 50 }, null);
        const children = await db.add([
            { data: { name: "A", age: 10 }, parent: root.id },
            { data: { name: "B", age: 20 }, parent: root.id },
            { data: { name: "C", age: 30 }, parent: null },
        ]);
        expect(children).toHaveLength(3);
        expect(db.get(root.id)?.children).toContain(children[0].id);
        expect(db.get(root.id)?.children).toContain(children[1].id);
        expect(db.get(root.id)?.children).not.toContain(children[2].id);
        expect(children[2].parent).toBeNull();
        expect(rootIdSet(db).has(children[2].id)).toBe(true);
    });
});
