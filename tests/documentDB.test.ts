import { describe, it, expect } from "vitest";
import { DocumentDB, DocumentOf } from "../src/db/documentDB";
import { MemoryCodec } from "../src/codec/memoryCodec";
import { IndexStore } from "../src/util/indices";

type User = { name: string; age: number };

function makeDB() {
    const codec = new MemoryCodec<DocumentOf<User>>();
    return new DocumentDB<User>(codec);
}

/** Reach into TS-private `indices` field for test assertions */
function idx(db: DocumentDB<any>): IndexStore {
    return (db as any).indices;
}

// ============================================================
// get
// ============================================================

describe("get", () => {
    it("returns undefined for missing id", () => {
        const db = makeDB();
        expect(db.get("missing")).toBeUndefined();
    });

    it("returns a single record by id", async () => {
        const db = makeDB();
        await db.insert("a", { name: "Alice", age: 30 });
        const result = db.get("a");
        expect(result).toEqual({ id: "a", data: { name: "Alice", age: 30 } });
    });

    it("returns multiple records by id list", async () => {
        const db = makeDB();
        await db.insert({ a: { name: "Alice", age: 30 }, b: { name: "Bob", age: 25 } });
        const result = db.get(["a", "b"]);
        expect(result).toHaveLength(2);
        expect(result.map((r) => r.id)).toContain("a");
        expect(result.map((r) => r.id)).toContain("b");
    });

    it("skips missing ids in list", async () => {
        const db = makeDB();
        await db.insert("a", { name: "Alice", age: 30 });
        const result = db.get(["a", "missing"]);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("a");
    });

    it("accepts a Set of ids", async () => {
        const db = makeDB();
        await db.insert({ a: { name: "Alice", age: 30 }, b: { name: "Bob", age: 25 } });
        const result = db.get(new Set(["a", "b"]));
        expect(result).toHaveLength(2);
    });
});

// ============================================================
// insert
// ============================================================

describe("insert", () => {
    it("inserts a single record", async () => {
        const db = makeDB();
        await db.insert("a", { name: "Alice", age: 30 });
        expect(db.get("a")?.data.name).toBe("Alice");
    });

    it("inserts a batch of records", async () => {
        const db = makeDB();
        await db.insert({
            a: { name: "Alice", age: 30 },
            b: { name: "Bob", age: 25 },
            c: { name: "Charlie", age: 35 },
        });
        expect(db.get("a")).toBeDefined();
        expect(db.get("b")).toBeDefined();
        expect(db.get("c")).toBeDefined();
    });

    it("overwrites existing record on same id", async () => {
        const db = makeDB();
        await db.insert("a", { name: "Alice", age: 30 });
        await db.insert("a", { name: "Alice Updated", age: 31 });
        expect(db.get("a")?.data.name).toBe("Alice Updated");
    });
});

// ============================================================
// remove
// ============================================================

describe("remove", () => {
    it("removes a single record", async () => {
        const db = makeDB();
        await db.insert("a", { name: "Alice", age: 30 });
        await db.remove("a");
        expect(db.get("a")).toBeUndefined();
    });

    it("removes multiple records by list", async () => {
        const db = makeDB();
        await db.insert({ a: { name: "Alice", age: 30 }, b: { name: "Bob", age: 25 }, c: { name: "Charlie", age: 35 } });
        await db.remove(["a", "b"]);
        expect(db.get("a")).toBeUndefined();
        expect(db.get("b")).toBeUndefined();
        expect(db.get("c")).toBeDefined();
    });

    it("no-ops for missing ids", async () => {
        const db = makeDB();
        await db.insert("a", { name: "Alice", age: 30 });
        await db.remove("missing");
        expect(db.get("a")).toBeDefined();
    });

    it("accepts a Set of ids", async () => {
        const db = makeDB();
        await db.insert({ a: { name: "Alice", age: 30 }, b: { name: "Bob", age: 25 } });
        await db.remove(new Set(["a", "b"]));
        expect(db.get("a")).toBeUndefined();
        expect(db.get("b")).toBeUndefined();
    });
});

// ============================================================
// update
// ============================================================

