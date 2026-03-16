import { readFile, writeFile, appendFile } from "node:fs/promises";
import { Codec } from "../types";

const OP_UPSERT = "U";
const OP_DELETE = "D";
// const OP_STRUCT = "S"; // to be used later - represents a change to non-data stuff, for tree, it's a parent change or a children change, stuff like that.
// const OP_FIELD = "F"; // to be used later - will be [typeof OP_SET, id: string, path: LensPathSegment: [], data: any] to strategically alter an item
// const OP_PARTIAL = "P"; // to be used later - I can't remember how but the previous version of this had it, so I'm adding it here.

const SEP_ENTRY = "\x1c"; //File Separator
const SEP_OPERATION = "\x1d"; //Group Separator

const SPLIT_ENTRY = /(?<!\\)\x1c/s; // File Separator
const SPLIT_OPERATION = /(?<!\\)\x1d/s; // Group Separator

const SIGIL_PREFIX = "\x10"; // Data-Link Escape

/**
 *  this codec stores data in a modified json format
 *
 *  each entry is an operation, either UPSERT or DELETE. Each operation is separated by the SEP_ENTRY.
 *  each ledger is made of two or three parts (depending on the operation), separated by a SEP_OPERATION.
 *  the data is stored either in a raw json form, or in an object where the key starts with a SIGIL_PREFIX and then the name of the sigil, the value is then parsed using the registered parser for that sigil.
 */

export class TrhCodec<I extends { id: string }, D extends { [id: string]: I }> implements Codec<I, D> {
    #file: string;
    #transformers: { [sigil: string]: { serializer: (value: any) => any; parser: (token: any) => any } } = {};

    constructor(file: string) {
        this.#file = file;

        // Built-in type support
        this.register<number, boolean>(
            "core.nan",
            () => NaN,
            (v) => (isNaN(v) && typeof v === "number" ? true : undefined),
        );
        this.register<number, -1 | 1>(
            "core.inf",
            (t) => (t === 1 ? Infinity : -Infinity),
            (v) => (typeof v === "number" && !isFinite(v) && !isNaN(v) ? (Math.sign(v) as -1 | 1) : undefined),
        );
        this.register<bigint>(
            "core.bigint",
            (t) => BigInt(t),
            (v) => (typeof v === "bigint" ? `${v}` : undefined),
        );
        this.register<Date>(
            "core.date",
            (t) => new Date(t),
            (v) => (v instanceof Date ? v.toISOString() : undefined),
        );
        this.register<RegExp, { source: string; flags: string }>(
            "core.regex",
            ({ source, flags }) => new RegExp(source, flags),
            (v) => (v instanceof RegExp ? { source: v.source, flags: v.flags } : undefined),
        );
        this.register<Set<unknown>, unknown[]>(
            "core.set",
            (t) => new Set(t),
            (v) => (v instanceof Set ? [...v] : undefined),
        );
        this.register<Map<unknown, unknown>, [unknown, unknown][]>(
            "core.map",
            (t) => new Map(t),
            (v) => (v instanceof Map ? [...v] : undefined),
        );
    }

    register = <S, T = string>(sigil: string, parser: (token: T) => S, serializer: (value: S) => T | undefined) => {
        if (!(sigil in this.#transformers)) {
            this.#transformers[sigil] = { serializer, parser };
        }
    };

    // --- Sigil-aware JSON serialization ---

    #replacer = (_key: string, value: unknown): unknown => {
        for (const [sigil, { serializer }] of Object.entries(this.#transformers)) {
            const encoded = serializer(value);
            if (encoded !== undefined) return { [`${SIGIL_PREFIX}${sigil}`]: encoded };
        }
        return value;
    };

    #reviver = (_key: string, value: unknown): unknown => {
        if (value !== null && typeof value === "object" && !Array.isArray(value)) {
            const keys = Object.keys(value);
            if (keys.length === 1 && keys[0].startsWith(SIGIL_PREFIX)) {
                const sigil = keys[0].slice(1);
                if (sigil in this.#transformers) {
                    return this.#transformers[sigil].parser((value as any)[keys[0]]);
                }
            }
        }
        return value;
    };

    // --- Codec interface ---

    async load(): Promise<D> {
        let raw: string;
        try {
            raw = await readFile(this.#file, "utf-8");
        } catch {
            return {} as D;
        }

        // Replay ledger
        const result: { [id: string]: I } = {};
        if (raw.trim()) {
            for (const entry of raw.split(SPLIT_ENTRY)) {
                if (!entry.trim()) continue;
                const [operation, id, data] = entry.split(SPLIT_OPERATION);
                if (!operation) continue;

                if (operation === OP_UPSERT) {
                    result[id] = JSON.parse(data, this.#reviver) as I;
                } else {
                    delete result[id];
                }
            }
        }
        const data = result as D;

        // Compact on load
        await this.flush(data);

        return data;
    }

    async flush(data: D): Promise<void> {
        const entries: string[] = [];
        for (const [id, item] of Object.entries(data)) {
            entries.push([OP_UPSERT, id, JSON.stringify(item, this.#replacer)].join(SEP_OPERATION));
        }
        await writeFile(this.#file, entries.join(SEP_ENTRY), "utf-8");
    }

    async insert(items: I[]): Promise<void> {
        await appendFile(this.#file, SEP_ENTRY + items.map((item) => [OP_UPSERT, item.id, JSON.stringify(item, this.#replacer)].join(SEP_OPERATION)).join(SEP_ENTRY), "utf-8");
    }

    async update(items: I[]): Promise<void> {
        await appendFile(this.#file, SEP_ENTRY + items.map((item) => [OP_UPSERT, item.id, JSON.stringify(item, this.#replacer)].join(SEP_OPERATION)).join(SEP_ENTRY), "utf-8");
    }

    async delete(items: I[]): Promise<void> {
        await appendFile(this.#file, SEP_ENTRY + items.map((item) => [OP_DELETE, item.id].join(SEP_OPERATION)).join(SEP_ENTRY), "utf-8");
    }
}
