import { describe, it, expect } from "vitest";
import { stringifyIndex, IndexStore } from "../src/util/indices";
import { Lens } from "../src/util/lens";

// ------------------------------------------------------------
// stringifyIndex
// ------------------------------------------------------------

describe("stringifyIndex", () => {
    it("serializes property segments", () => {
        const path: Lens.PathSegment[] = [{ type: "property", key: "name" }];
        expect(stringifyIndex(path)).toBe("name");
    });

    it("serializes nested properties with dot join", () => {
        const path: Lens.PathSegment[] = [
            { type: "property", key: "address" },
            { type: "property", key: "zip" },
        ];
        expect(stringifyIndex(path)).toBe("address.zip");
    });

    it("escapes dots in property keys", () => {
        const path: Lens.PathSegment[] = [{ type: "property", key: "a.b" }];
        expect(stringifyIndex(path)).toBe("a\\.b");
    });

    it("serializes index segments as numbers", () => {
        const path: Lens.PathSegment[] = [
            { type: "property", key: "items" },
            { type: "index", index: 3 },
            { type: "property", key: "name" },
        ];
        expect(stringifyIndex(path)).toBe("items.3.name");
    });

    it("serializes accessor segments", () => {
        const path: Lens.PathSegment[] = [
            { type: "property", key: "ex" },
            { type: "accessor", name: "link", args: ["test"] },
        ];
        expect(stringifyIndex(path)).toBe("ex.link(test)");
    });

    it("serializes accessor with multiple args", () => {
        const path: Lens.PathSegment[] = [{ type: "accessor", name: "cell", args: [0, 1] }];
        expect(stringifyIndex(path)).toBe("cell(0,1)");
    });

    it("escapes special chars in accessor names and args", () => {
        const path: Lens.PathSegment[] = [{ type: "accessor", name: "a.b", args: ["c,d", "e(f)"] }];
        expect(stringifyIndex(path)).toBe("a\\.b(c\\,d,e\\(f\\))");
    });

    it("handles accessor with no args", () => {
        const path: Lens.PathSegment[] = [{ type: "accessor", name: "foo" }];
        expect(stringifyIndex(path)).toBe("foo()");
    });

    it("escapes backslashes", () => {
        const path: Lens.PathSegment[] = [{ type: "property", key: "a\\b" }];
        expect(stringifyIndex(path)).toBe("a\\\\b");
    });
});

// ------------------------------------------------------------
// IndexStore
// ------------------------------------------------------------