describe("update", () => {
    it("updates a single record with static data", async () => {
        const db = makeDB();
        await db.insert("a", { name: "Alice", age: 30 });
        await db.update("a", { name: "Alice", age: 31 });
        expect(db.get("a")?.data.age).toBe(31);
    });

    it("updates a single record with updater function", async () => {
        const db = makeDB();
        await db.insert("a", { name: "Alice", age: 30 });
        await db.update("a", (prev) => ({ ...prev, age: prev.age + 1 }));
        expect(db.get("a")?.data.age).toBe(31);
    });

    it("passes meta to updater function", async () => {
        const db = makeDB();
        await db.insert("a", { name: "Alice", age: 30 });
        await db.update("a", (prev, meta) => ({ ...prev, name: `${prev.name}-${meta.id}` }));
        expect(db.get("a")?.data.name).toBe("Alice-a");
    });

    it("updates a batch via payload object", async () => {
        const db = makeDB();
        await db.insert({ a: { name: "Alice", age: 30 }, b: { name: "Bob", age: 25 } });
        await db.update({ a: { name: "Alice", age: 99 }, b: { name: "Bob", age: 99 } });
        expect(db.get("a")?.data.age).toBe(99);
        expect(db.get("b")?.data.age).toBe(99);
    });

    it("updates multiple ids with shared updater", async () => {
        const db = makeDB();
        await db.insert({ a: { name: "Alice", age: 30 }, b: { name: "Bob", age: 25 } });
        await db.update(["a", "b"], (prev) => ({ ...prev, age: prev.age + 10 }));
        expect(db.get("a")?.data.age).toBe(40);
        expect(db.get("b")?.data.age).toBe(35);
    });

    it("accepts a Set of ids with updater", async () => {
        const db = makeDB();
        await db.insert({ a: { name: "Alice", age: 30 }, b: { name: "Bob", age: 25 } });
        await db.update(new Set(["a", "b"]), (prev) => ({ ...prev, age: 0 }));
        expect(db.get("a")?.data.age).toBe(0);
        expect(db.get("b")?.data.age).toBe(0);
    });

    it("no-ops for missing ids", async () => {
        const db = makeDB();
        await db.insert("a", { name: "Alice", age: 30 });
        await db.update("missing", { name: "Ghost", age: 0 });
        expect(db.get("missing")).toBeUndefined();
        expect(db.get("a")?.data.age).toBe(30);
    });

    it("updates indices on value change", async () => {
        const db = makeDB();
        db.addIndex(($) => $("age"));
        await db.insert("a", { name: "Alice", age: 30 });
        expect(idx(db).eq("age", 30)).toEqual(new Set(["a"]));

        await db.update("a", { name: "Alice", age: 31 });
        expect(idx(db).eq("age", 30)).toEqual(new Set());
        expect(idx(db).eq("age", 31)).toEqual(new Set(["a"]));
    });

    it("calls codec.update", async () => {
        const codec = new MemoryCodec<DocumentOf<User>>();
        let updateCalled = false;
        codec.update = async (items) => {
            updateCalled = true;
            expect(items).toHaveLength(1);
            expect(items[0].data.age).toBe(31);
        };
        const db = new DocumentDB<User>(codec);
        await db.insert("a", { name: "Alice", age: 30 });
        await db.update("a", { name: "Alice", age: 31 });
        expect(updateCalled).toBe(true);
    });

    it("does not call codec.update when nothing is updated", async () => {
        const codec = new MemoryCodec<DocumentOf<User>>();
        let updateCalled = false;
        codec.update = async () => {
            updateCalled = true;
        };
        const db = new DocumentDB<User>(codec);
        await db.update("missing", { name: "Ghost", age: 0 });
        expect(updateCalled).toBe(false);
    });
});

// ============================================================
// addIndex / dropIndex
// ============================================================

describe("addIndex / dropIndex", () => {
    it("creates an index and backfills from existing data", async () => {
        const db = makeDB();
        await db.insert({ a: { name: "Alice", age: 30 }, b: { name: "Bob", age: 25 } });
        db.addIndex(($) => $("name"));
        expect(idx(db).eq("name", "Alice")).toEqual(new Set(["a"]));
        expect(idx(db).eq("name", "Bob")).toEqual(new Set(["b"]));
    });

    it("drops an index", async () => {
        const db = makeDB();
        db.addIndex(($) => $("name"));
        await db.insert("a", { name: "Alice", age: 30 });
        expect(idx(db).eq("name", "Alice")).toEqual(new Set(["a"]));
        db.dropIndex(($) => $("name"));
        expect(idx(db).eq("name", "Alice")).toEqual(new Set());
    });

    it("ignores duplicate addIndex", async () => {
        const db = makeDB();
        db.addIndex(($) => $("name"));
        await db.insert("a", { name: "Alice", age: 30 });
        db.addIndex(($) => $("name")); // should not clear existing index data
        expect(idx(db).eq("name", "Alice")).toEqual(new Set(["a"]));
    });
});

