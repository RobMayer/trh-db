import { describe, it, expect } from "vitest";
import { TreeDB } from "../src/db/treeDB";
import { MemoryCodec } from "../src/codec/memoryCodec";
import { TreeItemOf } from "../src/types";
import { IndexStore } from "../src/util/indices";

type Person = { name: string; age: number };

function makeDB() {
    return new TreeDB<Person>(new MemoryCodec());
}

function idx(db: TreeDB<any>): IndexStore {
    return (db as any).indices;
}

function rootIds(db: TreeDB<any>): Set<string> {
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
async function seededDB() {
    const db = makeDB();
    await db.add("grandpa", { name: "Grandpa", age: 60 }, null);
    await db.add("dad", { name: "Dad", age: 35 }, "grandpa");
    await db.add("uncle", { name: "Uncle", age: 32 }, "grandpa");
    await db.add("alice", { name: "Alice", age: 10 }, "dad");
    await db.add("bob", { name: "Bob", age: 8 }, "dad");
    await db.add("charlie", { name: "Charlie", age: 7 }, "uncle");
    return db;
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
        const db = await seededDB();
        const result = db.get("alice");
        expect(result).toEqual({ id: "alice", parent: "dad", children: [], data: { name: "Alice", age: 10 } });
    });

    it("returns multiple nodes by id list", async () => {
        const db = await seededDB();
        const result = db.get(["alice", "bob"]);
        expect(result).toHaveLength(2);
        expect(result.map((r) => r.id)).toEqual(expect.arrayContaining(["alice", "bob"]));
    });

    it("skips missing ids in list", async () => {
        const db = await seededDB();
        const result = db.get(["alice", "missing"]);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("alice");
    });

    it("accepts a Set of ids", async () => {
        const db = await seededDB();
        const result = db.get(new Set(["alice", "bob"]));
        expect(result).toHaveLength(2);
    });
});

// ============================================================
// add
// ============================================================

describe("add", () => {
    it("adds a root node", async () => {
        const db = makeDB();
        await db.add("r", { name: "Root", age: 50 }, null);
        const item = db.get("r");
        expect(item?.parent).toBeNull();
        expect(item?.children).toEqual([]);
        expect(item?.data.name).toBe("Root");
    });

    it("adds a child node and updates parent children array", async () => {
        const db = makeDB();
        await db.add("r", { name: "Root", age: 50 }, null);
        await db.add("c", { name: "Child", age: 20 }, "r");
        expect(db.get("c")?.parent).toBe("r");
        expect(db.get("r")?.children).toContain("c");
    });

    it("tracks root ids", async () => {
        const db = makeDB();
        await db.add("r1", { name: "Root1", age: 50 }, null);
        await db.add("r2", { name: "Root2", age: 40 }, null);
        await db.add("c", { name: "Child", age: 20 }, "r1");
        expect(rootIds(db)).toEqual(new Set(["r1", "r2"]));
    });
});

// ============================================================
// update
// ============================================================

describe("update", () => {
    it("updates a single node with static data", async () => {
        const db = await seededDB();
        await db.update("alice", { name: "Alice Updated", age: 11 });
        expect(db.get("alice")?.data.name).toBe("Alice Updated");
        expect(db.get("alice")?.data.age).toBe(11);
    });

    it("updates a single node with updater function", async () => {
        const db = await seededDB();
        await db.update("alice", (prev) => ({ ...prev, age: prev.age + 1 }));
        expect(db.get("alice")?.data.age).toBe(11);
    });

    it("passes item to updater function", async () => {
        const db = await seededDB();
        await db.update("alice", (prev, item) => ({ ...prev, name: `${prev.name}-${item.id}` }));
        expect(db.get("alice")?.data.name).toBe("Alice-alice");
    });

    it("updates a batch via payload object", async () => {
        const db = await seededDB();
        await db.update({ alice: { name: "A", age: 99 }, bob: { name: "B", age: 99 } });
        expect(db.get("alice")?.data.age).toBe(99);
        expect(db.get("bob")?.data.age).toBe(99);
    });

    it("updates multiple ids with shared updater", async () => {
        const db = await seededDB();
        await db.update(["alice", "bob"], (prev) => ({ ...prev, age: prev.age + 10 }));
        expect(db.get("alice")?.data.age).toBe(20);
        expect(db.get("bob")?.data.age).toBe(18);
    });

    it("no-ops for missing ids", async () => {
        const db = await seededDB();
        await db.update("missing", { name: "Ghost", age: 0 });
        expect(db.get("missing")).toBeUndefined();
    });

    it("does not affect tree structure", async () => {
        const db = await seededDB();
        await db.update("alice", { name: "Alice Updated", age: 99 });
        expect(db.get("alice")?.parent).toBe("dad");
        expect(db.get("dad")?.children).toContain("alice");
    });
});