describe("IndexStore", () => {
    const namePath: Lens.PathSegment[] = [{ type: "property", key: "name" }];
    const agePath: Lens.PathSegment[] = [{ type: "property", key: "age" }];

    describe("lifecycle", () => {
        it("creates and checks indices", () => {
            const store = new IndexStore();
            expect(store.has(namePath)).toBe(false);
            store.create(namePath);
            expect(store.has(namePath)).toBe(true);
        });

        it("drops indices", () => {
            const store = new IndexStore();
            store.create(namePath);
            store.drop(namePath);
            expect(store.has(namePath)).toBe(false);
        });

        it("lists index keys", () => {
            const store = new IndexStore();
            store.create(namePath);
            store.create(agePath);
            expect(store.keys()).toEqual(expect.arrayContaining(["name", "age"]));
        });

        it("ignores duplicate create", () => {
            const store = new IndexStore();
            store.create(namePath);
            store.index("name", "Alice", "id1");
            store.create(namePath); // should not clear existing data
            expect(store.eq("name", "Alice")).toContain("id1");
        });
    });

    describe("index / deindex", () => {
        it("indexes and retrieves by equality", () => {
            const store = new IndexStore();
            store.create(namePath);
            store.index("name", "Alice", "id1");
            store.index("name", "Alice", "id2");
            store.index("name", "Bob", "id3");

            const alice = store.eq("name", "Alice");
            expect(alice).toContain("id1");
            expect(alice).toContain("id2");
            expect(alice).not.toContain("id3");
        });

        it("deindexes and cleans up empty keys", () => {
            const store = new IndexStore();
            store.create(namePath);
            store.index("name", "Alice", "id1");
            store.deindex("name", "Alice", "id1");

            expect(store.eq("name", "Alice").size).toBe(0);
        });

        it("ignores operations on non-existent indices", () => {
            const store = new IndexStore();
            // Should not throw
            store.index("missing", "val", "id1");
            store.deindex("missing", "val", "id1");
            expect(store.eq("missing", "val").size).toBe(0);
        });
    });

    describe("range queries", () => {
        function makeAgeStore() {
            const store = new IndexStore();
            store.create(agePath);
            store.index("age", 18, "a");
            store.index("age", 25, "b");
            store.index("age", 25, "c");
            store.index("age", 30, "d");
            store.index("age", 40, "e");
            store.index("age", 50, "f");
            return store;
        }

        it("gt — greater than", () => {
            const store = makeAgeStore();
            const result = store.gt("age", 25);
            expect(result).toEqual(new Set(["d", "e", "f"]));
        });

        it("gte — greater than or equal", () => {
            const store = makeAgeStore();
            const result = store.gte("age", 25);
            expect(result).toEqual(new Set(["b", "c", "d", "e", "f"]));
        });

        it("lt — less than", () => {
            const store = makeAgeStore();
            const result = store.lt("age", 30);
            expect(result).toEqual(new Set(["a", "b", "c"]));
        });

        it("lte — less than or equal", () => {
            const store = makeAgeStore();
            const result = store.lte("age", 30);
            expect(result).toEqual(new Set(["a", "b", "c", "d"]));
        });

        it("range — inclusive on both ends", () => {
            const store = makeAgeStore();
            const result = store.range("age", 25, 40);
            expect(result).toEqual(new Set(["b", "c", "d", "e"]));
        });

        it("range — exclusive on both ends", () => {
            const store = makeAgeStore();
            const result = store.range("age", 25, 40, false, false);
            expect(result).toEqual(new Set(["d"]));
        });

        it("range — mixed inclusivity", () => {
            const store = makeAgeStore();
            const result = store.range("age", 18, 30, false, true);
            expect(result).toEqual(new Set(["b", "c", "d"]));
        });

        it("returns empty for non-existent index", () => {
            const store = new IndexStore();
            expect(store.gt("missing", 0).size).toBe(0);
        });
    });

    describe("scan", () => {
        it("returns IDs in ascending order", () => {
            const store = new IndexStore();
            store.create(agePath);
            store.index("age", 30, "d");
            store.index("age", 18, "a");
            store.index("age", 25, "b");

            const result = store.scan("age", "asc");
            expect(result).toEqual(["a", "b", "d"]);
        });

        it("returns IDs in descending order", () => {
            const store = new IndexStore();
            store.create(agePath);
            store.index("age", 30, "d");
            store.index("age", 18, "a");
            store.index("age", 25, "b");

            const result = store.scan("age", "desc");
            expect(result).toEqual(["d", "b", "a"]);
        });

        it("returns empty for non-existent index", () => {
            const store = new IndexStore();
            expect(store.scan("missing", "asc")).toEqual([]);
        });
    });

    describe("string keys with natural collation", () => {
        it("orders strings naturally", () => {
            const store = new IndexStore();
            store.create(namePath);
            store.index("name", "Charlie", "c");
            store.index("name", "Alice", "a");
            store.index("name", "Bob", "b");

            const result = store.scan("name", "asc");
            expect(result).toEqual(["a", "b", "c"]);
        });

        it("range query on strings", () => {
            const store = new IndexStore();
            store.create(namePath);
            store.index("name", "Alice", "a");
            store.index("name", "Bob", "b");
            store.index("name", "Charlie", "c");
            store.index("name", "Dave", "d");

            const result = store.range("name", "Bob", "Dave");
            expect(result).toEqual(new Set(["b", "c", "d"]));
        });
    });

    describe("stress", () => {
        it("handles many inserts and deletes", () => {
            const store = new IndexStore();
            store.create(agePath);

            // Insert 1000 entries
            for (let i = 0; i < 1000; i++) {
                store.index("age", i, `id${i}`);
            }

            // Verify a few
            expect(store.eq("age", 500)).toContain("id500");
            expect(store.gt("age", 998)).toEqual(new Set(["id999"]));
            expect(store.lt("age", 2)).toEqual(new Set(["id0", "id1"]));

            // Delete half
            for (let i = 0; i < 500; i++) {
                store.deindex("age", i, `id${i}`);
            }

            expect(store.eq("age", 0).size).toBe(0);
            expect(store.eq("age", 500)).toContain("id500");
            expect(store.scan("age", "asc").length).toBe(500);
        });

        it("handles multiple IDs per value", () => {
            const store = new IndexStore();
            store.create(agePath);

            for (let i = 0; i < 100; i++) {
                store.index("age", 25, `id${i}`);
            }

            const result = store.eq("age", 25);
            expect(result.size).toBe(100);
        });
    });
});
