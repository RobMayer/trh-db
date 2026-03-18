import { describe, it, expect } from "vitest";
import { DocumentDB, DocumentOf } from "../src/db/documentDB";
import { MemoryCodec } from "../src/codec/memoryCodec";
import { IndexStore } from "../src/util/indices";

type User = { name: string; age: number };

function makeDB() {
    return new DocumentDB<User>(new MemoryCodec());
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
        const a = await db.insert({ name: "Alice", age: 30 });
        const result = db.get(a.id);
        expect(result).toEqual({ id: a.id, type: "document", data: { name: "Alice", age: 30 } });
    });

    it("returns multiple records by id list", async () => {
        const db = makeDB();
        const [a, b] = await db.insert([{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }]);
        const result = db.get([a.id, b.id]);
        expect(result).toHaveLength(2);
        expect(result.map((r) => r.id)).toContain(a.id);
        expect(result.map((r) => r.id)).toContain(b.id);
    });

    it("skips missing ids in list", async () => {
        const db = makeDB();
        const a = await db.insert({ name: "Alice", age: 30 });
        const result = db.get([a.id, "missing"]);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(a.id);
    });

    it("accepts a Set of ids", async () => {
        const db = makeDB();
        const [a, b] = await db.insert([{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }]);
        const result = db.get(new Set([a.id, b.id]));
        expect(result).toHaveLength(2);
    });
});

// ============================================================
// insert
// ============================================================

describe("insert", () => {
    it("inserts a single record and returns it with a generated id", async () => {
        const db = makeDB();
        const result = await db.insert({ name: "Alice", age: 30 });
        expect(result.id).toBeDefined();
        expect(result.data.name).toBe("Alice");
        expect(db.get(result.id)?.data.name).toBe("Alice");
    });

    it("inserts a batch of records and returns them", async () => {
        const db = makeDB();
        const results = await db.insert([
            { name: "Alice", age: 30 },
            { name: "Bob", age: 25 },
            { name: "Charlie", age: 35 },
        ]);
        expect(results).toHaveLength(3);
        for (const r of results) {
            expect(r.id).toBeDefined();
            expect(db.get(r.id)).toBeDefined();
        }
    });

    it("generates unique ids for each record", async () => {
        const db = makeDB();
        const results = await db.insert([
            { name: "Alice", age: 30 },
            { name: "Bob", age: 25 },
        ]);
        expect(results[0].id).not.toBe(results[1].id);
    });
});

// ============================================================
// remove
// ============================================================

describe("remove", () => {
    it("removes a single record and returns it", async () => {
        const db = makeDB();
        const a = await db.insert({ name: "Alice", age: 30 });
        const removed = await db.remove(a.id);
        expect(removed?.id).toBe(a.id);
        expect(db.get(a.id)).toBeUndefined();
    });

    it("removes multiple records by list", async () => {
        const db = makeDB();
        const [a, b, c] = await db.insert([{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }, { name: "Charlie", age: 35 }]);
        const removed = await db.remove([a.id, b.id]);
        expect(removed).toHaveLength(2);
        expect(db.get(a.id)).toBeUndefined();
        expect(db.get(b.id)).toBeUndefined();
        expect(db.get(c.id)).toBeDefined();
    });

    it("returns undefined for missing id", async () => {
        const db = makeDB();
        const a = await db.insert({ name: "Alice", age: 30 });
        const removed = await db.remove("missing");
        expect(removed).toBeUndefined();
        expect(db.get(a.id)).toBeDefined();
    });

    it("accepts a Set of ids", async () => {
        const db = makeDB();
        const [a, b] = await db.insert([{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }]);
        await db.remove(new Set([a.id, b.id]));
        expect(db.get(a.id)).toBeUndefined();
        expect(db.get(b.id)).toBeUndefined();
    });
});

// ============================================================
// update
// ============================================================