// ============================================================
// Index maintenance
// ============================================================

describe("index maintenance", () => {
    it("indexes values on insert", async () => {
        const db = makeDB();
        db.addIndex(($) => $("age"));
        await db.insert("a", { name: "Alice", age: 30 });
        await db.insert("b", { name: "Bob", age: 25 });
        await db.insert("c", { name: "Charlie", age: 30 });

        expect(idx(db).eq("age", 30)).toEqual(new Set(["a", "c"]));
        expect(idx(db).eq("age", 25)).toEqual(new Set(["b"]));
    });

    it("deindexes values on remove", async () => {
        const db = makeDB();
        db.addIndex(($) => $("name"));
        await db.insert("a", { name: "Alice", age: 30 });
        await db.insert("b", { name: "Bob", age: 25 });
        await db.remove("a");

        expect(idx(db).eq("name", "Alice")).toEqual(new Set());
        expect(idx(db).eq("name", "Bob")).toEqual(new Set(["b"]));
    });

    it("handles nested path indices", async () => {
        type WithAddress = { name: string; address: { city: string; zip: string } };
        const codec = new MemoryCodec<DocumentOf<WithAddress>>();
        const db = new DocumentDB<WithAddress>(codec);
        db.addIndex(($) => $("address")("city"));

        await db.insert("a", { name: "Alice", address: { city: "NYC", zip: "10001" } });
        await db.insert("b", { name: "Bob", address: { city: "LA", zip: "90001" } });

        expect(idx(db).eq("address.city", "NYC")).toEqual(new Set(["a"]));
        expect(idx(db).eq("address.city", "LA")).toEqual(new Set(["b"]));

        await db.remove("a");
        expect(idx(db).eq("address.city", "NYC")).toEqual(new Set());
        expect(idx(db).eq("address.city", "LA")).toEqual(new Set(["b"]));
    });

    it("handles multiple indices simultaneously", async () => {
        const db = makeDB();
        db.addIndex(($) => $("name"));
        db.addIndex(($) => $("age"));

        await db.insert("a", { name: "Alice", age: 30 });
        await db.insert("b", { name: "Bob", age: 25 });

        expect(idx(db).eq("name", "Alice")).toEqual(new Set(["a"]));
        expect(idx(db).eq("age", 30)).toEqual(new Set(["a"]));

        await db.remove("a");
        expect(idx(db).eq("name", "Alice")).toEqual(new Set());
        expect(idx(db).eq("age", 30)).toEqual(new Set());
        expect(idx(db).eq("name", "Bob")).toEqual(new Set(["b"]));
        expect(idx(db).eq("age", 25)).toEqual(new Set(["b"]));
    });
});

// ============================================================
// Codec notifications
// ============================================================

describe("codec notifications", () => {
    it("calls codec.insert on insert", async () => {
        const codec = new MemoryCodec<DocumentOf<User>>();
        let insertCalled = false;
        codec.insert = async (items) => {
            insertCalled = true;
            expect(items).toHaveLength(1);
            expect(items[0].data.name).toBe("Alice");
        };
        const db = new DocumentDB<User>(codec);
        await db.insert("a", { name: "Alice", age: 30 });
        expect(insertCalled).toBe(true);
    });

    it("calls codec.delete on remove", async () => {
        const codec = new MemoryCodec<DocumentOf<User>>();
        let deleteCalled = false;
        codec.delete = async (items) => {
            deleteCalled = true;
            expect(items).toHaveLength(1);
            expect(items[0].id).toBe("a");
        };
        const db = new DocumentDB<User>(codec);
        await db.insert("a", { name: "Alice", age: 30 });
        await db.remove("a");
        expect(deleteCalled).toBe(true);
    });

    it("does not call codec.delete when nothing is removed", async () => {
        const codec = new MemoryCodec<DocumentOf<User>>();
        let deleteCalled = false;
        codec.delete = async () => {
            deleteCalled = true;
        };
        const db = new DocumentDB<User>(codec);
        await db.remove("missing");
        expect(deleteCalled).toBe(false);
    });
});

