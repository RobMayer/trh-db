import { Codec } from "../types";

export class MemoryCodec<I, D, M = null> implements Codec<I, D, M> {
    #meta: M | null;
    constructor() {
        this.#meta = null;
    }
    update: (items: I[], data: D) => Promise<void> = async () => {};
    insert: (items: I[], data: D) => Promise<void> = async () => {};
    delete: (items: I[], data: D) => Promise<void> = async () => {};
    load: () => Promise<D> = async () => {
        return {} as D;
    };
    flush: (data: D) => Promise<void> = async () => {};
    get metadata(): M | null {
        return this.#meta;
    }

    set metadata(value: M | null) {
        this.#meta = value;
    }
}