// ============================================================
// move
// ============================================================

describe("move", () => {
    it("moves a node to a new parent", async () => {
        const db = await seededDB();
        await db.move("alice", "uncle");
        expect(db.get("alice")?.parent).toBe("uncle");
        expect(db.get("uncle")?.children).toContain("alice");
        expect(db.get("dad")?.children).not.toContain("alice");
    });

    it("moves a node to root", async () => {
        const db = await seededDB();
        await db.move("alice", null);
        expect(db.get("alice")?.parent).toBeNull();
        expect(db.get("dad")?.children).not.toContain("alice");
        expect(rootIds(db).has("alice")).toBe(true);
    });

    it("moves a root to a parent", async () => {
        const db = await seededDB();
        await db.move("grandpa", null); // already root, no-op
        expect(db.get("grandpa")?.parent).toBeNull();

        // add a second root, then move it under grandpa
        await db.add("orphan", { name: "Orphan", age: 5 }, null);
        expect(rootIds(db).has("orphan")).toBe(true);
        await db.move("orphan", "grandpa");
        expect(db.get("orphan")?.parent).toBe("grandpa");
        expect(rootIds(db).has("orphan")).toBe(false);
    });

    it("no-ops for missing node", async () => {
        const db = await seededDB();
        await db.move("missing", "grandpa");
        expect(db.get("grandpa")?.children).not.toContain("missing");
    });

    it("no-ops when parent is already the same", async () => {
        const db = await seededDB();
        const childrenBefore = [...db.get("dad")!.children];
        await db.move("alice", "dad");
        expect(db.get("dad")?.children).toEqual(childrenBefore);
    });
});

// ============================================================
// pluck — remove node, orphan children as roots
// ============================================================

describe("pluck", () => {
    it("removes a leaf node", async () => {
        const db = await seededDB();
        const result = await db.pluck("alice");
        expect(result?.id).toBe("alice");
        expect(db.get("alice")).toBeUndefined();
        expect(db.get("dad")?.children).not.toContain("alice");
    });

    it("removes an internal node and orphans children as roots", async () => {
        const db = await seededDB();
        await db.pluck("dad");
        expect(db.get("dad")).toBeUndefined();
        expect(db.get("alice")?.parent).toBeNull();
        expect(db.get("bob")?.parent).toBeNull();
        expect(rootIds(db).has("alice")).toBe(true);
        expect(rootIds(db).has("bob")).toBe(true);
        expect(db.get("grandpa")?.children).not.toContain("dad");
    });

    it("removes multiple nodes", async () => {
        const db = await seededDB();
        const result = await db.pluck(["alice", "bob"]);
        expect(result).toHaveLength(2);
        expect(db.get("alice")).toBeUndefined();
        expect(db.get("bob")).toBeUndefined();
        expect(db.get("dad")?.children).toEqual([]);
    });

    it("no-ops for missing id", async () => {
        const db = await seededDB();
        const result = await db.pluck("missing");
        expect(result).toBeUndefined();
    });
});

// ============================================================
// splice — remove node, reparent children to node's parent
// ============================================================

describe("splice", () => {
    it("removes node and reparents children to grandparent", async () => {
        const db = await seededDB();
        await db.splice("dad");
        expect(db.get("dad")).toBeUndefined();
        expect(db.get("alice")?.parent).toBe("grandpa");
        expect(db.get("bob")?.parent).toBe("grandpa");
        expect(db.get("grandpa")?.children).toContain("alice");
        expect(db.get("grandpa")?.children).toContain("bob");
        expect(db.get("grandpa")?.children).not.toContain("dad");
    });

    it("splicing a root orphans children as roots", async () => {
        const db = await seededDB();
        await db.splice("grandpa");
        expect(db.get("grandpa")).toBeUndefined();
        expect(db.get("dad")?.parent).toBeNull();
        expect(db.get("uncle")?.parent).toBeNull();
        expect(rootIds(db).has("dad")).toBe(true);
        expect(rootIds(db).has("uncle")).toBe(true);
    });

    it("splicing a leaf is the same as pluck", async () => {
        const db = await seededDB();
        await db.splice("alice");
        expect(db.get("alice")).toBeUndefined();
        expect(db.get("dad")?.children).not.toContain("alice");
    });
});

