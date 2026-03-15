import { describe, it, expect } from "vitest";
import { CollectionDB } from "../src/db/collectionDB";
import { MemoryCodec } from "../src/codec/memoryCodec";
import { IndexStore } from "../src/util/indices";
import { CollectionMemberOf, CollectionOf } from "../src/types";

type User = { name: string; age: number };

function makeDB() {
    const codec = new MemoryCodec<CollectionMemberOf<User>, CollectionOf<User>>();
    return new CollectionDB<User>(codec);
}

/** Reach into TS-private `indices` field for test assertions */
function idx(db: CollectionDB<any>): IndexStore {
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
        const codec = new MemoryCodec<CollectionMemberOf<User>, CollectionOf<User>>();
        let updateCalled = false;
        codec.update = async (items) => {
            updateCalled = true;
            expect(items).toHaveLength(1);
            expect(items[0].data.age).toBe(31);
        };
        const db = new CollectionDB<User>(codec);
        await db.insert("a", { name: "Alice", age: 30 });
        await db.update("a", { name: "Alice", age: 31 });
        expect(updateCalled).toBe(true);
    });

    it("does not call codec.update when nothing is updated", async () => {
        const codec = new MemoryCodec<CollectionMemberOf<User>, CollectionOf<User>>();
        let updateCalled = false;
        codec.update = async () => {
            updateCalled = true;
        };
        const db = new CollectionDB<User>(codec);
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
        const codec = new MemoryCodec<CollectionMemberOf<WithAddress>, CollectionOf<WithAddress>>();
        const db = new CollectionDB<WithAddress>(codec);
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
        const codec = new MemoryCodec<CollectionMemberOf<User>, CollectionOf<User>>();
        let insertCalled = false;
        codec.insert = async (items) => {
            insertCalled = true;
            expect(items).toHaveLength(1);
            expect(items[0].data.name).toBe("Alice");
        };
        const db = new CollectionDB<User>(codec);
        await db.insert("a", { name: "Alice", age: 30 });
        expect(insertCalled).toBe(true);
    });

    it("calls codec.delete on remove", async () => {
        const codec = new MemoryCodec<CollectionMemberOf<User>, CollectionOf<User>>();
        let deleteCalled = false;
        codec.delete = async (items) => {
            deleteCalled = true;
            expect(items).toHaveLength(1);
            expect(items[0].id).toBe("a");
        };
        const db = new CollectionDB<User>(codec);
        await db.insert("a", { name: "Alice", age: 30 });
        await db.remove("a");
        expect(deleteCalled).toBe(true);
    });

    it("does not call codec.delete when nothing is removed", async () => {
        const codec = new MemoryCodec<CollectionMemberOf<User>, CollectionOf<User>>();
        let deleteCalled = false;
        codec.delete = async () => {
            deleteCalled = true;
        };
        const db = new CollectionDB<User>(codec);
        await db.remove("missing");
        expect(deleteCalled).toBe(false);
    });
});
