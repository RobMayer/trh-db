import { readFile, writeFile } from "node:fs/promises";
import { Codec } from "../types";

type Jsonable = string | number | boolean | null | Jsonable[] | { [key: string]: Jsonable };

export class JsonCodec<I extends Jsonable, D extends Jsonable, M extends Jsonable = null> implements Codec<I, D, M> {
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

    async load(): Promise<D> {
        try {
            const raw = await readFile(this.#file, "utf-8");
            return JSON.parse(raw) as D;
        } catch {
            return {} as D;
        }
    }

    async flush(data: D): Promise<void> {
        await writeFile(this.#file, JSON.stringify(data), "utf-8");
    }

    async insert(_items: I[], data: D): Promise<void> {
        await this.flush(data);
    }

    async update(_items: I[], data: D): Promise<void> {
        await this.flush(data);
    }

    async delete(_items: I[], data: D): Promise<void> {
        await this.flush(data);
    }
}