// ============================================================
// Pipeline — chain starters
// ============================================================

async function seededDB() {
    const db = makeDB();
    await db.insert({
        a: { name: "Alice", age: 30 },
        b: { name: "Bob", age: 25 },
        c: { name: "Charlie", age: 35 },
        d: { name: "Diana", age: 28 },
    });
    return db;
}

describe("pipeline: select", () => {
    it("selects a single record", async () => {
        const db = await seededDB();
        const result = await db.select("a").get();
        expect(result).toEqual({ id: "a", data: { name: "Alice", age: 30 } });
    });

    it("returns undefined for missing single select", async () => {
        const db = await seededDB();
        const result = await db.select("missing").get();
        expect(result).toBeUndefined();
    });

    it("selects multiple records", async () => {
        const db = await seededDB();
        const result = await db.select(["a", "c"]).get();
        expect(result).toHaveLength(2);
        expect((result as any[]).map((r: any) => r.id)).toEqual(expect.arrayContaining(["a", "c"]));
    });
});

describe("pipeline: all", () => {
    it("returns all records", async () => {
        const db = await seededDB();
        const result = await db.all().get();
        expect(result).toHaveLength(4);
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
        const result = await db.where(($) => [$("age"), ">", 28]).get();
        expect(result).toHaveLength(2); // Alice(30), Charlie(35)
    });

    it("chains multiple where clauses", async () => {
        const db = await seededDB();
        const result = await db
            .where(($) => [$("age"), ">", 25])
            .where(($) => [$("age"), "<", 35])
            .get();
        expect(result).toHaveLength(2); // Alice(30), Diana(28)
    });

    it("filters by $.ID meta accessor", async () => {
        const db = await seededDB();
        const result = await db.where(($) => [$.ID, "=", "b"]).get();
        expect(result).toHaveLength(1);
        expect((result as any[])[0].data.name).toBe("Bob");
    });

    it("supports unary truthiness operator", async () => {
        const db = await seededDB();
        const result = await db.where(($) => [$("name"), "?"]).get();
        expect(result).toHaveLength(4); // all names are truthy
    });

    it("uses index acceleration for equality", async () => {
        const db = await seededDB();
        db.addIndex(($) => $("name"));
        const result = await db.where(($) => [$("name"), "=", "Bob"]).get();
        expect(result).toHaveLength(1);
        expect((result as any[])[0].id).toBe("b");
    });

    it("uses index acceleration for range", async () => {
        const db = await seededDB();
        db.addIndex(($) => $("age"));
        const result = await db.where(($) => [$("age"), ">", 28]).get();
        expect(result).toHaveLength(2); // Alice(30), Charlie(35)
    });
});

// ============================================================
// Pipeline — sort, slice, paginate, window
// ============================================================

describe("pipeline: sort", () => {
    it("sorts ascending", async () => {
        const db = await seededDB();
        const result = await db
            .all()
            .sort(($) => $("age"), "asc")
            .get();
        const ages = (result as any[]).map((r: any) => r.data.age);
        expect(ages).toEqual([25, 28, 30, 35]);
    });

    it("sorts descending", async () => {
        const db = await seededDB();
        const result = await db
            .all()
            .sort(($) => $("age"), "desc")
            .get();
        const ages = (result as any[]).map((r: any) => r.data.age);
        expect(ages).toEqual([35, 30, 28, 25]);
    });

    it("sorts by string field", async () => {
        const db = await seededDB();
        const result = await db
            .all()
            .sort(($) => $("name"), "asc")
            .get();
        const names = (result as any[]).map((r: any) => r.data.name);
        expect(names).toEqual(["Alice", "Bob", "Charlie", "Diana"]);
    });

    it("sorts by $.ID", async () => {
        const db = await seededDB();
        const result = await db
            .all()
            .sort(($) => $.ID, "desc")
            .get();
        const ids = (result as any[]).map((r: any) => r.id);
        expect(ids).toEqual(["d", "c", "b", "a"]);
    });
});