describe("update", () => {
    it("updates a single record with static data and returns it", async () => {
        const db = makeDB();
        const a = await db.insert({ name: "Alice", age: 30 });
        const updated = await db.update(a.id, { name: "Alice", age: 31 });
        expect(updated?.data.age).toBe(31);
        expect(db.get(a.id)?.data.age).toBe(31);
    });

    it("updates a single record with updater function", async () => {
        const db = makeDB();
        const a = await db.insert({ name: "Alice", age: 30 });
        await db.update(a.id, (prev) => ({ ...prev, age: prev.age + 1 }));
        expect(db.get(a.id)?.data.age).toBe(31);
    });

    it("passes meta to updater function", async () => {
        const db = makeDB();
        const a = await db.insert({ name: "Alice", age: 30 });
        await db.update(a.id, (prev, meta) => ({ ...prev, name: `${prev.name}-${meta.id}` }));
        expect(db.get(a.id)?.data.name).toBe(`Alice-${a.id}`);
    });

    it("updates a batch via payload object", async () => {
        const db = makeDB();
        const [a, b] = await db.insert([{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }]);
        const updated = await db.update({ [a.id]: { name: "Alice", age: 99 }, [b.id]: { name: "Bob", age: 99 } });
        expect(updated).toHaveLength(2);
        expect(db.get(a.id)?.data.age).toBe(99);
        expect(db.get(b.id)?.data.age).toBe(99);
    });

    it("updates multiple ids with shared updater", async () => {
        const db = makeDB();
        const [a, b] = await db.insert([{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }]);
        await db.update([a.id, b.id], (prev) => ({ ...prev, age: prev.age + 10 }));
        expect(db.get(a.id)?.data.age).toBe(40);
        expect(db.get(b.id)?.data.age).toBe(35);
    });

    it("accepts a Set of ids with updater", async () => {
        const db = makeDB();
        const [a, b] = await db.insert([{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }]);
        await db.update(new Set([a.id, b.id]), (prev) => ({ ...prev, age: 0 }));
        expect(db.get(a.id)?.data.age).toBe(0);
        expect(db.get(b.id)?.data.age).toBe(0);
    });

    it("returns undefined for missing id", async () => {
        const db = makeDB();
        const a = await db.insert({ name: "Alice", age: 30 });
        const result = await db.update("missing", { name: "Ghost", age: 0 });
        expect(result).toBeUndefined();
        expect(db.get(a.id)?.data.age).toBe(30);
    });

    it("updates indices on value change", async () => {
        const db = makeDB();
        db.addIndex(($) => $("age"));
        const a = await db.insert({ name: "Alice", age: 30 });
        expect(idx(db).eq("age", 30)).toEqual(new Set([a.id]));

        await db.update(a.id, { name: "Alice", age: 31 });
        expect(idx(db).eq("age", 30)).toEqual(new Set());
        expect(idx(db).eq("age", 31)).toEqual(new Set([a.id]));
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
        const a = await db.insert({ name: "Alice", age: 30 });
        await db.update(a.id, { name: "Alice", age: 31 });
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
        const [a, b] = await db.insert([{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }]);
        db.addIndex(($) => $("name"));
        expect(idx(db).eq("name", "Alice")).toEqual(new Set([a.id]));
        expect(idx(db).eq("name", "Bob")).toEqual(new Set([b.id]));
    });

    it("drops an index", async () => {
        const db = makeDB();
        db.addIndex(($) => $("name"));
        const a = await db.insert({ name: "Alice", age: 30 });
        expect(idx(db).eq("name", "Alice")).toEqual(new Set([a.id]));
        db.dropIndex(($) => $("name"));
        expect(idx(db).eq("name", "Alice")).toEqual(new Set());
    });

    it("ignores duplicate addIndex", async () => {
        const db = makeDB();
        db.addIndex(($) => $("name"));
        const a = await db.insert({ name: "Alice", age: 30 });
        db.addIndex(($) => $("name")); // should not clear existing index data
        expect(idx(db).eq("name", "Alice")).toEqual(new Set([a.id]));
    });
});

