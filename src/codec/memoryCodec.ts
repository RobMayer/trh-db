import { Codec, DBMeta } from "../types";

export class MemoryCodec<D extends { id: string; data: any }, M extends DBMeta<any> = DBMeta<null>> implements Codec<D, M> {
    update: (items: D[], data: () => { [id: string]: D }, meta: M | null) => Promise<void> = async () => {};
    insert: (items: D[], data: () => { [id: string]: D }, meta: M | null) => Promise<void> = async () => {};
    delete: (items: D[], data: () => { [id: string]: D }, meta: M | null) => Promise<void> = async () => {};
    struct: (items: D[], data: () => { [id: string]: D }, meta: M | null) => Promise<void> = async () => {};
    load: () => Promise<[data: { [id: string]: D }, meta: M | null]> = async () => {
        return [{} as { [id: string]: D }, null];
    };
    flush: (data: () => { [id: string]: D }, meta: M | null) => Promise<void> = async () => {};
    setMeta: (value: M | null, data: () => { [id: string]: D }) => Promise<void> = async () => {};
}
