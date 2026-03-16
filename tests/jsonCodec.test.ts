import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { JsonCodec } from "../src/codec/jsonCodec";
import { mkdir, rm } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const TMP = join(import.meta.dirname, ".tmp", "json");

type Item = { id: string; data: { name: string; age: number } };
type Meta = { user: null; type: string; version: number };

function makeCodec(name: string) {
    return new JsonCodec<Item, Meta>(join(TMP, `${name}.json`));
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

    it("round-trips data and meta through flush + load", async () => {
        const codec = makeCodec("load-roundtrip");
        const items: { [id: string]: Item } = {
            a: { id: "a", data: { name: "Alice", age: 30 } },
            b: { id: "b", data: { name: "Bob", age: 25 } },
        };
        const meta: Meta = { user: null, type: "documents", version: 1 };
        await codec.flush(items, meta);
        const [loaded, loadedMeta] = await codec.load();
        expect(loaded).toEqual(items);
        expect(loadedMeta).toEqual(meta);
    });
});

// ============================================================
// flush
// ============================================================

describe("flush", () => {
    it("writes { meta, data } envelope to file", async () => {
        const codec = makeCodec("flush-envelope");
        const items = { a: { id: "a", data: { name: "Alice", age: 30 } } };
        const meta: Meta = { user: null, type: "test", version: 1 };
        await codec.flush(items, meta);
        const raw = await readFile(join(TMP, "flush-envelope.json"), "utf-8");
        const parsed = JSON.parse(raw);
        expect(parsed).toEqual({ meta, data: items });
    });

    it("writes null meta when no meta provided", async () => {
        const codec = makeCodec("flush-null-meta");
        await codec.flush({ a: { id: "a", data: { name: "Alice", age: 30 } } }, null);
        const raw = await readFile(join(TMP, "flush-null-meta.json"), "utf-8");
        const parsed = JSON.parse(raw);
        expect(parsed.meta).toBeNull();
    });
});

// ============================================================
// insert / update / delete / struct
// ============================================================

describe("insert", () => {
    it("rewrites the full file with current data", async () => {
        const codec = makeCodec("insert");
        const data = {
            a: { id: "a", data: { name: "Alice", age: 30 } },
            b: { id: "b", data: { name: "Bob", age: 25 } },
        };
        const meta: Meta = { user: null, type: "documents", version: 1 };
        await codec.insert([data.b], data, meta);
        const [loaded, loadedMeta] = await codec.load();
        expect(loaded).toEqual(data);
        expect(loadedMeta).toEqual(meta);
    });
});

describe("update", () => {
    it("rewrites the full file with current data", async () => {
        const codec = makeCodec("update");
        const data = { a: { id: "a", data: { name: "Alice Updated", age: 31 } } };
        const meta: Meta = { user: null, type: "documents", version: 1 };
        await codec.update([data.a], data, meta);
        const [loaded] = await codec.load();
        expect(loaded.a.data.name).toBe("Alice Updated");
    });
});

describe("delete", () => {
    it("rewrites the full file with current data", async () => {
        const codec = makeCodec("delete");
        const data = { b: { id: "b", data: { name: "Bob", age: 25 } } };
        await codec.delete([], data, null);
        const [loaded] = await codec.load();
        expect(loaded).toEqual(data);
    });
});

describe("struct", () => {
    it("rewrites the full file with current data", async () => {
        const codec = makeCodec("struct");
        const data = { a: { id: "a", data: { name: "Alice", age: 30 } } };
        await codec.struct([data.a], data, null);
        const [loaded] = await codec.load();
        expect(loaded).toEqual(data);
    });
});

// ============================================================
// setMeta
// ============================================================

describe("setMeta", () => {
    it("persists meta alongside data", async () => {
        const codec = makeCodec("setmeta");
        const data = { a: { id: "a", data: { name: "Alice", age: 30 } } };
        const meta: Meta = { user: null, type: "documents", version: 2 };
        await codec.setMeta(meta, data);
        const [loaded, loadedMeta] = await codec.load();
        expect(loaded).toEqual(data);
        expect(loadedMeta).toEqual(meta);
    });
});

// ============================================================
// meta: null handling
// ============================================================

describe("null meta", () => {
    it("loads null when meta was never set", async () => {
        const codec = makeCodec("null-meta");
        await codec.flush({}, null);
        const [, meta] = await codec.load();
        expect(meta).toBeNull();
    });

    it("loads null when JSON meta field is missing", async () => {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(join(TMP, "no-meta-field.json"), JSON.stringify({ data: {} }), "utf-8");
        const codec = makeCodec("no-meta-field");
        const [, meta] = await codec.load();
        expect(meta).toBeNull();
    });
});