// ============================================================
// Index maintenance
// ============================================================

describe("index maintenance", () => {
    it("indexes values on insert", async () => {
        const db = makeDB();
        db.addIndex(($) => $("age"));
        const a = await db.insert({ name: "Alice", age: 30 });
        const b = await db.insert({ name: "Bob", age: 25 });
        const c = await db.insert({ name: "Charlie", age: 30 });

        expect(idx(db).eq("age", 30)).toEqual(new Set([a.id, c.id]));
        expect(idx(db).eq("age", 25)).toEqual(new Set([b.id]));
    });

    it("deindexes values on remove", async () => {
        const db = makeDB();
        db.addIndex(($) => $("name"));
        const a = await db.insert({ name: "Alice", age: 30 });
        const b = await db.insert({ name: "Bob", age: 25 });
        await db.remove(a.id);

        expect(idx(db).eq("name", "Alice")).toEqual(new Set());
        expect(idx(db).eq("name", "Bob")).toEqual(new Set([b.id]));
    });

    it("handles nested path indices", async () => {
        type WithAddress = { name: string; address: { city: string; zip: string } };
        const codec = new MemoryCodec<DocumentOf<WithAddress>>();
        const db = new DocumentDB<WithAddress>(codec);
        db.addIndex(($) => $("address")("city"));

        const a = await db.insert({ name: "Alice", address: { city: "NYC", zip: "10001" } });
        const b = await db.insert({ name: "Bob", address: { city: "LA", zip: "90001" } });

        expect(idx(db).eq("address.city", "NYC")).toEqual(new Set([a.id]));
        expect(idx(db).eq("address.city", "LA")).toEqual(new Set([b.id]));

        await db.remove(a.id);
        expect(idx(db).eq("address.city", "NYC")).toEqual(new Set());
        expect(idx(db).eq("address.city", "LA")).toEqual(new Set([b.id]));
    });

    it("handles multiple indices simultaneously", async () => {
        const db = makeDB();
        db.addIndex(($) => $("name"));
        db.addIndex(($) => $("age"));

        const a = await db.insert({ name: "Alice", age: 30 });
        const b = await db.insert({ name: "Bob", age: 25 });

        expect(idx(db).eq("name", "Alice")).toEqual(new Set([a.id]));
        expect(idx(db).eq("age", 30)).toEqual(new Set([a.id]));

        await db.remove(a.id);
        expect(idx(db).eq("name", "Alice")).toEqual(new Set());
        expect(idx(db).eq("age", 30)).toEqual(new Set());
        expect(idx(db).eq("name", "Bob")).toEqual(new Set([b.id]));
        expect(idx(db).eq("age", 25)).toEqual(new Set([b.id]));
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
        await db.insert({ name: "Alice", age: 30 });
        expect(insertCalled).toBe(true);
    });

    it("calls codec.delete on remove", async () => {
        const codec = new MemoryCodec<DocumentOf<User>>();
        let deleteCalled = false;
        let insertedId: string;
        codec.delete = async (items) => {
            deleteCalled = true;
            expect(items).toHaveLength(1);
            expect(items[0].id).toBe(insertedId);
        };
        const db = new DocumentDB<User>(codec);
        const a = await db.insert({ name: "Alice", age: 30 });
        insertedId = a.id;
        await db.remove(a.id);
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

type SeededDB = { db: DocumentDB<User>; alice: DocumentOf<User>; bob: DocumentOf<User>; charlie: DocumentOf<User>; diana: DocumentOf<User> };

async function seededDB(): Promise<SeededDB> {
    const db = makeDB();
    const [alice, bob, charlie, diana] = await db.insert([
        { name: "Alice", age: 30 },
        { name: "Bob", age: 25 },
        { name: "Charlie", age: 35 },
        { name: "Diana", age: 28 },
    ]);
    return { db, alice, bob, charlie, diana };
}

describe("pipeline: select", () => {
    it("selects a single record", async () => {
        const { db, alice } = await seededDB();
        const result = await db.select(alice.id).get();
        expect(result).toEqual({ id: alice.id, type: "document", data: { name: "Alice", age: 30 } });
    });

    it("returns undefined for missing single select", async () => {
        const { db } = await seededDB();
        const result = await db.select("missing").get();
        expect(result).toBeUndefined();
    });

    it("selects multiple records", async () => {
        const { db, alice, charlie } = await seededDB();
        const result = await db.select([alice.id, charlie.id]).get();
        expect(result).toHaveLength(2);
        expect((result as any[]).map((r: any) => r.id)).toEqual(expect.arrayContaining([alice.id, charlie.id]));
    });
});

describe("pipeline: all", () => {
    it("returns all records", async () => {
        const { db } = await seededDB();
        const result = await db.all().get();
        expect(result).toHaveLength(4);
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
        expect((result as any[])[0].data.name).toBe("Alice");
    });

    it("filters by comparison", async () => {
        const { db } = await seededDB();
        const result = await db.where(($) => [$("age"), ">", 28]).get();
        expect(result).toHaveLength(2); // Alice(30), Charlie(35)
    });

    it("chains multiple where clauses", async () => {
        const { db } = await seededDB();
        const result = await db
            .where(($) => [$("age"), ">", 25])
            .where(($) => [$("age"), "<", 35])
            .get();
        expect(result).toHaveLength(2); // Alice(30), Diana(28)
    });

    it("filters by $.ID meta accessor", async () => {
        const { db, bob } = await seededDB();
        const result = await db.where(($) => [$.ID, "=", bob.id]).get();
        expect(result).toHaveLength(1);
        expect((result as any[])[0].data.name).toBe("Bob");
    });

    it("supports unary truthiness operator", async () => {
        const { db } = await seededDB();
        const result = await db.where(($) => [$("name"), "?"]).get();
        expect(result).toHaveLength(4); // all names are truthy
    });

    it("uses index acceleration for equality", async () => {
        const { db, bob } = await seededDB();
        db.addIndex(($) => $("name"));
        const result = await db.where(($) => [$("name"), "=", "Bob"]).get();
        expect(result).toHaveLength(1);
        expect((result as any[])[0].id).toBe(bob.id);
    });

    it("uses index acceleration for range", async () => {
        const { db } = await seededDB();
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
        const { db } = await seededDB();
        const result = await db
            .all()
            .sort(($) => $("age"), "asc")
            .get();
        const ages = (result as any[]).map((r: any) => r.data.age);
        expect(ages).toEqual([25, 28, 30, 35]);
    });

    it("sorts descending", async () => {
        const { db } = await seededDB();
        const result = await db
            .all()
            .sort(($) => $("age"), "desc")
            .get();
        const ages = (result as any[]).map((r: any) => r.data.age);
        expect(ages).toEqual([35, 30, 28, 25]);
    });

    it("sorts by string field", async () => {
        const { db } = await seededDB();
        const result = await db
            .all()
            .sort(($) => $("name"), "asc")
            .get();
        const names = (result as any[]).map((r: any) => r.data.name);
        expect(names).toEqual(["Alice", "Bob", "Charlie", "Diana"]);
    });

    it("sorts by $.ID", async () => {
        const { db } = await seededDB();
        const asc = await db
            .all()
            .sort(($) => $.ID, "asc")
            .id() as string[];
        const desc = await db
            .all()
            .sort(($) => $.ID, "desc")
            .id() as string[];
        expect(desc).toEqual([...asc].reverse());
    });
});

describe("pipeline: slice / paginate / window", () => {
    it("slices results", async () => {
        const { db } = await seededDB();
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
        const { db } = await seededDB();
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
        const { db } = await seededDB();
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
        const { db } = await seededDB();
        const result = await db
            .all()
            .sort(($) => $("age"), "asc")
            .first()
            .get();
        expect((result as any).data.age).toBe(25);
    });

    it("last returns last item", async () => {
        const { db } = await seededDB();
        const result = await db
            .all()
            .sort(($) => $("age"), "asc")
            .last()
            .get();
        expect((result as any).data.age).toBe(35);
    });

    it("at returns item at index", async () => {
        const { db } = await seededDB();
        const result = await db
            .all()
            .sort(($) => $("age"), "asc")
            .at(2)
            .get();
        expect((result as any).data.age).toBe(30);
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
        expect(await db.all().count()).toBe(4);
        expect(await db.where(($) => [$("age"), ">", 28]).count()).toBe(2);
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
            .all()
            .sort(($) => $("name"), "asc")
            .id();
        expect(multiIds).toHaveLength(4);
    });

    it("id returns undefined for missing single select", async () => {
        const { db } = await seededDB();
        const result = await db.select("missing").id();
        expect(result).toBeUndefined();
    });
});

// ============================================================
// Pipeline — write terminals
// ============================================================

describe("pipeline: update terminal", () => {
    it("updates matched records with static value", async () => {
        const { db, alice } = await seededDB();
        await db.where(($) => [$("name"), "=", "Alice"]).update({ name: "Alice Updated", age: 99 });
        expect(db.get(alice.id)?.data.name).toBe("Alice Updated");
        expect(db.get(alice.id)?.data.age).toBe(99);
    });

    it("updates matched records with updater function", async () => {
        const { db, alice, charlie, bob } = await seededDB();
        await db.where(($) => [$("age"), ">", 28]).update((prev) => ({ ...prev, age: prev.age + 100 }));
        expect(db.get(alice.id)?.data.age).toBe(130); // 30 + 100
        expect(db.get(charlie.id)?.data.age).toBe(135); // 35 + 100
        expect(db.get(bob.id)?.data.age).toBe(25); // unchanged
    });

    it("updates single select with updater", async () => {
        const { db, bob } = await seededDB();
        await db.select(bob.id).update((prev) => ({ ...prev, age: 0 }));
        expect(db.get(bob.id)?.data.age).toBe(0);
    });
});

describe("pipeline: remove terminal", () => {
    it("removes matched records", async () => {
        const { db, alice, bob, charlie, diana } = await seededDB();
        await db.where(($) => [$("age"), "<", 29]).remove();
        expect(db.get(bob.id)).toBeUndefined(); // age 25
        expect(db.get(diana.id)).toBeUndefined(); // age 28
        expect(db.get(alice.id)).toBeDefined(); // age 30
        expect(db.get(charlie.id)).toBeDefined(); // age 35
    });

    it("removes single select", async () => {
        const { db, alice } = await seededDB();
        await db.select(alice.id).remove();
        expect(db.get(alice.id)).toBeUndefined();
        expect(await db.all().count()).toBe(3);
    });
});

// ============================================================
// Pipeline — distinct
// ============================================================

describe("pipeline: distinct", () => {
    it("deduplicates by id", async () => {
        const { db } = await seededDB();
        const result = await db.all().distinct().get();
        expect(result).toHaveLength(4);
    });
});

// ============================================================
// Set operations
// ============================================================

describe("set operations", () => {
    describe("intersection", () => {
        it("returns items present in all pipelines", async () => {
            const { db } = await seededDB();
            const result = await db.intersection(
                db.where(($) => [$("age"), ">", 25]),
                db.where(($) => [$("age"), "<", 35]),
            ).get();
            // Alice(30) and Diana(28)
            const names = (result as any[]).map((r: any) => r.data.name).sort();
            expect(names).toEqual(["Alice", "Diana"]);
        });

        it("returns empty when no overlap", async () => {
            const { db } = await seededDB();
            const result = await db.intersection(
                db.where(($) => [$("age"), "<", 25]),
                db.where(($) => [$("age"), ">", 30]),
            ).get();
            expect(result).toHaveLength(0);
        });

        it("supports chaining after intersection", async () => {
            const { db } = await seededDB();
            const result = await db.intersection(
                db.where(($) => [$("age"), ">", 25]),
                db.where(($) => [$("age"), "<", 35]),
            ).sort(($) => $("age"), "asc").first().get();
            expect((result as any).data.name).toBe("Diana");
        });
    });

    describe("union", () => {
        it("returns items present in any pipeline", async () => {
            const { db } = await seededDB();
            const result = await db.union(
                db.where(($) => [$("age"), "<", 26]),
                db.where(($) => [$("age"), ">", 34]),
            ).get();
            const names = (result as any[]).map((r: any) => r.data.name).sort();
            expect(names).toEqual(["Bob", "Charlie"]);
        });

        it("deduplicates overlapping results", async () => {
            const { db } = await seededDB();
            const result = await db.union(
                db.where(($) => [$("age"), ">", 20]),
                db.where(($) => [$("age"), "<", 40]),
            ).get();
            expect(result).toHaveLength(4);
        });
    });

    describe("exclusion", () => {
        it("returns items in first pipeline not in second", async () => {
            const { db } = await seededDB();
            const result = await db.exclusion(
                db.all(),
                db.where(($) => [$("age"), ">", 28]),
            ).get();
            const names = (result as any[]).map((r: any) => r.data.name).sort();
            expect(names).toEqual(["Bob", "Diana"]);
        });

        it("subtracts multiple pipelines", async () => {
            const { db } = await seededDB();
            const result = await db.exclusion(
                db.all(),
                db.where(($) => [$("name"), "=", "Alice"]),
                db.where(($) => [$("name"), "=", "Bob"]),
            ).get();
            const names = (result as any[]).map((r: any) => r.data.name).sort();
            expect(names).toEqual(["Charlie", "Diana"]);
        });
    });

    describe("nesting", () => {
        it("supports nested set operations", async () => {
            const { db } = await seededDB();
            // union of (age > 34) and (intersection of age > 25 and age < 29)
            // age > 34: Charlie(35)
            // age > 25 AND age < 29: Diana(28)
            const result = await db.union(
                db.where(($) => [$("age"), ">", 34]),
                db.intersection(
                    db.where(($) => [$("age"), ">", 25]),
                    db.where(($) => [$("age"), "<", 29]),
                ),
            ).get();
            const names = (result as any[]).map((r: any) => r.data.name).sort();
            expect(names).toEqual(["Charlie", "Diana"]);
        });
    });
});

// ============================================================
// Pipeline — lens-targeted update
// ============================================================

describe("pipeline: lens-targeted update", () => {
    it("updates a nested field via lens", async () => {
        type WithAddress = { name: string; address: { city: string; zip: string } };
        const codec = new MemoryCodec<DocumentOf<WithAddress>>();
        const db = new DocumentDB<WithAddress>(codec);
        const a = await db.insert({ name: "Alice", address: { city: "NYC", zip: "10001" } });
        const b = await db.insert({ name: "Bob", address: { city: "LA", zip: "90001" } });

        await (db as any).where(($: any) => [$("address")("city"), "=", "NYC"]).update(($: any) => $("address")("zip"), "10002");

        expect(db.get(a.id)?.data.address.zip).toBe("10002");
        expect(db.get(b.id)?.data.address.zip).toBe("90001"); // unchanged
    });

    it("updates a top-level field via lens on seeded DB", async () => {
        const { db, alice, bob } = await seededDB();
        await (db as any).where(($: any) => [$("name"), "=", "Alice"]).update(($: any) => $("age"), 99);
        expect(db.get(alice.id)?.data.age).toBe(99);
        expect(db.get(bob.id)?.data.age).toBe(25); // unchanged
    });
});