// ============================================================
// prune — remove node and all descendants
// ============================================================

describe("prune", () => {
    it("removes node and all descendants", async () => {
        const db = await seededDB();
        await db.prune("dad");
        expect(db.get("dad")).toBeUndefined();
        expect(db.get("alice")).toBeUndefined();
        expect(db.get("bob")).toBeUndefined();
        expect(db.get("grandpa")?.children).not.toContain("dad");
        // uncle and charlie should be unaffected
        expect(db.get("uncle")).toBeDefined();
        expect(db.get("charlie")).toBeDefined();
    });

    it("pruning a leaf removes only that node", async () => {
        const db = await seededDB();
        await db.prune("alice");
        expect(db.get("alice")).toBeUndefined();
        expect(db.get("bob")).toBeDefined();
        expect(db.get("dad")?.children).toEqual(["bob"]);
    });

    it("pruning root removes entire tree", async () => {
        const db = await seededDB();
        await db.prune("grandpa");
        expect(db.get("grandpa")).toBeUndefined();
        expect(db.get("dad")).toBeUndefined();
        expect(db.get("uncle")).toBeUndefined();
        expect(db.get("alice")).toBeUndefined();
        expect(db.get("bob")).toBeUndefined();
        expect(db.get("charlie")).toBeUndefined();
    });
});

// ============================================================
// trim — remove node only if it is a leaf
// ============================================================

describe("trim", () => {
    it("removes a leaf node", async () => {
        const db = await seededDB();
        const result = await db.trim("alice");
        expect(result?.id).toBe("alice");
        expect(db.get("alice")).toBeUndefined();
    });

    it("no-ops on a node with children", async () => {
        const db = await seededDB();
        const result = await db.trim("dad");
        expect(result).toBeUndefined();
        expect(db.get("dad")).toBeDefined();
    });

    it("trims multiple leaves", async () => {
        const db = await seededDB();
        const result = await db.trim(["alice", "bob", "charlie"]);
        expect(result).toHaveLength(3);
        expect(db.get("alice")).toBeUndefined();
        expect(db.get("bob")).toBeUndefined();
        expect(db.get("charlie")).toBeUndefined();
    });

    it("skips non-leaves in a mixed list", async () => {
        const db = await seededDB();
        const result = await db.trim(["alice", "dad"]);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("alice");
        expect(db.get("dad")).toBeDefined();
    });
});

// ============================================================
// Index management
// ============================================================

describe("index management", () => {
    it("creates an index and backfills from existing data", async () => {
        const db = await seededDB();
        db.addIndex(($) => $("name"));
        expect(idx(db).eq("name", "Alice")).toEqual(new Set(["alice"]));
        expect(idx(db).eq("name", "Bob")).toEqual(new Set(["bob"]));
    });

    it("indexes on add", async () => {
        const db = makeDB();
        db.addIndex(($) => $("age"));
        await db.add("a", { name: "A", age: 10 }, null);
        expect(idx(db).eq("age", 10)).toEqual(new Set(["a"]));
    });

    it("deindexes on prune", async () => {
        const db = await seededDB();
        db.addIndex(($) => $("name"));
        await db.prune("dad");
        expect(idx(db).eq("name", "Alice")).toEqual(new Set());
        expect(idx(db).eq("name", "Dad")).toEqual(new Set());
        expect(idx(db).eq("name", "Uncle")).toEqual(new Set(["uncle"]));
    });

    it("updates index on data update", async () => {
        const db = await seededDB();
        db.addIndex(($) => $("age"));
        expect(idx(db).eq("age", 10)).toEqual(new Set(["alice"]));
        await db.update("alice", { name: "Alice", age: 11 });
        expect(idx(db).eq("age", 10)).toEqual(new Set());
        expect(idx(db).eq("age", 11)).toEqual(new Set(["alice"]));
    });
});

// ============================================================
// Pipeline — chain starters
// ============================================================

describe("pipeline: select", () => {
    it("selects a single node", async () => {
        const db = await seededDB();
        const result = await db.select("alice").get();
        expect((result as TreeItemOf<Person>).data.name).toBe("Alice");
    });

    it("returns undefined for missing single select", async () => {
        const db = await seededDB();
        const result = await db.select("missing").get();
        expect(result).toBeUndefined();
    });

    it("selects multiple nodes", async () => {
        const db = await seededDB();
        const result = await db.select(["alice", "bob"]).get();
        expect(result).toHaveLength(2);
    });
});

