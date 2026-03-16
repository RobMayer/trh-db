import { Codec } from "../types";

export class MemoryCodec<D extends { id: string; data: any }, M = null> implements Codec<D, M> {
    #meta: M | null;
    constructor() {
        this.#meta = null;
    }
    update: (items: D[], data: { [id: string]: D }) => Promise<void> = async () => {};
    insert: (items: D[], data: { [id: string]: D }) => Promise<void> = async () => {};
    delete: (items: D[], data: { [id: string]: D }) => Promise<void> = async () => {};
    struct: (items: D[], data: { [id: string]: D }) => Promise<void> = async () => {};
    load: () => Promise<{ [id: string]: D }> = async () => {
        return {} as { [id: string]: D };
    };
    flush: (data: { [id: string]: D }) => Promise<void> = async () => {};
    get metadata(): M | null {
        return this.#meta;
    }

    set metadata(value: M | null) {
        this.#meta = value;
    }
}
