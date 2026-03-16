import { readFile, writeFile } from "node:fs/promises";
import { Codec, DBMeta } from "../types";

type Jsonable = string | number | boolean | null | Jsonable[] | { [key: string]: Jsonable };

export class JsonCodec<D extends { id: string; data: any } & Jsonable, M extends DBMeta<Jsonable> & Jsonable = DBMeta<null>> implements Codec<D, M> {
    #file: string;

    constructor(file: string) {
        this.#file = file;
    }

    async setMeta(value: M | null, data: { [id: string]: D }): Promise<void> {
        await this.flush(data, value);
    }

    async load(): Promise<[data: { [id: string]: D }, meta: M | null]> {
        try {
            const raw = await readFile(this.#file, "utf-8");
            const parsed = JSON.parse(raw) as { meta: M | null; data: { [id: string]: D } };
            return [parsed.data, parsed.meta ?? null];
        } catch {
            return [{} as { [id: string]: D }, null];
        }
    }

    async flush(data: { [id: string]: D }, meta: M | null): Promise<void> {
        await writeFile(this.#file, JSON.stringify({ meta, data }), "utf-8");
    }

    async insert(_items: D[], data: { [id: string]: D }, meta: M | null): Promise<void> {
        await this.flush(data, meta);
    }

    async update(_items: D[], data: { [id: string]: D }, meta: M | null): Promise<void> {
        await this.flush(data, meta);
    }

    async delete(_items: D[], data: { [id: string]: D }, meta: M | null): Promise<void> {
        await this.flush(data, meta);
    }

    async struct(_items: D[], data: { [id: string]: D }, meta: M | null): Promise<void> {
        await this.flush(data, meta);
    }
}