describe("pipeline: roots", () => {
    it("returns root nodes", async () => {
        const db = await seededDB();
        const result = await db.roots().get();
        expect(result).toHaveLength(1);
        expect((result as any[])[0].id).toBe("grandpa");
    });

    it("returns multiple roots", async () => {
        const db = await seededDB();
        await db.add("other", { name: "Other", age: 40 }, null);
        const result = await db.roots().get();
        expect(result).toHaveLength(2);
    });
});

describe("pipeline: deep (all nodes DFS)", () => {
    it("returns all nodes in depth-first order", async () => {
        const db = await seededDB();
        const result = await db.deep().get();
        const ids = (result as any[]).map((r: any) => r.id);
        expect(ids).toEqual(["grandpa", "dad", "alice", "bob", "uncle", "charlie"]);
    });
});

describe("pipeline: wide (all nodes BFS)", () => {
    it("returns all nodes in breadth-first order", async () => {
        const db = await seededDB();
        const result = await db.wide().get();
        const ids = (result as any[]).map((r: any) => r.id);
        expect(ids).toEqual(["grandpa", "dad", "uncle", "alice", "bob", "charlie"]);
    });
});

describe("pipeline: ancestors", () => {
    it("returns ancestors of a node", async () => {
        const db = await seededDB();
        const result = await db.ancestors("alice").get();
        const ids = (result as any[]).map((r: any) => r.id);
        expect(ids).toEqual(["dad", "grandpa"]);
    });

    it("returns empty for root", async () => {
        const db = await seededDB();
        const result = await db.ancestors("grandpa").get();
        expect(result).toHaveLength(0);
    });
});

describe("pipeline: children", () => {
    it("returns children of a node", async () => {
        const db = await seededDB();
        const result = await db.children("dad").get();
        const ids = (result as any[]).map((r: any) => r.id);
        expect(ids).toEqual(expect.arrayContaining(["alice", "bob"]));
        expect(result).toHaveLength(2);
    });

    it("returns empty for leaf", async () => {
        const db = await seededDB();
        const result = await db.children("alice").get();
        expect(result).toHaveLength(0);
    });
});

describe("pipeline: parent", () => {
    it("returns parent of a single node", async () => {
        const db = await seededDB();
        const result = await db.parent("alice").get();
        expect((result as TreeItemOf<Person>).id).toBe("dad");
    });

    it("returns empty for root node", async () => {
        const db = await seededDB();
        const result = await db.parent("grandpa").get();
        expect(result).toBeUndefined();
    });
});

describe("pipeline: deepDescendants", () => {
    it("returns descendants in DFS order", async () => {
        const db = await seededDB();
        const result = await db.deepDescendants("grandpa").get();
        const ids = (result as any[]).map((r: any) => r.id);
        expect(ids).toEqual(["dad", "alice", "bob", "uncle", "charlie"]);
    });

    it("returns empty for leaf", async () => {
        const db = await seededDB();
        const result = await db.deepDescendants("alice").get();
        expect(result).toHaveLength(0);
    });
});

describe("pipeline: wideDescendants", () => {
    it("returns descendants in BFS order", async () => {
        const db = await seededDB();
        const result = await db.wideDescendants("grandpa").get();
        const ids = (result as any[]).map((r: any) => r.id);
        expect(ids).toEqual(["dad", "uncle", "alice", "bob", "charlie"]);
    });
});

describe("pipeline: siblings", () => {
    it("returns siblings excluding self", async () => {
        const db = await seededDB();
        const result = await db.siblings("alice").get();
        expect(result).toHaveLength(1);
        expect((result as any[])[0].id).toBe("bob");
    });

    it("returns siblings of a root (other roots)", async () => {
        const db = await seededDB();
        await db.add("other", { name: "Other", age: 40 }, null);
        const result = await db.siblings("grandpa").get();
        expect(result).toHaveLength(1);
        expect((result as any[])[0].id).toBe("other");
    });

    it("returns empty for only child", async () => {
        const db = await seededDB();
        const result = await db.siblings("charlie").get();
        expect(result).toHaveLength(0);
    });
});

// ============================================================
// Pipeline — where
// ============================================================