describe("pipeline: slice / paginate / window", () => {
    it("slices results", async () => {
        const db = await seededDB();
        const result = await db
            .all()
            .sort(($) => $("age"), "asc")
            .slice(1, 3)
            .get();
        expect(result).toHaveLength(2);
        expect((result as any[])[0].data.age).toBe(28);
        expect((result as any[])[1].data.age).toBe(30);
    });

    it("paginates results", async () => {
        const db = await seededDB();
        const page1 = await db
            .all()
            .sort(($) => $("age"), "asc")
            .paginate(1, 2)
            .get();
        const page2 = await db
            .all()
            .sort(($) => $("age"), "asc")
            .paginate(2, 2)
            .get();
        expect(page1).toHaveLength(2);
        expect(page2).toHaveLength(2);
        expect((page1 as any[])[0].data.age).toBe(25);
        expect((page2 as any[])[0].data.age).toBe(30);
    });

    it("windows results", async () => {
        const db = await seededDB();
        const result = await db
            .all()
            .sort(($) => $("age"), "asc")
            .window(1, 2)
            .get();
        expect(result).toHaveLength(2);
        expect((result as any[])[0].data.age).toBe(28);
    });
});

// ============================================================
// Pipeline — cardinality reducers
// ============================================================

describe("pipeline: first / last / at", () => {
    it("first returns first item", async () => {
        const db = await seededDB();
        const result = await db
            .all()
            .sort(($) => $("age"), "asc")
            .first()
            .get();
        expect((result as any).data.age).toBe(25);
    });

    it("last returns last item", async () => {
        const db = await seededDB();
        const result = await db
            .all()
            .sort(($) => $("age"), "asc")
            .last()
            .get();
        expect((result as any).data.age).toBe(35);
    });

    it("at returns item at index", async () => {
        const db = await seededDB();
        const result = await db
            .all()
            .sort(($) => $("age"), "asc")
            .at(2)
            .get();
        expect((result as any).data.age).toBe(30);
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
        expect(await db.all().count()).toBe(4);
        expect(await db.where(($) => [$("age"), ">", 28]).count()).toBe(2);
    });

    it("exists returns true/false", async () => {
        const db = await seededDB();
        expect(await db.select("a").exists()).toBe(true);
        expect(await db.select("missing").exists()).toBe(false);
        expect(await db.where(($) => [$("age"), ">", 100]).exists()).toBe(false);
    });

    it("id returns id(s)", async () => {
        const db = await seededDB();
        const singleId = await db.select("a").id();
        expect(singleId).toBe("a");

        const multiIds = await db
            .all()
            .sort(($) => $("name"), "asc")
            .id();
        expect(multiIds).toEqual(["a", "b", "c", "d"]);
    });

    it("id returns undefined for missing single select", async () => {
        const db = await seededDB();
        const result = await db.select("missing").id();
        expect(result).toBeUndefined();
    });
});

// ============================================================
// Pipeline — write terminals
// ============================================================

describe("pipeline: update terminal", () => {
    it("updates matched records with static value", async () => {
        const db = await seededDB();
        await db.where(($) => [$("name"), "=", "Alice"]).update({ name: "Alice Updated", age: 99 });
        expect(db.get("a")?.data.name).toBe("Alice Updated");
        expect(db.get("a")?.data.age).toBe(99);
    });

    it("updates matched records with updater function", async () => {
        const db = await seededDB();
        await db.where(($) => [$("age"), ">", 28]).update((prev) => ({ ...prev, age: prev.age + 100 }));
        expect(db.get("a")?.data.age).toBe(130); // 30 + 100
        expect(db.get("c")?.data.age).toBe(135); // 35 + 100
        expect(db.get("b")?.data.age).toBe(25); // unchanged
    });

    it("updates single select with updater", async () => {
        const db = await seededDB();
        await db.select("b").update((prev) => ({ ...prev, age: 0 }));
        expect(db.get("b")?.data.age).toBe(0);
    });
});

describe("pipeline: remove terminal", () => {
    it("removes matched records", async () => {
        const db = await seededDB();
        await db.where(($) => [$("age"), "<", 29]).remove();
        expect(db.get("b")).toBeUndefined(); // age 25
        expect(db.get("d")).toBeUndefined(); // age 28
        expect(db.get("a")).toBeDefined(); // age 30
        expect(db.get("c")).toBeDefined(); // age 35
    });

    it("removes single select", async () => {
        const db = await seededDB();
        await db.select("a").remove();
        expect(db.get("a")).toBeUndefined();
        expect(await db.all().count()).toBe(3);
    });
});

// ============================================================
// Pipeline — distinct
// ============================================================

describe("pipeline: distinct", () => {
    it("deduplicates by id", async () => {
        const db = await seededDB();
        const result = await db.all().distinct().get();
        expect(result).toHaveLength(4);
    });
});
