import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TrhCodec } from "../src/codec/trhCodec";
import { mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";

const TMP = join(import.meta.dirname, ".tmp", "trh");

type Item = { id: string; data: { name: string; value: unknown } };
type Meta = { user: null; type: string; version: number };

function makeCodec(name: string) {
    return new TrhCodec<Item, Meta>(join(TMP, `${name}.trh`));
}

beforeAll(async () => {
    await mkdir(TMP, { recursive: true });
});

afterAll(async () => {
    await rm(TMP, { recursive: true, force: true });
});

// ============================================================
// load
// ============================================================

describe("load", () => {
    it("returns empty data and null meta when file does not exist", async () => {
        const codec = makeCodec("load-missing");
        const [data, meta] = await codec.load();
        expect(data).toEqual({});
        expect(meta).toBeNull();
    });

    it("round-trips data through flush + load", async () => {
        const codec = makeCodec("load-roundtrip");
        const items: { [id: string]: Item } = {
            a: { id: "a", data: { name: "Alice", value: 30 } },
            b: { id: "b", data: { name: "Bob", value: 25 } },
        };
        const meta: Meta = { user: null, type: "tree", version: 1 };
        await codec.flush(items, meta);
        const [loaded, loadedMeta] = await codec.load();
        expect(loaded).toEqual(items);
        expect(loadedMeta).toEqual(meta);
    });
});

// ============================================================
// ledger operations
// ============================================================

describe("insert", () => {
    it("appends INSERT entries that replay correctly", async () => {
        const codec = makeCodec("insert");
        const a: Item = { id: "a", data: { name: "Alice", value: 1 } };
        const b: Item = { id: "b", data: { name: "Bob", value: 2 } };
        // flush empty, then insert
        await codec.flush({}, null);
        await codec.insert([a], { a }, null);
        await codec.insert([b], { a, b }, null);
        const [loaded] = await codec.load();
        expect(loaded).toEqual({ a, b });
    });
});

describe("update", () => {
    it("appends UPDATE entries that modify data on replay", async () => {
        const codec = makeCodec("update");
        const a: Item = { id: "a", data: { name: "Alice", value: 1 } };
        await codec.flush({ a }, null);
        await codec.update([{ ...a, data: { name: "Alice Updated", value: 2 } }], { a }, null);
        const [loaded] = await codec.load();
        expect(loaded.a.data.name).toBe("Alice Updated");
        expect(loaded.a.data.value).toBe(2);
    });
});

describe("delete", () => {
    it("appends DELETE entries that remove items on replay", async () => {
        const codec = makeCodec("delete");
        const a: Item = { id: "a", data: { name: "Alice", value: 1 } };
        const b: Item = { id: "b", data: { name: "Bob", value: 2 } };
        await codec.flush({ a, b }, null);
        await codec.delete([a], { b }, null);
        const [loaded] = await codec.load();
        expect(loaded).toEqual({ b });
        expect(loaded.a).toBeUndefined();
    });
});

describe("struct", () => {
    it("appends STRUCT entries that merge structural fields on replay", async () => {
        type TreeItem = { id: string; data: { name: string; value: number }; parent: string | null; children: string[] };
        const codec = new TrhCodec<TreeItem, Meta>(join(TMP, "struct.trh"));
        const a: TreeItem = { id: "a", data: { name: "A", value: 1 }, parent: null, children: ["b"] };
        await codec.flush({ a }, null);
        const updated: TreeItem = { ...a, parent: "root", children: ["b", "c"] };
        await codec.struct([updated], { a: updated }, null);
        const [loaded] = await codec.load();
        expect(loaded.a.parent).toBe("root");
        expect(loaded.a.children).toEqual(["b", "c"]);
    });
});

// ============================================================
// setMeta
// ============================================================

describe("setMeta", () => {
    it("appends META entry that replays as last-wins", async () => {
        const codec = makeCodec("setmeta");
        await codec.flush({}, null);
        await codec.setMeta({ user: null, type: "docs", version: 1 }, {});
        await codec.setMeta({ user: null, type: "docs", version: 2 }, {});
        const [, meta] = await codec.load();
        expect(meta).toEqual({ user: null, type: "docs", version: 2 });
    });
});

// ============================================================
// compaction on load
// ============================================================

describe("compaction", () => {
    it("compacts ledger on load to only I and M entries", async () => {
        const codec = makeCodec("compact");
        const a: Item = { id: "a", data: { name: "Alice", value: 1 } };
        const b: Item = { id: "b", data: { name: "Bob", value: 2 } };
        const meta: Meta = { user: null, type: "test", version: 1 };
        await codec.flush({}, null);
        await codec.insert([a, b], { a, b }, meta);
        await codec.setMeta(meta, { a, b });
        await codec.update([{ ...a, data: { name: "Alice V2", value: 10 } }], { a, b }, meta);
        await codec.delete([b], { a }, meta);

        // Load triggers compaction
        const [loaded, loadedMeta] = await codec.load();
        expect(Object.keys(loaded)).toEqual(["a"]);
        expect(loaded.a.data.name).toBe("Alice V2");
        expect(loadedMeta).toEqual(meta);

        // Read the compacted file — should have no U/D/S entries
        const raw = await readFile(join(TMP, "compact.trh"), "utf-8");
        expect(raw).not.toContain("\x1dU\x1d");
        expect(raw).not.toContain("\x1dD\x1d");
        expect(raw).not.toContain("\x1dS\x1d");
    });
});

// ============================================================
// sigil round-tripping
// ============================================================

describe("sigils", () => {
    it("round-trips NaN", async () => {
        const codec = makeCodec("sigil-nan");
        const a: Item = { id: "a", data: { name: "nan", value: NaN } };
        await codec.flush({ a }, null);
        const [loaded] = await codec.load();
        expect(loaded.a.data.value).toBeNaN();
    });

    it("round-trips Infinity and -Infinity", async () => {
        const codec = makeCodec("sigil-inf");
        const a: Item = { id: "a", data: { name: "pos", value: Infinity } };
        const b: Item = { id: "b", data: { name: "neg", value: -Infinity } };
        await codec.flush({ a, b }, null);
        const [loaded] = await codec.load();
        expect(loaded.a.data.value).toBe(Infinity);
        expect(loaded.b.data.value).toBe(-Infinity);
    });

    it("round-trips BigInt", async () => {
        const codec = makeCodec("sigil-bigint");
        const a: Item = { id: "a", data: { name: "big", value: 12345678901234567890n } };
        await codec.flush({ a }, null);
        const [loaded] = await codec.load();
        expect(loaded.a.data.value).toBe(12345678901234567890n);
    });

    it("round-trips Date", async () => {
        const codec = makeCodec("sigil-date");
        const d = new Date("2025-06-15T12:00:00Z");
        const a: Item = { id: "a", data: { name: "date", value: d } };
        await codec.flush({ a }, null);
        const [loaded] = await codec.load();
        expect(loaded.a.data.value).toEqual(d);
        expect(loaded.a.data.value).toBeInstanceOf(Date);
    });

    it("round-trips RegExp", async () => {
        const codec = makeCodec("sigil-regex");
        const a: Item = { id: "a", data: { name: "regex", value: /foo.*bar/gi } };
        await codec.flush({ a }, null);
        const [loaded] = await codec.load();
        const v = loaded.a.data.value as RegExp;
        expect(v).toBeInstanceOf(RegExp);
        expect(v.source).toBe("foo.*bar");
        expect(v.flags).toBe("gi");
    });

    it("round-trips Set", async () => {
        const codec = makeCodec("sigil-set");
        const a: Item = { id: "a", data: { name: "set", value: new Set([1, 2, 3]) } };
        await codec.flush({ a }, null);
        const [loaded] = await codec.load();
        expect(loaded.a.data.value).toBeInstanceOf(Set);
        expect(loaded.a.data.value).toEqual(new Set([1, 2, 3]));
    });

    it("round-trips Map", async () => {
        const codec = makeCodec("sigil-map");
        const a: Item = { id: "a", data: { name: "map", value: new Map([["x", 1], ["y", 2]]) } };
        await codec.flush({ a }, null);
        const [loaded] = await codec.load();
        expect(loaded.a.data.value).toBeInstanceOf(Map);
        expect(loaded.a.data.value).toEqual(new Map([["x", 1], ["y", 2]]));
    });

    it("round-trips URL", async () => {
        const codec = makeCodec("sigil-url");
        const a: Item = { id: "a", data: { name: "url", value: new URL("https://example.com/path") } };
        await codec.flush({ a }, null);
        const [loaded] = await codec.load();
        expect(loaded.a.data.value).toBeInstanceOf(URL);
        expect((loaded.a.data.value as URL).href).toBe("https://example.com/path");
    });
});

// ============================================================
// custom sigil registration
// ============================================================

describe("custom sigil", () => {
    it("round-trips a custom type via register()", async () => {
        const codec = makeCodec("sigil-custom");
        codec.register<{ real: number; imag: number }, [number, number]>(
            "complex",
            ([r, i]) => ({ real: r, imag: i }),
            (v) => (v && typeof v === "object" && "real" in v && "imag" in v ? [v.real, v.imag] : undefined),
        );
        const a: Item = { id: "a", data: { name: "complex", value: { real: 3, imag: 4 } } };
        await codec.flush({ a }, null);

        // Need a fresh codec with the same sigil registered to load
        const codec2 = makeCodec("sigil-custom");
        codec2.register<{ real: number; imag: number }, [number, number]>(
            "complex",
            ([r, i]) => ({ real: r, imag: i }),
            (v) => (v && typeof v === "object" && "real" in v && "imag" in v ? [v.real, v.imag] : undefined),
        );
        const [loaded] = await codec2.load();
        expect(loaded.a.data.value).toEqual({ real: 3, imag: 4 });
    });
});

// ============================================================
// ledger replay ordering
// ============================================================

describe("replay ordering", () => {
    it("later operations override earlier ones", async () => {
        const codec = makeCodec("replay-order");
        const a1: Item = { id: "a", data: { name: "v1", value: 1 } };
        const a2: Item = { id: "a", data: { name: "v2", value: 2 } };
        await codec.flush({}, null);
        await codec.insert([a1], { a: a1 }, null);
        await codec.insert([a2], { a: a2 }, null); // re-insert same id
        const [loaded] = await codec.load();
        expect(loaded.a.data.name).toBe("v2");
    });

    it("delete then re-insert restores the item", async () => {
        const codec = makeCodec("replay-delete-reinsert");
        const a: Item = { id: "a", data: { name: "Alice", value: 1 } };
        await codec.flush({ a }, null);
        await codec.delete([a], {}, null);
        const a2: Item = { id: "a", data: { name: "Alice Reborn", value: 2 } };
        await codec.insert([a2], { a: a2 }, null);
        const [loaded] = await codec.load();
        expect(loaded.a.data.name).toBe("Alice Reborn");
    });
});