describe("pipeline: where", () => {
    it("filters by equality", async () => {
        const db = await seededDB();
        const result = await db.where(($) => [$("name"), "=", "Alice"]).get();
        expect(result).toHaveLength(1);
        expect((result as any[])[0].data.name).toBe("Alice");
    });

    it("filters by comparison", async () => {
        const db = await seededDB();
        const result = await db.where(($) => [$("age"), "<", 10]).get();
        expect(result).toHaveLength(2); // bob(8), charlie(7)
    });

    it("chains multiple where clauses", async () => {
        const db = await seededDB();
        const result = await db
            .where(($) => [$("age"), ">", 7])
            .where(($) => [$("age"), "<", 35])
            .get();
        expect(result).toHaveLength(3); // alice(10), bob(8), uncle(32)
    });

    it("filters by $.ID meta accessor", async () => {
        const db = await seededDB();
        const result = await db.where(($) => [$.ID, "=", "bob"]).get();
        expect(result).toHaveLength(1);
        expect((result as any[])[0].data.name).toBe("Bob");
    });

    it("filters by $.PARENT meta accessor", async () => {
        const db = await seededDB();
        const result = await db.where(($) => [$.PARENT, "=", "dad"]).get();
        expect(result).toHaveLength(2); // alice, bob
    });

    it("uses index acceleration", async () => {
        const db = await seededDB();
        db.addIndex(($) => $("name"));
        const result = await db.where(($) => [$("name"), "=", "Charlie"]).get();
        expect(result).toHaveLength(1);
        expect((result as any[])[0].id).toBe("charlie");
    });
});

// ============================================================
// Pipeline — sort, slice, paginate, window
// ============================================================

describe("pipeline: sort", () => {
    it("sorts ascending by data field", async () => {
        const db = await seededDB();
        const result = await db
            .deep()
            .sort(($) => $("age"), "asc")
            .get();
        const ages = (result as any[]).map((r: any) => r.data.age);
        expect(ages).toEqual([7, 8, 10, 32, 35, 60]);
    });

    it("sorts descending", async () => {
        const db = await seededDB();
        const result = await db
            .deep()
            .sort(($) => $("name"), "desc")
            .get();
        const names = (result as any[]).map((r: any) => r.data.name);
        expect(names).toEqual(["Uncle", "Grandpa", "Dad", "Charlie", "Bob", "Alice"]);
    });
});

describe("pipeline: slice / paginate / window", () => {
    it("slices results", async () => {
        const db = await seededDB();
        const result = await db
            .deep()
            .sort(($) => $("age"), "asc")
            .slice(1, 3)
            .get();
        expect(result).toHaveLength(2);
        expect((result as any[])[0].data.age).toBe(8);
        expect((result as any[])[1].data.age).toBe(10);
    });

    it("paginates results", async () => {
        const db = await seededDB();
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
        expect((page1 as any[])[0].data.age).toBe(7);
        expect((page2 as any[])[0].data.age).toBe(10);
    });

    it("windows results", async () => {
        const db = await seededDB();
        const result = await db
            .deep()
            .sort(($) => $("age"), "asc")
            .window(2, 2)
            .get();
        expect(result).toHaveLength(2);
        expect((result as any[])[0].data.age).toBe(10);
        expect((result as any[])[1].data.age).toBe(32);
    });
});

// ============================================================
// Pipeline — cardinality reducers
// ============================================================

describe("pipeline: first / last / at", () => {
    it("first returns first item", async () => {
        const db = await seededDB();
        const result = await db
            .deep()
            .sort(($) => $("age"), "asc")
            .first()
            .get();
        expect((result as any).data.age).toBe(7);
    });

    it("last returns last item", async () => {
        const db = await seededDB();
        const result = await db
            .deep()
            .sort(($) => $("age"), "asc")
            .last()
            .get();
        expect((result as any).data.age).toBe(60);
    });

    it("at returns item at index", async () => {
        const db = await seededDB();
        const result = await db
            .deep()
            .sort(($) => $("age"), "asc")
            .at(2)
            .get();
        expect((result as any).data.age).toBe(10);
    });

    it("first on empty returns undefined", async () => {
        const db = await seededDB();
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
        const db = await seededDB();
        expect(await db.deep().count()).toBe(6);
        expect(await db.where(($) => [$("age"), "<", 10]).count()).toBe(2);
    });

    it("exists returns true/false", async () => {
        const db = await seededDB();
        expect(await db.select("alice").exists()).toBe(true);
        expect(await db.select("missing").exists()).toBe(false);
        expect(await db.where(($) => [$("age"), ">", 100]).exists()).toBe(false);
    });

    it("id returns id(s)", async () => {
        const db = await seededDB();
        const singleId = await db.select("alice").id();
        expect(singleId).toBe("alice");

        const multiIds = await db
            .deep()
            .sort(($) => $("name"), "asc")
            .id();
        expect(multiIds).toEqual(["alice", "bob", "charlie", "dad", "grandpa", "uncle"]);
    });
});

