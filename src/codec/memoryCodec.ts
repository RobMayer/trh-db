import { Codec } from "../types";

export class MemoryCodec<I, D> implements Codec<I, D> {
    update: (items: I[], data: D) => Promise<void> = async () => {};
    insert: (items: I[], data: D) => Promise<void> = async () => {};
    delete: (items: I[], data: D) => Promise<void> = async () => {};
    load: () => Promise<D> = async () => {
        return {} as D;
    };
    flush: (data: D) => Promise<void> = async () => {};
}
