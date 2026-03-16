import { readFile, writeFile } from "node:fs/promises";
import { Codec } from "../types";

type Jsonable = string | number | boolean | null | Jsonable[] | { [key: string]: Jsonable };

export class JsonCodec<D extends { id: string; data: any } & Jsonable, M extends Jsonable = null> implements Codec<D, M> {
    #file: string;
    #meta: M | null;

    constructor(file: string) {
        this.#file = file;
        this.#meta = null;
    }

    get metadata(): M | null {
        return this.#meta;
    }

    set metadata(value: M | null) {
        this.#meta = value;
    }

    async load(): Promise<{ [id: string]: D }> {
        try {
            const raw = await readFile(this.#file, "utf-8");
            const parsed = JSON.parse(raw) as { meta: M | null; data: { [id: string]: D } };
            this.#meta = parsed.meta ?? null;
            return parsed.data;
        } catch {
            return {} as { [id: string]: D };
        }
    }

    async flush(data: { [id: string]: D }): Promise<void> {
        await writeFile(this.#file, JSON.stringify({ meta: this.#meta, data }), "utf-8");
    }

    async insert(_items: D[], data: { [id: string]: D }): Promise<void> {
        await this.flush(data);
    }

    async update(_items: D[], data: { [id: string]: D }): Promise<void> {
        await this.flush(data);
    }

    async delete(_items: D[], data: { [id: string]: D }): Promise<void> {
        await this.flush(data);
    }

    async struct(_items: D[], data: { [id: string]: D }): Promise<void> {
        await this.flush(data);
    }
}