// ============================================================
// Pipeline — write terminals
// ============================================================

describe("pipeline: update terminal", () => {
    it("updates matched nodes with updater function", async () => {
        const db = await seededDB();
        await db.where(($) => [$("age"), "<", 10]).update((prev) => ({ ...prev, age: prev.age + 100 }));
        expect(db.get("bob")?.data.age).toBe(108);
        expect(db.get("charlie")?.data.age).toBe(107);
        expect(db.get("alice")?.data.age).toBe(10); // unchanged
    });

    it("updates single select with static value", async () => {
        const db = await seededDB();
        await db.select("alice").update({ name: "Alice Updated", age: 99 });
        expect(db.get("alice")?.data.name).toBe("Alice Updated");
    });
});

describe("pipeline: pluck terminal", () => {
    it("plucks matched nodes", async () => {
        const db = await seededDB();
        await db.children("dad").pluck();
        expect(db.get("alice")).toBeUndefined();
        expect(db.get("bob")).toBeUndefined();
        expect(db.get("dad")?.children).toEqual([]);
    });
});

describe("pipeline: prune terminal", () => {
    it("prunes matched subtree", async () => {
        const db = await seededDB();
        await db.select("uncle").prune();
        expect(db.get("uncle")).toBeUndefined();
        expect(db.get("charlie")).toBeUndefined();
        expect(db.get("grandpa")?.children).toEqual(["dad"]);
    });
});

describe("pipeline: move terminal", () => {
    it("moves matched nodes to new parent", async () => {
        const db = await seededDB();
        await db.children("dad").move("uncle");
        expect(db.get("alice")?.parent).toBe("uncle");
        expect(db.get("bob")?.parent).toBe("uncle");
        expect(db.get("uncle")?.children).toContain("alice");
        expect(db.get("uncle")?.children).toContain("bob");
    });

    it("moves with callback", async () => {
        const db = await seededDB();
        await db.select("alice").move((item) => (item.parent === "dad" ? "uncle" : null));
        expect(db.get("alice")?.parent).toBe("uncle");
    });
});

// ============================================================
// Pipeline — traversal chaining
// ============================================================

describe("pipeline: traversal chaining", () => {
    it("select then children", async () => {
        const db = await seededDB();
        const result = await db.select("grandpa").children().get();
        const ids = (result as any[]).map((r: any) => r.id);
        expect(ids).toEqual(expect.arrayContaining(["dad", "uncle"]));
        expect(result).toHaveLength(2);
    });

    it("select then deepDescendants", async () => {
        const db = await seededDB();
        const result = await db.select("dad").deepDescendants().get();
        const ids = (result as any[]).map((r: any) => r.id);
        expect(ids).toEqual(["alice", "bob"]);
    });

    it("select then ancestors", async () => {
        const db = await seededDB();
        const result = await db.select("alice").ancestors().get();
        const ids = (result as any[]).map((r: any) => r.id);
        expect(ids).toEqual(["dad", "grandpa"]);
    });

    it("select then parent", async () => {
        const db = await seededDB();
        const result = await db.select("alice").parent().get();
        expect(result).toHaveLength(1);
        expect((result as any[])[0].id).toBe("dad");
    });

    it("select then siblings", async () => {
        const db = await seededDB();
        const result = await db.select("alice").siblings().get();
        expect(result).toHaveLength(1);
        expect((result as any[])[0].id).toBe("bob");
    });

    it("chains traversal then where", async () => {
        const db = await seededDB();
        const result = await db
            .select("grandpa")
            .deepDescendants()
            .where(($) => [$("age"), "<", 10])
            .get();
        const ids = (result as any[]).map((r: any) => r.id);
        expect(ids).toEqual(expect.arrayContaining(["bob"]));
    });

    it("chains traversal then sort", async () => {
        const db = await seededDB();
        const result = await db
            .children("grandpa")
            .sort(($) => $("age"), "asc")
            .get();
        const names = (result as any[]).map((r: any) => r.data.name);
        expect(names).toEqual(["Uncle", "Dad"]);
    });
});

// ============================================================
// Pipeline — distinct
// ============================================================

describe("pipeline: distinct", () => {
    it("deduplicates nodes", async () => {
        const db = await seededDB();
        const result = await db.deep().distinct().get();
        expect(result).toHaveLength(6);
    });
});
